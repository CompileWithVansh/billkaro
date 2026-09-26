import { useState, useMemo } from 'react';
import { Item, CartLine } from '../types';

interface Props {
  items: Item[];
  activeBillLines?: CartLine[];
  onClose: () => void;
  onConfirm: (data: {
    amount: number;
    name: string;
    itemId?: number | null;
    category?: string;
    description?: string;
    isAdjustment?: boolean;
  }) => void;
}

// Cleanly strip trailing portion names in parentheses like (Half Plate), (Quarter), (Full)
function cleanDishName(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  return cleaned || name;
}

export default function CustomAmountModal({
  items,
  activeBillLines = [],
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');
  const [customName, setCustomName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  
  // Check if selected item is already present in the active cart
  const itemInCart = useMemo(() => {
    if (!selectedItemId) return false;
    return activeBillLines.some((l) => l.itemId === Number(selectedItemId));
  }, [selectedItemId, activeBillLines]);

  // Group items by category for the dropdown
  const categorizedItems = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const cat = item.category?.trim() || 'General';
      const list = map.get(cat) || [];
      list.push(item);
      map.set(cat, list);
    }
    return map;
  }, [items]);

  function handleItemSelect(idStr: string) {
    setSelectedItemId(idStr);
    if (!idStr) {
      if (customName.endsWith('(Extra)') || customName.endsWith('(Custom)')) {
        setCustomName('Custom');
      }
      return;
    }

    const item = items.find((i) => i.id === Number(idStr));
    if (item) {
      const baseName = cleanDishName(item.name);
      const inCart = activeBillLines.some((l) => l.itemId === item.id);
      
      // Auto-populate clean descriptive name without double parentheses
      setCustomName(inCart ? `${baseName} (Extra)` : `${baseName} (Custom)`);
    }
  }

  function push(ch: string) {
    setValue((prev) => {
      if (ch === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      if (prev.includes('.')) {
        const decimals = prev.split('.')[1] ?? '';
        if (decimals.length >= 2) return prev;
      }
      if (prev === '0' && ch !== '.') return ch;
      return prev + ch;
    });
  }

  function backspace() {
    setValue((prev) => prev.slice(0, -1));
  }

  function addQuickAmount(delta: number) {
    const current = Number(value) || 0;
    const next = current + delta;
    setValue(String(next));
  }

  function handleConfirm() {
    const num = Number(value);
    if (!isFinite(num) || num <= 0) return;

    const item = selectedItemId ? items.find((i) => i.id === Number(selectedItemId)) : undefined;
    const baseName = item ? cleanDishName(item.name) : '';
    const finalName = customName.trim() || (item ? `${baseName} (Custom)` : 'Custom');

    onConfirm({
      amount: +num.toFixed(2),
      name: finalName,
      itemId: item ? item.id : null,
      category: item?.category || undefined,
      description: item?.description || undefined,
      // Automatically treats as extra portion adjustment if the item is already in the cart!
      isAdjustment: Boolean(item && itemInCart),
    });
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  const quickTags = ['Extra', 'Packing', 'Delivery', 'Custom'];
  const quickAmounts = [10, 20, 40, 50, 100, 200];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal custom-amount-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Add Custom Amount</h3>
          <button
            type="button"
            className="line-del"
            onClick={onClose}
            style={{ fontSize: '1.2rem', padding: '4px 8px', color: 'var(--muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Display */}
        <div className="keypad-display" style={{ marginBottom: 10, minHeight: 64, fontSize: 32 }}>
          ₹{value || '0'}
        </div>

        {/* Quick Amount Chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              className="mini-btn"
              onClick={() => addQuickAmount(amt)}
              style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#38bdf8',
              }}
            >
              +₹{amt}
            </button>
          ))}
          {value && (
            <button
              type="button"
              className="mini-btn"
              onClick={() => setValue('')}
              style={{
                background: '#451a1a',
                border: '1px solid #7f1d1d',
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#fca5a5',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Keypad Grid */}
        <div className="keypad-grid" style={{ marginBottom: 14 }}>
          {keys.map((k, i) =>
            k === '⌫' ? (
              <button key={i} className="keypad-key" onClick={backspace} style={{ minHeight: 46, fontSize: 20 }}>
                ⌫
              </button>
            ) : (
              <button key={i} className="keypad-key" onClick={() => push(k)} style={{ minHeight: 46, fontSize: 20 }}>
                {k}
              </button>
            )
          )}
        </div>

        {/* Link to Catalog Item (Optional) */}
        <div className="field" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🔗 Link to Menu Item</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>(Optional for Sales Reports)</span>
          </label>
          <select
            value={selectedItemId}
            onChange={(e) => handleItemSelect(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text)',
              fontSize: '0.9rem',
            }}
          >
            <option value="">— None (General Miscellaneous / Custom) —</option>
            {Array.from(categorizedItems.entries()).map(([cat, catItems]) => (
              <optgroup key={cat} label={cat}>
                {catItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.price > 0 ? `(₹${item.price})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedItemId && itemInCart && (
            <div style={{ fontSize: '0.76rem', color: '#38bdf8', marginTop: 4, fontWeight: 500 }}>
              ✓ Adding as extra portion to your cart item
            </div>
          )}
        </div>

        {/* Item Name / Description */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Item Name on Bill</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Printed on receipt</span>
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Extra Biryani, Packing, Delivery"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text)',
              fontSize: '0.9rem',
            }}
          />

          {/* Quick Tag Suggestion Chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {quickTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (selectedItemId) {
                    const item = items.find((i) => i.id === Number(selectedItemId));
                    const baseName = item ? cleanDishName(item.name) : '';
                    setCustomName(baseName ? `${baseName} (${tag})` : tag);
                  } else {
                    setCustomName(tag);
                  }
                }}
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  color: 'var(--muted)',
                }}
              >
                +{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: 6 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn green"
            onClick={handleConfirm}
            disabled={!value || Number(value) <= 0}
            style={{ opacity: !value || Number(value) <= 0 ? 0.5 : 1 }}
          >
            Add {value && Number(value) > 0 ? `₹${value} ` : ''}to bill
          </button>
        </div>
      </div>
    </div>
  );
}
