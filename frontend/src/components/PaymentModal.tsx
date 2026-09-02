import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  amount: number;
  upiId: string | null;
  payeeName: string | null;
  storeName: string;
  onClose: () => void;
  onConfirmPayment: (details: {
    paymentMethod: 'upi' | 'cash' | 'udhaar';
    customerName?: string;
    customerPhone?: string;
    status: 'paid' | 'unpaid';
    action: 'save' | 'whatsapp' | 'print';
  }) => void;
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
  upiId,
  payeeName,
  storeName,
  onClose,
  onConfirmPayment,
}: Props) {
  const [method, setMethod] = useState<'upi' | 'cash' | 'udhaar'>('upi');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (method !== 'upi') return;
    if (!upiId) {
      setError('No UPI ID set. Add one in Settings to generate a payment QR.');
      return;
    }
    setError('');
    const link = buildUpiLink(upiId, payeeName || storeName, amount);
    QRCode.toDataURL(link, { width: 320, margin: 1 })
      .then(setDataUrl)
      .catch(() => setError('Could not generate QR code.'));
  }, [amount, upiId, payeeName, storeName, method]);

  function handleComplete(action: 'save' | 'whatsapp' | 'print' = 'save') {
    if (method === 'udhaar') {
      if (!customerName.trim()) {
        setError('Please enter Customer Name for Udhaar credit.');
        return;
      }
      onConfirmPayment({
        paymentMethod: 'udhaar',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        status: 'unpaid',
        action,
      });
    } else {
      onConfirmPayment({
        paymentMethod: method,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        status: 'paid',
        action,
      });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Complete Payment</h3>
        <div className="qr-amount">₹{amount.toFixed(2)}</div>

        <div className="payment-tabs" style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
          <button
            type="button"
            className={`btn ${method === 'upi' ? 'primary' : 'ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setMethod('upi')}
          >
            📱 UPI QR
          </button>
          <button
            type="button"
            className={`btn ${method === 'cash' ? 'primary' : 'ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setMethod('cash')}
          >
            💵 Cash
          </button>
          <button
            type="button"
            className={`btn ${method === 'udhaar' ? 'primary' : 'ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setMethod('udhaar')}
          >
            📋 Udhaar
          </button>
        </div>

        {method === 'upi' && (
          <>
            <div className="qr-note">Scan with any UPI App (Paytm/PhonePe/GPay)</div>
            {error ? (
              <div className="error-box">{error}</div>
            ) : (
              <div className="qr-box">
                {dataUrl ? (
                  <img src={dataUrl} alt="Payment QR" width={288} height={288} />
                ) : (
                  <div style={{ color: '#111', padding: 40 }}>Generating QR…</div>
                )}
              </div>
            )}
          </>
        )}

        {method === 'cash' && (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '1.1rem' }}>
            Collect <strong>₹{amount.toFixed(2)}</strong> cash from customer.
          </div>
        )}

        {method === 'udhaar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '12px 0' }}>
            <div className="field">
              <label>Customer Name *</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Customer Phone (optional for WhatsApp)</label>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 9876543210"
              />
            </div>
            {error && <div className="error-box">{error}</div>}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Main Primary Green Save Button */}
          <button
            type="button"
            className="btn green block"
            style={{ fontSize: '1.1rem', minHeight: '52px' }}
            onClick={() => handleComplete('save')}
          >
            {method === 'udhaar' ? '📋 Save as Udhaar' : '✅ Paid'}
          </button>

          {/* Secondary Action Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn ghost"
              style={{ flex: 1, fontSize: '0.9rem' }}
              onClick={() => handleComplete('whatsapp')}
            >
              📲 WhatsApp Receipt
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ flex: 1, fontSize: '0.9rem' }}
              onClick={() => handleComplete('print')}
            >
              🖨️ Print
            </button>
          </div>

          <button
            type="button"
            className="btn ghost block"
            style={{ marginTop: 4, opacity: 0.6, fontSize: '0.85rem' }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
