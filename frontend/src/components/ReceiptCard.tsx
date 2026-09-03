import { forwardRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getItemDesc, formatInvoiceNumber } from '../types';
import type { Bill, Item, User } from '../types';

interface Props {
  bill: Bill;
  user: User;
  items?: Item[];
  invoiceNumber?: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string;
}

export const ReceiptCard = forwardRef<HTMLDivElement, Props>(({
  bill,
  user,
  items,
  invoiceNumber,
  subtotal,
  tax,
  total,
  paymentMethod,
  customerName,
  customerPhone,
}, ref) => {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (user.upiId && total > 0) {
      const link = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${total.toFixed(2)}&cu=INR`;
      QRCode.toDataURL(link, { width: 150, margin: 1 })
        .then(setQrUrl)
        .catch(() => {});
    } else {
      setQrUrl('');
    }
  }, [user.upiId, user.payeeName, user.storeName, total]);

  const dateStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const billNumber = invoiceNumber || (bill.savedBillId ? formatInvoiceNumber(bill.savedBillId) : 'INV-0001');

  return (
    <div
      ref={ref}
      style={{
        width: '480px',
        padding: '28px',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        border: '1px solid #e2e8f0',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #cbd5e1', paddingBottom: '16px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '800', color: '#1e293b' }}>
          {user.storeName || 'BillKaro POS'}
        </h2>
        {user.address && <div style={{ fontSize: '13px', color: '#64748b' }}>{user.address}</div>}
        {user.phone && <div style={{ fontSize: '13px', color: '#64748b' }}>Ph: {user.phone}</div>}
        
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '14px', color: '#475569' }}>
          <span style={{ color: '#0f172a', fontWeight: '800' }}>Bill No: {billNumber}</span>
          {bill.label && (
            <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', color: '#475569' }}>
              Table: {bill.label}
            </span>
          )}
        </div>
        <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
          {dateStr}
        </div>
      </div>

      {/* Customer info if present */}
      {(customerName || customerPhone) && (
        <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', fontSize: '13px' }}>
          {customerName && <div><strong>Customer:</strong> {customerName}</div>}
          {customerPhone && <div><strong>Phone:</strong> {customerPhone}</div>}
        </div>
      )}

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
            <th style={{ padding: '8px 0' }}>Item</th>
            <th style={{ padding: '8px 0', textAlign: 'center' }}>Qty</th>
            <th style={{ padding: '8px 0', textAlign: 'right' }}>Price</th>
            <th style={{ padding: '8px 0', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((line, idx) => {
            const catalogItem = items?.find((i) => i.id === line.itemId);
            const desc = getItemDesc(line) || (catalogItem ? getItemDesc(catalogItem) : '');
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: '600', color: '#1e293b' }}>{line.name}</div>
                  {desc ? (
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '400', marginTop: '2px', lineHeight: '1.3' }}>
                      {desc}
                    </div>
                  ) : null}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'center', verticalAlign: 'top' }}>{line.qty}</td>
                <td style={{ padding: '10px 0', textAlign: 'right', color: '#64748b', verticalAlign: 'top' }}>₹{line.price.toFixed(2)}</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '700', color: '#0f172a', verticalAlign: 'top' }}>
                  ₹{(line.price * line.qty).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '14px', fontSize: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
          <span>Subtotal</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        {tax > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
            <span>Tax</span>
            <span>₹{tax.toFixed(2)}</span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '2px solid #0f172a',
            fontSize: '20px',
            fontWeight: '800',
            color: '#0f172a',
          }}
        >
          <span>Grand Total</span>
          <span>₹{total.toFixed(2)}</span>
        </div>
      </div>

      {/* UPI QR Code */}
      {qrUrl && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <img src={qrUrl} alt="UPI QR Code" style={{ width: '130px', height: '130px', borderRadius: '8px' }} />
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Scan to Pay via any UPI App
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
            GPay • PhonePe • Paytm • BHIM ({user.upiId})
          </div>
        </div>
      )}

      {/* Footer Payment Method / Status */}
      <div
        style={{
          marginTop: '16px',
          textAlign: 'center',
          padding: '10px',
          borderRadius: '10px',
          background: paymentMethod === 'udhaar' ? '#fee2e2' : '#e0f2fe',
          color: paymentMethod === 'udhaar' ? '#991b1b' : '#0369a1',
          fontWeight: '700',
          fontSize: '13px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {paymentMethod === 'udhaar'
          ? 'STATUS: UDHAAR / UNPAID'
          : `PAYMENT METHOD: ${paymentMethod.toUpperCase()}`}
      </div>

      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        Thank you for your business! • Powered by BillKaro
      </div>
    </div>
  );
});

ReceiptCard.displayName = 'ReceiptCard';
