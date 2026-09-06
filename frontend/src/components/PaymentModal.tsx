import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  amount: number;
  subtotal?: number;
  taxPercent?: number;
  upiId: string | null;
  payeeName: string | null;
  storeName: string;
  onClose: () => void;
  onConfirmPayment: (details: {
    paymentMethod: 'upi' | 'cash' | 'udhaar' | 'split';
    customerName?: string;
    customerPhone?: string;
    status: 'paid' | 'unpaid';
    action: 'save' | 'whatsapp' | 'print';
    discountType?: 'percent' | 'flat' | null;
    discountValue?: number;
    discountAmount?: number;
    cashAmount?: number | null;
    upiAmount?: number | null;
    finalTotal: number;
    finalTax: number;
  }) => Promise<void> | void;
}

function buildUpiLink(upiId: string, payeeName: string, amount: number) {
  const params = new URLSearchParams({
    pa: upiId,                       // payee address (UPI id)
    pn: payeeName,                   // payee name
    am: amount.toFixed(2),           // amount
    cu: 'INR',                       // currency
    tn: 'BillKaro payment',          // transaction note
  });
  return `upi://pay?${params.toString()}`;
}

export default function PaymentModal({
  amount,
  subtotal,
  taxPercent,
  upiId,
  payeeName,
  storeName,
  onClose,
  onConfirmPayment,
}: Props) {
  const baseSubtotal = subtotal !== undefined ? subtotal : amount;
  const taxRate = taxPercent || 0;

  // Discount state
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountInput, setDiscountInput] = useState<string>('');

  // Payment method & split state
  const [method, setMethod] = useState<'upi' | 'cash' | 'split' | 'udhaar'>('upi');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Authoritative calculation
  const numDiscountInput = Number(discountInput) || 0;
  let discountAmount = 0;
  let effectiveDiscountValue = 0;

  if (numDiscountInput > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, numDiscountInput));
      discountAmount = Number(((baseSubtotal * pct) / 100).toFixed(2));
      effectiveDiscountValue = pct;
    } else {
      const flat = Math.min(baseSubtotal, Math.max(0, numDiscountInput));
      discountAmount = Number(flat.toFixed(2));
      effectiveDiscountValue = flat;
    }
  }

  const taxableSubtotal = Math.max(0, baseSubtotal - discountAmount);
  const calculatedTax = Number((taxableSubtotal * (taxRate / 100)).toFixed(2));
  const finalPayable = Number((taxableSubtotal + calculatedTax).toFixed(2));

  function handleSplitCashChange(val: string) {
    setSplitCash(val);
    const num = Number(val) || 0;
    const remaining = Math.max(0, Number((finalPayable - num).toFixed(2)));
    setSplitUpi(remaining > 0 ? String(remaining) : '0');
  }

  function handleSplitUpiChange(val: string) {
    setSplitUpi(val);
    const num = Number(val) || 0;
    const remaining = Math.max(0, Number((finalPayable - num).toFixed(2)));
    setSplitCash(remaining > 0 ? String(remaining) : '0');
  }

  const qrAmount = method === 'split' ? (Number(splitUpi) > 0 ? Number(splitUpi) : finalPayable) : finalPayable;

  useEffect(() => {
    if (method !== 'upi' && method !== 'split') return;
    if (!upiId) {
      setError('No UPI ID set. Add one in Settings to generate a payment QR.');
      return;
    }
    setError('');
    const link = buildUpiLink(upiId, payeeName || storeName, qrAmount);
    QRCode.toDataURL(link, { width: method === 'split' ? 200 : 288, margin: 1 })
      .then(setDataUrl)
      .catch(() => setError('Could not generate QR code.'));
  }, [qrAmount, upiId, payeeName, storeName, method]);

  async function handleComplete(action: 'save' | 'whatsapp' | 'print' = 'save') {
    if (isSubmitting) return;

    if (method === 'udhaar') {
      if (!customerName.trim()) {
        setError('Please enter Customer Name for Udhaar credit.');
        return;
      }
    }

    if (method === 'split') {
      const c = Number(splitCash) || 0;
      const u = Number(splitUpi) || 0;
      if (Math.abs(c + u - finalPayable) > 1) {
        setError(`Split total (₹${(c + u).toFixed(2)}) must match bill total (₹${finalPayable.toFixed(2)})`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onConfirmPayment({
        paymentMethod: method,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        status: method === 'udhaar' || action === 'whatsapp' ? 'unpaid' : 'paid',
        action,
        discountType: discountAmount > 0 ? discountType : null,
        discountValue: discountAmount > 0 ? effectiveDiscountValue : 0,
        discountAmount,
        cashAmount: method === 'split' ? (Number(splitCash) || 0) : (method === 'cash' ? finalPayable : null),
        upiAmount: method === 'split' ? (Number(splitUpi) || 0) : (method === 'upi' ? finalPayable : null),
        finalTotal: finalPayable,
        finalTax: calculatedTax,
      });
    } catch (err) {
      console.error('Payment processing failed:', err);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={isSubmitting ? undefined : onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          padding: 0,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 20,
        }}
      >
        {/* Fixed Header */}
        <div
          style={{
            padding: '16px 20px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Complete Payment</h3>
          <button
            type="button"
            onClick={isSubmitting ? undefined : onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Middle Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 20px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* 1. QR Code / Payment Method View at Top */}
          {(method === 'upi' || method === 'split') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2px 0 10px' }}>
              {error ? (
                <div className="error-box" style={{ width: '100%', marginBottom: 8 }}>{error}</div>
              ) : (
                <div
                  className="qr-box"
                  style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: 10,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    margin: '0 0 6px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  {dataUrl ? (
                    <img
                      src={dataUrl}
                      alt={method === 'split' ? 'Split Payment QR' : 'Payment QR'}
                      width={170}
                      height={170}
                      style={{ borderRadius: 8, display: 'block' }}
                    />
                  ) : (
                    <div style={{ color: '#64748b', padding: '60px 30px', textAlign: 'center', fontSize: '0.88rem' }}>
                      Generating QR…
                    </div>
                  )}
                </div>
              )}
              <div className="qr-note" style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                {method === 'split' ? (
                  <span>
                    Scan UPI QR for balance: <strong style={{ color: '#38bdf8' }}>₹{Number(splitUpi || finalPayable).toFixed(2)}</strong>
                  </span>
                ) : (
                  'Scan with any UPI App (Paytm / PhonePe / GPay)'
                )}
              </div>
            </div>
          )}

          {method === 'cash' && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 14,
                padding: '14px 18px',
                margin: '2px 0 12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 2 }}>💵</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#4ade80' }}>
                Cash Payment
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                Collect physical cash at counter and confirm below
              </div>
            </div>
          )}

          {method === 'udhaar' && (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 14,
                padding: '14px 18px',
                margin: '2px 0 12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 2 }}>📋</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>
                Customer Khata (Udhaar / Credit)
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                Record unpaid bill to customer khata ledger
              </div>
            </div>
          )}

          {/* 2. Total Payable Amount Underneath QR / Banner */}
          <div style={{ textAlign: 'center', margin: '4px 0 10px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Total Payable
            </div>
            <div className="qr-amount" style={{ margin: '2px 0', fontSize: '2rem', fontWeight: 800, color: '#38bdf8', lineHeight: 1.1 }}>
              ₹{finalPayable.toFixed(2)}
            </div>
            {discountAmount > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 3 }}>
                Subtotal: ₹{baseSubtotal.toFixed(2)} • Discount: -₹{discountAmount.toFixed(2)}
              </div>
            )}
          </div>

          {/* 3. Payment Method Tabs (UPI, Cash, Split, Udhaar) - Prominent, Easy Tap */}
          <div style={{ margin: '4px 0 12px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Payment Method
            </div>
            <div className="payment-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <button
                type="button"
                className={`btn ${method === 'upi' ? 'primary' : 'ghost'}`}
                style={{
                  padding: '8px 4px',
                  minHeight: 46,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  border: method === 'upi' ? '2px solid #38bdf8' : '1px solid #334155',
                  background: method === 'upi' ? 'rgba(56, 189, 248, 0.2)' : 'var(--panel-2, #1e293b)',
                  color: method === 'upi' ? '#38bdf8' : 'var(--text)',
                  boxShadow: method === 'upi' ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none',
                }}
                disabled={isSubmitting}
                onClick={() => setMethod('upi')}
              >
                <span style={{ fontSize: '1.15rem' }}>📱</span>
                <span>UPI QR</span>
              </button>
              <button
                type="button"
                className={`btn ${method === 'cash' ? 'primary' : 'ghost'}`}
                style={{
                  padding: '8px 4px',
                  minHeight: 46,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  border: method === 'cash' ? '2px solid #4ade80' : '1px solid #334155',
                  background: method === 'cash' ? 'rgba(74, 222, 128, 0.2)' : 'var(--panel-2, #1e293b)',
                  color: method === 'cash' ? '#4ade80' : 'var(--text)',
                  boxShadow: method === 'cash' ? '0 0 10px rgba(74, 222, 128, 0.3)' : 'none',
                }}
                disabled={isSubmitting}
                onClick={() => setMethod('cash')}
              >
                <span style={{ fontSize: '1.15rem' }}>💵</span>
                <span>Cash</span>
              </button>
              <button
                type="button"
                className={`btn ${method === 'split' ? 'primary' : 'ghost'}`}
                style={{
                  padding: '8px 4px',
                  minHeight: 46,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  border: method === 'split' ? '2px solid #f59e0b' : '1px solid #334155',
                  background: method === 'split' ? 'rgba(245, 158, 11, 0.2)' : 'var(--panel-2, #1e293b)',
                  color: method === 'split' ? '#f59e0b' : 'var(--text)',
                  boxShadow: method === 'split' ? '0 0 10px rgba(245, 158, 11, 0.3)' : 'none',
                }}
                disabled={isSubmitting}
                onClick={() => {
                  setMethod('split');
                  if (!splitCash && !splitUpi) {
                    setSplitCash('');
                    setSplitUpi(String(finalPayable));
                  }
                }}
              >
                <span style={{ fontSize: '1.15rem' }}>💳</span>
                <span>Split</span>
              </button>
              <button
                type="button"
                className={`btn ${method === 'udhaar' ? 'primary' : 'ghost'}`}
                style={{
                  padding: '8px 4px',
                  minHeight: 46,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  border: method === 'udhaar' ? '2px solid #a855f7' : '1px solid #334155',
                  background: method === 'udhaar' ? 'rgba(168, 85, 247, 0.2)' : 'var(--panel-2, #1e293b)',
                  color: method === 'udhaar' ? '#c084fc' : 'var(--text)',
                  boxShadow: method === 'udhaar' ? '0 0 10px rgba(168, 85, 247, 0.3)' : 'none',
                }}
                disabled={isSubmitting}
                onClick={() => setMethod('udhaar')}
              >
                <span style={{ fontSize: '1.15rem' }}>📋</span>
                <span>Udhaar</span>
              </button>
            </div>
          </div>

          {/* 4. Mode-Specific Inputs in Thumb Zone (Split Cash/UPI or Udhaar Name/Phone) */}
          {method === 'split' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                margin: '0 0 12px',
                background: 'var(--panel-2, #1e293b)',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Split Bill (Cash + UPI)</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4, fontWeight: 600 }}>💵 Cash Received</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={splitCash}
                    onChange={(e) => handleSplitCashChange(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#4ade80', fontWeight: 700, fontSize: '16px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4, fontWeight: 600 }}>📱 UPI Amount (QR)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={splitUpi}
                    onChange={(e) => handleSplitUpiChange(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 700, fontSize: '16px' }}
                  />
                </div>
              </div>
              {error && <div className="error-box" style={{ color: '#ef4444', fontSize: '0.8rem', margin: '4px 0 0' }}>{error}</div>}
            </div>
          )}

          {method === 'udhaar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 12px', background: 'var(--panel-2, #1e293b)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Customer Name *</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  disabled={isSubmitting}
                  autoFocus
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', fontSize: '16px' }}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Customer Phone (for 1-click WhatsApp)</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  disabled={isSubmitting}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', fontSize: '16px' }}
                />
              </div>
              {error && <div className="error-box" style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{error}</div>}
            </div>
          )}

          {/* 5. Apply Discount Section */}
          <div
            style={{
              background: 'var(--panel-2, #1e293b)',
              border: '1px solid var(--border, #334155)',
              borderRadius: 12,
              padding: '10px 14px',
              margin: '0 0 8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>Apply Discount</span>
              <div style={{ display: 'flex', gap: 4, background: '#0f172a', padding: 2, borderRadius: 8, border: '1px solid #334155' }}>
                <button
                  type="button"
                  className={`btn sm-btn ${discountType === 'percent' ? 'primary' : 'ghost'}`}
                  style={{ fontSize: '0.78rem', padding: '2px 10px', minWidth: 36, fontWeight: 700, minHeight: 28 }}
                  onClick={() => setDiscountType('percent')}
                >
                  %
                </button>
                <button
                  type="button"
                  className={`btn sm-btn ${discountType === 'flat' ? 'primary' : 'ghost'}`}
                  style={{ fontSize: '0.78rem', padding: '2px 10px', minWidth: 36, fontWeight: 700, minHeight: 28 }}
                  onClick={() => setDiscountType('flat')}
                >
                  ₹
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                min="0"
                step="any"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={discountType === 'percent' ? 'Enter discount % (e.g. 10)' : 'Enter discount ₹ (e.g. 50)'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '16px',
                  borderRadius: 8,
                  background: '#0f172a',
                  border: discountAmount > 0 ? '1px solid #10b981' : '1px solid #334155',
                  color: '#f8fafc',
                }}
              />
              {discountInput && (
                <button
                  type="button"
                  className="btn sm-btn ghost"
                  style={{ fontSize: '0.78rem', color: '#94a3b8', minHeight: 34 }}
                  onClick={() => setDiscountInput('')}
                  title="Clear discount"
                >
                  Clear
                </button>
              )}
            </div>

            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                <span>Savings: -₹{discountAmount.toFixed(2)} ({discountType === 'percent' ? `${effectiveDiscountValue}%` : 'Flat'})</span>
                {taxRate > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>Tax on ₹{taxableSubtotal.toFixed(2)}: ₹{calculatedTax.toFixed(2)}</span>}
              </div>
            )}
          </div>
        </div>

        {/* 6. FIXED DOCKED ACTION FOOTER - IDENTICAL IN ALL 4 VIEWS, NEVER JUMPS! */}
        <div
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--panel, #0f172a)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* Main Primary Action Button */}
          <button
            type="button"
            className="btn green block"
            style={{
              fontSize: '1rem',
              minHeight: '46px',
              fontWeight: 700,
              opacity: isSubmitting ? 0.8 : 1,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 12,
            }}
            disabled={isSubmitting}
            onClick={() => handleComplete('save')}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-inline" />
                <span>Saving Bill & Invoice…</span>
              </>
            ) : method === 'udhaar' ? (
              `📋 Save as Udhaar (₹${finalPayable.toFixed(2)}) & Close`
            ) : (
              `✅ Paid ₹${finalPayable.toFixed(2)} & Close Tab`
            )}
          </button>

          {/* Secondary Action Buttons (WhatsApp & Print) */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn ghost"
              style={{
                flex: 1,
                fontSize: '0.85rem',
                minHeight: '38px',
                color: '#22c55e',
                borderColor: 'rgba(34, 197, 94, 0.4)',
                opacity: isSubmitting ? 0.5 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                borderRadius: 10,
              }}
              disabled={isSubmitting}
              onClick={() => handleComplete('whatsapp')}
              title="Share bill & QR on WhatsApp without closing the tab"
            >
              📲 WhatsApp
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{
                flex: 1,
                fontSize: '0.85rem',
                minHeight: '38px',
                opacity: isSubmitting ? 0.5 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                borderRadius: 10,
              }}
              disabled={isSubmitting}
              onClick={() => handleComplete('print')}
            >
              🖨️ Print
            </button>
          </div>

          <button
            type="button"
            className="btn ghost block"
            style={{
              padding: '6px 0',
              opacity: isSubmitting ? 0.4 : 0.6,
              fontSize: '0.82rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
