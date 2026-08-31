import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../types';

interface Props {
  item: Item;
  qty: number;
  locked: boolean;
  onTap: (item: Item) => void;
  onEdit: (item: Item) => void;
}

/**
 * A single item button.
 * - When the layout is LOCKED, tapping adds the item to the cart.
 * - When UNLOCKED, the button becomes draggable to rearrange, and a small
 *   edit dot lets you edit/delete the item.
 */
export default function SortableItemButton({ item, qty, locked, onTap, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: locked,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: item.color || '#2563eb',
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`item-btn ${isDragging ? 'dragging' : ''}`}
      // Only bind drag listeners when unlocked; otherwise plain tap-to-add.
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
      onClick={() => {
        if (locked) onTap(item);
      }}
    >
      {qty > 0 && <span className="badge">{qty}</span>}

      {!locked && (
        <span
          className="edit-dot"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ✎
        </span>
      )}

      <span className="name">{item.name}</span>
      <span className="price">₹{item.price.toFixed(2)}</span>
    </button>
  );
}
