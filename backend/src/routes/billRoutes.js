import express from 'express';
import { billsRepo, itemsRepo, usersRepo, getPool } from '../db.js';
import { requireAuth } from '../auth.js';
import { sanitizeText, sanitizePhone } from '../utils/sanitize.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Active in-memory KDS tickets store per store ID
const activeKdsQueue = new Map();

export function updateActiveKdsStatus(storeId, ticketId, status) {
  const existing = activeKdsQueue.get(String(storeId)) || [];
  const t = existing.find((x) => String(x.id) === String(ticketId));
  if (t) {
    t.status = status;
    return t;
  }
  return null;
}

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
    const { label, items, invoiceNumber, customerName } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      return res.status(400).json({ error: 'Cart items required (max 200 items)' });
    }
    const storeId = String(req.userId);
    const cleanLabel = sanitizeText(label) || 'Kitchen Ticket';
    const cleanInvoiceNumber = invoiceNumber ? sanitizeText(invoiceNumber) : null;
    const cleanCustomerName = customerName ? sanitizeText(customerName) : null;
    const orderTicket = {
      id: 'KDS-' + Date.now().toString().slice(-4),
      label: cleanLabel,
      items,
      total: items.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 1), 0),
      createdAt: new Date().toISOString(),
      status: 'preparing',
      invoiceNumber: cleanInvoiceNumber,
      customerName: cleanCustomerName,
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
    const { label, items, paymentMethod, customerName, customerPhone, status, clientBillId } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      return res.status(400).json({ error: 'Bill must have between 1 and 200 items' });
    }

    const userId = Number(req.userId);

    // 1. Verify line items & prices (Catalog price lock against internal theft)
    for (const line of items) {
      const linePrice = typeof line.price === 'number' ? line.price : Number(line.price);
      const lineQty = typeof line.qty === 'number' ? line.qty : Number(line.qty || 1);

      if (isNaN(linePrice) || linePrice < 0 || linePrice > 999999) {
        return res.status(400).json({ error: 'Item price must be between 0 and 999,999' });
      }
      if (isNaN(lineQty) || lineQty <= 0 || lineQty > 9999) {
        return res.status(400).json({ error: 'Item quantity must be between 1 and 9,999' });
      }

      // If line is linked to catalog itemId, verify price matches database (1 rupee tolerance for float precision)
      if (line.itemId) {
        const dbItem = await itemsRepo.findById(line.itemId, userId);
        if (dbItem && Math.abs(linePrice - Number(dbItem.price)) > 1) {
          return res.status(400).json({
            error: `Price mismatch for ${dbItem.name}. Expected ₹${dbItem.price}, got ₹${linePrice}`,
          });
        }
      }
    }

    // 2. Authoritative server-side financial math (prevents client-side total manipulation)
    const user = await usersRepo.findById(userId);
    const taxPercent = user && typeof user.tax_percent === 'number' && user.tax_percent >= 0 ? user.tax_percent : 0;

    const serverSubtotal = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
      0
    );
    const serverTax = Number((serverSubtotal * (taxPercent / 100)).toFixed(2));
    const serverTotal = Number((serverSubtotal + serverTax).toFixed(2));

    const now = Date.now();

    // 3. Check clientBillId if provided by frontend for idempotency
    if (clientBillId) {
      const clientKey = `client_${userId}_${clientBillId}`;
      const existing = recentBillsMap.get(clientKey);
      if (existing) {
        console.log(`[Dedupe] Prevented duplicate bill via clientBillId: ${clientBillId}`);
        return res.status(200).json({ id: existing.id, bill: existing.bill, deduplicated: true });
      }
    }

    // 4. Rapid double-tap safeguard: check if identical order fingerprint was created in last 4 seconds
    const fingerprintKey = `fp_${userId}_${serverTotal.toFixed(2)}_${items.length}_${items.map((i) => `${i.itemId || i.id}:${i.qty}`).sort().join(',')}`;
    const recentFp = recentBillsMap.get(fingerprintKey);
    if (recentFp && (now - recentFp.timestamp < 4000)) {
      console.log(`[Dedupe] Prevented rapid double-tap duplicate bill within 4s for user ${userId}`);
      return res.status(200).json({ id: recentFp.id, bill: recentFp.bill, deduplicated: true });
    }

    // 5. Sanitize customer and order metadata
    const cleanCustomerName = sanitizeText(customerName) || null;
    const cleanCustomerPhone = sanitizePhone(customerPhone) || null;
    const cleanLabel = sanitizeText(label) || 'Bill';
    const validPaymentMethods = ['upi', 'cash', 'card', 'udhaar', 'other'];
    const cleanPaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'upi';
    const cleanStatus = status === 'unpaid' ? 'unpaid' : 'paid';

    const bill = await billsRepo.create(userId, {
      label: cleanLabel,
      items,
      subtotal: serverSubtotal,
      tax: serverTax,
      total: serverTotal,
      paymentMethod: cleanPaymentMethod,
      customerName: cleanCustomerName,
      customerPhone: cleanCustomerPhone,
      status: cleanStatus,
    });

    // Auto-deduct stock for sold items
    await itemsRepo.deductStock(userId, items);

    // Format invoice number and auto-link to matching active KDS kitchen ticket
    const invNumber = 'INV-' + String(bill.id).padStart(4, '0');
    const storeId = String(userId);
    const existingKds = activeKdsQueue.get(storeId) || [];
    const updatedTickets = [];
    for (const t of existingKds) {
      const matchesLabel = (t.label || '').trim().toLowerCase() === cleanLabel.trim().toLowerCase();
      if (matchesLabel && !t.invoiceNumber) {
        t.invoiceNumber = invNumber;
        if (cleanCustomerName) t.customerName = cleanCustomerName;
        updatedTickets.push(t);
      }
    }
    if (updatedTickets.length > 0) {
      const io = req.app.get('io');
      if (io) {
        for (const ut of updatedTickets) {
          io.to(`store_${storeId}`).emit('kds:order-updated', {
            orderId: ut.id,
            label: ut.label,
            status: ut.status,
            invoiceNumber: ut.invoiceNumber,
            customerName: ut.customerName,
          });
        }
      }
    }

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
