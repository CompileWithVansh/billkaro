import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item, ItemVariant } from '../types';

interface Props {
  item: Item;
  qty: number;
  locked: boolean;
  onTap: (item: Item, variant?: ItemVariant) => void;
  onDecrement?: (item: Item, variant?: ItemVariant) => void;
  onEdit: (item: Item) => void;
  variantQtys?: Map<string, number>;
}

/**
 * A single item button.
 * - When the layout is LOCKED, tapping adds the item to the cart.
 *   (If it has variants, tapping any portion chip bills that variant in 1 tap).
 * - When UNLOCKED, the button becomes draggable to rearrange, and a small
 *   edit dot lets you edit/delete the item.
 */
export default function SortableItemButton({
  item,
  qty,
  locked,
  onTap,
  onDecrement,
  onEdit,
  variantQtys,
}: Props) {
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

  const numCols = hasVariants && item.variants ? (item.variants.length === 3 ? 3 : 2) : 1;

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
            const lowestVariant = [...item.variants].sort((a, b) => a.price - b.price)[0] || item.variants[0];
            onTap(item, lowestVariant);
          } else {
            onTap(item);
          }
        }
      }}
    >
      {/* Corner badge for standard non-variant items */}
      {!hasVariants && qty > 0 && (
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

      {hasVariants ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
          {/* Item Name & Portions Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6 }}>
            <span
              className="name"
              style={{
                margin: 0,
                fontSize: '0.96rem',
                fontWeight: 800,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '68%',
              }}
            >
              {item.name}
            </span>
            <span
              style={{
                fontSize: '0.70rem',
                background: qty > 0 ? '#38bdf8' : 'rgba(0, 0, 0, 0.38)',
                color: qty > 0 ? '#0f172a' : '#ffffff',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 800,
                letterSpacing: '0.3px',
                flexShrink: 0,
              }}
            >
              {qty > 0 ? `${qty} in cart` : `${item.variants!.length} sizes`}
            </span>
          </div>

          {/* Portion Chips Grid */}
          <div
            className="variant-chips-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${numCols}, 1fr)`,
              gap: 6,
              width: '100%',
              marginTop: 'auto',
            }}
          >
            {item.variants!.map((v, idx) => {
              const vKey = `${item.id}_${v.id}`;
              const vQty = variantQtys ? (variantQtys.get(vKey) ?? 0) : 0;
              const isSelected = vQty > 0;

              return (
                <div
                  key={v.id || idx}
                  role="button"
                  tabIndex={0}
                  className={`variant-chip-btn ${isSelected ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked && !isOutOfStock) onTap(item, v);
                  }}
                  onPointerDown={(e) => {
                    if (locked) e.stopPropagation();
                  }}
                  style={{
                    position: 'relative',
                    background: isSelected ? 'rgba(15, 23, 42, 0.94)' : 'rgba(0, 0, 0, 0.38)',
                    border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.22)',
                    boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.45)' : 'none',
                    borderRadius: 8,
                    padding: '6px 4px',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: locked ? (isOutOfStock ? 'not-allowed' : 'pointer') : 'grab',
                    minHeight: 44,
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Individual Portion Quantity Badge with decrement */}
                  {isSelected && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -7,
                        right: -7,
                        background: '#38bdf8',
                        color: '#0f172a',
                        borderRadius: '50%',
                        minWidth: 20,
                        height: 20,
                        padding: '0 4px',
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                        zIndex: 4,
                        cursor: 'pointer',
                      }}
                      title="Tap to subtract 1"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (locked && onDecrement) {
                          onDecrement(item, v);
                        }
                      }}
                    >
                      {vQty}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      opacity: isSelected ? 1 : 0.9,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      textTransform: 'capitalize',
                      lineHeight: 1.15,
                    }}
                  >
                    {v.name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: isSelected ? '#38bdf8' : '#4ade80',
                      marginTop: 2,
                      lineHeight: 1.15,
                    }}
                  >
                    ₹{v.price % 1 === 0 ? v.price.toFixed(0) : v.price.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </button>
  );
}
