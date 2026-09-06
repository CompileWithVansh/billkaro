import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../types';

interface Props {
  item: Item;
  qty: number;
  locked: boolean;
  onTap: (item: Item) => void;
  onDecrement?: (item: Item) => void;
  onEdit: (item: Item) => void;
}

/**
 * A single item button.
 * - When the layout is LOCKED, tapping adds the item to the cart.
 * - When UNLOCKED, the button becomes draggable to rearrange, and a small
 *   edit dot lets you edit/delete the item.
 */
export default function SortableItemButton({ item, qty, locked, onTap, onDecrement, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: locked,
  });

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
      className={`item-btn ${isDragging ? 'dragging' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
      {...(!locked ? attributes : {})}
      {...(!locked ? listeners : {})}
      onClick={() => {
        if (locked && !isOutOfStock) onTap(item);
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
    </button>
  );
}
