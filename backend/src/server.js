import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { initDb } from './db.js';
import authRoutes from './routes/authRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import billRoutes from './routes/billRoutes.js';

// Memoized DB initialization. Retries on failure so a sleeping/cold database
// (e.g. Neon free tier waking up) doesn't permanently break the process.
let dbReady = null;
function ensureDb() {
  if (!dbReady) {
    dbReady = initDb().catch((err) => {
      // Reset so the next request retries instead of caching a rejection.
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

// Fail fast in production if the JWT secret was left at its insecure default.
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
  console.error(
    'FATAL: JWT_SECRET must be set to a strong value (>=16 chars) in production.'
  );
  process.exit(1);
}

// Behind a platform proxy (Render/Railway/Fly/Nginx) so secure cookies /
// rate limiting / IPs work correctly.
app.set('trust proxy', 1);

// CORS: when the frontend is served by this same server (single-process
// deploy), requests are same-origin and CORS is irrelevant. If you host the
// frontend separately, list its origin(s) in CORS_ORIGIN (comma separated).
const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origins.length ? origins : true,
  })
);
app.use(express.json({ limit: '1mb' }));

// ---------------- API ----------------
// Health check does NOT touch the DB, so the platform can mark the service
// live even while the database is still waking up.
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'billkaro', env: isProd ? 'production' : 'development' })
);

// Ensure the schema exists before any data route runs. Cheap after the first
// success (memoized); retries if the DB was momentarily unreachable.
app.use(['/api/auth', '/api/items', '/api/bills'], (_req, res, next) => {
  ensureDb()
    .then(() => next())
    .catch((err) => {
      console.error('DB not ready:', err.message);
      res.status(503).json({ error: 'Database is starting up, please retry in a moment.' });
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/bills', billRoutes);

// ---------------- Static frontend ----------------
// In production we serve the built SPA (frontend/dist) from this same server,
// so the whole app runs as ONE process on ONE URL — no CORS, no second host.
const distPath = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));

  // SPA fallback: any non-API route returns index.html so client-side routing
  // (e.g. /login) works on hard refresh.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.json({
      ok: true,
      service: 'billkaro-api',
      note: 'Frontend build not found. Run the frontend build or set up separate hosting.',
    })
  );
}

// ---------------- Errors ----------------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start listening immediately so the platform health check passes even if the
// database is still cold. Kick off schema init in the background; data routes
// also guarantee it via ensureDb(), retrying as needed.
app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `BillKaro running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`
  );
  ensureDb()
    .then(() => console.log('BillKaro: database ready.'))
    .catch((err) => console.error('BillKaro: initial DB init failed, will retry on request:', err.message));
});
