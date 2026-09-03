import { useState } from 'react';
import type { Item } from '../types';
import { ITEM_COLORS } from '../colors';

interface Props {
  initial?: Item | null;
  /** For new items, the color pre-selected so each item differs by default. */
  suggestedColor?: string;
  onClose: () => void;
  onSave: (data: { name: string; price: number; color: string; category: string; description?: string; stockQuantity?: number | null }) => void;
  onDelete?: () => void;
}

export default function ItemEditorModal({ initial, suggestedColor, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [color, setColor] = useState(initial?.color ?? suggestedColor ?? ITEM_COLORS[0]);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stockQuantity, setStockQuantity] = useState(initial?.stockQuantity !== null && initial?.stockQuantity !== undefined ? String(initial.stockQuantity) : '');

  function save() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      price: Number(price) || 0,
      color,
      category: category.trim(),
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
          <label>Category (optional)</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. South Indian" />
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
