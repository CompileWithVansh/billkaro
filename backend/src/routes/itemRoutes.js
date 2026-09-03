import express from 'express';
import { itemsRepo } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();
router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function mapItem(r) {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    color: r.color,
    category: r.category,
    description: r.description || '',
    stockQuantity: r.stock_quantity !== undefined && r.stock_quantity !== null ? Number(r.stock_quantity) : null,
    sortOrder: r.sort_order,
  };
}

// GET /api/items
router.get(
  '/',
  wrap(async (req, res) => {
    const items = await itemsRepo.listByUser(req.userId);
    res.json({ items: items.map(mapItem) });
  })
);

// POST /api/items
router.post(
  '/',
  wrap(async (req, res) => {
    const { name, price, color, category, description, stockQuantity } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const item = await itemsRepo.create(req.userId, { name, price, color, category, description, stockQuantity });
    res.status(201).json({ item: mapItem(item) });
  })
);

// PUT /api/items/layout/reorder
router.put(
  '/layout/reorder',
  wrap(async (req, res) => {
    const { order } = req.body || {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of item ids' });
    }
    const items = await itemsRepo.reorder(req.userId, order);
    res.json({ items: items.map(mapItem) });
  })
);

// PUT /api/items/:id
router.put(
  '/:id',
  wrap(async (req, res) => {
    const { name, price, color, category, description, stockQuantity } = req.body || {};
    const item = await itemsRepo.update(req.params.id, req.userId, { name, price, color, category, description, stockQuantity });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: mapItem(item) });
  })
);

// DELETE /api/items/:id
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ok = await itemsRepo.remove(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  })
);

export default router;
