import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  amount: number;
  upiId: string | null;
  payeeName: string | null;
  storeName: string;
  onClose: () => void;
  onMarkPaid: () => void;
}

/**
 * Builds a standard UPI payment deep link and renders it as a QR code.
 * Any UPI app (Paytm, PhonePe, GPay, BHIM) can scan it. The bill amount is
 * injected into the "am" parameter so the customer sees the exact amount.
 * No paid API keys are required — this is generated fully on the device.
 */
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
  onMarkPaid,
}: Props) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!upiId) {
      setError('No UPI ID set. Add one in Settings to generate a payment QR.');
      return;
    }
    const link = buildUpiLink(upiId, payeeName || storeName, amount);
    QRCode.toDataURL(link, { width: 320, margin: 1 })
      .then(setDataUrl)
      .catch(() => setError('Could not generate QR code.'));
  }, [amount, upiId, payeeName, storeName]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Scan to pay</h3>
        <div className="qr-amount">₹{amount.toFixed(2)}</div>
        <div className="qr-note">Pay to {payeeName || storeName}</div>

        {error ? (
          <div className="error-box">{error}</div>
        ) : (
          <div className="qr-box">
            {dataUrl ? (
              <img src={dataUrl} alt="Payment QR" width={288} height={288} />
            ) : (
              <div style={{ color: '#111', padding: 40 }}>Generating…</div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn green" onClick={onMarkPaid}>Mark paid & clear</button>
        </div>
      </div>
    </div>
  );
}
