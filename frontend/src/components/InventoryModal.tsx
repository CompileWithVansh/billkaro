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
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📦 Inventory & Stock Manager</h3>
          <input
            style={{ width: 240, padding: '8px 12px', fontSize: '0.9rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item or category…"
          />
        </div>

        <div style={{ maxHeight: 440, overflowY: 'auto', border: '1px solid #334155', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
                          className="btn ghost"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 32 }}
                          onClick={() => adjustStock(item.id, 10)}
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 32 }}
                          onClick={() => adjustStock(item.id, 50)}
                        >
                          +50
                        </button>
                        <button
                          type="button"
                          className={`btn ${isOut ? 'danger' : 'ghost'}`}
                          style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 32 }}
                          onClick={() => setStockPreset(item.id, 'out')}
                        >
                          Out of Stock
                        </button>
                        <button
                          type="button"
                          className={`btn ${isUnlimited ? 'primary' : 'ghost'}`}
                          style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 32 }}
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
