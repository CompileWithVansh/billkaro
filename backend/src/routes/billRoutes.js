import express from 'express';
import { billsRepo, itemsRepo } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Public KDS orders endpoint for paired kitchen screens
router.get(
  '/kds/orders',
  wrap(async (req, res) => {
    const storeId = req.query.store;
    if (!storeId) return res.status(400).json({ error: 'Store ID is required' });
    const rows = await billsRepo.listByUser(storeId);
    res.json({
      bills: rows.map((r) => ({
        id: r.id,
        label: r.label,
        items: typeof r.items_json === 'string' ? JSON.parse(r.items_json) : r.items_json,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        paymentMethod: r.payment_method || 'upi',
        customerName: r.customer_name || null,
        customerPhone: r.customer_phone || null,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  })
);

router.use(requireAuth);

// POST /api/bills
router.post(
  '/',
  wrap(async (req, res) => {
    const { label, items, subtotal, tax, total, paymentMethod, customerName, customerPhone, status } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    const bill = await billsRepo.create(req.userId, {
      label,
      items,
      subtotal,
      tax,
      total,
      paymentMethod: paymentMethod || 'upi',
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      status: status || 'paid',
    });

    // Auto-deduct stock for sold items
    await itemsRepo.deductStock(req.userId, items);

    // Broadcast live order ticket to Kitchen Display System (KDS) sockets
    const io = req.app.get('io');
    if (io) {
      const orderTicket = {
        id: bill.id,
        label: bill.label || 'Order',
        items,
        total: bill.total,
        paymentMethod: bill.payment_method,
        createdAt: bill.created_at,
        status: 'preparing',
      };
      io.to(`store_${req.userId}`).emit('kds:new-order', orderTicket);
    }

    res.status(201).json({ id: bill.id, bill });
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
        items: typeof r.items_json === 'string' ? JSON.parse(r.items_json) : r.items_json,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        paymentMethod: r.payment_method || 'upi',
        customerName: r.customer_name || null,
        customerPhone: r.customer_phone || null,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  })
);

// PUT /api/bills/:id/status (e.g. Mark Udhaar bill as paid)
router.put(
  '/:id/status',
  wrap(async (req, res) => {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });
    const bill = await billsRepo.updateStatus(req.params.id, req.userId, status);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json({ ok: true, bill });
  })
);

// DELETE /api/bills/:id
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ok = await billsRepo.remove(req.params.id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Bill not found' });
    res.json({ ok: true });
  })
);

export default router;
