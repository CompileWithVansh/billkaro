import { useState } from 'react';
import { api } from '../api';
import type { Item } from '../types';

interface Props {
  items: Item[];
  onRefreshItems: () => void;
}

export default function StockTab({ items, onRefreshItems }: Props) {
  const [stockMap, setStockMap] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    items.forEach((item) => {
      initial[item.id] = item.stockQuantity !== null && item.stockQuantity !== undefined ? String(item.stockQuantity) : '';
    });
    return initial;
  });

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function handleStockChange(itemId: number, val: string) {
    setSaveSuccess(false);
    setStockMap((prev) => ({ ...prev, [itemId]: val }));
  }

  function adjustStock(itemId: number, delta: number) {
    setSaveSuccess(false);
    setStockMap((prev) => {
      const current = prev[itemId] === '' ? 0 : Number(prev[itemId]) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: String(next) };
    });
  }

  function setStockPreset(itemId: number, preset: 'out' | 'unlimited') {
    setSaveSuccess(false);
    setStockMap((prev) => ({
      ...prev,
      [itemId]: preset === 'out' ? '0' : '',
    }));
  }

  // Count changed items
  const changedItems = items.filter((item) => {
    const strVal = stockMap[item.id];
    const newStock = strVal === '' || strVal === undefined ? null : Number(strVal);
    return newStock !== item.stockQuantity;
  });

  async function handleSave() {
    if (changedItems.length === 0) return;
    try {
      setSaving(true);
      setSaveSuccess(false);

      const updates = changedItems.map((item) => {
        const strVal = stockMap[item.id];
        const newStock = strVal === '' || strVal === undefined ? null : Number(strVal);
        return api.put(`/items/${item.id}`, {
          name: item.name,
          price: item.price,
          category: item.category,
          stockQuantity: newStock,
        });
      });

      await Promise.all(updates);
      onRefreshItems();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update inventory:', err);
      const msg = err?.response?.data?.error || 'Could not update inventory.';
      alert(msg);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Page Header */}
      <div style={{ padding: '14px 16px', background: 'var(--panel-2, #1e293b)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
            📦 Inventory & Stock Manager
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
            Manage stock counts, 86 items, and low-inventory alerts ({items.length} dishes)
          </div>
        </div>

        {changedItems.length > 0 && (
          <div style={{ fontSize: '0.78rem', background: '#38bdf8', color: '#0f172a', padding: '3px 10px', borderRadius: 12, fontWeight: 800 }}>
            {changedItems.length} un-saved change(s)
          </div>
        )}
      </div>

      {/* Search Input */}
      <div style={{ padding: '12px 16px', background: 'var(--bg, #0f172a)', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search dishes by name or category…"
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--panel, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: '#f8fafc',
            fontSize: '16px',
            outline: 'none',
          }}
        />
      </div>

      {/* Items Stock List (Scrollable Area) */}
      <div style={{ padding: '12px 16px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            No items matched "{search}".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredItems.map((item) => {
              const currentVal = stockMap[item.id];
              const isUnlimited = currentVal === '' || currentVal === undefined;
              const numericVal = isUnlimited ? null : Number(currentVal);
              const isOut = numericVal !== null && numericVal <= 0;
              const isLow = numericVal !== null && numericVal > 0 && numericVal <= 5;

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--panel-2, #1e293b)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: item.color || '#38bdf8',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {item.category || 'General'}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.95rem' }}>
                        ₹{item.price.toFixed(2)}
                      </div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isOut ? '#991b1b' : isLow ? '#78350f' : 'rgba(255,255,255,0.06)',
                          color: isOut ? '#fca5a5' : isLow ? '#fde68a' : '#94a3b8',
                        }}
                      >
                        {isOut ? '🔴 SOLD OUT' : isLow ? `⚠️ LOW (${numericVal})` : isUnlimited ? '∞ UNLIMITED' : `✅ ${numericVal} IN STOCK`}
                      </span>
                    </div>
                  </div>

                  {/* Stock Quick Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 120 }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Stock:</span>
                      <input
                        type="number"
                        min="0"
                        value={currentVal}
                        placeholder="∞"
                        onChange={(e) => handleStockChange(item.id, e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 80,
                          padding: '6px 8px',
                          fontSize: '16px',
                          fontWeight: 700,
                          borderRadius: 8,
                          background: 'var(--bg, #0f172a)',
                          border: isOut ? '1px solid #ef4444' : isLow ? '1px solid #f59e0b' : '1px solid var(--border)',
                          color: '#f8fafc',
                          textAlign: 'center',
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="btn sm-btn ghost"
                      style={{ fontSize: '0.75rem', padding: '5px 8px' }}
                      onClick={() => adjustStock(item.id, 10)}
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      className="btn sm-btn ghost"
                      style={{ fontSize: '0.75rem', padding: '5px 8px' }}
                      onClick={() => adjustStock(item.id, 50)}
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      className="btn sm-btn danger"
                      style={{ fontSize: '0.75rem', padding: '5px 8px' }}
                      onClick={() => setStockPreset(item.id, 'out')}
                    >
                      Out
                    </button>
                    <button
                      type="button"
                      className="btn sm-btn primary"
                      style={{ fontSize: '0.75rem', padding: '5px 8px' }}
                      onClick={() => setStockPreset(item.id, 'unlimited')}
                    >
                      ∞
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Save Bar pinned above mobile bottom navigation */}
      <div
        className="stock-save-bar"
        style={{
          flexShrink: 0,
          background: 'rgba(15, 23, 42, 0.98)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: '0.85rem', color: saveSuccess ? '#4ade80' : '#94a3b8', fontWeight: 600 }}>
          {saveSuccess
            ? '✅ Stock quantities updated successfully!'
            : changedItems.length > 0
            ? `${changedItems.length} item(s) modified`
            : 'All stock levels saved'}
        </div>
        <button
          type="button"
          className="btn green"
          style={{ padding: '10px 20px', fontSize: '0.95rem', fontWeight: 800, minWidth: 160 }}
          disabled={saving || changedItems.length === 0}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save Stock Updates'}
        </button>
      </div>
    </div>
  );
}
