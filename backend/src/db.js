import pg from 'pg';

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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL is not set. Point it at your Postgres database.');
  process.exit(1);
}

// Neon and most hosted Postgres require SSL. We pass the ssl option explicitly
// and strip any sslmode query param to avoid pg's verify-full aliasing warning.
const cleanConnectionString = connectionString.replace(/([?&])sslmode=[^&]*(&|$)/, (_m, p1, p2) =>
  p2 === '&' ? p1 : ''
);
const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: { rejectUnauthorized: false },
});

// ------------------------------------------------------------
// Schema (created on boot; safe to run repeatedly)
// ------------------------------------------------------------
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billkaro_users (
      id            SERIAL PRIMARY KEY,
      store_name    TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      upi_id        TEXT,
      payee_name    TEXT,
      currency      TEXT NOT NULL DEFAULT 'INR',
      tax_percent   REAL NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billkaro_items (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES billkaro_users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      price       REAL NOT NULL DEFAULT 0,
      color       TEXT DEFAULT '#2563eb',
      category    TEXT DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS billkaro_bills (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES billkaro_users(id) ON DELETE CASCADE,
      label       TEXT DEFAULT '',
      items_json  JSONB NOT NULL,
      subtotal    REAL NOT NULL DEFAULT 0,
      tax         REAL NOT NULL DEFAULT 0,
      total       REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'paid',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS billkaro_items_user_idx ON billkaro_items(user_id);
    CREATE INDEX IF NOT EXISTS billkaro_bills_user_idx ON billkaro_bills(user_id);
  `);
  console.log('BillKaro: Postgres schema ready.');
}

// ---------------- Users ----------------
export const usersRepo = {
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM billkaro_users WHERE email = $1', [email]);
    return rows[0] || null;
  },
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM billkaro_users WHERE id = $1', [Number(id)]);
    return rows[0] || null;
  },
  async create({ storeName, email, passwordHash, upiId, payeeName, taxPercent }) {
    const { rows } = await pool.query(
      `INSERT INTO billkaro_users (store_name, email, password_hash, upi_id, payee_name, tax_percent)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [storeName, email, passwordHash, upiId || null, payeeName || storeName, Number(taxPercent) || 0]
    );
    return rows[0];
  },
  async update(id, fields) {
    const { rows } = await pool.query(
      `UPDATE billkaro_users SET
         store_name  = COALESCE($1, store_name),
         upi_id      = COALESCE($2, upi_id),
         payee_name  = COALESCE($3, payee_name),
         tax_percent = COALESCE($4, tax_percent)
       WHERE id = $5 RETURNING *`,
      [
        fields.storeName ?? null,
        fields.upiId ?? null,
        fields.payeeName ?? null,
        fields.taxPercent == null ? null : Number(fields.taxPercent),
        Number(id),
      ]
    );
    return rows[0] || null;
  },
};

// ---------------- Items ----------------
export const itemsRepo = {
  async listByUser(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM billkaro_items WHERE user_id = $1 ORDER BY sort_order ASC, id ASC',
      [Number(userId)]
    );
    return rows;
  },
  async findById(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM billkaro_items WHERE id = $1 AND user_id = $2',
      [Number(id), Number(userId)]
    );
    return rows[0] || null;
  },
  async create(userId, { name, price, color, category }) {
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM billkaro_items WHERE user_id = $1',
      [Number(userId)]
    );
    const nextOrder = Number(maxRows[0].m) + 1;
    const { rows } = await pool.query(
      `INSERT INTO billkaro_items (user_id, name, price, color, category, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [Number(userId), name, Number(price) || 0, color || '#2563eb', category || '', nextOrder]
    );
    return rows[0];
  },
  async update(id, userId, fields) {
    const { rows } = await pool.query(
      `UPDATE billkaro_items SET
         name     = COALESCE($1, name),
         price    = COALESCE($2, price),
         color    = COALESCE($3, color),
         category = COALESCE($4, category)
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [
        fields.name ?? null,
        fields.price == null ? null : Number(fields.price),
        fields.color ?? null,
        fields.category ?? null,
        Number(id),
        Number(userId),
      ]
    );
    return rows[0] || null;
  },
  async remove(id, userId) {
    const res = await pool.query(
      'DELETE FROM billkaro_items WHERE id = $1 AND user_id = $2',
      [Number(id), Number(userId)]
    );
    return res.rowCount > 0;
  },
  async reorder(userId, orderIds) {
    const client = await pool.connect();
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
  async create(userId, { label, items, subtotal, tax, total, status }) {
    const { rows } = await pool.query(
      `INSERT INTO billkaro_bills (user_id, label, items_json, subtotal, tax, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        Number(userId),
        label || '',
        JSON.stringify(items),
        Number(subtotal) || 0,
        Number(tax) || 0,
        Number(total) || 0,
        status || 'paid',
      ]
    );
    return rows[0];
  },
  async listByUser(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM billkaro_bills WHERE user_id = $1 ORDER BY id DESC LIMIT 100',
      [Number(userId)]
    );
    return rows;
  },
};
