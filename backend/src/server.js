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
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'billkaro', env: isProd ? 'production' : 'development' })
);

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

// Initialize the database schema, then start listening.
initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `BillKaro running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`
      );
    });
  })
  .catch((err) => {
    console.error('FATAL: could not initialize the database.', err);
    process.exit(1);
  });
