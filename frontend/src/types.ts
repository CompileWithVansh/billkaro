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
  gstin?: string | null;
  fssai?: string | null;
  taxEnabled?: boolean;
  taxInclusive?: boolean;
}

export interface ItemVariant {
  id: string;        // unique id e.g. "v1", "v2"
  name: string;      // e.g. "Quarter", "Half", "Full"
  price: number;     // e.g. 130, 260, 520
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
  variants?: ItemVariant[];
}

export interface CartLine {
  lineId: string;          // stable unique id for this cart line
  itemId: number | null;   // linked catalog item, or null for a custom/misc line
  name: string;
  price: number;
  qty: number;
  category?: string;       // item category shown as description on the receipt
  description?: string;    // item description shown on receipt / WhatsApp
  variantId?: string;      // optional variant identifier
  variantName?: string;    // e.g. "Half", "Full"
}

export function getItemDesc(
  line: { description?: string; category?: string },
  options?: { showCategory?: boolean; showDescription?: boolean }
): string {
  // Configurable receipt item text: Category is OFF by default to keep bills short
  let showCat = options?.showCategory;
  if (showCat === undefined && typeof localStorage !== 'undefined') {
    showCat = localStorage.getItem('billkaro_print_category_enabled') === 'true';
  } else if (showCat === undefined) {
    showCat = false;
  }

  let showDesc = options?.showDescription;
  if (showDesc === undefined && typeof localStorage !== 'undefined') {
    showDesc = localStorage.getItem('billkaro_print_description_enabled') !== 'false';
  } else if (showDesc === undefined) {
    showDesc = true;
  }

  const desc = showDesc ? (line.description?.trim() || '') : '';
  const cat = showCat ? (line.category?.trim() || '') : '';

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
  label: string;   // e.g. "T1"
  lines: CartLine[];
  kdsStatus?: 'preparing' | 'ready';
  lastSentLines?: CartLine[];
  savedBillId?: number | string;  // persisted backend bill ID once generated / shared
  billShared?: boolean;           // whether bill was shared on WhatsApp awaiting payment
  discountType?: 'percent' | 'flat' | null;
  discountValue?: number;
  discountAmount?: number;
}

export interface SavedBill {
  id: number | string;
  label: string;
  items: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'upi' | 'cash' | 'udhaar' | 'split';
  customerName: string | null;
  customerPhone: string | null;
  status: 'paid' | 'unpaid';
  discountType?: 'percent' | 'flat' | null;
  discountValue?: number;
  discountAmount?: number;
  cashAmount?: number | null;
  upiAmount?: number | null;
  createdAt: string;
}

