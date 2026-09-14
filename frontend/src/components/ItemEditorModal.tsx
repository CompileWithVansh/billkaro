import { useMemo, useState } from 'react';
import type { Item, ItemVariant } from '../types';
import { ITEM_COLORS, CLASSIC_ITEM_COLORS, EXTENDED_ITEM_COLORS } from '../colors';

interface Props {
  initial?: Item | null;
  /** For new items, the color pre-selected so each item differs by default. */
  suggestedColor?: string;
  existingCategories?: string[];
  onClose: () => void;
  onSave: (data: {
    name: string;
    price: number;
    color: string;
    category: string;
    description?: string;
    stockQuantity?: number | null;
    variants?: ItemVariant[] | null;
  }) => void;
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
  const [color, setColor] = useState(initial?.color ?? suggestedColor ?? CLASSIC_ITEM_COLORS[0]);
  const [showAllColors, setShowAllColors] = useState(() => EXTENDED_ITEM_COLORS.includes(initial?.color ?? ''));
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stockQuantity, setStockQuantity] = useState(initial?.stockQuantity !== null && initial?.stockQuantity !== undefined ? String(initial.stockQuantity) : '');
  const [variants, setVariants] = useState<ItemVariant[]>(() => {
    return Array.isArray(initial?.variants) ? [...initial.variants] : [];
  });
  const [showVariantsSection, setShowVariantsSection] = useState(() => (initial?.variants?.length ?? 0) > 0);

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

    const cleanVariants = variants
      .filter((v) => v.name.trim())
      .map((v, i) => ({
        id: v.id || `v_${i + 1}`,
        name: v.name.trim(),
        price: Math.max(0, Number(v.price) || 0),
      }));

    let finalPrice = Number(price) || 0;
    if (cleanVariants.length > 0 && finalPrice === 0) {
      finalPrice = cleanVariants[0].price;
    }

    onSave({
      name: name.trim(),
      price: finalPrice,
      color,
      category: finalCategory,
      description: description.trim(),
      stockQuantity: stockQuantity === '' ? null : Number(stockQuantity),
      variants: cleanVariants.length > 0 ? cleanVariants : null,
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
          <label>{variants.length > 0 ? 'Base / Starting Price (₹)' : 'Price (₹)'}</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </div>

        {/* Optional Portion Sizes / Variants Section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn ghost sm-btn"
              onClick={() => setShowVariantsSection((prev) => !prev)}
              style={{
                fontSize: '0.8rem',
                padding: '4px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderColor: variants.length > 0 ? '#38bdf8' : 'var(--border)',
                color: variants.length > 0 ? '#38bdf8' : 'var(--text)',
              }}
            >
              <span>{showVariantsSection ? '▾' : '▸'}</span>
              <span>➕ Portion Sizes / Variants ({variants.length})</span>
            </button>

            {variants.length > 0 && !showVariantsSection && (
              <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>
                {variants.map((v) => `${v.name} ₹${v.price}`).join(' • ')}
              </span>
            )}
          </div>

          {showVariantsSection && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--panel-2)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                  Quick presets:
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn ghost sm-btn"
                    onClick={() => {
                      const p = Number(price) || 0;
                      setVariants([
                        { id: 'v1', name: 'Half', price: p ? Math.round(p * 0.6) : 0 },
                        { id: 'v2', name: 'Full', price: p || 0 },
                      ]);
                    }}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                  >
                    Half / Full
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm-btn"
                    onClick={() => {
                      const p = Number(price) || 0;
                      setVariants([
                        { id: 'v1', name: 'Quarter', price: p ? Math.round(p * 0.35) : 0 },
                        { id: 'v2', name: 'Half', price: p ? Math.round(p * 0.6) : 0 },
                        { id: 'v3', name: 'Full', price: p || 0 },
                      ]);
                    }}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                  >
                    Qtr / Half / Full
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm-btn"
                    onClick={() => {
                      setVariants([
                        { id: 'v1', name: '250g', price: 0 },
                        { id: 'v2', name: '500g', price: 0 },
                        { id: 'v3', name: '1kg', price: 0 },
                      ]);
                    }}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                  >
                    250g / 500g / 1kg
                  </button>
                </div>
              </div>

              {/* Variants Rows */}
              {variants.map((v, idx) => (
                <div key={v.id || idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={v.name}
                    placeholder="e.g. Half, 500g"
                    onChange={(e) => {
                      const val = e.target.value;
                      setVariants((prev) => prev.map((item, i) => (i === idx ? { ...item, name: val } : item)));
                    }}
                    style={{ flex: 1.2, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                  <div style={{ position: 'relative', width: '100px' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.85rem' }}>₹</span>
                    <input
                      type="number"
                      value={v.price === 0 ? '' : v.price}
                      placeholder="0"
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        setVariants((prev) => prev.map((item, i) => (i === idx ? { ...item, price: val } : item)));
                      }}
                      style={{ width: '100%', padding: '6px 6px 6px 20px', fontSize: '0.85rem', fontWeight: 700, color: '#86efac' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                    title="Delete portion"
                  >
                    🗑️
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn ghost sm-btn"
                onClick={() => {
                  setVariants((prev) => [
                    ...prev,
                    { id: `v_${prev.length + 1}_${Date.now()}`, name: '', price: 0 },
                  ]);
                }}
                style={{ fontSize: '0.75rem', alignSelf: 'flex-start', marginTop: 4 }}
              >
                ➕ Add Another Portion
              </button>
            </div>
          )}
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
        </div>

        <div className="field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 500ml, Extra cheese, Spicy" />
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>
              Button color {showAllColors ? `(30)` : `(12)`}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: color,
                  border: '1.5px solid #ffffff',
                  boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                }}
                title="Current color preview"
              />
              <button
                type="button"
                onClick={() => setShowAllColors((v) => !v)}
                style={{
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: '#38bdf8',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                {showAllColors ? '▴ Standard (12)' : `+ More Colors (${EXTENDED_ITEM_COLORS.length}) ▾`}
              </button>
            </div>
          </div>
          <div className="color-row">
            {(showAllColors ? ITEM_COLORS : CLASSIC_ITEM_COLORS).map((c) => (
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
