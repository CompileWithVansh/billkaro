import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  categories: string[];
  categoryIcons: (cat: string) => string;
  itemsCountByCategory: (cat: string) => number;
  onSave: (newOrder: string[]) => void;
  onClose: () => void;
}

function SortableCategoryRow({
  cat,
  count,
  icon,
  idx,
  total,
  onMove,
}: {
  cat: string;
  count: number;
  icon: string;
  idx: number;
  total: number;
  onMove: (index: number, direction: 'up' | 'down') => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 999 : 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: 12,
    background: isDragging ? 'rgba(56, 189, 248, 0.18)' : 'var(--panel)',
    border: isDragging ? '1px solid #38bdf8' : '1px solid var(--border)',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {/* Drag Handle */}
        <span
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 4px',
            color: isDragging ? '#38bdf8' : 'var(--muted)',
            userSelect: 'none',
          }}
          title="Drag up or down to reorder"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>

        <span style={{ fontSize: '1.3rem' }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: '#f8fafc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cat}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{count} items</div>
        </div>
      </div>

      {/* Move Up / Down Buttons for 1-step nudge */}
      <div style={{ display: 'flex', gap: 6, marginLeft: 8 }} onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn ghost sm-btn"
          disabled={idx === 0}
          onClick={() => onMove(idx, 'up')}
          style={{
            padding: '4px 10px',
            fontSize: '0.9rem',
            opacity: idx === 0 ? 0.3 : 1,
            cursor: idx === 0 ? 'not-allowed' : 'pointer',
          }}
          title="Move Up"
        >
          ▲
        </button>
        <button
          type="button"
          className="btn ghost sm-btn"
          disabled={idx === total - 1}
          onClick={() => onMove(idx, 'down')}
          style={{
            padding: '4px 10px',
            fontSize: '0.9rem',
            opacity: idx === total - 1 ? 0.3 : 1,
            cursor: idx === total - 1 ? 'not-allowed' : 'pointer',
          }}
          title="Move Down"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export default function ArrangeCategoriesModal({
  categories,
  categoryIcons,
  itemsCountByCategory,
  onSave,
  onClose,
}: Props) {
  // Exclude 'All' since 'All' is always fixed at the top
  const [order, setOrder] = useState<string[]>(() => categories.filter((c) => c !== 'All'));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  function move(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;
    setOrder(arrayMove(order, index, target));
  }

  function handleSave() {
    onSave(order);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '460px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>↕️</span> Arrange Categories
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Drag ⠿ items to reorder directly, or use the arrows.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Categories List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '4px 2px',
            maxHeight: '55vh',
          }}
        >
          {/* 'All' pinned item */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px dashed rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>🛒</span>
              <span>All Items (Fixed at Top)</span>
            </div>
            <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>Pinned</span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map((cat, idx) => (
                <SortableCategoryRow
                  key={cat}
                  cat={cat}
                  count={itemsCountByCategory(cat)}
                  icon={categoryIcons(cat)}
                  idx={idx}
                  total={order.length}
                  onMove={move}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="button" className="btn green" onClick={handleSave} style={{ flex: 2, fontWeight: 700 }}>
            💾 Save Category Order
          </button>
        </div>
      </div>
    </div>
  );
}
