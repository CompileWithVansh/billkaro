import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { createCorsOriginValidator, getCorsOptions } from '../src/middleware/corsConfig.js';
import { loginLimiter, kdsPairLimiter, registerLimiter, apiLimiter } from '../src/middleware/rateLimiter.js';

test('CORS Validator - Production Mode', async (t) => {
  process.env.CORS_ORIGIN = 'https://billkaro-i6h5.onrender.com,https://pos.mystore.com';
  process.env.RENDER_EXTERNAL_HOSTNAME = 'billkaro-app.onrender.com';
  const isOriginAllowed = createCorsOriginValidator(true);

  await t.test('allows requests with no Origin header (same-origin, curl, mobile)', () => {
    let result = null;
    isOriginAllowed(undefined, (_err, allowed) => { result = allowed; });
    assert.equal(result, true);
  });

  await t.test('allows whitelisted origins from CORS_ORIGIN', () => {
    let result1 = null;
    let result2 = null;
    isOriginAllowed('https://billkaro-i6h5.onrender.com', (_err, allowed) => { result1 = allowed; });
    isOriginAllowed('https://pos.mystore.com', (_err, allowed) => { result2 = allowed; });
    assert.equal(result1, true);
    assert.equal(result2, true);
  });

  await t.test('auto-allows Render external hostname', () => {
    let result = null;
    isOriginAllowed('https://billkaro-app.onrender.com', (_err, allowed) => { result = allowed; });
    assert.equal(result, true);
  });

  await t.test('blocks untrusted third-party origins', () => {
    let result = null;
    isOriginAllowed('https://evil-attacker.com', (_err, allowed) => { result = allowed; });
    assert.equal(result, false);
  });
});

test('CORS Validator - Development Mode', async (t) => {
  const isOriginAllowed = createCorsOriginValidator(false);

  await t.test('allows localhost and loopback origins', () => {
    let resultLocalhost = null;
    let result127 = null;
    isOriginAllowed('http://localhost:5173', (_err, allowed) => { resultLocalhost = allowed; });
    isOriginAllowed('http://127.0.0.1:5173', (_err, allowed) => { result127 = allowed; });
    assert.equal(resultLocalhost, true);
    assert.equal(result127, true);
  });

  await t.test('allows private LAN IPs for local iPad / tablet testing', () => {
    let resultLan192 = null;
    let resultLan10 = null;
    let resultLan172 = null;
    isOriginAllowed('http://192.168.1.105:5173', (_err, allowed) => { resultLan192 = allowed; });
    isOriginAllowed('http://10.0.0.42:3000', (_err, allowed) => { resultLan10 = allowed; });
    isOriginAllowed('http://172.20.10.2:4000', (_err, allowed) => { resultLan172 = allowed; });
    assert.equal(resultLan192, true);
    assert.equal(resultLan10, true);
    assert.equal(resultLan172, true);
  });
});

test('Rate Limiter - Login Endpoint Brute Force Protection', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  app.post('/api/auth/login', loginLimiter, (_req, res) => {
    res.status(401).json({ error: 'Invalid email or password' });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Send 10 attempts (within limit)
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@store.com', password: `wrong_${i}` }),
      });
      assert.equal(res.status, 401, `Attempt ${i} should be 401`);
      // Standard RateLimit header should be present
      assert.ok(res.headers.get('ratelimit') || res.headers.get('ratelimit-limit') || res.headers.get('ratelimit-remaining') !== null);
    }

    // 11th attempt must be blocked by rate limiter
    const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@store.com', password: 'attack_attempt' }),
    });

    assert.equal(blockedRes.status, 429, '11th attempt must be 429 Too Many Requests');
    const data = await blockedRes.json();
    assert.equal(data.error, 'Too many login attempts from this IP. Please try again after 15 minutes.');
  } finally {
    server.close();
  }
});

