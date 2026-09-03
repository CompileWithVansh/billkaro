import { useState } from 'react';

interface Props {
  categories: string[];
  categoryIcons: (cat: string) => string;
  itemsCountByCategory: (cat: string) => number;
  onSave: (newOrder: string[]) => void;
  onClose: () => void;
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

  function move(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;
    const updated = [...order];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setOrder(updated);
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
              Reorder categories so your most frequent items appear first.
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

          {order.map((cat, idx) => {
            const count = itemsCountByCategory(cat);
            return (
              <div
                key={cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.3rem' }}>{categoryIcons(cat)}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>{cat}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{count} items</div>
                  </div>
                </div>

                {/* Move Up / Down Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn ghost sm-btn"
                    disabled={idx === 0}
                    onClick={() => move(idx, 'up')}
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
                    disabled={idx === order.length - 1}
                    onClick={() => move(idx, 'down')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.9rem',
                      opacity: idx === order.length - 1 ? 0.3 : 1,
                      cursor: idx === order.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                    title="Move Down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })}
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
