import express from 'express';
import { billsRepo } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();
router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/bills
router.post(
  '/',
  wrap(async (req, res) => {
    const { label, items, subtotal, tax, total, status } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    const bill = await billsRepo.create(req.userId, { label, items, subtotal, tax, total, status });
    res.status(201).json({ id: bill.id });
  })
);

// GET /api/bills
router.get(
  '/',
  wrap(async (req, res) => {
    const rows = await billsRepo.listByUser(req.userId);
    res.json({
      bills: rows.map((r) => ({
        id: r.id,
        label: r.label,
        // items_json is JSONB — pg returns it already parsed.
        items: typeof r.items_json === 'string' ? JSON.parse(r.items_json) : r.items_json,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  })
);

export default router;
