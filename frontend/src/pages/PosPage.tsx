import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { Item, Bill, CartLine } from '../types';

import SortableItemButton from '../components/SortableItemButton';
import ItemEditorModal from '../components/ItemEditorModal';
import PaymentModal from '../components/PaymentModal';
import SettingsModal from '../components/SettingsModal';
import KeypadModal from '../components/KeypadModal';
import HistoryModal from '../components/HistoryModal';
import InventoryModal from '../components/InventoryModal';
import ConnectKdsModal from '../components/ConnectKdsModal';
import { nextItemColor } from '../colors';
import { printBill } from '../components/PrintReceipt';
import { saveCachedItems, getCachedItems, queueOfflineBill, syncPendingBills } from '../offlineStore';

const TABS_KEY = 'billkaro_tabs';

function makeLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextBillNumber(bills: Bill[]): number {
  const used = new Set(
    bills
      .map((b) => {
        const m = b.label.match(/^Bill (\d+)$/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n): n is number => n !== null)
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function newBill(index: number): Bill {
  return {
    id: makeLineId(),
    label: `Bill ${index}`,
    lines: [],
  };
}

function billTotal(b: Bill, taxPercent: number) {
  const subtotal = b.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = +(subtotal * (taxPercent / 100)).toFixed(2);
  return { subtotal, tax, total: +(subtotal + tax).toFixed(2) };
}

function loadTabs(): { bills: Bill[] } | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.bills) || parsed.bills.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function PosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<Item[]>([]);
  const [locked, setLocked] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const persisted = loadTabs();
  const [bills, setBills] = useState<Bill[]>(persisted?.bills ?? [newBill(1)]);
  const [activeId, setActiveId] = useState<string>(persisted?.bills?.[0]?.id ?? '');

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showConnectKds, setShowConnectKds] = useState(false);
  const [editorItem, setEditorItem] = useState<Item | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [qtyEditLine, setQtyEditLine] = useState<CartLine | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const taxPercent = user?.taxPercent ?? 0;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onFSChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
    setMenuOpen(false);
  }

  // Monitor Network Online/Offline status & sync pending bills on reconnect
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      syncPendingBills().then((count) => {
        if (count > 0) alert(`🟢 Network restored! Synced ${count} offline bill(s) to server.`);
        fetchItems();
      });
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function fetchItems() {
    if (navigator.onLine) {
      try {
        const res = await api.get('/items');
        setItems(res.data.items);
        saveCachedItems(res.data.items);
      } catch {
        const cached = await getCachedItems();
        if (cached.length) setItems(cached);
      }
    } else {
      const cached = await getCachedItems();
      if (cached.length) setItems(cached);
    }
  }

  useEffect(() => {
    fetchItems();
    if (navigator.onLine) {
      syncPendingBills().then((count) => {
        if (count > 0) fetchItems();
      });
    }
  }, []);

  const activeBill = bills.find((b) => b.id === activeId) ?? bills[0];

  const qtyByItem = useMemo(() => {
    const map = new Map<number, number>();
    activeBill?.lines.forEach((l) => {
      if (l.itemId != null) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.qty);
    });
    return map;
  }, [activeBill]);

  const { subtotal, tax, total } = useMemo(
    () => billTotal(activeBill ?? { id: '', label: '', lines: [] }, taxPercent),
    [activeBill, taxPercent]
  );

  function updateActiveBill(updater: (b: Bill) => Bill) {
    setBills((prev) => prev.map((b) => (b.id === activeBill.id ? updater(b) : b)));
  }

  function addToCart(item: Item) {
    updateActiveBill((b) => {
      const existing = b.lines.find((l) => l.itemId === item.id);
      let lines: CartLine[];
      if (existing) {
        lines = b.lines.map((l) =>
          l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      } else {
        lines = [
          ...b.lines,
          { lineId: makeLineId(), itemId: item.id, name: item.name, price: item.price, qty: 1, category: item.category },
        ];
      }
      return { ...b, lines };
    });
  }

  function addCustomAmount(amount: number) {
    updateActiveBill((b) => ({
      ...b,
      lines: [
        ...b.lines,
        { lineId: makeLineId(), itemId: null, name: 'Custom', price: amount, qty: 1 },
      ],
    }));
    setCustomOpen(false);
  }

  function changeQty(lineId: string, delta: number) {
    updateActiveBill((b) => ({
      ...b,
      lines: b.lines
        .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    }));
  }

  function setQty(lineId: string, qty: number) {
    updateActiveBill((b) => ({
      ...b,
      lines: b.lines
        .map((l) => (l.lineId === lineId ? { ...l, qty } : l))
        .filter((l) => l.qty > 0),
    }));
    setQtyEditLine(null);
  }

  function removeLine(lineId: string) {
    updateActiveBill((b) => ({ ...b, lines: b.lines.filter((l) => l.lineId !== lineId) }));
  }

  function clearActiveBill() {
    updateActiveBill((b) => ({ ...b, lines: [] }));
  }

  function addTab() {
    setBills((prev) => {
      const b = newBill(nextBillNumber(prev));
      setActiveId(b.id);
      return [...prev, b];
    });
  }

  function closeTab(id: string) {
    const target = bills.find((b) => b.id === id);
    if (target && target.lines.length > 0) {
      const ok = window.confirm(
        `"${target.label}" still has items (₹${billTotal(target, taxPercent).total.toFixed(
          2
        )}). Close and discard it?`
      );
      if (!ok) return;
    }
    setBills((prev) => {
      const filtered = prev.filter((b) => b.id !== id);
      const result = filtered.length ? filtered : [newBill(nextBillNumber(filtered))];
      if (id === activeId) setActiveId(result[result.length - 1].id);
      return result;
    });
  }

  function renameTab(id: string) {
    const target = bills.find((b) => b.id === id);
    if (!target) return;
    const name = window.prompt('Rename bill / table', target.label);
    if (name && name.trim()) {
      setBills((prev) => prev.map((b) => (b.id === id ? { ...b, label: name.trim() } : b)));
    }
  }

  function openAddItem() {
    setEditorItem(null);
    setShowEditor(true);
  }
  function openEditItem(item: Item) {
    setEditorItem(item);
    setShowEditor(true);
  }

  async function saveItem(data: { name: string; price: number; color: string; category: string; stockQuantity?: number | null }) {
    if (editorItem) {
      const res = await api.put(`/items/${editorItem.id}`, data);
      setItems((prev) => prev.map((i) => (i.id === editorItem.id ? res.data.item : i)));
    } else {
      const res = await api.post('/items', data);
      setItems((prev) => [...prev, res.data.item]);
    }
    setShowEditor(false);
  }

  async function deleteItem() {
    if (!editorItem) return;
    await api.delete(`/items/${editorItem.id}`);
    setItems((prev) => prev.filter((i) => i.id !== editorItem.id));
    setShowEditor(false);
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    try {
      await api.put('/items/layout/reorder', { order: reordered.map((i) => i.id) });
    } catch {
    }
  }

  async function handleConfirmPayment(details: {
    paymentMethod: 'upi' | 'cash' | 'udhaar';
    customerName?: string;
    customerPhone?: string;
    status: 'paid' | 'unpaid';
    shouldPrint?: boolean;
  }) {
    const payload = {
      label: activeBill.label,
      items: activeBill.lines,
      subtotal,
      tax,
      total,
      paymentMethod: details.paymentMethod,
      customerName: details.customerName,
      customerPhone: details.customerPhone,
      status: details.status,
    };

    if (navigator.onLine) {
      try {
        await api.post('/bills', payload);
        fetchItems();
      } catch (err) {
        console.warn('Network error saving bill, queuing offline:', err);
        await queueOfflineBill(payload);
        alert('⚡ Saved offline! Bill will auto-sync when network is stable.');
      }
    } else {
      await queueOfflineBill(payload);
      alert('⚡ Offline Mode: Bill saved locally! Will sync automatically when back online.');
    }

    if (details.shouldPrint && details.paymentMethod !== 'udhaar' && user) {
      printBill({ bill: activeBill, user, subtotal, tax, total });
    }

    clearActiveBill();
    setShowPayment(false);
  }

  return (
    <div className="pos">
      {/* Top bar */}
      <div className="topbar">
        <div className="logo">Bill<span>Karo</span></div>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: 12,
            fontWeight: 600,
            background: isOnline ? '#065f46' : '#991b1b',
            color: isOnline ? '#6ee7b7' : '#fca5a5',
            marginLeft: 4,
          }}
        >
          {isOnline ? '🟢 Online' : '🔴 Offline Mode'}
        </span>

        <div className="spacer" />

        <button className="icon-btn" onClick={openAddItem} title="Add new product item">
          ➕ Item
        </button>
        <button className="icon-btn" onClick={() => setShowInventory(true)} title="Stock & Inventory Manager">
          📦 Stock
        </button>
        <button
          className="icon-btn"
          onClick={() => setLocked((v) => !v)}
          title={locked ? 'Unlock to rearrange' : 'Lock layout'}
        >
          {locked ? '🔒 Locked' : '🔓 Arrange'}
        </button>

        {/* Hamburger Dropdown Menu */}
        <div className="menu-dropdown-wrap">
          <button
            className="icon-btn"
            onClick={() => setMenuOpen((v) => !v)}
            title="More Options"
          >
            ☰ Menu
          </button>
          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                onClick={() => setMenuOpen(false)}
              />
              <div className="menu-dropdown" style={{ zIndex: 9999 }} onClick={() => setMenuOpen(false)}>
                <button
                  className="menu-dropdown-item"
                  onClick={() => setShowInventory(true)}
                >
                  📦 Inventory & Stock
                </button>
                <button
                  className="menu-dropdown-item"
                  onClick={() => setShowHistory(true)}
                >
                  📜 History & Udhaar
                </button>
                <button
                  className="menu-dropdown-item"
                  onClick={() => setShowConnectKds(true)}
                >
                  📲 Connect Kitchen (QR)
                </button>
                <button
                  className="menu-dropdown-item"
                  onClick={() => navigate('/kds')}
                >
                  🍳 Kitchen KDS
                </button>
                <button
                  className="menu-dropdown-item"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen Mode'}
                </button>
                <button
                  className="menu-dropdown-item"
                  onClick={() => setShowSettings(true)}
                >
                  ⚙️ Store Settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bill tabs */}
      <div className="tabbar">
        {bills.map((b) => {
          const t = billTotal(b, taxPercent);
          return (
            <div
              key={b.id}
              className={`tab ${b.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(b.id)}
              onDoubleClick={() => renameTab(b.id)}
            >
              <span className="tab-label">
                {b.label}
                {t.total > 0 && <em className="tab-total">₹{t.total.toFixed(0)}</em>}
              </span>
              <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(b.id);
                }}
              >
                ×
              </span>
            </div>
          );
        })}
        <button className="tab-add" onClick={addTab} title="New bill">+</button>
      </div>

      {/* Workspace */}
      <div className="workspace">
        {/* Items */}
        <div className="items-panel">
          <div className="items-toolbar">
            <h2>Items</h2>
            {!locked && (
              <span style={{ color: 'var(--muted)' }}>Drag to rearrange • tap ✎ to edit</span>
            )}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="item-grid">
                {items.length === 0 && (
                  <div className="empty-hint">
                    No items yet. Tap <b>➕ Item</b> above to add your first product —
                    it will instantly appear here as a button.
                  </div>
                )}
                {items.map((item) => (
                  <SortableItemButton
                    key={item.id}
                    item={item}
                    qty={qtyByItem.get(item.id) ?? 0}
                    locked={locked}
                    onTap={addToCart}
                    onEdit={openEditItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <footer style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
            © 2026 BillKaro POS • Made with ❤️ by Vansh Gupta
          </footer>
        </div>

        {/* Cart */}
        <div className="cart-panel">
          <div className="cart-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛒</span>
              <span>{activeBill?.label}</span>
            </div>
            <button className="mini-btn" onClick={() => renameTab(activeBill.id)}>
              ✏️ Rename
            </button>
          </div>

          <div className="cart-lines">
            {(!activeBill || activeBill.lines.length === 0) && (
              <div className="cart-empty">Tap items to add them here.</div>
            )}
            {activeBill?.lines.map((l) => (
              <div className="cart-line" key={l.lineId}>
                <div className="info">
                  <div className="nm">{l.name}</div>
                  <div className="pr">₹{l.price.toFixed(2)} each</div>
                </div>
                <div className="qty-ctrl">
                  <button onClick={() => changeQty(l.lineId, -1)}>−</button>
                  {/* Tap the number to type an exact quantity */}
                  <button className="q q-btn" onClick={() => setQtyEditLine(l)}>{l.qty}</button>
                  <button onClick={() => changeQty(l.lineId, +1)}>+</button>
                </div>
                <div className="line-total">₹{(l.price * l.qty).toFixed(2)}</div>
                <button className="line-del" onClick={() => removeLine(l.lineId)} title="Remove line item">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <button className="btn ghost block custom-btn" onClick={() => setCustomOpen(true)}>
              ＃ Add custom amount
            </button>

            <div className="totals-row">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {taxPercent > 0 && (
              <div className="totals-row">
                <span>Tax ({taxPercent}%)</span>
                <span>₹{tax.toFixed(2)}</span>
              </div>
            )}
            <div className="totals-row grand">
              <span>Total</span>
              <span>₹{total.toFixed(2)}</span>
            </div>

            <div className="cart-actions">
              <button className="btn ghost" onClick={clearActiveBill}>Clear</button>
              <button
                className="btn green"
                disabled={total <= 0}
                onClick={() => setShowPayment(true)}
              >
                💳 Pay ₹{total.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEditor && (
        <ItemEditorModal
          initial={editorItem}
          suggestedColor={nextItemColor(items.map((i) => i.color))}
          onClose={() => setShowEditor(false)}
          onSave={saveItem}
          onDelete={editorItem ? deleteItem : undefined}
        />
      )}

      {customOpen && (
        <KeypadModal
          title="Custom amount"
          mode="amount"
          confirmLabel="Add to bill"
          onClose={() => setCustomOpen(false)}
          onConfirm={addCustomAmount}
        />
      )}

      {qtyEditLine && (
        <KeypadModal
          title={`Quantity — ${qtyEditLine.name}`}
          mode="qty"
          initial={String(qtyEditLine.qty)}
          confirmLabel="Set quantity"
          onClose={() => setQtyEditLine(null)}
          onConfirm={(q) => setQty(qtyEditLine.lineId, q)}
        />
      )}

      {showHistory && user && <HistoryModal user={user} onClose={() => setShowHistory(false)} />}
      {showInventory && <InventoryModal items={items} onClose={() => setShowInventory(false)} onRefreshItems={fetchItems} />}
      {showConnectKds && <ConnectKdsModal onClose={() => setShowConnectKds(false)} />}

      {showPayment && (
        <PaymentModal
          amount={total}
          upiId={user?.upiId ?? null}
          payeeName={user?.payeeName ?? null}
          storeName={user?.storeName ?? 'BillKaro'}
          onClose={() => setShowPayment(false)}
          onConfirmPayment={handleConfirmPayment}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