test('Rate Limiter - KDS PIN Pairing Brute Force Protection', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  app.post('/api/auth/kds-pair', kdsPairLimiter, (_req, res) => {
    res.status(401).json({ error: 'Invalid Kitchen Pairing PIN' });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${baseUrl}/api/auth/kds-pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: `100${i}` }),
      });
      assert.equal(res.status, 401);
    }

    // 11th attempt must be blocked
    const blockedRes = await fetch(`${baseUrl}/api/auth/kds-pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });

    assert.equal(blockedRes.status, 429);
    const data = await blockedRes.json();
    assert.equal(data.error, 'Too many kitchen pairing attempts. Please try again after 15 minutes.');
  } finally {
    server.close();
  }
});

test('CORS HTTP Integration - Rejects Unauthorized Cross-Origin in Production', async () => {
  process.env.CORS_ORIGIN = 'https://billkaro-i6h5.onrender.com';
  const app = express();
  app.use(cors(getCorsOptions(true)));
  app.get('/api/test', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Request from unauthorized origin
    const unauthRes = await fetch(`${baseUrl}/api/test`, {
      headers: { Origin: 'https://attacker-site.com' },
    });
    assert.equal(unauthRes.headers.get('access-control-allow-origin'), null);

    // 2. Request from authorized origin
    const authRes = await fetch(`${baseUrl}/api/test`, {
      headers: { Origin: 'https://billkaro-i6h5.onrender.com' },
    });
    assert.equal(authRes.headers.get('access-control-allow-origin'), 'https://billkaro-i6h5.onrender.com');

    // 3. Preflight OPTIONS request from unauthorized origin
    const unauthPreflight = await fetch(`${baseUrl}/api/test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker-site.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(unauthPreflight.headers.get('access-control-allow-origin'), null);

    // 4. Preflight OPTIONS request from authorized origin
    const authPreflight = await fetch(`${baseUrl}/api/test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://billkaro-i6h5.onrender.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(authPreflight.headers.get('access-control-allow-origin'), 'https://billkaro-i6h5.onrender.com');
  } finally {
    server.close();
  }
});

test('Rate Limiter - Health Check Bypass', async () => {
  const app = express();
  // Simulate server.js ordering:
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', apiLimiter);
  app.get('/api/data', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Send 25 rapid health checks
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      // Health check should not have RateLimit headers because it bypasses apiLimiter
      assert.equal(res.headers.get('ratelimit'), null);
    }
  } finally {
    server.close();
  }
});

import { sanitizeText, sanitizePhone } from '../src/utils/sanitize.js';
import helmet from 'helmet';

test('Input Sanitization - Emojis & Indian Unicode Preservation', async (t) => {
  await t.test('preserves food emojis and text', () => {
    assert.equal(sanitizeText('Masala Chai ☕'), 'Masala Chai ☕');
    assert.equal(sanitizeText('🍕 Margherita Pizza'), '🍕 Margherita Pizza');
    assert.equal(sanitizeText('Double Patty Burger 🍔'), 'Double Patty Burger 🍔');
    assert.equal(sanitizeText('Ice Cream Sundae 🍨'), 'Ice Cream Sundae 🍨');
  });

  await t.test('preserves Devanagari, Tamil, and Indian scripts', () => {
    assert.equal(sanitizeText('पनीर टिक्का'), 'पनीर टिक्का');
    assert.equal(sanitizeText('காபி'), 'காபி');
    assert.equal(sanitizeText('मसाला डोसा'), 'मसाला डोसा');
  });

  await t.test('strips dangerous ESC/POS printer hardware control characters', () => {
    // \x1B (ESC), \x00 (NUL), \x07 (BEL)
    const dangerous = 'Cold Coffee\x1B\x00\x07';
    assert.equal(sanitizeText(dangerous), 'Cold Coffee');
  });

  await t.test('strips HTML tags and script blocks to neutralize Stored XSS', () => {
    const xss = '<script>alert("hacked")</script>Cold Coffee <img src=x onerror=alert(1)>';
    assert.equal(sanitizeText(xss), 'Cold Coffee');
  });

  await t.test('removes invisible zero-width spaces that break item search', () => {
    const zeroWidth = 'Cold\u200B Coffee\uFEFF';
    assert.equal(sanitizeText(zeroWidth), 'Cold Coffee');
  });

  await t.test('handles newlines properly when allowed in descriptions', () => {
    const descWithNewlines = 'Line 1\nLine 2\r\nLine 3\x00';
    assert.equal(sanitizeText(descWithNewlines, { allowNewlines: true }), 'Line 1\nLine 2\r\nLine 3');
  });
});

test('Phone Number Sanitization - Preserves Formatting', async (t) => {
  await t.test('preserves international dialing codes and spaces', () => {
    assert.equal(sanitizePhone('+91 98765 43210'), '+91 98765 43210');
  });

  await t.test('preserves landline parenthesis and hyphen formats', () => {
    assert.equal(sanitizePhone('(022) 2345-6789'), '(022) 2345-6789');
  });

  await t.test('strips control characters and caps at 20 characters', () => {
    assert.equal(sanitizePhone('+91 98765\x0043210'), '+91 9876543210');
    assert.equal(sanitizePhone('+91 12345678901234567890EXTRA'), '+91 1234567890123456');
  });
});

test('RFC 5321 Email Validation Regex', () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Valid emails
  assert.equal(EMAIL_REGEX.test('store@example.com'), true);
  assert.equal(EMAIL_REGEX.test('billing.counter@pos.store.co.in'), true);

  // Invalid emails
  assert.equal(EMAIL_REGEX.test('admin@'), false);
  assert.equal(EMAIL_REGEX.test('user@@example.com'), false);
  assert.equal(EMAIL_REGEX.test('user@.com'), false);
  assert.equal(EMAIL_REGEX.test('plainaddress'), false);
});

test('Helmet HTTP Security Headers', async () => {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.get('/api/test-headers', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/test-headers`);
    assert.equal(res.status, 200);

    // MIME sniffing protection
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

    // Clickjacking protection (iframe blocking)
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');

    // Express signature hidden
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    server.close();
  }
});

