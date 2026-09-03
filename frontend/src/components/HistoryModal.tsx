import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { getItemDesc, formatInvoiceNumber, getBillDisplayLabel, type Item, type SavedBill, type User } from '../types';
import { printBill } from './PrintReceipt';

interface Props {
  user: User;
  items?: Item[];
  onClose: () => void;
}

export default function HistoryModal({ user, items, onClose }: Props) {
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

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

  function handleSendWhatsAppReminder(b: SavedBill) {
    const custName = b.customerName || 'Customer';
    const dateFormatted = new Date(b.createdAt).toLocaleDateString('en-IN');
    const invNum = formatInvoiceNumber(b.id);
    const amountStr = Number(b.total).toFixed(2);

    let paymentInfo = '';
    if (user.upiId) {
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(`Bill-${invNum}`)}`;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(upiDeepLink)}`;

      paymentInfo = `💳 *Pay via UPI ID:* \`${user.upiId}\`\n\n📲 *1-Tap Pay Link:*\n${upiDeepLink}\n\n🖼️ *Scan QR Code to Pay:*\n${qrImageUrl}\n\n`;
    }

    const text = `*Pending Payment Reminder — ${user.storeName || 'BillKaro'}*\n\nHi ${custName},\nThis is a friendly payment reminder regarding your pending balance of *₹${amountStr}* from ${dateFormatted} (${invNum}).\n\n${paymentInfo}Thank you!`;

    if (b.customerPhone && b.customerPhone.trim()) {
      const cleanPhone = b.customerPhone.replace(/\D/g, '');
      const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
    } else if (navigator.share) {
      navigator.share({
        title: `Payment Reminder - ${b.customerName || 'Udhaar'} (${invNum})`,
        text,
      }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  function handleSendWhatsAppReceipt(b: SavedBill) {
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
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(upiDeepLink)}`;
      upiSection = `\n💳 *UPI ID:* \`${user.upiId}\`\n🖼️ *Scan QR Code:*\n${qrImageUrl}\n`;
    }

    const text = `*BillKaro Receipt — ${user.storeName || 'BillKaro'}*\nDate: ${new Date(b.createdAt).toLocaleDateString('en-IN')}\nInvoice: *${billDisplay}*${b.customerName ? `\nCustomer: ${b.customerName}` : ''}\n\n*Items Ordered:*\n${itemsList}\n\n----------------------------------\nSubtotal: ₹${Number(b.subtotal).toFixed(2)}${b.tax > 0 ? `\nTax (${user.taxPercent || 0}%): ₹${Number(b.tax).toFixed(2)}` : ''}\n*Total Amount: ₹${Number(b.total).toFixed(2)}*\nPayment: ${b.status === 'unpaid' ? 'UDHAAR / UNPAID' : `PAID via ${(b.paymentMethod || 'UPI').toUpperCase()}`}\n----------------------------------${upiSection}\nThank you for visiting us!`;

    if (b.customerPhone && b.customerPhone.trim()) {
      const cleanPhone = b.customerPhone.replace(/\D/g, '');
      const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
    } else if (navigator.share) {
      navigator.share({
        title: `BillKaro Receipt - ${billDisplay}`,
        text,
      }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  // Calculate Dates & Sales Metrics
  const today = new Date();
  const todayStr = today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const periodTitle =
    salesPeriod === 'today'
      ? "TODAY'S"
      : salesPeriod === 'yesterday'
      ? "YESTERDAY'S"
      : salesPeriod === 'custom' && customDate
      ? new Date(customDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()
      : 'ALL TIME';

  const periodBills = useMemo(() => {
    return bills.filter((b) => {
      const dStr = new Date(b.createdAt).toDateString();
      if (salesPeriod === 'today') return dStr === todayStr;
      if (salesPeriod === 'yesterday') return dStr === yesterdayStr;
      if (salesPeriod === 'custom' && customDate) {
        return dStr === new Date(customDate + 'T00:00:00').toDateString();
      }
      return true; // 'all'
    });
  }, [bills, salesPeriod, customDate, todayStr, yesterdayStr]);

  const periodTotal = periodBills.reduce((s, b) => s + b.total, 0);
  const periodCash = periodBills.filter((b) => b.paymentMethod === 'cash' && b.status === 'paid').reduce((s, b) => s + b.total, 0);
  const periodUpi = periodBills.filter((b) => b.paymentMethod === 'upi' && b.status === 'paid').reduce((s, b) => s + b.total, 0);
  const periodUdhaar = periodBills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.total, 0);

  const totalUdhaar = bills
    .filter((b) => b.status === 'unpaid')
    .reduce((sum, b) => sum + b.total, 0);

  const filteredBills = bills.filter((b) => {
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

        {/* Sales Period Selector: Today, Yesterday, All Time, Custom Date */}
        <div className="period-selector-row">
          <div className="period-pills">
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'today' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('today'); setCustomDate(''); }}
            >
              📅 Today
            </button>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'yesterday' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('yesterday'); setCustomDate(''); }}
            >
              ⏪ Yesterday
            </button>
            <button
              type="button"
              className={`pill-btn ${salesPeriod === 'all' ? 'active' : ''}`}
              onClick={() => { setSalesPeriod('all'); setCustomDate(''); }}
            >
              🌐 All Time
            </button>
          </div>
          <input
            type="date"
            className="period-date-input"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              if (e.target.value) setSalesPeriod('custom');
            }}
            title="Pick specific date"
          />
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
              All ({bills.length})
            </button>
            <button
              type="button"
              className={`btn sm-btn ${filter === 'paid' ? 'primary' : 'ghost'}`}
              onClick={() => setFilter('paid')}
            >
              Paid ({bills.filter((b) => b.status === 'paid').length})
            </button>
            <button
              type="button"
              className={`btn sm-btn ${filter === 'unpaid' ? 'danger' : 'ghost'}`}
              onClick={() => setFilter('unpaid')}
            >
              Udhaar ({bills.filter((b) => b.status === 'unpaid').length})
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
                          onClick={() => handleSendWhatsAppReceipt(b)}
                          title="Share WhatsApp Receipt"
                        >
                          📲 WhatsApp
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
                              padding: '2px 8px',
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
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
                              onClick={() => handleSendWhatsAppReceipt(b)}
                              title="Share receipt on WhatsApp"
                            >
                              📲 WhatsApp
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

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
