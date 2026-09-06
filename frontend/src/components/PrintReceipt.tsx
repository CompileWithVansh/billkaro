import { getItemDesc, type Bill, type Item, type User } from '../types';

interface Props {
  bill: Bill;
  user: User;
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

export function printBill({
  bill,
  user,
  items,
  subtotal,
  tax,
  total,
  discountType,
  discountValue,
  discountAmount,
  paymentMethod,
  cashAmount,
  upiAmount,
}: Props) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

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
    ? `<tr class="summary-row" style="font-weight: 600;">
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
      <tr class="summary-row" style="font-size: 10px; color: #555;">
        <td colspan="3">Round off</td>
        <td>${roundOff > 0 ? `+ ₹${roundOff.toFixed(2)}` : `- ₹${Math.abs(roundOff).toFixed(2)}`}</td>
      </tr>` : ''}`;
  }

  let paymentRow = '';
  if (paymentMethod === 'split' && cashAmount != null && upiAmount != null) {
    paymentRow = `<tr class="summary-row" style="font-size: 10px; color: #333;">
      <td colspan="4" style="text-align: right; padding-top: 4px;">
        Paid: SPLIT (Cash ₹${cashAmount.toFixed(2)} | UPI ₹${upiAmount.toFixed(2)})
      </td>
    </tr>`;
  } else if (paymentMethod) {
    paymentRow = `<tr class="summary-row" style="font-size: 10px; color: #333;">
      <td colspan="4" style="text-align: right; padding-top: 4px;">
        Paid: ${paymentMethod.toUpperCase()}
      </td>
    </tr>`;
  }

  const totalQty = bill.lines.reduce((s, l) => s + l.qty, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt — ${escHtml(bill.label)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: 80mm auto;
      margin: 4mm 0;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
      width: 76mm;
      margin: 0 auto;
      padding: 6px 4px;
    }

    /* ---------- Header ---------- */
    .store-name {
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 2px;
    }
    .store-sub {
      text-align: center;
      font-size: 10px;
      color: #333;
      margin-bottom: 2px;
    }

    /* ---------- Dividers ---------- */
    .divider      { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid{ border: none; border-top: 1px solid  #000; margin: 6px 0; }

    /* thin line between each item row */
    .row-divider  { border: none; border-top: 1px dotted #aaa; margin: 0; }
    .item-sep td  { padding: 0; }

    /* ---------- Meta ---------- */
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }

    /* ---------- Item table ---------- */
    table { width: 100%; border-collapse: collapse; }
    th    { font-size: 11px; padding: 2px 0; }
    td    { font-size: 11px; padding: 2px 0; vertical-align: top; }

    .col-name  { text-align: left;  width: 48%; }
    .col-qty   { text-align: center; width: 14%; }
    .col-price { text-align: right;  width: 18%; }
    .col-total { text-align: right;  width: 20%; }

    .item-name  { text-align: left; }
    .item-desc  { font-size: 9px; color: #555; padding-left: 2px; }
    .item-qty   { text-align: center; }
    .item-price { text-align: right; }
    .item-total { text-align: right; }

    /* ---------- Summary rows ---------- */
    .summary-row td:first-child { text-align: right; padding-right: 8px; }
    .summary-row td:last-child  { text-align: right; }

    .total-row { font-size: 15px; font-weight: bold; }
    .total-row td { padding: 4px 0; }
    .total-row td:first-child { text-align: right; }
    .total-row td:last-child  { text-align: right; }

    /* ---------- Footer ---------- */
    .footer       { text-align: center; font-size: 10px; color: #555; margin-top: 8px; }
    .footer .powered { font-size: 9px; color: #888; margin-top: 3px; }

    /* ---------- Screen preview ---------- */
    @media screen {
      body { width: 360px; border: 1px dashed #ccc; padding: 16px; font-size: 13px; }
      .store-name { font-size: 20px; }
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
    <span><strong>${escHtml(bill.label)}</strong></span>
  </div>

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
      ${paymentRow}
      ${taxRate > 0 && isTaxInclusive ? `
      <tr class="summary-row" style="font-size: 9px; color: #555;">
        <td colspan="4" style="text-align: center; padding-top: 4px; font-style: italic;">
          (Prices are inclusive of GST)
        </td>
      </tr>` : ''}
    </tbody>
  </table>

  <hr class="divider" />

  <div class="footer">
    Thanks & Visit Again !!!!!
    <div class="powered">Powered by BillKaro</div>
  </div>
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
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
