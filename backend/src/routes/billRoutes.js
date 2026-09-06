import express from 'express';
import { billsRepo, itemsRepo, usersRepo, getPool } from '../db.js';
import { requireAuth, requireUserRole } from '../auth.js';
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

// Authenticated KDS orders endpoint for paired kitchen screens (Scoped to authenticated store)
router.get(
  '/kds/orders',
  requireAuth,
  wrap(async (req, res) => {
    const storeId = req.query.store;
    if (!storeId) return res.status(400).json({ error: 'Store ID is required' });
    if (String(req.userId) !== String(storeId)) {
      return res.status(403).json({ error: 'Unauthorized access to this store tickets' });
    }
    const tickets = activeKdsQueue.get(String(storeId)) || [];
    res.json({ bills: tickets });
  })
);

// Authenticated endpoint to clear a ticket from active KDS queue when cook clears it
router.post(
  '/kds/clear-ticket',
  requireAuth,
  wrap(async (req, res) => {
    const { storeId, ticketId } = req.body || {};
    if (!storeId || !ticketId) {
      return res.status(400).json({ error: 'storeId and ticketId are required' });
    }
    if (String(req.userId) !== String(storeId)) {
      return res.status(403).json({ error: 'Unauthorized access to this store tickets' });
    }
    const existing = activeKdsQueue.get(String(storeId)) || [];
    activeKdsQueue.set(String(storeId), existing.filter((t) => String(t.id) !== String(ticketId)));
    res.json({ ok: true });
  })
);

// All subsequent routes require full authentication
router.use(requireAuth);

// In-memory deduplication cache for KDS to prevent duplicate tickets on rapid double-taps
const recentKdsSends = new Map(); // key -> { timestamp, ticket }

// POST /api/bills/kds/send (Explicitly send current cart ticket to Kitchen Display - Cashier only)
router.post(
  '/kds/send',
  requireUserRole,
  wrap(async (req, res) => {
    const { label, items, invoiceNumber, customerName } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      return res.status(400).json({ error: 'Cart items required (max 200 items)' });
    }
    const storeId = String(req.userId);
    const cleanLabel = sanitizeText(label) || 'Kitchen Ticket';
    const cleanInvoiceNumber = invoiceNumber ? sanitizeText(invoiceNumber) : null;
    const cleanCustomerName = customerName ? sanitizeText(customerName) : null;

    // Sanitize item names, categories, and portion descriptions to prevent Stored XSS
    const cleanItems = items.map((l) => ({
      ...l,
      name: sanitizeText(l.name) || 'Item',
      category: l.category ? sanitizeText(l.category) : undefined,
      description: l.description ? sanitizeText(l.description) : undefined,
      price: Number(l.price) || 0,
      qty: Number(l.qty) || 1,
    }));

    // Deduplication check: Ignore rapid double-clicks within 3 seconds for the exact same store, table, and item payload
    const dedupKey = `${storeId}:${cleanLabel.toLowerCase()}:${JSON.stringify(cleanItems.map((i) => ({ name: i.name, qty: i.qty })))}`;
    const recentSend = recentKdsSends.get(dedupKey);
    if (recentSend && Date.now() - recentSend.timestamp < 3000) {
      return res.json({ ok: true, ticket: recentSend.ticket, duplicateSuppressed: true });
    }

    const existing = activeKdsQueue.get(storeId) || [];
    const existingTableTicket = existing.find(
      (t) => (t.label || '').trim().toLowerCase() === cleanLabel.trim().toLowerCase()
    );

    let orderTicket;
    if (existingTableTicket) {
      // Incremental Order / Running Table:
      // Compare with previous items and flag newly added items for the kitchen
      const prevItems = existingTableTicket.items || [];
      const updatedItems = cleanItems.map((newItem) => {
        const prev = prevItems.find((p) => p.name.toLowerCase() === newItem.name.toLowerCase());
        if (!prev) {
          return { ...newItem, isNew: true };
        } else if (newItem.qty > prev.qty) {
          return { ...newItem, newQty: newItem.qty - prev.qty, isUpdated: true };
        }
        return newItem;
      });

      existingTableTicket.items = updatedItems;
      existingTableTicket.total = cleanItems.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 1), 0);
      existingTableTicket.status = 'preparing'; // Reset status to cooking for kitchen
      if (cleanInvoiceNumber) {
        existingTableTicket.invoiceNumber = cleanInvoiceNumber;
      }
      if (cleanCustomerName) {
        existingTableTicket.customerName = cleanCustomerName;
      }
      orderTicket = existingTableTicket;
    } else {
      // New kitchen ticket with guaranteed order/invoice identifier
      const ticketId = 'KDS-' + Date.now().toString().slice(-4);
      orderTicket = {
        id: ticketId,
        label: cleanLabel,
        items: cleanItems,
        total: cleanItems.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 1), 0),
        createdAt: new Date().toISOString(),
        status: 'preparing',
        invoiceNumber: cleanInvoiceNumber || ticketId,
        customerName: cleanCustomerName,
      };
      activeKdsQueue.set(storeId, [orderTicket, ...existing]);
    }

    recentKdsSends.set(dedupKey, { timestamp: Date.now(), ticket: orderTicket });

    const io = req.app.get('io');
    if (io) {
      io.to(`store_${storeId}`).emit('kds:new-order', orderTicket);
      io.to(`store_${storeId}`).emit('kds:order-updated', {
        orderId: orderTicket.id,
        label: orderTicket.label,
        status: 'preparing',
        invoiceNumber: orderTicket.invoiceNumber,
        customerName: orderTicket.customerName,
        items: orderTicket.items,
      });
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
  for (const [key, val] of recentKdsSends.entries()) {
    if (now - val.timestamp > 60000) {
      recentKdsSends.delete(key);
    }
  }
}, 60000).unref();

