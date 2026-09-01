import type { Bill } from '../types';
import type { User } from '../types';

interface Props {
  bill: Bill;
  user: User;
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Opens a new browser window with a print-optimised receipt and triggers the
 * print dialog immediately. Works with:
 *  - Any network/USB printer (thermal receipt printers, laser, inkjet)
 *  - iPad AirPrint
 *  - "Save as PDF" when no printer is connected
 *
 * No external library needed — the browser handles all rendering.
 */
export function printBill({ bill, user, subtotal, tax, total }: Props) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // Build the receipt rows
  const rows = bill.lines
    .map((l) => {
      const lineTotal = (l.price * l.qty).toFixed(2);
      const name = l.name.length > 20 ? l.name.slice(0, 19) + '…' : l.name;
      return `
        <tr>
          <td class="item-name">${name}</td>
          <td class="item-qty">${l.qty}</td>
          <td class="item-price">₹${l.price.toFixed(2)}</td>
          <td class="item-total">₹${lineTotal}</td>
        </tr>`;
    })
    .join('');

  const taxRow =
    tax > 0
      ? `<tr class="summary-row">
           <td colspan="3">Tax (${user.taxPercent}%)</td>
           <td>₹${tax.toFixed(2)}</td>
         </tr>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt — ${bill.label}</title>
  <style>
    /* ---- Reset ---- */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ---- Page: narrow column centred for thermal printers ---- */
    @page {
      size: 80mm auto;   /* auto height = content height */
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

    /* ---- Store header ---- */
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
      color: #444;
      margin-bottom: 6px;
    }

    /* ---- Dividers ---- */
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .divider-solid {
      border: none;
      border-top: 1px solid #000;
      margin: 6px 0;
    }

    /* ---- Meta (date/bill) ---- */
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 2px;
    }

    /* ---- Items table ---- */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      font-size: 10px;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding: 3px 0;
    }
    .col-name  { text-align: left;  width: 44%; }
    .col-qty   { text-align: center; width: 12%; }
    .col-price { text-align: right; width: 22%; }
    .col-total { text-align: right; width: 22%; }

    tbody td {
      padding: 4px 0;
      vertical-align: top;
    }
    .item-name  { text-align: left; }
    .item-qty   { text-align: center; }
    .item-price { text-align: right; }
    .item-total { text-align: right; font-weight: bold; }

    /* ---- Summary ---- */
    .summary-row td {
      padding: 2px 0;
    }
    .summary-row td:first-child {
      text-align: right;
    }
    .summary-row td:last-child {
      text-align: right;
      font-weight: bold;
    }

    .total-row {
      font-size: 15px;
      font-weight: bold;
    }
    .total-row td {
      padding: 4px 0;
    }
    .total-row td:first-child { text-align: right; }
    .total-row td:last-child  { text-align: right; }

    /* ---- Footer ---- */
    .footer {
      text-align: center;
      font-size: 10px;
      color: #555;
      margin-top: 8px;
    }
    .footer .powered {
      font-size: 9px;
      color: #888;
      margin-top: 4px;
    }

    /* ---- Hide on screen, show on print ---- */
    @media screen {
      body {
        width: 360px;
        border: 1px dashed #ccc;
        padding: 16px;
        font-size: 13px;
      }
      .store-name { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="store-name">${escHtml(user.storeName)}</div>
  ${user.upiId ? `<div class="store-sub">UPI: ${escHtml(user.upiId)}</div>` : ''}

  <hr class="divider" />

  <div class="meta">
    <span>${dateStr} ${timeStr}</span>
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

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) {
    alert('Could not open print window. Please allow popups for this site.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Small delay so fonts/styles load before the print dialog fires.
  win.onload = () => {
    win.focus();
    win.print();
    // Close the helper window after printing (or cancelling).
    win.onafterprint = () => win.close();
  };
}

// Minimal HTML escaping so store names with & or < don't break the receipt.
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
