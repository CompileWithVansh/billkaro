// Shared palette for item buttons and category badges.
// Kept in one place so the editor, POS item grid, and auto-color logic stay in sync.

/**
 * Original 12 classic colors - preserved in exact order for 100% backward compatibility
 * with existing items and user habits.
 */
export const CLASSIC_ITEM_COLORS = [
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
 * Additional rich restaurant & cafe colors (bakery, espresso, tandoori, cocktails, etc.)
 */
export const EXTENDED_ITEM_COLORS = [
  '#0284c7', // Sky Blue
  '#06b6d4', // Bright Aqua
  '#059669', // Emerald Mint
  '#10b981', // Jade Green
  '#84cc16', // Bright Chartreuse
  '#f97316', // Warm Tangerine
  '#f59e0b', // Cheese Yellow
  '#ef4444', // Fiery Red
  '#b91c1c', // Deep Tandoori
  '#f43f5e', // Rose Coral
  '#9333ea', // Grape Purple
  '#6366f1', // Soft Iris
  '#a855f7', // Lavender
  '#ec4899', // Berry Pink
  '#14b8a6', // Persian Turquoise
  '#78350f', // Roasted Coffee / Espresso
  '#854d0e', // Spiced Chai / Caramel
  '#334155', // Midnight Charcoal
];

/**
 * Full combined palette of 30 colors.
 */
export const ITEM_COLORS = [...CLASSIC_ITEM_COLORS, ...EXTENDED_ITEM_COLORS];

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
