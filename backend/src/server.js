import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import os from 'os';
import { initDb } from './db.js';
import { verifyToken } from './auth.js';
import { sanitizeText } from './utils/sanitize.js';
import authRoutes from './routes/authRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import billRoutes, { updateActiveKdsStatus } from './routes/billRoutes.js';
import { getCorsOptions, getSocketCorsOptions } from './middleware/corsConfig.js';
import { apiLimiter } from './middleware/rateLimiter.js';

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
const httpServer = createServer(app);
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

// HTTP Security Headers with POS-tailored Content Security Policy (CSP)
// Explicitly permits dynamic UPI QR codes (data:), receipt canvas blobs (blob:),
// Google Fonts, and live KDS real-time WebSockets (ws:, wss:)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Lock down hardware permissions & strip PaaS provider disclosure
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.removeHeader('X-Render-Origin-Server');
  next();
});

// Secure CORS configuration
app.use(cors(getCorsOptions(isProd)));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Malformed JSON / entity too large parser error interceptor
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload exceeds allowed limit' });
  }
  next(err);
});

// ---------------- Socket.io for Real-time KDS ----------------
const io = new Server(httpServer, {
  cors: getSocketCorsOptions(isProd),
});
app.set('io', io);

// Authenticate socket connections via handshake auth token
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.sub;
    socket.userRole = decoded.role || 'user';
    next();
  } catch {
    return next(new Error('Invalid or expired authentication token'));
  }
});

io.on('connection', (socket) => {
  // Bind strictly to authenticated user's store room
  const storeRoom = `store_${socket.userId}`;
  socket.join(storeRoom);

  socket.on('join_store', () => {
    // Keep connection strictly confined to authenticated store room
    socket.join(storeRoom);
  });

  socket.on('kds:update-status', ({ orderId, label, status }) => {
    if (!orderId || !status) return;
    const validStatuses = ['preparing', 'ready'];
    if (!validStatuses.includes(status)) return;

    const cleanLabel = label ? sanitizeText(label).substring(0, 100) : '';
    const updated = updateActiveKdsStatus(socket.userId, orderId, status);
    io.to(storeRoom).emit('kds:order-updated', {
      orderId,
      label: cleanLabel,
      status,
      invoiceNumber: updated?.invoiceNumber,
      customerName: updated?.customerName,
    });
  });
});

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ---------------- API ----------------
// Health check is kept before the rate limiter so monitors are never throttled
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'billkaro', env: isProd ? 'production' : 'development' })
);

// General API rate limiter for DoS / scraping protection
app.use('/api', apiLimiter);

app.get('/api/info', (req, res) => {
  // Hide internal network information in production
  if (isProd) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const localIp = getLocalNetworkIp();
  const host = req.get('host') || '';
  res.json({
    localIp,
    port: PORT,
    host,
    networkKdsUrl: `http://${localIp}:${PORT}/kds`,
  });
});

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

// Explicitly block dotfiles (.env, .git, etc.) and hidden files from falling into the SPA catch-all
app.use((req, res, next) => {
  if (req.path.startsWith('/.') || req.path.includes('/.')) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// ---------------- Static frontend ----------------
const distPath = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));

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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(
    `BillKaro running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`
  );
  ensureDb()
    .then(() => console.log('BillKaro: database ready.'))
    .catch((err) => console.error('BillKaro: initial DB init failed, will retry on request:', err.message));
});
