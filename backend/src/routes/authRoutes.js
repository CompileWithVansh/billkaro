import express from 'express';
import bcrypt from 'bcryptjs';
import { usersRepo } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const router = express.Router();

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
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    const user = await usersRepo.updateKdsPin(req.userId, newPin);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, kdsPin: user.kds_pin });
  })
);

// POST /api/auth/register
router.post(
  '/register',
  wrap(async (req, res) => {
    const { storeName, email, password, upiId, payeeName, taxPercent, address, phone } = req.body || {};
    if (!storeName || !email || !password) {
      return res.status(400).json({ error: 'storeName, email and password are required' });
    }
    if (await usersRepo.findByEmail(email.toLowerCase())) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await usersRepo.create({
      storeName,
      email: email.toLowerCase(),
      passwordHash,
      upiId,
      payeeName,
      taxPercent,
      address,
      phone,
    });
    const token = signToken({ sub: user.id });
    res.status(201).json({ token, user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await usersRepo.findByEmail(email.toLowerCase());
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
    const updated = await usersRepo.update(req.userId, { storeName, upiId, payeeName, taxPercent, address, phone });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(updated) });
  })
);

export default router;
