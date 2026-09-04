import { useMemo, useState } from 'react';
import type { Item } from '../types';
import { ITEM_COLORS } from '../colors';

interface Props {
  initial?: Item | null;
  /** For new items, the color pre-selected so each item differs by default. */
  suggestedColor?: string;
  existingCategories?: string[];
  onClose: () => void;
  onSave: (data: { name: string; price: number; color: string; category: string; description?: string; stockQuantity?: number | null }) => void;
  onDelete?: () => void;
}

export default function ItemEditorModal({
  initial,
  suggestedColor,
  existingCategories,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [color, setColor] = useState(initial?.color ?? suggestedColor ?? ITEM_COLORS[0]);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stockQuantity, setStockQuantity] = useState(initial?.stockQuantity !== null && initial?.stockQuantity !== undefined ? String(initial.stockQuantity) : '');

  const registeredCategories = useMemo(() => {
    const list = (existingCategories || [])
      .map((c) => c.trim())
      .filter((c) => c && c !== 'All');
    return Array.from(new Set(list));
  }, [existingCategories]);

  function save() {
    if (!name.trim()) return;

    let finalCategory = category.trim();
    // Auto-match case against registered categories to prevent duplicate casing variations
    if (finalCategory) {
      const matched = registeredCategories.find(
        (c) => c.toLowerCase() === finalCategory.toLowerCase()
      );
      if (matched) {
        finalCategory = matched;
      }
    }

    onSave({
      name: name.trim(),
      price: Number(price) || 0,
      color,
      category: finalCategory,
      description: description.trim(),
      stockQuantity: stockQuantity === '' ? null : Number(stockQuantity),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Edit item' : 'Add item'}</h3>

        <div className="field">
          <label>Item name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Masala Dosa" autoFocus />
        </div>

        <div className="field">
          <label>Price (₹)</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </div>

        <div className="field">
          <label>Stock Quantity (optional)</label>
          <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} placeholder="Unlimited (leave empty)" />
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ margin: 0 }}>Category (optional)</label>
            {registeredCategories.length > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Pick or type custom
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              list="registered-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. South Indian, Beverages"
              style={{ flex: 1 }}
            />

            {registeredCategories.length > 0 && (
              <select
                value={registeredCategories.includes(category) ? category : ''}
                onChange={(e) => {
                  if (e.target.value) setCategory(e.target.value);
                }}
                style={{
                  width: '135px',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  padding: '0 8px',
                }}
              >
                <option value="">Categories ▾</option>
                {registeredCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Datalist for inline suggestions while typing */}
          <datalist id="registered-category-options">
            {registeredCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {/* Category Chips */}
          {registeredCategories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxHeight: '80px', overflowY: 'auto' }}>
              {registeredCategories.map((c) => {
                const isSelected = category.trim().toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    className={`btn ${isSelected ? 'primary' : 'ghost'}`}
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.78rem',
                      borderRadius: 16,
                      lineHeight: 1.4,
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.05)',
                      color: isSelected ? '#38bdf8' : 'var(--text)',
                      fontWeight: isSelected ? 700 : 500,
                    }}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 500ml, Extra cheese, Spicy" />
        </div>

        <div className="field">
          <label>Button color</label>
          <div className="color-row">
            {ITEM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${color === c ? 'sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          {initial && onDelete && (
            <button className="btn danger" onClick={onDelete}>Delete</button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
