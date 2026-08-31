// Shared palette for item buttons. Kept in one place so the editor and the
// auto-color logic stay in sync.
export const ITEM_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#ea580c', // orange
  '#0d9488', // teal
  '#4f46e5', // indigo
  '#65a30d', // lime
  '#4b5563', // slate
];

/**
 * Pick a color for a new item so different items get different button colors
 * automatically. We rotate through the palette and, when possible, prefer a
 * color not already used by an existing item.
 */
export function nextItemColor(existingColors: string[]): string {
  const unused = ITEM_COLORS.find((c) => !existingColors.includes(c));
  if (unused) return unused;
  // All colors used at least once -> rotate by count.
  return ITEM_COLORS[existingColors.length % ITEM_COLORS.length];
}
