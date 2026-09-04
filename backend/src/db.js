import pg from 'pg';
import dns from 'dns';

// Some Neon endpoints publish ONLY IPv6 (AAAA) records. Node's default DNS
// result ordering can then fail to connect with ENOTFOUND even though the host
// is reachable over IPv6. Using "verbatim" order makes Node honour whatever the
// resolver returns (IPv6 included) instead of preferring IPv4.
dns.setDefaultResultOrder('verbatim');

/**
 * Cloud Postgres datastore (Neon / any Postgres).
 *
 * Data lives in the cloud database, not on the server's disk — so it survives
 * redeploys and restarts and is not tied to any single machine. Tables are
 * prefixed with `billkaro_` so this app can safely share a database with other
 * projects without colliding.
 *
 * Configure with the DATABASE_URL env var, e.g.
 *   postgresql://user:password@host/dbname?sslmode=require
 */

const { Pool } = pg;

// The pool is created lazily so a missing/invalid DATABASE_URL surfaces as a
// runtime error (handled as a 503) instead of crashing the process at import
// time — which would guarantee a failed deploy on platforms like Render.
let pool = null;
export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Point it at your Postgres database.');
  }
  // Neon and most hosted Postgres require SSL. We pass the ssl option
  // explicitly, so strip sslmode/channel_binding params from the URL to avoid
  // pg's verify-full aliasing warning and driver conflicts.
  let clean = connectionString;
  for (const param of ['sslmode', 'channel_binding']) {
    clean = clean.replace(new RegExp(`([?&])${param}=[^&]*`, 'g'), '$1');
  }
  // Tidy up any leftover separators (e.g. "?&", trailing "?" or "&").
  clean = clean.replace(/\?&+/, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');
  pool = new Pool({
    connectionString: clean,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  return pool;
}

// ------------------------------------------------------------
// Schema (created on boot; safe to run repeatedly)
// ------------------------------------------------------------
export async function initDb() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS billkaro_users (
      id            SERIAL PRIMARY KEY,
      store_name    TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      upi_id        TEXT,
      payee_name    TEXT,
      address       TEXT,
      phone         TEXT,
      currency      TEXT NOT NULL DEFAULT 'INR',
      tax_percent   REAL NOT NULL DEFAULT 0,
      kds_pin       TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Migrate existing tables: add columns that may not exist yet.
    -- IF NOT EXISTS prevents errors on a fresh DB that already has them.
    ALTER TABLE billkaro_users ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE billkaro_users ADD COLUMN IF NOT EXISTS phone   TEXT;
    ALTER TABLE billkaro_users ADD COLUMN IF NOT EXISTS kds_pin TEXT;

    ALTER TABLE billkaro_items ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT NULL;
    ALTER TABLE billkaro_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE billkaro_bills ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'upi';
    ALTER TABLE billkaro_bills ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT NULL;
    ALTER TABLE billkaro_bills ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT NULL;

    -- Generate KDS pairing PIN for any existing users with NULL kds_pin (6 digits)
    UPDATE billkaro_users 
    SET kds_pin = LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0')
    WHERE kds_pin IS NULL;

    CREATE TABLE IF NOT EXISTS billkaro_items (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES billkaro_users(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      price          REAL NOT NULL DEFAULT 0,
      color          TEXT DEFAULT '#2563eb',
      category       TEXT DEFAULT '',
      description    TEXT DEFAULT '',
      stock_quantity INTEGER DEFAULT NULL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billkaro_bills (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES billkaro_users(id) ON DELETE CASCADE,
      label          TEXT DEFAULT '',
      items_json     JSONB NOT NULL,
      subtotal       REAL NOT NULL DEFAULT 0,
      tax            REAL NOT NULL DEFAULT 0,
      total          REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'upi',
      customer_name  TEXT DEFAULT NULL,
      customer_phone TEXT DEFAULT NULL,
      status         TEXT NOT NULL DEFAULT 'paid',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS billkaro_items_user_idx ON billkaro_items(user_id);
    CREATE INDEX IF NOT EXISTS billkaro_bills_user_idx ON billkaro_bills(user_id);
  `);
  console.log('BillKaro: Postgres schema ready.');
}

// ---------------- Users ----------------
export const usersRepo = {
  async findByEmail(email) {
    const { rows } = await getPool().query('SELECT * FROM billkaro_users WHERE email = $1', [email]);
    return rows[0] || null;
  },
  async findById(id) {
    const { rows } = await getPool().query('SELECT * FROM billkaro_users WHERE id = $1', [Number(id)]);
    return rows[0] || null;
  },
  async findByKdsPin(pin) {
    const { rows } = await getPool().query('SELECT * FROM billkaro_users WHERE kds_pin = $1', [String(pin).trim()]);
    return rows[0] || null;
  },
  async updateKdsPin(userId, pin) {
    const { rows } = await getPool().query(
      'UPDATE billkaro_users SET kds_pin = $1 WHERE id = $2 RETURNING *',
      [String(pin).trim(), Number(userId)]
    );
    return rows[0] || null;
  },
  async create({ storeName, email, passwordHash, upiId, payeeName, taxPercent, address, phone }) {
    const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
    const { rows } = await getPool().query(
      `INSERT INTO billkaro_users (store_name, email, password_hash, upi_id, payee_name, tax_percent, address, phone, kds_pin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [storeName, email, passwordHash, upiId || null, payeeName || storeName, Number(taxPercent) || 0, address || null, phone || null, randomPin]
    );
    return rows[0];
  },
  async update(id, fields) {
    const { rows } = await getPool().query(
      `UPDATE billkaro_users SET
         store_name  = COALESCE($1, store_name),
         upi_id      = COALESCE($2, upi_id),
         payee_name  = COALESCE($3, payee_name),
         tax_percent = COALESCE($4, tax_percent),
         address     = COALESCE($5, address),
         phone       = COALESCE($6, phone)
       WHERE id = $7 RETURNING *`,
      [
        fields.storeName  ?? null,
        fields.upiId      ?? null,
        fields.payeeName  ?? null,
        fields.taxPercent == null ? null : Number(fields.taxPercent),
        fields.address    ?? null,
        fields.phone      ?? null,
        Number(id),
      ]
    );
    return rows[0] || null;
  },
};

// ---------------- Items ----------------
export const itemsRepo = {
  async listByUser(userId) {
    const { rows } = await getPool().query(
      'SELECT * FROM billkaro_items WHERE user_id = $1 ORDER BY sort_order ASC, id ASC',
      [Number(userId)]
    );
    return rows;
  },
  async findById(id, userId) {
    const { rows } = await getPool().query(
      'SELECT * FROM billkaro_items WHERE id = $1 AND user_id = $2',
      [Number(id), Number(userId)]
    );
    return rows[0] || null;
  },
  async create(userId, { name, price, color, category, description, stockQuantity }) {
    const { rows: maxRows } = await getPool().query(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM billkaro_items WHERE user_id = $1',
      [Number(userId)]
    );
    const nextOrder = Number(maxRows[0].m) + 1;
    const stock = stockQuantity === '' || stockQuantity === undefined || stockQuantity === null ? null : Number(stockQuantity);
    const { rows } = await getPool().query(
      `INSERT INTO billkaro_items (user_id, name, price, color, category, description, stock_quantity, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [Number(userId), name, Number(price) || 0, color || '#2563eb', category || '', description || '', stock, nextOrder]
    );
    return rows[0];
  },
  async update(id, userId, fields) {
    const hasStockUpdate = 'stockQuantity' in fields;
    const stockVal = fields.stockQuantity === '' || fields.stockQuantity === null || fields.stockQuantity === undefined ? null : Number(fields.stockQuantity);
    const { rows } = await getPool().query(
      `UPDATE billkaro_items SET
         name           = COALESCE($1, name),
         price          = COALESCE($2, price),
         color          = COALESCE($3, color),
         category       = COALESCE($4, category),
         description    = COALESCE($5, description),
         stock_quantity = CASE WHEN $6 THEN $7 ELSE stock_quantity END
       WHERE id = $8 AND user_id = $9 RETURNING *`,
      [
        fields.name ?? null,
        fields.price == null ? null : Number(fields.price),
        fields.color ?? null,
        fields.category ?? null,
        fields.description ?? null,
        hasStockUpdate,
        stockVal,
        Number(id),
        Number(userId),
      ]
    );
    return rows[0] || null;
  },
  async remove(id, userId) {
    const res = await getPool().query(
      'DELETE FROM billkaro_items WHERE id = $1 AND user_id = $2',
      [Number(id), Number(userId)]
    );
    return res.rowCount > 0;
  },
  async deductStock(userId, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const line of items) {
        if (line.itemId && Number(line.qty) > 0) {
          await client.query(
            `UPDATE billkaro_items 
             SET stock_quantity = GREATEST(0, stock_quantity - $1) 
             WHERE id = $2 AND user_id = $3 AND stock_quantity IS NOT NULL`,
            [Number(line.qty), Number(line.itemId), Number(userId)]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Failed to deduct stock:', e.message);
    } finally {
      client.release();
    }
  },
  async reorder(userId, orderIds) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < orderIds.length; index++) {
        await client.query(
          'UPDATE billkaro_items SET sort_order = $1 WHERE id = $2 AND user_id = $3',
          [index, Number(orderIds[index]), Number(userId)]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return this.listByUser(userId);
  },
};

// ---------------- Bills ----------------
export const billsRepo = {
  async create(userId, { label, items, subtotal, tax, total, paymentMethod, customerName, customerPhone, status }) {
    const { rows } = await getPool().query(
      `INSERT INTO billkaro_bills (user_id, label, items_json, subtotal, tax, total, payment_method, customer_name, customer_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        Number(userId),
        label || '',
        JSON.stringify(items),
        Number(subtotal) || 0,
        Number(tax) || 0,
        Number(total) || 0,
        paymentMethod || 'upi',
        customerName || null,
        customerPhone || null,
        status || 'paid',
      ]
    );
    return rows[0];
  },
  async listByUser(userId) {
    const { rows } = await getPool().query(
      'SELECT * FROM billkaro_bills WHERE user_id = $1 ORDER BY id DESC LIMIT 100',
      [Number(userId)]
    );
    return rows;
  },
  async updateStatus(id, userId, status) {
    const { rows } = await getPool().query(
      `UPDATE billkaro_bills SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [status, Number(id), Number(userId)]
    );
    return rows[0] || null;
  },
  async remove(id, userId) {
    const res = await getPool().query(
      'DELETE FROM billkaro_bills WHERE id = $1 AND user_id = $2',
      [Number(id), Number(userId)]
    );
    return res.rowCount > 0;
  },
};