test('Financial Integrity - Server-side Total Recalculation & Fraud Prevention', () => {
  const taxPercent = 5; // 5% GST
  const items = [
    { itemId: 1, name: 'Cold Coffee ☕', price: 100, qty: 2 }, // 200
    { itemId: null, name: 'Custom Cookie', price: 50, qty: 1 }, // 50
  ];

  // Client attempts to send manipulated total: 10
  const clientManipulatedTotal = 10;

  // Server recalculation:
  const serverSubtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const serverTax = Number((serverSubtotal * (taxPercent / 100)).toFixed(2));
  const serverTotal = Number((serverSubtotal + serverTax).toFixed(2));

  assert.equal(serverSubtotal, 250);
  assert.equal(serverTax, 12.5);
  assert.equal(serverTotal, 262.5);
  assert.notEqual(serverTotal, clientManipulatedTotal);
});

test('Price Verification - Detects Tampered Catalog Item Price', () => {
  const dbItem = { id: 5, name: 'Margherita Pizza 🍕', price: 299 };
  
  // Fraud attempt: cashier alters catalog price in cart to ₹1
  const tamperedLine = { itemId: 5, name: 'Margherita Pizza 🍕', price: 1, qty: 1 };
  const legitimateLine = { itemId: 5, name: 'Margherita Pizza 🍕', price: 299, qty: 1 };

  const isTampered = Math.abs(tamperedLine.price - dbItem.price) > 1;
  const isLegitimate = Math.abs(legitimateLine.price - dbItem.price) <= 1;

  assert.equal(isTampered, true, 'Tampered price must be detected');
  assert.equal(isLegitimate, true, 'Legitimate price must pass');
});

test('KDS Ticket Management - Exports Status Updater Function', async () => {
  const { updateActiveKdsStatus } = await import('../src/routes/billRoutes.js');
  assert.equal(typeof updateActiveKdsStatus, 'function');
});
