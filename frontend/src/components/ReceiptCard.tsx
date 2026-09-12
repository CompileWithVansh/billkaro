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
  discountType?: 'percent' | 'flat' | null;
  discountValue?: number;
  discountAmount?: number;
  cashAmount?: number | null;
  upiAmount?: number | null;
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
  discountType,
  discountValue,
  discountAmount,
  cashAmount: _cashAmount,
  upiAmount,
}, ref) => {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    const qrAmount = (paymentMethod === 'split' && upiAmount != null && upiAmount > 0) ? upiAmount : total;
    if (user.upiId && qrAmount > 0) {
      const link = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${qrAmount.toFixed(2)}&cu=INR`;
      QRCode.toDataURL(link, { width: 150, margin: 1 })
        .then(setQrUrl)
        .catch(() => {});
    } else {
      setQrUrl('');
    }
  }, [user.upiId, user.payeeName, user.storeName, total, paymentMethod, upiAmount]);

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
        {user.phone && <div style={{ fontSize: '13px', color: '#64748b' }}>Mob No: {user.phone}</div>}
        {user.gstin && <div style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1', marginTop: '2px' }}>GSTIN: {user.gstin}</div>}
        {user.fssai && <div style={{ fontSize: '12px', color: '#64748b' }}>FSSAI: {user.fssai}</div>}
        
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
              <tr key={idx} style={{ borderBottom: '1px dotted #e2e8f0' }}>
                <td style={{ padding: '8px 0', maxWidth: '180px' }}>
                  <div style={{ fontWeight: '600' }}>{line.name}</div>
                  {desc && <div style={{ fontSize: '11px', color: '#64748b' }}>{desc}</div>}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'center', color: '#475569' }}>{line.qty}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#475569' }}>₹{line.price.toFixed(2)}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600' }}>
                  ₹{(line.price * line.qty).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      {(() => {
        const isTaxEnabled = user?.taxEnabled ?? (user?.taxPercent ? user.taxPercent > 0 : false);
        const isTaxInclusive = user?.taxInclusive !== false;
        const taxRate = isTaxEnabled ? (user.taxPercent || 0) : 0;
        const halfRate = +(taxRate / 2).toFixed(2);
        const cgst = +(subtotal * (halfRate / 100)).toFixed(2);
        const sgst = +(subtotal * (halfRate / 100)).toFixed(2);

        return (
          <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '14px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
              <span>{taxRate > 0 && isTaxInclusive ? 'Sub Total (Taxable)' : 'Subtotal'}</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount !== undefined && discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#16a34a', fontWeight: 600 }}>
                <span>Discount {discountType === 'percent' ? `(${discountValue}%)` : ''}</span>
                <span>- ₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            {taxRate > 0 && tax > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#64748b' }}>
                  <span>CGST ({halfRate}%)</span>
                  <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
                  <span>SGST ({halfRate}%)</span>
                  <span>₹{sgst.toFixed(2)}</span>
                </div>
              </>
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
            {taxRate > 0 && isTaxInclusive && (
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                (Prices are inclusive of GST)
              </div>
            )}
          </div>
        );
      })()}

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

      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        Thank you for your business! • Powered by BillKaro
      </div>
    </div>
  );
});

ReceiptCard.displayName = 'ReceiptCard';
