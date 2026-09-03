import { useState } from 'react';
import { api } from '../api';
import type { Item } from '../types';

interface Props {
  items: Item[];
  onClose: () => void;
  onRefreshItems: () => void;
}

export default function InventoryModal({ items, onClose, onRefreshItems }: Props) {
  const [stockMap, setStockMap] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    items.forEach((item) => {
      initial[item.id] = item.stockQuantity !== null && item.stockQuantity !== undefined ? String(item.stockQuantity) : '';
    });
    return initial;
  });

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  function handleStockChange(itemId: number, val: string) {
    setStockMap((prev) => ({ ...prev, [itemId]: val }));
  }

  function adjustStock(itemId: number, delta: number) {
    setStockMap((prev) => {
      const current = prev[itemId] === '' ? 0 : Number(prev[itemId]) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: String(next) };
    });
  }

  function setStockPreset(itemId: number, preset: 'out' | 'unlimited') {
    setStockMap((prev) => ({
      ...prev,
      [itemId]: preset === 'out' ? '0' : '',
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      const updates = items.map((item) => {
        const strVal = stockMap[item.id];
        const newStock = strVal === '' ? null : Number(strVal);
        if (newStock !== item.stockQuantity) {
          return api.put(`/items/${item.id}`, { stockQuantity: newStock });
        }
        return Promise.resolve();
      });

      await Promise.all(updates);
      onRefreshItems();
      onClose();
    } catch (err) {
      console.error('Failed to update inventory:', err);
      alert('Could not update inventory.');
    } finally {
      setSaving(false);
    }
  }

  const filteredItems = items.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q));
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840 }}>
        {/* Header with Top-Right Close Button */}
        <div className="modal-header" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>📦 Inventory & Stock Manager</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div style={{ marginBottom: 14 }}>
          <input
            style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item or category…"
          />
        </div>

        <div style={{ maxHeight: 440, overflowY: 'auto' }}>
          {/* Mobile Inventory Cards (< 768px) */}
          <div className="mobile-inventory-list">
            {filteredItems.map((item) => {
              const stockVal = stockMap[item.id] ?? '';
              const isOut = stockVal === '0';
              const isUnlimited = stockVal === '';

              return (
                <div key={item.id} className="inventory-card">
                  <div className="inventory-card-header">
                    <div className="inventory-card-title">
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: item.color || '#2563eb', flexShrink: 0 }} />
                      <span>{item.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>({item.category || 'General'})</span>
                    </div>
                    <div className="inventory-card-price">₹{item.price.toFixed(2)}</div>
                  </div>

                  <div className="inventory-card-controls">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>Stock:</span>
                      <input
                        type="number"
                        style={{
                          width: '100%',
                          maxWidth: 100,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: isOut ? '1px solid #ef4444' : '1px solid #334155',
                          background: '#0f172a',
                          color: isOut ? '#fca5a5' : '#f8fafc',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                        }}
                        value={stockVal}
                        onChange={(e) => handleStockChange(item.id, e.target.value)}
                        placeholder="Unlimited"
                      />
                    </div>
                    <div className="inventory-chips">
                      <button
                        type="button"
                        className="btn ghost sm-btn"
                        onClick={() => adjustStock(item.id, 10)}
                      >
                        +10
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm-btn"
                        onClick={() => adjustStock(item.id, 50)}
                      >
                        +50
                      </button>
                      <button
                        type="button"
                        className={`btn sm-btn ${isOut ? 'danger' : 'ghost'}`}
                        onClick={() => setStockPreset(item.id, 'out')}
                      >
                        Out
                      </button>
                      <button
                        type="button"
                        className={`btn sm-btn ${isUnlimited ? 'primary' : 'ghost'}`}
                        onClick={() => setStockPreset(item.id, 'unlimited')}
                      >
                        ∞
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="desktop-inventory-table" style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: 12 }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <th style={{ padding: '10px 14px' }}>Item</th>
                  <th style={{ padding: '10px 14px' }}>Category</th>
                  <th style={{ padding: '10px 14px' }}>Price</th>
                  <th style={{ padding: '10px 14px', width: 140 }}>Stock Quantity</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const stockVal = stockMap[item.id] ?? '';
                  const isOut = stockVal === '0';
                  const isUnlimited = stockVal === '';

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 999, background: item.color || '#2563eb' }} />
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        {item.category || 'General'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        ₹{item.price.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          type="number"
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: isOut ? '1px solid #ef4444' : '1px solid #334155',
                            background: '#0f172a',
                            color: isOut ? '#fca5a5' : '#f8fafc',
                            fontWeight: 700,
                          }}
                          value={stockVal}
                          onChange={(e) => handleStockChange(item.id, e.target.value)}
                          placeholder="Unlimited"
                        />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn ghost sm-btn"
                            onClick={() => adjustStock(item.id, 10)}
                          >
                            +10
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm-btn"
                            onClick={() => adjustStock(item.id, 50)}
                          >
                            +50
                          </button>
                          <button
                            type="button"
                            className={`btn sm-btn ${isOut ? 'danger' : 'ghost'}`}
                            onClick={() => setStockPreset(item.id, 'out')}
                          >
                            Out of Stock
                          </button>
                          <button
                            type="button"
                            className={`btn sm-btn ${isUnlimited ? 'primary' : 'ghost'}`}
                            onClick={() => setStockPreset(item.id, 'unlimited')}
                          >
                            Unlimited
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Inventory Updates'}
          </button>
        </div>
      </div>
    </div>
  );
}
