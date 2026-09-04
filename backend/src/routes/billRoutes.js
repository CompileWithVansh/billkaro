import express from 'express';
import { billsRepo, itemsRepo, getPool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Active in-memory KDS tickets store per store ID
const activeKdsQueue = new Map();

// Public KDS orders endpoint for paired kitchen screens (Only active kitchen tickets)
router.get(
  '/kds/orders',
  wrap(async (req, res) => {
    const storeId = req.query.store;
    if (!storeId) return res.status(400).json({ error: 'Store ID is required' });
    const tickets = activeKdsQueue.get(String(storeId)) || [];
    res.json({ bills: tickets });
  })
);

// Public/Paired endpoint to clear a ticket from active KDS queue when cook clears it
router.post(
  '/kds/clear-ticket',
  wrap(async (req, res) => {
    const { storeId, ticketId } = req.body || {};
    if (storeId && ticketId) {
      const existing = activeKdsQueue.get(String(storeId)) || [];
      activeKdsQueue.set(String(storeId), existing.filter((t) => String(t.id) !== String(ticketId)));
    }
    res.json({ ok: true });
  })
);

router.use(requireAuth);

// POST /api/bills/kds/send (Explicitly send current cart ticket to Kitchen Display)
router.post(
  '/kds/send',
  wrap(async (req, res) => {
    const { label, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart items required to send ticket to kitchen' });
    }
    const storeId = String(req.userId);
    const orderTicket = {
      id: 'KDS-' + Date.now().toString().slice(-4),
      label: label || 'Kitchen Ticket',
      items,
      total: items.reduce((s, l) => s + (l.price || 0) * (l.qty || 1), 0),
      createdAt: new Date().toISOString(),
      status: 'preparing',
    };

    // Store in active in-memory KDS queue for this store
    const existing = activeKdsQueue.get(storeId) || [];
    activeKdsQueue.set(storeId, [orderTicket, ...existing.filter((t) => t.id !== orderTicket.id)]);

    const io = req.app.get('io');
    if (io) {
      io.to(`store_${storeId}`).emit('kds:new-order', orderTicket);
    }
    res.json({ ok: true, ticket: orderTicket });
  })
);

// In-memory deduplication cache to prevent duplicate bill creation from accidental double-taps or network retries
const recentBillsMap = new Map(); // key -> { id, bill, timestamp }

// Periodic cleanup of stale deduplication cache entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recentBillsMap.entries()) {
    if (now - val.timestamp > 60000) {
      recentBillsMap.delete(key);
    }
  }
}, 60000).unref();

// POST /api/bills (Payment checkout — strictly saves to database for history/reports; does NOT send to KDS)
router.post(
  '/',
  wrap(async (req, res) => {
    const { label, items, subtotal, tax, total, paymentMethod, customerName, customerPhone, status, clientBillId } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    const userId = Number(req.userId);
    const now = Date.now();

    // 1. Check clientBillId if provided by frontend
    if (clientBillId) {
      const clientKey = `client_${userId}_${clientBillId}`;
      const existing = recentBillsMap.get(clientKey);
      if (existing) {
        console.log(`[Dedupe] Prevented duplicate bill via clientBillId: ${clientBillId}`);
        return res.status(200).json({ id: existing.id, bill: existing.bill, deduplicated: true });
      }
    }

    // 2. Rapid double-tap safeguard: check if identical order fingerprint was created in last 4 seconds
    const fingerprintKey = `fp_${userId}_${Number(total).toFixed(2)}_${items.length}_${items.map((i) => `${i.itemId || i.id}:${i.qty}`).sort().join(',')}`;
    const recentFp = recentBillsMap.get(fingerprintKey);
    if (recentFp && (now - recentFp.timestamp < 4000)) {
      console.log(`[Dedupe] Prevented rapid double-tap duplicate bill within 4s for user ${userId}`);
      return res.status(200).json({ id: recentFp.id, bill: recentFp.bill, deduplicated: true });
    }

    const bill = await billsRepo.create(userId, {
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
    await itemsRepo.deductStock(userId, items);

    // Cache the created bill for deduplication
    const billRecord = { id: bill.id, bill, timestamp: now };
    if (clientBillId) {
      recentBillsMap.set(`client_${userId}_${clientBillId}`, billRecord);
    }
    recentBillsMap.set(fingerprintKey, billRecord);

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
