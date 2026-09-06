import { useEffect, useMemo, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { api } from '../api';
import { getItemDesc, formatInvoiceNumber, getBillDisplayLabel, type Item, type SavedBill, type User } from '../types';
import { printBill } from './PrintReceipt';
import { ReceiptCard } from './ReceiptCard';

interface Props {
  user: User;
  items?: Item[];
  onClose: () => void;
}

export function formatWhatsAppPhone(phone?: string | null): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export default function HistoryModal({ user, items, onClose }: Props) {
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'yesterday' | 'week' | 'range'>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

  const [activeReceiptBill, setActiveReceiptBill] = useState<SavedBill | null>(null);
  const [sharingBillId, setSharingBillId] = useState<string | number | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    try {
      setLoading(true);
      const res = await api.get('/bills');
      setBills(res.data.bills || []);
    } catch (err) {
      console.error('Failed to load past bills:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid(billId: string | number) {
    try {
      setUpdatingId(billId);
      await api.put(`/bills/${billId}/status`, { status: 'paid' });
      setBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, status: 'paid' } : b))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Could not update status.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteBill(billId: string | number, label: string) {
    if (!window.confirm(`Delete bill entry "${label}" permanently?`)) return;
    try {
      setUpdatingId(billId);
      await api.delete(`/bills/${billId}`);
      setBills((prev) => prev.filter((b) => b.id !== billId));
    } catch (err) {
      console.error('Failed to delete bill:', err);
      alert('Could not delete bill.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSendWhatsAppReminder(b: SavedBill) {
    let targetPhone = formatWhatsAppPhone(b.customerPhone);

    // If no phone was entered at checkout, give option to enter it OR skip to pick from phone contacts
    if (!targetPhone) {
      const entered = window.prompt(
        `Enter WhatsApp number for ${b.customerName || 'Customer'} (or press Cancel to pick from your phone contacts):`,
        ''
      );
      if (entered && entered.trim()) {
        const clean = formatWhatsAppPhone(entered);
        if (clean.length >= 10) {
          targetPhone = clean;
        }
      }
    }

    const custName = b.customerName || 'Customer';
    const dateFormatted = new Date(b.createdAt).toLocaleDateString('en-IN');
    const invNum = formatInvoiceNumber(b.id);
    const amountStr = Number(b.total).toFixed(2);

    let paymentInfo = '';
    if (user.upiId) {
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(`Bill-${invNum}`)}`;
      paymentInfo = `💳 *Pay via UPI ID:* \`${user.upiId}\`\n\n📲 *1-Tap Pay Link:*\n${upiDeepLink}\n\n`;
    }

    const text = `*Pending Payment Reminder — ${user.storeName || 'BillKaro'}*\n\nHi ${custName},\nThis is a friendly payment reminder regarding your pending balance of *₹${amountStr}* from ${dateFormatted} (${invNum}).\n\n${paymentInfo}Thank you!`;

    if (targetPhone) {
      // Directly opens chat with the customer (no contact saving required)
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      // If cashier has them saved in phone contacts and skipped typing:
      // Opens WhatsApp contact selector with the pre-filled reminder message!
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  async function handleSendWhatsAppReceipt(b: SavedBill) {
    const targetPhone = formatWhatsAppPhone(b.customerPhone);
    const invNum = formatInvoiceNumber(b.id);
    const billDisplay = getBillDisplayLabel(b);
    const itemsList = (b.items || [])
      .map((l) => {
        const catalogItem = items?.find((i) => i.id === l.itemId);
        const desc = getItemDesc(l) || (catalogItem ? getItemDesc(catalogItem) : '');
        return `• *${l.name}*${desc ? ` (${desc})` : ''} x${l.qty} — ₹${(l.price * l.qty).toFixed(2)}`;
      })
      .join('\n');

    let upiSection = '';
    if (user.upiId) {
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${Number(b.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill-${invNum}`)}`;
      upiSection = `\n💳 *UPI ID:* \`${user.upiId}\`\n📲 *UPI Pay:* ${upiDeepLink}\n`;
    }

    const textMessage = `*BillKaro Receipt — ${user.storeName || 'BillKaro'}*\nDate: ${new Date(b.createdAt).toLocaleDateString('en-IN')}\nInvoice: *${billDisplay}*${b.customerName ? `\nCustomer: ${b.customerName}` : ''}\n\n*Items Ordered:*\n${itemsList}\n\n----------------------------------\nSubtotal: ₹${Number(b.subtotal).toFixed(2)}${b.tax > 0 ? `\nTax (${user.taxPercent || 0}%): ₹${Number(b.tax).toFixed(2)}` : ''}\n*Total Amount: ₹${Number(b.total).toFixed(2)}*\nPayment: ${b.status === 'unpaid' ? 'UDHAAR / UNPAID' : `PAID via ${(b.paymentMethod || 'UPI').toUpperCase()}`}\n----------------------------------${upiSection}\nThank you for visiting us!`;

    const openWhatsAppDirect = () => {
      if (targetPhone) {
        window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(textMessage)}`, '_blank');
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(textMessage)}`, '_blank');
      }
    };

    try {
      setSharingBillId(b.id);
      setActiveReceiptBill(b);

      // Microtick to render ReceiptCard & QR code canvas
      await new Promise((r) => setTimeout(r, 180));

      if (receiptRef.current) {
        const blob = await toBlob(receiptRef.current, { pixelRatio: 2 });
        if (blob) {
          const file = new File([blob], `${invNum}_Receipt.png`, { type: 'image/png' });

          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `BillKaro Receipt - ${invNum}`,
              text: textMessage,
              files: [file],
            });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${invNum}_Receipt.png`;
            a.click();
            URL.revokeObjectURL(url);
            openWhatsAppDirect();
          }
        } else {
          openWhatsAppDirect();
        }
      } else {
        openWhatsAppDirect();
      }
    } catch (err) {
      console.warn('Receipt image generation failed:', err);
      openWhatsAppDirect();
    } finally {
      setSharingBillId(null);
    }
  }

  // Calculate Dates & Sales Metrics
  const today = new Date();
  const todayStr = today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const periodTitle = useMemo(() => {
    if (salesPeriod === 'today') return "TODAY'S";
    if (salesPeriod === 'yesterday') return "YESTERDAY'S";
    if (salesPeriod === 'week') return "THIS WEEK'S";
    if (salesPeriod === 'range') {
      if (startDate && endDate) {
        const s = new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const e = new Date(endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${s} – ${e}`.toUpperCase();
      }
      if (startDate) return `FROM ${new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`.toUpperCase();
      if (endDate) return `UNTIL ${new Date(endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`.toUpperCase();
      return 'DATE RANGE';
    }
    return "TODAY'S";
  }, [salesPeriod, startDate, endDate]);

  const periodBills = useMemo(() => {
    return bills.filter((b) => {
      const billDate = new Date(b.createdAt);
      const dStr = billDate.toDateString();
      if (salesPeriod === 'today') return dStr === todayStr;
      if (salesPeriod === 'yesterday') return dStr === yesterdayStr;
      if (salesPeriod === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return billDate >= weekAgo;
      }
      if (salesPeriod === 'range') {
        if (!startDate && !endDate) return true;
        const bTime = billDate.getTime();
        const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
        const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
        return bTime >= start && bTime <= end;
      }
      return dStr === todayStr;
    });
  }, [bills, salesPeriod, startDate, endDate, todayStr, yesterdayStr]);

  const periodTotal = periodBills.reduce((s, b) => s + b.total, 0);
  const periodCash = periodBills.filter((b) => b.paymentMethod === 'cash' && b.status === 'paid').reduce((s, b) => s + b.total, 0);
  const periodUpi = periodBills.filter((b) => b.paymentMethod === 'upi' && b.status === 'paid').reduce((s, b) => s + b.total, 0);
  const periodUdhaar = periodBills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.total, 0);

  const totalUdhaar = bills
    .filter((b) => b.status === 'unpaid')
    .reduce((sum, b) => sum + b.total, 0);

  const filteredBills = useMemo(() => {
    return periodBills.filter((b) => {
      if (filter === 'paid' && b.status !== 'paid') return false;
      if (filter === 'unpaid' && b.status !== 'unpaid') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const inv = formatInvoiceNumber(b.id).toLowerCase();
        const nameMatch = b.customerName?.toLowerCase().includes(q);
        const phoneMatch = b.customerPhone?.includes(q);
        const labelMatch = b.label?.toLowerCase().includes(q);
        const invMatch = inv.includes(q);
        return nameMatch || phoneMatch || labelMatch || invMatch;
      }
      return true;
    });
  }, [periodBills, filter, search]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        {/* Header with Top-Right Close Button */}
        <div className="modal-header">
          <div>
            <h3>Bill History & Udhaar Ledger</h3>
            {totalUdhaar > 0 && (
              <div style={{ background: '#ef4444', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700, display: 'inline-block', marginTop: 4 }}>
                Total Udhaar Pending: ₹{totalUdhaar.toFixed(2)}
              </div>
            )}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Sales Period Selector: Today, Yesterday, 7 Days, Date Range */}
        <div className="period-selector-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div className="period-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'today' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('today'); setStartDate(''); setEndDate(''); }}
            >
              📅 Today
            </button>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'yesterday' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('yesterday'); setStartDate(''); setEndDate(''); }}
            >
              ⏪ Yesterday
            </button>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'week' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('week'); setStartDate(''); setEndDate(''); }}
            >
              🗓️ 7 Days
            </button>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'range' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('range'); }}
            >
              📆 Date Range
            </button>
          </div>

          {/* Date Range Inputs */}
          {salesPeriod === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg-2)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>From:</span>
                <input
                  type="date"
                  className="period-date-input"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSalesPeriod('range');
                  }}
                  title="Start date"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>To:</span>
                <input
                  type="date"
                  className="period-date-input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSalesPeriod('range');
                  }}
                  title="End date"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  className="btn sm-btn ghost"
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  title="Reset Range"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sales Summary Grid (Responsive 2x2 on mobile, 4-in-a-row on desktop) */}
        <div className="sales-summary-grid">
          <div className="sales-stat-card">
            <div className="sales-stat-label">{periodTitle} TOTAL SALES</div>
            <div className="sales-stat-val" style={{ color: '#38bdf8' }}>₹{periodTotal.toFixed(2)}</div>
            <div className="sales-stat-sub">{periodBills.length} bill(s)</div>
          </div>
          <div className="sales-stat-card">
            <div className="sales-stat-label">CASH COLLECTED</div>
            <div className="sales-stat-val" style={{ color: '#4ade80' }}>₹{periodCash.toFixed(2)}</div>
          </div>
          <div className="sales-stat-card">
            <div className="sales-stat-label">UPI COLLECTED</div>
            <div className="sales-stat-val" style={{ color: '#60a5fa' }}>₹{periodUpi.toFixed(2)}</div>
          </div>
          <div className="sales-stat-card">
            <div className="sales-stat-label">UDHAAR CREATED</div>
            <div className="sales-stat-val" style={{ color: '#f87171' }}>₹{periodUdhaar.toFixed(2)}</div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="history-filter-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, or INV #…"
          />
          <div className="history-filter-pills">
            <button
              type="button"
              className={`btn sm-btn ${filter === 'all' ? 'primary' : 'ghost'}`}
              onClick={() => setFilter('all')}
            >
              All ({periodBills.length})
            </button>
            <button
              type="button"
              className={`btn sm-btn ${filter === 'paid' ? 'primary' : 'ghost'}`}
              onClick={() => setFilter('paid')}
            >
              Paid ({periodBills.filter((b) => b.status === 'paid').length})
            </button>
            <button
              type="button"
              className={`btn sm-btn ${filter === 'unpaid' ? 'danger' : 'ghost'}`}
              onClick={() => setFilter('unpaid')}
            >
              Udhaar ({periodBills.filter((b) => b.status === 'unpaid').length})
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading bill history…</div>
        ) : filteredBills.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No bills found.</div>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {/* Mobile Cards List (< 768px) */}
            <div className="mobile-bills-list">
              {filteredBills.map((b) => {
                const displayTitle = getBillDisplayLabel(b);
                const dateStr = new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                const timeStr = new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

                return (
                  <div key={b.id} className="history-bill-card">
                    <div className="bill-card-top">
                      <div>
                        <div className="bill-card-inv">{displayTitle}</div>
                        <div className="bill-card-date">{dateStr}, {timeStr}</div>
                      </div>
                      <div className="bill-card-badges">
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: b.status === 'paid' ? '#065f46' : '#991b1b',
                            color: b.status === 'paid' ? '#6ee7b7' : '#fca5a5',
                          }}
                        >
                          {b.status === 'paid' ? 'PAID' : 'UDHAAR'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                          {b.paymentMethod || 'UPI'}
                        </span>
                      </div>
                    </div>

                    {(b.customerName || b.customerPhone) && (
                      <div className="bill-card-customer">
                        👤 {b.customerName || 'Customer'} {b.customerPhone ? `(${b.customerPhone})` : ''}
                      </div>
                    )}

                    <div className="bill-card-items-preview">
                      🛒 {b.items?.length || 0} item(s):{' '}
                      {(b.items || []).map((i) => `${i.name} (x${i.qty})`).slice(0, 2).join(', ')}
                      {(b.items?.length || 0) > 2 ? '…' : ''}
                    </div>

                    <div className="bill-card-bottom">
                      <div className="bill-card-total">
                        ₹{Number(b.total).toFixed(2)}
                      </div>
                      <div className="bill-card-actions">
                        {b.status === 'unpaid' && (
                          <>
                            <button
                              className="btn green sm-btn"
                              disabled={updatingId === b.id}
                              onClick={() => handleMarkPaid(b.id)}
                              title="Mark Paid"
                            >
                              Mark Paid
                            </button>
                            <button
                              className="btn ghost sm-btn"
                              onClick={() => handleSendWhatsAppReminder(b)}
                              title="Send 1-tap WhatsApp Reminder with QR & Pay Link"
                              style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                            >
                              📲 Remind
                            </button>
                          </>
                        )}
                        <button
                          className="btn ghost sm-btn"
                          style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.4)' }}
                          disabled={sharingBillId === b.id}
                          onClick={() => handleSendWhatsAppReceipt(b)}
                          title="Share WhatsApp Receipt Image with QR"
                        >
                          {sharingBillId === b.id ? '⏳ Image…' : '📲 WhatsApp'}
                        </button>
                        <button
                          className="btn ghost sm-btn"
                          onClick={() =>
                            printBill({
                              bill: { id: String(b.id), label: displayTitle, lines: b.items || [] },
                              user,
                              items,
                              subtotal: b.subtotal,
                              tax: b.tax,
                              total: b.total,
                            })
                          }
                          title="Print Receipt"
                        >
                          Print
                        </button>
                        <button
                          className="btn danger sm-btn"
                          disabled={updatingId === b.id}
                          onClick={() => handleDeleteBill(b.id, displayTitle)}
                          title="Delete Bill"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet Table View (>= 768px) */}
            <div className="desktop-bills-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' }}>
                    <th style={{ padding: '8px 12px' }}>Invoice</th>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Customer</th>
                    <th style={{ padding: '8px 12px' }}>Method</th>
                    <th style={{ padding: '8px 12px' }}>Total</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map((b) => {
                    const displayTitle = getBillDisplayLabel(b);
                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8' }}>
                          {displayTitle}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })},{' '}
                          {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {b.customerName || b.customerPhone ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{b.customerName || 'Customer'}</div>
                              {b.customerPhone && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{b.customerPhone}</div>}
                            </div>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textTransform: 'uppercase', fontSize: '0.8rem', color: '#94a3b8' }}>
                          {b.paymentMethod || 'UPI'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          ₹{Number(b.total).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: b.status === 'paid' ? '#065f46' : '#991b1b',
                              color: b.status === 'paid' ? '#6ee7b7' : '#fca5a5',
                            }}
                          >
                            {b.status === 'paid' ? 'PAID' : 'UDHAAR'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {b.status === 'unpaid' && (
                              <>
                                <button
                                  className="btn green sm-btn"
                                  disabled={updatingId === b.id}
                                  onClick={() => handleMarkPaid(b.id)}
                                  title="Mark Udhaar bill as paid"
                                >
                                  Mark Paid
                                </button>
                                <button
                                  className="btn ghost sm-btn"
                                  style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                                  onClick={() => handleSendWhatsAppReminder(b)}
                                  title="Send 1-tap WhatsApp reminder with QR"
                                >
                                  📲 Remind
                                </button>
                              </>
                            )}
                            <button
                              className="btn ghost sm-btn"
                              style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.4)' }}
                              disabled={sharingBillId === b.id}
                              onClick={() => handleSendWhatsAppReceipt(b)}
                              title="Share receipt image on WhatsApp"
                            >
                              {sharingBillId === b.id ? '⏳ Image…' : '📲 WhatsApp'}
                            </button>
                            <button
                              className="btn ghost sm-btn"
                              onClick={() =>
                                printBill({
                                  bill: { id: String(b.id), label: displayTitle, lines: b.items || [] },
                                  user,
                                  items,
                                  subtotal: b.subtotal,
                                  tax: b.tax,
                                  total: b.total,
                                })
                              }
                            >
                              Print
                            </button>
                            <button
                              className="btn danger sm-btn"
                              disabled={updatingId === b.id}
                              onClick={() => handleDeleteBill(b.id, displayTitle)}
                              title="Delete Bill Entry"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hidden off-screen ReceiptCard for WhatsApp image snapshot */}
        {activeReceiptBill && (
          <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', zIndex: -100 }}>
            <ReceiptCard
              ref={receiptRef}
              bill={{
                id: String(activeReceiptBill.id),
                label: getBillDisplayLabel(activeReceiptBill),
                lines: (activeReceiptBill.items || []).map((l, i) => ({
                  lineId: `hist_line_${i}`,
                  itemId: l.itemId ?? null,
                  name: l.name,
                  price: l.price,
                  qty: l.qty,
                  category: l.category,
                  description: l.description,
                })),
                savedBillId: activeReceiptBill.id,
              }}
              user={user}
              items={items}
              invoiceNumber={formatInvoiceNumber(activeReceiptBill.id)}
              subtotal={Number(activeReceiptBill.subtotal)}
              tax={Number(activeReceiptBill.tax)}
              total={Number(activeReceiptBill.total)}
              paymentMethod={activeReceiptBill.paymentMethod || 'upi'}
              customerName={activeReceiptBill.customerName || undefined}
              customerPhone={activeReceiptBill.customerPhone || undefined}
            />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