// POST /api/bills (Payment checkout — strictly saves to database for history/reports; Cashier only)
router.post(
  '/',
  requireUserRole,
  wrap(async (req, res) => {
    const {
      label,
      items,
      paymentMethod,
      customerName,
      customerPhone,
      status,
      clientBillId,
      discountType,
      discountValue,
      discountAmount,
      cashAmount,
      upiAmount,
    } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      return res.status(400).json({ error: 'Bill must have between 1 and 200 items' });
    }

    const userId = Number(req.userId);

    // Sanitize item names, categories, and portion descriptions to prevent Stored XSS
    const cleanItems = items.map((l) => ({
      ...l,
      name: sanitizeText(l.name) || 'Item',
      category: l.category ? sanitizeText(l.category) : undefined,
      description: l.description ? sanitizeText(l.description) : undefined,
      price: typeof l.price === 'number' ? l.price : Number(l.price) || 0,
      qty: typeof l.qty === 'number' ? l.qty : Number(l.qty) || 1,
    }));

    // 1. Verify line items & prices (Catalog price lock against internal theft)
    for (const line of cleanItems) {
      const linePrice = line.price;
      const lineQty = line.qty;

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

    // 2. Authoritative server-side financial math with discount
    const user = await usersRepo.findById(userId);
    const taxPercent = user && typeof user.tax_percent === 'number' && user.tax_percent >= 0 ? user.tax_percent : 0;

    const serverSubtotal = cleanItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
      0
    );

    // Calculate authoritative discount
    let cleanDiscountType = null;
    let cleanDiscountValue = 0;
    let cleanDiscountAmount = 0;

    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, Number(discountValue) || 0));
      if (pct > 0) {
        cleanDiscountType = 'percent';
        cleanDiscountValue = pct;
        cleanDiscountAmount = Number(((serverSubtotal * pct) / 100).toFixed(2));
      }
    } else if (discountType === 'flat' || Number(discountAmount) > 0) {
      const flat = Math.min(serverSubtotal, Math.max(0, Number(discountValue) || Number(discountAmount) || 0));
      if (flat > 0) {
        cleanDiscountType = 'flat';
        cleanDiscountValue = flat;
        cleanDiscountAmount = Number(flat.toFixed(2));
      }
    }

    const serverTaxable = Math.max(0, serverSubtotal - cleanDiscountAmount);
    const serverTax = Number((serverTaxable * (taxPercent / 100)).toFixed(2));
    const serverTotal = Number((serverTaxable + serverTax).toFixed(2));

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
    const fingerprintKey = `fp_${userId}_${serverTotal.toFixed(2)}_${cleanItems.length}_${cleanItems.map((i) => `${i.itemId || i.id}:${i.qty}`).sort().join(',')}`;
    const recentFp = recentBillsMap.get(fingerprintKey);
    if (recentFp && (now - recentFp.timestamp < 4000)) {
      console.log(`[Dedupe] Prevented rapid double-tap duplicate bill within 4s for user ${userId}`);
      return res.status(200).json({ id: recentFp.id, bill: recentFp.bill, deduplicated: true });
    }

    // 5. Sanitize customer and order metadata
    const cleanCustomerName = sanitizeText(customerName) || null;
    const cleanCustomerPhone = sanitizePhone(customerPhone) || null;
    const cleanLabel = sanitizeText(label) || 'Bill';
    const validPaymentMethods = ['upi', 'cash', 'card', 'udhaar', 'split', 'other'];
    const cleanPaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'upi';
    const cleanStatus = status === 'unpaid' ? 'unpaid' : 'paid';

    let cleanCash = null;
    let cleanUpi = null;
    if (cleanPaymentMethod === 'split') {
      cleanCash = Math.max(0, Number(cashAmount) || 0);
      cleanUpi = Math.max(0, Number(upiAmount) || 0);
      if (cleanCash === 0 && cleanUpi === 0) {
        cleanUpi = serverTotal;
      } else if (Math.abs(cleanCash + cleanUpi - serverTotal) > 1) {
        cleanUpi = Math.max(0, Number((serverTotal - cleanCash).toFixed(2)));
      }
    }

    const bill = await billsRepo.create(userId, {
      label: cleanLabel,
      items: cleanItems,
      subtotal: serverSubtotal,
      tax: serverTax,
      total: serverTotal,
      paymentMethod: cleanPaymentMethod,
      customerName: cleanCustomerName,
      customerPhone: cleanCustomerPhone,
      status: cleanStatus,
      discountType: cleanDiscountType,
      discountValue: cleanDiscountValue,
      discountAmount: cleanDiscountAmount,
      cashAmount: cleanPaymentMethod === 'split' ? cleanCash : null,
      upiAmount: cleanPaymentMethod === 'split' ? cleanUpi : null,
    });

    // Auto-deduct stock for sold items
    await itemsRepo.deductStock(userId, cleanItems);

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

// GET /api/bills (Cashier/Owner only)
router.get(
  '/',
  requireUserRole,
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
        discountType: r.discount_type || null,
        discountValue: Number(r.discount_value) || 0,
        discountAmount: Number(r.discount_amount) || 0,
        cashAmount: r.cash_amount != null ? Number(r.cash_amount) : null,
        upiAmount: r.upi_amount != null ? Number(r.upi_amount) : null,
        createdAt: r.created_at,
      })),
    });
  })
);

// PUT /api/bills/:id/status (Mark Udhaar bill as paid, etc. - Cashier/Owner only)
router.put(
  '/:id/status',
  requireUserRole,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }
    const { status } = req.body || {};
    const validStatuses = ['paid', 'unpaid', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be paid, unpaid, or cancelled.' });
    }
    const bill = await billsRepo.updateStatus(id, req.userId, status);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json({ ok: true, bill });
  })
);

// DELETE /api/bills/:id (Cashier/Owner only)
router.delete(
  '/:id',
  requireUserRole,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }
    const ok = await billsRepo.remove(id, req.userId);
    if (!ok) return res.status(404).json({ error: 'Bill not found' });
    res.json({ ok: true });
  })
);

export default router;
