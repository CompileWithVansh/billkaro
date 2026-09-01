export interface User {
  id: number;
  storeName: string;
  email: string;
  upiId: string | null;
  payeeName: string | null;
  currency: string;
  taxPercent: number;
}

export interface Item {
  id: number;
  name: string;
  price: number;
  color: string;
  category: string;
  sortOrder: number;
}

export interface CartLine {
  lineId: string;          // stable unique id for this cart line
  itemId: number | null;   // linked catalog item, or null for a custom/misc line
  name: string;
  price: number;
  qty: number;
  category?: string;       // item category shown as description on the receipt
}

export interface Bill {
  id: string;      // client-side tab id
  label: string;   // e.g. "Table 1"
  lines: CartLine[];
}
