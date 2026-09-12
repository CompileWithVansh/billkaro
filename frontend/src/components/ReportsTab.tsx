import { useEffect, useMemo, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { api } from '../api';
import { getItemDesc, formatInvoiceNumber, getBillDisplayLabel, type Item, type SavedBill, type User } from '../types';
import { printReceipt } from './PrintReceipt';
import { ReceiptCard } from './ReceiptCard';

interface Props {
  user: User;
  items?: Item[];
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

export default function ReportsTab({ user, items }: Props) {
  const [activeSubtab, setActiveSubtab] = useState<'reports' | 'bills'>('reports');
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'range'>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [dishSearch, setDishSearch] = useState('');
  const [dishesExpanded, setDishesExpanded] = useState(false);

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

    if (!targetPhone) {
      const entered = window.prompt(
        `Enter WhatsApp number for ${b.customerName || 'Customer'}:`,
        ''
      );
      if (entered && entered.trim()) {
        const clean = formatWhatsAppPhone(entered);
        if (clean.length >= 10) targetPhone = clean;
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
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
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
      const upiAmountToPay = (b.paymentMethod === 'split' && b.upiAmount != null && b.upiAmount > 0) ? b.upiAmount : b.total;
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${Number(upiAmountToPay).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill-${invNum}`)}`;
      upiSection = `\n💳 *UPI ID:* \`${user.upiId}\`\n📲 *UPI Pay Link:* ${upiDeepLink}\n`;
    }

    const discountText = b.discountAmount && Number(b.discountAmount) > 0
      ? `\nDiscount (${b.discountType === 'percent' ? `${b.discountValue}%` : '₹' + b.discountValue}): -₹${Number(b.discountAmount).toFixed(2)}`
      : '';
    const isTaxEnabled = user?.taxEnabled ?? (user?.taxPercent ? user.taxPercent > 0 : false);
    const isTaxInclusive = user?.taxInclusive !== false;
    const taxRate = isTaxEnabled ? (user.taxPercent || 0) : 0;
    const halfRate = +(taxRate / 2).toFixed(2);
    const taxText = taxRate > 0 && b.tax > 0
      ? `\nCGST (${halfRate}%): ₹${(Number(b.tax) / 2).toFixed(2)}\nSGST (${halfRate}%): ₹${(Number(b.tax) / 2).toFixed(2)}${isTaxInclusive ? ' (Included in prices)' : ''}`
      : '';
    const gstinHeader = user?.gstin ? `\nGSTIN: ${user.gstin}` : '';
    const fssaiHeader = user?.fssai ? `\nFSSAI: ${user.fssai}` : '';

    const textMessage = `*BillKaro Receipt — ${user.storeName || 'BillKaro'}*${gstinHeader}${fssaiHeader}\nDate: ${new Date(b.createdAt).toLocaleDateString('en-IN')}\nInvoice: *${billDisplay}*${b.customerName ? `\nCustomer: ${b.customerName}` : ''}\n\n*Items Ordered:*\n${itemsList}\n\n----------------------------------\nSubtotal: ₹${Number(b.subtotal).toFixed(2)}${discountText}${taxText}\n*Total Amount: ₹${Number(b.total).toFixed(2)}*\n----------------------------------${upiSection}\nThank you for visiting us!`;

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

  // Calculate Dates & Filter Bills
  const today = new Date();
  const todayStr = today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

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
      if (salesPeriod === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        return billDate >= monthAgo;
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

  const periodTotal = periodBills.reduce((s, b) => s + Number(b.total || 0), 0);
  const periodCount = periodBills.length;
  const avgOrderValue = periodCount > 0 ? periodTotal / periodCount : 0;
  const periodDiscounts = periodBills.reduce((s, b) => s + (Number(b.discountAmount) || 0), 0);
  const periodTax = periodBills.reduce((s, b) => s + (Number(b.tax) || 0), 0);

  const periodCash = periodBills
    .filter((b) => b.status === 'paid')
    .reduce((s, b) => {
      if (b.paymentMethod === 'cash') return s + Number(b.total || 0);
      if (b.paymentMethod === 'split') return s + (Number(b.cashAmount) || 0);
      return s;
    }, 0);

  const periodUpi = periodBills
    .filter((b) => b.status === 'paid')
    .reduce((s, b) => {
      if (b.paymentMethod === 'upi') return s + Number(b.total || 0);
      if (b.paymentMethod === 'split') return s + (Number(b.upiAmount) || 0);
      return s;
    }, 0);

  const periodSplitBills = periodBills.filter((b) => b.paymentMethod === 'split' && b.status === 'paid');
  const periodSplitCount = periodSplitBills.length;
  const periodSplitTotal = periodSplitBills.reduce((s, b) => s + Number(b.total || 0), 0);

  const periodUdhaar = periodBills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + Number(b.total || 0), 0);
  const periodUdhaarCount = periodBills.filter((b) => b.status === 'unpaid').length;

  const totalUdhaar = bills
    .filter((b) => b.status === 'unpaid')
    .reduce((sum, b) => sum + Number(b.total || 0), 0);

  // Top Selling Items Analytics
  const topSellingItems = useMemo(() => {
    const itemMap = new Map<string, { name: string; category?: string; qty: number; revenue: number }>();
    periodBills.forEach((b) => {
      (b.items || []).forEach((item) => {
        const key = item.name.trim().toLowerCase();
        const existing = itemMap.get(key) || {
          name: item.name,
          category: item.category,
          qty: 0,
          revenue: 0,
        };
        existing.qty += Number(item.qty || 1);
        existing.revenue += (Number(item.price) || 0) * (Number(item.qty) || 1);
        if (item.category && !existing.category) existing.category = item.category;
        itemMap.set(key, existing);
      });
    });
    const list = Array.from(itemMap.values());
    list.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
    return list;
  }, [periodBills]);

  const totalUnitsSold = useMemo(() => {
    return topSellingItems.reduce((acc, item) => acc + item.qty, 0);
  }, [topSellingItems]);

  const displayedTopDishes = useMemo(() => {
    if (!dishSearch.trim()) return topSellingItems;
    const q = dishSearch.toLowerCase();
    return topSellingItems.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q))
    );
  }, [topSellingItems, dishSearch]);

  // Daily Sales Breakdown
  const dailyBreakdown = useMemo(() => {
    const dayMap = new Map<string, { dateStr: string; timestamp: number; count: number; total: number; cash: number; upi: number; udhaar: number }>();
    periodBills.forEach((b) => {
      const d = new Date(b.createdAt);
      const dayKey = d.toISOString().slice(0, 10);
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const existing = dayMap.get(dayKey) || {
        dateStr,
        timestamp: new Date(dayKey).getTime(),
        count: 0,
        total: 0,
        cash: 0,
        upi: 0,
        udhaar: 0,
      };
      existing.count += 1;
      const bTotal = Number(b.total || 0);
      existing.total += bTotal;
      if (b.status === 'unpaid') {
        existing.udhaar += bTotal;
      } else {
        if (b.paymentMethod === 'cash') existing.cash += bTotal;
        else if (b.paymentMethod === 'upi') existing.upi += bTotal;
        else if (b.paymentMethod === 'split') {
          existing.cash += Number(b.cashAmount || 0);
          existing.upi += Number(b.upiAmount || 0);
        }
      }
      dayMap.set(dayKey, existing);
    });
    return Array.from(dayMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [periodBills]);

  function exportReportCsv() {
    if (periodBills.length === 0) {
      alert('No bills in selected period.');
      return;
    }
    const headers = [
      'Invoice Number',
      'Date',
      'Time',
      'Table / Label',
      'Customer Name',
      'Customer Phone',
      'Payment Method',
      'Cash Amount (Rs)',
      'UPI Amount (Rs)',
      'Subtotal (Rs)',
      'Discount Type',
      'Discount Value',
      'Discount Amount (Rs)',
      'Tax (Rs)',
      'Grand Total (Rs)',
      'Status',
    ];

    const escapeCsv = (str: string | number | null | undefined) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const rows = periodBills.map((b) => {
      const d = new Date(b.createdAt);
      return [
        escapeCsv(formatInvoiceNumber(b.id)),
        escapeCsv(d.toLocaleDateString('en-IN')),
        escapeCsv(d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })),
        escapeCsv(b.label || 'T1'),
        escapeCsv(b.customerName || ''),
        escapeCsv(b.customerPhone || ''),
        escapeCsv(b.paymentMethod || 'upi'),
        escapeCsv(b.paymentMethod === 'split' ? b.cashAmount : b.paymentMethod === 'cash' ? b.total : 0),
        escapeCsv(b.paymentMethod === 'split' ? b.upiAmount : b.paymentMethod === 'upi' ? b.total : 0),
        escapeCsv(Number(b.subtotal).toFixed(2)),
        escapeCsv(b.discountType || 'none'),
        escapeCsv(b.discountValue || 0),
        escapeCsv(Number(b.discountAmount || 0).toFixed(2)),
        escapeCsv(Number(b.tax || 0).toFixed(2)),
        escapeCsv(Number(b.total).toFixed(2)),
        escapeCsv(b.status || 'paid'),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BillKaro_Report_${salesPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const filteredBills = useMemo(() => {
    return periodBills.filter((b) => {
      if (filter === 'paid' && b.status !== 'paid') return false;
      if (filter === 'unpaid' && b.status !== 'unpaid') return false;
      if (search.trim()) {
        const rawQ = search.trim();
        const q = rawQ.toLowerCase();

        // 1. Comparison operators: > 1000, < 500, >= 2000, <= 150
        const opMatch = rawQ.match(/^([><]=?)\s*(\d+(\.\d+)?)$/);
        if (opMatch) {
          const op = opMatch[1];
          const val = parseFloat(opMatch[2]);
          const bTotal = Number(b.total || 0);
          if (op === '>') return bTotal > val;
          if (op === '>=') return bTotal >= val;
          if (op === '<') return bTotal < val;
          if (op === '<=') return bTotal <= val;
        }

        // 2. Standard text matches: customer name, phone, table label, invoice number
        const inv = formatInvoiceNumber(b.id).toLowerCase();
        const nameMatch = b.customerName?.toLowerCase().includes(q);
        const phoneMatch = b.customerPhone?.includes(q);
        const labelMatch = b.label?.toLowerCase().includes(q);
        const invMatch = inv.includes(q) || String(b.id).includes(q);

        // 3. Amount search: matches total, subtotal, cash/upi split amounts
        const cleanNum = q.replace(/[₹,\s]|rs\.?/gi, '');
        let amountMatch = false;
        if (cleanNum && !isNaN(Number(cleanNum))) {
          const totalStr = String(b.total || '');
          const totalFixed = Number(b.total || 0).toFixed(2);
          const totalRound = String(Math.round(Number(b.total || 0)));
          const subtotalStr = String(b.subtotal || '');
          const subtotalFixed = Number(b.subtotal || 0).toFixed(2);
          const cashStr = b.cashAmount != null ? String(b.cashAmount) : '';
          const upiStr = b.upiAmount != null ? String(b.upiAmount) : '';

          amountMatch =
            totalStr.includes(cleanNum) ||
            totalFixed.includes(cleanNum) ||
            totalRound.includes(cleanNum) ||
            subtotalStr.includes(cleanNum) ||
            subtotalFixed.includes(cleanNum) ||
            cashStr.includes(cleanNum) ||
            upiStr.includes(cleanNum);
        }

        // 4. Item / dish names inside the bill
        const itemMatch = (b.items || []).some((item) =>
          item.name?.toLowerCase().includes(q)
        );

        return nameMatch || phoneMatch || labelMatch || invMatch || amountMatch || itemMatch;
      }
      return true;
    });
  }, [periodBills, filter, search]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 'max(90px, calc(90px + env(safe-area-inset-bottom, 0px)))', overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ padding: '14px 16px', background: 'var(--panel-2, #1e293b)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
            📊 Sales & Reports
          </div>
          {totalUdhaar > 0 && (
            <div style={{ fontSize: '0.75rem', background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'inline-block', marginTop: 4 }}>
              Total Udhaar: ₹{totalUdhaar.toFixed(2)}
            </div>
          )}
        </div>

        {/* Subtab Switcher */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg, #0f172a)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          <button
            type="button"
            className={`btn sm-btn ${activeSubtab === 'reports' ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.8rem', padding: '5px 12px', borderRadius: 8 }}
            onClick={() => setActiveSubtab('reports')}
          >
            📊 Analytics
          </button>
          <button
            type="button"
            className={`btn sm-btn ${activeSubtab === 'bills' ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.8rem', padding: '5px 12px', borderRadius: 8 }}
            onClick={() => setActiveSubtab('bills')}
          >
            📜 Bills ({periodBills.length})
          </button>
        </div>
      </div>

      {/* Shared Time Period Row */}
      <div style={{ padding: '12px 16px', background: 'var(--bg, #0f172a)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button
            type="button"
            className={`pill-btn ${salesPeriod === 'today' ? 'active' : ''}`}
            onClick={() => { setSalesPeriod('today'); setStartDate(''); setEndDate(''); }}
          >
            Today
          </button>
          <button
            type="button"
            className={`pill-btn ${salesPeriod === 'yesterday' ? 'active' : ''}`}
            onClick={() => { setSalesPeriod('yesterday'); setStartDate(''); setEndDate(''); }}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={`pill-btn ${salesPeriod === 'week' ? 'active' : ''}`}
            onClick={() => { setSalesPeriod('week'); setStartDate(''); setEndDate(''); }}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`pill-btn ${salesPeriod === 'month' ? 'active' : ''}`}
            onClick={() => { setSalesPeriod('month'); setStartDate(''); setEndDate(''); }}
          >
            30 Days
          </button>
          <button
            type="button"
            className={`pill-btn ${salesPeriod === 'range' ? 'active' : ''}`}
            onClick={() => { setSalesPeriod('range'); }}
          >
            Custom
          </button>
        </div>

        <button
          type="button"
          className="btn sm-btn primary"
          onClick={exportReportCsv}
          style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: 8 }}
          title="Download Excel CSV"
        >
          📥 Export CSV
        </button>
      </div>

      {salesPeriod === 'range' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--panel-2)', padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>From:</span>
          <input
            type="date"
            className="period-date-input"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setSalesPeriod('range'); }}
          />
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>To:</span>
          <input
            type="date"
            className="period-date-input"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setSalesPeriod('range'); }}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <div className="spinner-inline" style={{ marginBottom: 12 }} />
            <div>Loading sales data…</div>
          </div>
        ) : activeSubtab === 'reports' ? (
          /* ANALYTICS SUBTAB */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10 }}>
              <div className="sales-stat-card">
                <div className="sales-stat-label">TOTAL REVENUE</div>
                <div className="sales-stat-val" style={{ color: '#38bdf8' }}>₹{periodTotal.toFixed(2)}</div>
                <div className="sales-stat-sub">{periodCount} order(s)</div>
              </div>
              <div className="sales-stat-card">
                <div className="sales-stat-label">AVG ORDER VALUE</div>
                <div className="sales-stat-val" style={{ color: '#a78bfa' }}>₹{avgOrderValue.toFixed(1)}</div>
                <div className="sales-stat-sub">per bill</div>
              </div>
              <div className="sales-stat-card">
                <div className="sales-stat-label">DISCOUNTS GIVEN</div>
                <div className="sales-stat-val" style={{ color: '#f87171' }}>₹{periodDiscounts.toFixed(2)}</div>
                <div className="sales-stat-sub">saved</div>
              </div>
              <div className="sales-stat-card">
                <div className="sales-stat-label">TAX / GST</div>
                <div className="sales-stat-val" style={{ color: '#fbbf24' }}>₹{periodTax.toFixed(2)}</div>
                <div className="sales-stat-sub">collected</div>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span>💳 Payment Breakdown</span>
                <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500 }}>Total: ₹{periodTotal.toFixed(2)}</span>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 8 }}>
                <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>💵 CASH</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4ade80' }}>₹{periodCash.toFixed(2)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {periodTotal > 0 ? ((periodCash / periodTotal) * 100).toFixed(0) : 0}% of sales
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700 }}>📱 UPI</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#60a5fa' }}>₹{periodUpi.toFixed(2)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {periodTotal > 0 ? ((periodUpi / periodTotal) * 100).toFixed(0) : 0}% of sales
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>⚖️ SPLIT</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>{periodSplitCount}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    ₹{periodSplitTotal.toFixed(0)} split volume
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700 }}>⚠️ UDHAAR</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f87171' }}>₹{periodUdhaar.toFixed(2)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {periodUdhaarCount} pending bill(s)
                  </div>
                </div>
              </div>
            </div>

            {/* Top Selling Items */}
            <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🏆 Top Selling Dishes</span>
                    {topSellingItems.length > 0 && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontWeight: 700,
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                        }}
                      >
                        {topSellingItems.length} dishes
                      </span>
                    )}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {totalUnitsSold > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
                      {totalUnitsSold} sold
                    </span>
                  )}
                  {topSellingItems.length > 6 && (
                    <button
                      type="button"
                      className="btn ghost sm-btn"
                      onClick={() => setDishesExpanded((v) => !v)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                      title={dishesExpanded ? 'Switch to compact scroll view' : 'Expand full list'}
                    >
                      {dishesExpanded ? '↕️ Compact' : '📜 View All'}
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Search when many items */}
              {topSellingItems.length > 6 && (
                <div style={{ marginBottom: 10, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search dish by name or category..."
                    value={dishSearch}
                    onChange={(e) => setDishSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 12px 7px 32px',
                      fontSize: '0.82rem',
                      background: 'var(--bg, #0f172a)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', opacity: 0.6, pointerEvents: 'none' }}>
                    🔍
                  </span>
                  {dishSearch && (
                    <button
                      type="button"
                      onClick={() => setDishSearch('')}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        padding: '2px 6px',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {topSellingItems.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No items sold in this period.</div>
              ) : displayedTopDishes.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '12px 0', textAlign: 'center' }}>
                  No dish matching "{dishSearch}".
                </div>
              ) : (
                <div
                  className="dishes-scroll-list"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: dishesExpanded ? 'none' : '360px',
                    overflowY: dishesExpanded ? 'visible' : 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorY: 'contain',
                    paddingRight: dishesExpanded ? 0 : 4,
                  }}
                >
                  {displayedTopDishes.map((item, idx) => {
                    const originalIdx = topSellingItems.findIndex((x) => x.name === item.name);
                    const rank = (originalIdx !== -1 ? originalIdx : idx) + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                    const maxQty = topSellingItems[0]?.qty || 1;
                    const percent = Math.min(100, Math.round((item.qty / maxQty) * 100));

                    return (
                      <div
                        key={item.name}
                        style={{
                          background: 'var(--bg, #0f172a)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                fontSize: '0.95rem',
                                minWidth: 26,
                                flexShrink: 0,
                                fontWeight: 700,
                                color: rank > 3 ? '#94a3b8' : 'inherit',
                              }}
                            >
                              {medal}
                            </span>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                color: '#f8fafc',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                            {item.category && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  background: 'rgba(255,255,255,0.06)',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  color: '#94a3b8',
                                  flexShrink: 0,
                                  maxWidth: 90,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.category}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>{item.qty} sold</span>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 6 }}>(₹{item.revenue.toFixed(0)})</span>
                          </div>
                        </div>
                        <div style={{ width: '100%', height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: rank === 1 ? '#38bdf8' : rank <= 3 ? '#60a5fa' : '#0284c7',
                              borderRadius: 2,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Scroll affordance / count footer */}
              {topSellingItems.length > 6 && !dishesExpanded && !dishSearch && (
                <div
                  style={{
                    marginTop: 8,
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span>↕️ Scroll to view all {topSellingItems.length} dishes</span>
                </div>
              )}
            </div>

            {/* Daily Breakdown Table */}
            <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#e2e8f0' }}>
                📅 Daily Breakdown
              </h4>
              {dailyBreakdown.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No daily sales in this period.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                        <th style={{ padding: '6px 8px' }}>Date</th>
                        <th style={{ padding: '6px 8px' }}>Bills</th>
                        <th style={{ padding: '6px 8px' }}>Cash</th>
                        <th style={{ padding: '6px 8px' }}>UPI</th>
                        <th style={{ padding: '6px 8px' }}>Udhaar</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyBreakdown.map((row) => (
                        <tr key={row.dateStr} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 8px', fontWeight: 600 }}>{row.dateStr}</td>
                          <td style={{ padding: '8px 8px', color: '#94a3b8' }}>{row.count}</td>
                          <td style={{ padding: '8px 8px', color: '#4ade80' }}>₹{row.cash.toFixed(0)}</td>
                          <td style={{ padding: '8px 8px', color: '#60a5fa' }}>₹{row.upi.toFixed(0)}</td>
                          <td style={{ padding: '8px 8px', color: row.udhaar > 0 ? '#f87171' : '#94a3b8' }}>₹{row.udhaar.toFixed(0)}</td>
                          <td style={{ padding: '8px 8px', fontWeight: 800, color: '#38bdf8', textAlign: 'right' }}>₹{row.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* BILLS LEDGER SUBTAB */
          <div>
            <div className="history-filter-row">
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search amount (₹), INV #, customer, dish…"
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box', paddingRight: search ? 30 : 10 }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: '2px 6px',
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
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

            {filteredBills.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No bills found.</div>
            ) : (
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
                            {b.paymentMethod === 'split'
                              ? `SPLIT (₹${b.cashAmount || 0} C + ₹${b.upiAmount || 0} U)`
                              : (b.paymentMethod || 'UPI')}
                          </span>
                          {b.discountAmount != null && Number(b.discountAmount) > 0 && (
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                              }}
                            >
                              🏷️ -₹{Number(b.discountAmount).toFixed(0)} ({b.discountType === 'percent' ? `${b.discountValue}%` : 'Flat'})
                            </span>
                          )}
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
                            onClick={() => {
                              const invNum = formatInvoiceNumber(b.id);
                              printReceipt({
                                bill: { id: String(b.id), label: displayTitle, lines: b.items || [] },
                                invoiceNumber: invNum,
                                customerName: b.customerName || undefined,
                                customerPhone: b.customerPhone || undefined,
                                user,
                                items,
                                subtotal: b.subtotal,
                                tax: b.tax,
                                total: b.total,
                                discountType: b.discountType,
                                discountValue: b.discountValue,
                                discountAmount: b.discountAmount,
                                paymentMethod: b.paymentMethod,
                                cashAmount: b.cashAmount,
                                upiAmount: b.upiAmount,
                              });
                            }}
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
            )}
          </div>
        )}
      </div>

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
            discountType={activeReceiptBill.discountType}
            discountValue={activeReceiptBill.discountValue}
            discountAmount={activeReceiptBill.discountAmount}
            cashAmount={activeReceiptBill.cashAmount}
            upiAmount={activeReceiptBill.upiAmount}
          />
        </div>
      )}
    </div>
  );
}
