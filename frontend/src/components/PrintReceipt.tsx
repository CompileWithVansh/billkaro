import type { Bill, User } from '../types';

interface Props {
  bill: Bill;
  user: User;
  subtotal: number;
  tax: number;
  total: number;
}

export function printBill({ bill, user, subtotal, tax, total }: Props) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // Build item rows — each row has a light separator line beneath it,
  // and shows the category as a description line under the item name.
  const rows = bill.lines.map((l) => {
    const lineTotal = (l.price * l.qty).toFixed(2);
    const desc = l.category && l.category.trim()
      ? `<div class="item-desc">${escHtml(l.category.trim())}</div>`
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

  const taxRow = tax > 0
    ? `<tr class="summary-row">
         <td colspan="3">Tax (${user.taxPercent}%)</td>
         <td>₹${tax.toFixed(2)}</td>
       </tr>`
    : '';

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
      margin-bottom: 6px;
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
      margin-bottom: 2px;
    }

    /* ---------- Items table ---------- */
    table { width: 100%; border-collapse: collapse; }

    thead th {
      font-size: 10px;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding: 3px 0;
    }
    .col-name  { text-align: left;   width: 44%; }
    .col-qty   { text-align: center; width: 12%; }
    .col-price { text-align: right;  width: 22%; }
    .col-total { text-align: right;  width: 22%; }

    .item-row td { padding: 5px 0 3px; vertical-align: top; }
    .item-name   { text-align: left; }
    .item-desc   { font-size: 10px; color: #555; margin-top: 2px; }
    .item-qty    { text-align: center; }
    .item-price  { text-align: right; }
    .item-total  { text-align: right; font-weight: bold; }

    /* ---------- Summary ---------- */
    .summary-row td { padding: 2px 0; }
    .summary-row td:first-child { text-align: right; }
    .summary-row td:last-child  { text-align: right; font-weight: bold; }

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
        <td colspan="3">Subtotal</td>
        <td>₹${subtotal.toFixed(2)}</td>
      </tr>
      ${taxRow}
      <tr class="total-row">
        <td colspan="3">TOTAL</td>
        <td>₹${total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <hr class="divider" />

  <div class="footer">
    Thank you, visit again!
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
