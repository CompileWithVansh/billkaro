export interface User {
  id: number;
  storeName: string;
  email: string;
  upiId: string | null;
  payeeName: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  taxPercent: number;
  kdsPin?: string;
}

export interface Item {
  id: number;
  name: string;
  price: number;
  color: string;
  category: string;
  description?: string;
  stockQuantity: number | null;
  sortOrder: number;
}

export interface CartLine {
  lineId: string;          // stable unique id for this cart line
  itemId: number | null;   // linked catalog item, or null for a custom/misc line
  name: string;
  price: number;
  qty: number;
  category?: string;       // item category shown as description on the receipt
  description?: string;    // item description shown on receipt / WhatsApp
}

export function getItemDesc(line: { description?: string; category?: string }): string {
  const desc = line.description?.trim();
  const cat = line.category?.trim();
  if (desc && cat && desc.toLowerCase() !== cat.toLowerCase()) {
    return `${cat} • ${desc}`;
  }
  return desc || cat || '';
}

export function formatInvoiceNumber(id: number | string): string {
  const num = Number(id);
  if (isNaN(num)) return String(id);
  return `INV-${String(num).padStart(4, '0')}`;
}

export function getBillDisplayLabel(bill: { id?: number | string; label?: string }): string {
  const inv = bill.id ? formatInvoiceNumber(bill.id) : '';
  const rawLabel = (bill.label || '').trim();
  const isGenericBill = /^bill\s*\d+$/i.test(rawLabel);
  if (!inv) return rawLabel || 'Bill';
  if (!rawLabel || isGenericBill) return inv;
  return `${inv} (${rawLabel})`;
}

export interface Bill {
  id: string;      // client-side tab id
  label: string;   // e.g. "Table 1"
  lines: CartLine[];
  kdsStatus?: 'preparing' | 'ready';
}

export interface SavedBill {
  id: number | string;
  label: string;
  items: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'upi' | 'cash' | 'udhaar';
  customerName: string | null;
  customerPhone: string | null;
  status: 'paid' | 'unpaid';
  createdAt: string;
}
