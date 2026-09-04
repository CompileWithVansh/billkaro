import express from 'express';
import bcrypt from 'bcryptjs';
import { usersRepo } from '../db.js';
import { signToken, requireAuth } from '../auth.js';
import { loginLimiter, registerLimiter, kdsPairLimiter } from '../middleware/rateLimiter.js';
import { sanitizeText, sanitizePhone } from '../utils/sanitize.js';

const router = express.Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    id: u.id,
    storeName: u.store_name,
    email: u.email,
    upiId: u.upi_id,
    payeeName: u.payee_name,
    address: u.address,
    phone: u.phone,
    currency: u.currency,
    taxPercent: u.tax_percent,
    kdsPin: u.kds_pin,
  };
}

// small async wrapper so thrown errors reach the error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/auth/kds-pair (Public endpoint for Kitchen Display pairing)
router.post(
  '/kds-pair',
  kdsPairLimiter,
  wrap(async (req, res) => {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'Pairing PIN is required' });
    const user = await usersRepo.findByKdsPin(String(pin).trim());
    if (!user) return res.status(401).json({ error: 'Invalid Kitchen Pairing PIN' });
    const token = signToken({ sub: user.id, role: 'kds' });
    res.json({ ok: true, token, storeId: user.id, storeName: user.store_name });
  })
);

// POST /api/auth/kds-reset-pin (Authenticated: Regenerate new KDS pairing PIN)
router.post(
  '/kds-reset-pin',
  requireAuth,
  wrap(async (req, res) => {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await usersRepo.updateKdsPin(req.userId, newPin);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, kdsPin: user.kds_pin });
  })
);

// POST /api/auth/register
router.post(
  '/register',
  registerLimiter,
  wrap(async (req, res) => {
    const { storeName, email, password, upiId, payeeName, taxPercent, address, phone } = req.body || {};
    
    // 1. Validate and sanitize storeName
    const cleanStoreName = sanitizeText(storeName);
    if (!cleanStoreName || cleanStoreName.length > 100) {
      return res.status(400).json({ error: 'Store name must be between 1 and 100 characters' });
    }

    // 2. Strict RFC 5321 email validation
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 254) {
      return res.status(400).json({ error: 'Valid email required (max 254 characters)' });
    }

    // 3. Password length constraints
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 6 and 128 characters' });
    }

    if (await usersRepo.findByEmail(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // 4. Validate and sanitize optional metadata
    const cleanUpiId = sanitizeText(upiId).substring(0, 100) || null;
    const cleanPayeeName = sanitizeText(payeeName).substring(0, 100) || null;
    const cleanAddress = sanitizeText(address, { allowNewlines: true }).substring(0, 300) || null;
    const cleanPhone = sanitizePhone(phone) || null;

    let cleanTax = 0;
    if (taxPercent !== null && taxPercent !== undefined && taxPercent !== '') {
      const t = Number(taxPercent);
      if (isNaN(t) || t < 0 || t > 100) {
        return res.status(400).json({ error: 'Tax percent must be a number between 0 and 100' });
      }
      cleanTax = t;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await usersRepo.create({
      storeName: cleanStoreName,
      email: cleanEmail,
      passwordHash,
      upiId: cleanUpiId,
      payeeName: cleanPayeeName,
      taxPercent: cleanTax,
      address: cleanAddress,
      phone: cleanPhone,
    });
    const token = signToken({ sub: user.id });
    res.status(201).json({ token, user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await usersRepo.findByEmail(cleanEmail);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken({ sub: user.id });
    res.json({ token, user: publicUser(user) });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await usersRepo.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  })
);

// PUT /api/auth/settings
router.put(
  '/settings',
  requireAuth,
  wrap(async (req, res) => {
    const { storeName, upiId, payeeName, taxPercent, address, phone } = req.body || {};
    
    let cleanStoreName = undefined;
    if (storeName !== undefined) {
      cleanStoreName = sanitizeText(storeName);
      if (!cleanStoreName || cleanStoreName.length > 100) {
        return res.status(400).json({ error: 'Store name must be between 1 and 100 characters' });
      }
    }

    let cleanTax = undefined;
    if (taxPercent !== undefined && taxPercent !== null && taxPercent !== '') {
      const t = Number(taxPercent);
      if (isNaN(t) || t < 0 || t > 100) {
        return res.status(400).json({ error: 'Tax percent must be a number between 0 and 100' });
      }
      cleanTax = t;
    }

    const cleanUpiId = upiId !== undefined ? (sanitizeText(upiId).substring(0, 100) || null) : undefined;
    const cleanPayeeName = payeeName !== undefined ? (sanitizeText(payeeName).substring(0, 100) || null) : undefined;
    const cleanAddress = address !== undefined ? (sanitizeText(address, { allowNewlines: true }).substring(0, 300) || null) : undefined;
    const cleanPhone = phone !== undefined ? (sanitizePhone(phone) || null) : undefined;

    const updated = await usersRepo.update(req.userId, {
      storeName: cleanStoreName,
      upiId: cleanUpiId,
      payeeName: cleanPayeeName,
      taxPercent: cleanTax,
      address: cleanAddress,
      phone: cleanPhone,
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(updated) });
  })
);

export default router;
