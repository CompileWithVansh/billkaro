import QRCode from 'qrcode';
import { getItemDesc, getBillDisplayLabel, type Bill, type Item, type User } from '../types';

interface Props {
  bill: Bill;
  user: User;
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
  items?: Item[];
  subtotal: number;
  tax: number;
  total: number;
  discountType?: 'percent' | 'flat' | null;
  discountValue?: number;
  discountAmount?: number;
  paymentMethod?: string;
  cashAmount?: number | null;
  upiAmount?: number | null;
}

export async function printBill({
  bill,
  user,
  invoiceNumber,
  customerName,
  customerPhone,
  items,
  subtotal,
  tax,
  total,
  discountType,
  discountValue,
  discountAmount,
  paymentMethod,
  cashAmount: _cashAmount,
  upiAmount,
}: Props) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // Read store printer paper width setting (defaults to 58mm standard for Indian POS)
  const paperWidth = (typeof window !== 'undefined' && localStorage.getItem('billkaro_printer_paper_width')) || '58mm';
  const is58mm = paperWidth === '58mm';

  // Generate UPI QR code for print if store has a UPI ID configured and QR printing is enabled
  // When paying via Cash or Udhaar: DO NOT print QR code to save paper!
  // When Split payment: print QR with the exact split UPI amount!
  const printQrEnabled = (typeof window !== 'undefined' && localStorage.getItem('billkaro_print_qr_enabled')) !== 'false';
  let qrDataUrl = '';
  const isCashOnly = paymentMethod === 'cash';
  const isUdhaar = paymentMethod === 'udhaar';
  const hasUpiPay = (paymentMethod === 'split') ? (upiAmount != null && upiAmount > 0) : (!isCashOnly && !isUdhaar);
  const qrAmount = (paymentMethod === 'split' && upiAmount != null && upiAmount > 0) ? upiAmount : total;

  if (printQrEnabled && user?.upiId && hasUpiPay && qrAmount > 0) {
    const upiLink = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(user.payeeName || user.storeName)}&am=${qrAmount.toFixed(2)}&cu=INR`;
    try {
      // Size QR code to whole printer dots (~110px for 58mm / 384-dot printable width to avoid fractional-dot smearing)
      qrDataUrl = await QRCode.toDataURL(upiLink, {
        width: is58mm ? 110 : 140,
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.warn('Failed to generate QR code for receipt print:', err);
    }
  }

  // Build item rows — each row has a light separator line beneath it,
  // and shows the item description/category line under the item name.
  const rows = bill.lines.map((l) => {
    const lineTotal = (l.price * l.qty).toFixed(2);
    const catalogItem = items?.find((i) => i.id === l.itemId);
    const itemDesc = getItemDesc(l) || (catalogItem ? getItemDesc(catalogItem) : '');
    const desc = itemDesc
      ? `<div class="item-desc">${escHtml(itemDesc)}</div>`
      : '';
    return `
      <tr class="item-row">
        <td class="item-name">
          ${escHtml(l.name)}
          ${desc}
        </td>
        <td class="item-qty">${l.qty}</td>
        <td class="item-price">₹${l.price.toFixed(2)}</td>
        <td class="item-total">₹${lineTotal}</td>
      </tr>
      <tr class="item-sep"><td colspan="4"><hr class="row-divider" /></td></tr>`;
  }).join('');

  const effectiveDiscount = discountAmount !== undefined ? discountAmount : (bill.discountAmount || 0);
  const effectiveDiscountType = discountType !== undefined ? discountType : bill.discountType;
  const effectiveDiscountValue = discountValue !== undefined ? discountValue : bill.discountValue;

  const discountRow = effectiveDiscount > 0
    ? `<tr class="summary-row" style="font-weight: 700;">
         <td colspan="3">Discount ${effectiveDiscountType === 'percent' ? `(${effectiveDiscountValue}%)` : ''}</td>
         <td>- ₹${effectiveDiscount.toFixed(2)}</td>
       </tr>`
    : '';

  const isTaxEnabled = user?.taxEnabled ?? (user?.taxPercent ? user.taxPercent > 0 : false);
  const isTaxInclusive = user?.taxInclusive !== false;
  const taxRate = isTaxEnabled ? (user.taxPercent || 0) : 0;
  const halfRate = +(taxRate / 2).toFixed(2);

  let taxRows = '';
  if (taxRate > 0 && tax > 0) {
    const cgst = +(subtotal * (halfRate / 100)).toFixed(2);
    const sgst = +(subtotal * (halfRate / 100)).toFixed(2);
    const roundOff = +(total - (subtotal + cgst + sgst)).toFixed(2);

    taxRows = `
      <tr class="summary-row">
        <td colspan="3">CGST (${halfRate}%)</td>
        <td>₹${cgst.toFixed(2)}</td>
      </tr>
      <tr class="summary-row">
        <td colspan="3">SGST (${halfRate}%)</td>
        <td>₹${sgst.toFixed(2)}</td>
      </tr>
      ${Math.abs(roundOff) >= 0.005 ? `
      <tr class="summary-row" style="font-size: ${is58mm ? '9px' : '10px'}; color: #222;">
        <td colspan="3">Round off</td>
        <td>${roundOff > 0 ? `+ ₹${roundOff.toFixed(2)}` : `- ₹${Math.abs(roundOff).toFixed(2)}`}</td>
      </tr>` : ''}`;
  }

  const totalQty = bill.lines.reduce((s, l) => s + l.qty, 0);
  const billLabelDisplay = invoiceNumber || getBillDisplayLabel(bill);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt — ${escHtml(billLabelDisplay)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: ${is58mm ? '58mm auto' : '80mm auto'};
      margin: ${is58mm ? '1.5mm 0' : '4mm 0'};
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${is58mm ? '10.5px' : '12px'};
      font-weight: 600;
      color: #000000;
      background: #ffffff;
      width: ${is58mm ? '48mm' : '76mm'};
      margin: 0 auto;
      padding: ${is58mm ? '2mm 0' : '6px 4px'};
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
    }

    /* ---------- Header ---------- */
    .store-name {
      font-size: ${is58mm ? '15px' : '18px'};
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: ${is58mm ? '0.5px' : '1px'};
      margin-bottom: 2px;
    }
    .store-sub {
      text-align: center;
      font-size: ${is58mm ? '9px' : '10px'};
      color: #000000;
      margin-bottom: 1.5px;
    }

    /* ---------- Dividers ---------- */
    .divider       { border: none; border-top: 1px dashed #000000; margin: ${is58mm ? '4px 0' : '6px 0'}; }
    .divider-solid { border: none; border-top: 1px solid  #000000; margin: ${is58mm ? '4px 0' : '6px 0'}; }

    /* Thin line between each item row */
    .row-divider  { border: none; border-top: 1px dotted #555555; margin: 0; }
    .item-sep td  { padding: 0; }

    /* ---------- Meta ---------- */
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: ${is58mm ? '9.5px' : '11px'};
      font-weight: 700;
    }

    /* ---------- Item table ---------- */
    table { width: 100%; border-collapse: collapse; }
    th    { font-size: ${is58mm ? '9.5px' : '11px'}; font-weight: 800; padding: 2px 0; border-bottom: 1px dashed #000000; }
    td    { font-size: ${is58mm ? '9.5px' : '11px'}; padding: 2px 0; vertical-align: top; }

    .col-name  { text-align: left;   width: ${is58mm ? '44%' : '48%'}; }
    .col-qty   { text-align: center; width: ${is58mm ? '14%' : '14%'}; }
    .col-price { text-align: right;  width: ${is58mm ? '20%' : '18%'}; }
    .col-total { text-align: right;  width: ${is58mm ? '22%' : '20%'}; }

    .item-name  { text-align: left; }
    .item-desc  { font-size: ${is58mm ? '8px' : '9px'}; color: #222222; padding-left: 1px; }
    .item-qty   { text-align: center; }
    .item-price { text-align: right; }
    .item-total { text-align: right; }

    /* ---------- Summary rows ---------- */
    .summary-row td:first-child { text-align: right; padding-right: 6px; }
    .summary-row td:last-child  { text-align: right; }

    .total-row { font-size: ${is58mm ? '13px' : '15px'}; font-weight: 800; }
    .total-row td { padding: 3px 0; }
    .total-row td:first-child { text-align: right; }
    .total-row td:last-child  { text-align: right; }

    /* ---------- QR Code ---------- */
    .qr-block {
      text-align: center;
      margin: ${is58mm ? '5px 0 2px 0' : '8px 0 4px 0'};
    }
    .qr-img {
      width: ${is58mm ? '110px' : '135px'};
      height: ${is58mm ? '110px' : '135px'};
      margin: 0 auto;
      display: block;
      image-rendering: pixelated;
    }
    .qr-title {
      font-size: ${is58mm ? '9px' : '10px'};
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-top: 3px;
    }
    .qr-sub {
      font-size: ${is58mm ? '7.5px' : '8px'};
      color: #111111;
      margin-top: 1px;
    }
    .qr-upi {
      font-size: ${is58mm ? '7.5px' : '8px'};
      color: #222222;
      margin-top: 1px;
    }

    /* ---------- Footer ---------- */
    .footer       { text-align: center; font-size: ${is58mm ? '9px' : '10px'}; color: #111111; margin-top: 6px; }
    .footer .powered { font-size: ${is58mm ? '8px' : '9px'}; color: #444444; margin-top: 2px; }

    /* ---------- Screen preview ---------- */
    @media screen {
      body { width: ${is58mm ? '280px' : '360px'}; border: 1px dashed #ccc; padding: 12px; font-size: 12px; }
      .store-name { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="store-name">${escHtml(user.storeName)}</div>
  ${user.address ? `<div class="store-sub">${escHtml(user.address)}</div>` : ''}
  ${user.phone   ? `<div class="store-sub">Mob No - ${escHtml(user.phone)}</div>` : ''}
  ${user.gstin   ? `<div class="store-sub">GSTIN - ${escHtml(user.gstin)}</div>` : ''}
  ${user.fssai   ? `<div class="store-sub">FSSAI - ${escHtml(user.fssai)}</div>` : ''}

  <hr class="divider" />

  <div class="meta">
    <span>${dateStr} &nbsp; ${timeStr}</span>
    <span><strong>${escHtml(billLabelDisplay)}</strong></span>
  </div>
  ${customerName ? `
  <div class="meta">
    <span>Customer: <strong>${escHtml(customerName)}</strong></span>
    ${customerPhone ? `<span>Mob: ${escHtml(customerPhone)}</span>` : '<span></span>'}
  </div>` : ''}
  ${isUdhaar ? `
  <div class="meta">
    <span>Payment Mode:</span>
    <span><strong>UDHAAR (CREDIT)</strong></span>
  </div>` : ''}

  <hr class="divider" />

  <table>
    <thead>
      <tr>
        <th class="col-name">Item</th>
        <th class="col-qty">Qty</th>
        <th class="col-price">Rate</th>
        <th class="col-total">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <hr class="divider-solid" />

  <table>
    <tbody>
      <tr class="summary-row">
        <td colspan="3">Total Qty: ${totalQty} &nbsp; ${taxRate > 0 && isTaxInclusive ? 'Sub Total' : 'Subtotal'}</td>
        <td>₹${subtotal.toFixed(2)}</td>
      </tr>
      ${discountRow}
      ${taxRows}
      <tr class="total-row">
        <td colspan="3">${taxRate > 0 && isTaxInclusive ? 'Grand Total' : 'TOTAL'}</td>
        <td>₹${total.toFixed(2)}</td>
      </tr>
      ${taxRate > 0 && isTaxInclusive ? `
      <tr class="summary-row" style="font-size: 9px; color: #555;">
        <td colspan="4" style="text-align: center; padding-top: 4px; font-style: italic;">
          (Prices are inclusive of GST)
        </td>
      </tr>` : ''}
    </tbody>
  </table>

  ${qrDataUrl ? `
  <hr class="divider" />
  <div class="qr-block">
    <div class="qr-title">${paymentMethod === 'split' ? `SCAN TO PAY (UPI: ₹${qrAmount.toFixed(2)})` : 'SCAN TO PAY'}</div>
    <img src="${qrDataUrl}" alt="UPI QR Code" class="qr-img" />
  </div>
  ` : ''}

  <hr class="divider" />

  <div class="footer">
    Thanks & Visit Again !!!!!
    <div class="powered">Powered by BillKaro</div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
        window.onafterprint = function() { window.close(); };
      }, 150);
    });
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
      win.onafterprint = () => win.close();
    }, 150);
  };
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
