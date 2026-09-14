import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item, ItemVariant } from '../types';

interface Props {
  item: Item;
  qty: number;
  locked: boolean;
  onTap: (item: Item, variant?: ItemVariant) => void;
  onDecrement?: (item: Item) => void;
  onEdit: (item: Item) => void;
}

/**
 * A single item button.
 * - When the layout is LOCKED, tapping adds the item to the cart.
 *   (If it has variants, tapping any portion chip bills that variant in 1 tap).
 * - When UNLOCKED, the button becomes draggable to rearrange, and a small
 *   edit dot lets you edit/delete the item.
 */
export default function SortableItemButton({ item, qty, locked, onTap, onDecrement, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: locked,
  });

  const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
  const isOutOfStock = item.stockQuantity !== null && item.stockQuantity !== undefined && item.stockQuantity <= 0;
  const isLowStock = item.stockQuantity !== null && item.stockQuantity !== undefined && item.stockQuantity > 0 && item.stockQuantity <= 5;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isOutOfStock ? '#334155' : item.color || '#2563eb',
    opacity: isOutOfStock ? 0.65 : 1,
    cursor: locked ? (isOutOfStock ? 'not-allowed' : 'pointer') : 'grab',
    touchAction: locked ? 'auto' : 'none',
    zIndex: isDragging ? 99 : 'auto',
    border: isOutOfStock ? '1.5px solid rgba(239, 68, 68, 0.55)' : undefined,
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      className={`item-btn ${isDragging ? 'dragging' : ''} ${isOutOfStock ? 'out-of-stock' : ''} ${hasVariants ? 'has-variants' : ''}`}
      {...(!locked ? attributes : {})}
      {...(!locked ? listeners : {})}
      onClick={() => {
        if (locked && !isOutOfStock) {
          if (hasVariants && item.variants && item.variants.length > 0) {
            onTap(item, item.variants[0]);
          } else {
            onTap(item);
          }
        }
      }}
    >
      {qty > 0 && (
        <span
          className={`badge ${!locked ? 'with-edit' : ''}`}
          title={locked ? 'Tap to subtract 1' : undefined}
          onClick={(e) => {
            if (locked && onDecrement) {
              e.stopPropagation();
              onDecrement(item);
            }
          }}
          onPointerDown={(e) => {
            if (locked) e.stopPropagation();
          }}
        >
          {qty}
        </span>
      )}

      {!locked && (
        <span
          className="edit-dot"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </span>
      )}

      <span className="name">{item.name}</span>

      {hasVariants ? (
        <div
          className="variant-chips-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 4,
            marginTop: 6,
            width: '100%',
          }}
        >
          {item.variants!.map((v, idx) => {
            const isOddTotal = item.variants!.length % 2 === 1;
            const isLastOdd = isOddTotal && idx === item.variants!.length - 1;
            return (
              <div
                key={v.id || idx}
                role="button"
                tabIndex={0}
                className="variant-chip-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (locked && !isOutOfStock) onTap(item, v);
                }}
                onPointerDown={(e) => {
                  if (locked) e.stopPropagation();
                }}
                style={{
                  gridColumn: isLastOdd ? 'span 2' : 'auto',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 6,
                  padding: '4px 3px',
                  color: '#ffffff',
                  display: 'flex',
                  flexDirection: isLastOdd ? 'row' : 'column',
                  gap: isLastOdd ? 6 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: locked ? (isOutOfStock ? 'not-allowed' : 'pointer') : 'grab',
                  minHeight: 32,
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {v.name}
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#86efac' }}>
                  ₹{v.price % 1 === 0 ? v.price.toFixed(0) : v.price.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="item-btn-footer" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
            <span
              className="price"
              style={{
                textDecoration: isOutOfStock ? 'line-through' : undefined,
                opacity: isOutOfStock ? 0.6 : 0.95,
                fontSize: isOutOfStock ? '13px' : undefined,
              }}
            >
              ₹{item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}
            </span>
            {!isOutOfStock && isLowStock && (
              <span className="stock-badge low">⚠️ {item.stockQuantity}</span>
            )}
            {!isOutOfStock && !isLowStock && item.stockQuantity !== null && item.stockQuantity !== undefined && (
              <span className="stock-badge normal">{item.stockQuantity}</span>
            )}
          </div>

          {isOutOfStock && (
            <div
              className="stock-badge out"
              style={{
                width: '100%',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '2px 4px',
                fontSize: '9.5px',
                letterSpacing: '0.4px',
              }}
            >
              Out of Stock
            </div>
          )}
        </div>
      )}
    </button>
  );
}
