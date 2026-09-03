import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  DndContext,
  PointerSensor,
  MouseSensor,
  TouchSensor,
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
import { toBlob } from 'html-to-image';

import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getItemDesc, type Item, type Bill, type CartLine } from '../types';
import { ReceiptCard } from '../components/ReceiptCard';

function playAudioChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.log('Audio chime error:', err);
  }
}

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

function loadTabs(): { bills: Bill[]; activeId?: string } | null {
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
  const [mobileView, setMobileView] = useState<'items' | 'cart'>('items');

  const persisted = useMemo(() => loadTabs(), []);
  const [bills, setBills] = useState<Bill[]>(persisted?.bills ?? [newBill(1)]);
  const [activeId, setActiveId] = useState<string>(
    persisted?.activeId && persisted.bills.some((b) => b.id === persisted.activeId)
      ? persisted.activeId
      : (persisted?.bills?.[0]?.id ?? '')
  );

  // Auto-persist all open tabs and draft cart lines to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify({ bills, activeId }));
    } catch (e) {
      console.warn('Failed to persist tabs to localStorage:', e);
    }
  }, [bills, activeId]);

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
  const receiptRef = useRef<HTMLDivElement>(null);
  const [currentReceiptDetails, setCurrentReceiptDetails] = useState<{
    paymentMethod: string;
    customerName?: string;
    customerPhone?: string;
  }>({ paymentMethod: 'upi' });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
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

  // Listen for Kitchen KDS status updates (when cook marks order ready)
  useEffect(() => {
    if (!user?.id) return;

    const socketUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : window.location.origin;

    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('join_store', user.id);
    });

    socket.on('kds:order-updated', ({ label, status }: { label: string; status: 'preparing' | 'ready' }) => {
      if (status === 'ready') {
        playAudioChime();
        setBills((prev) =>
          prev.map((b) =>
            b.label === label || (label && b.label.toLowerCase().includes(label.toLowerCase()))
              ? { ...b, kdsStatus: 'ready' }
              : b
          )
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

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
          l.itemId === item.id
            ? {
                ...l,
                qty: l.qty + 1,
                category: l.category || item.category,
                description: l.description || item.description || item.category,
              }
            : l
        );
      } else {
        lines = [
          ...b.lines,
          {
            lineId: makeLineId(),
            itemId: item.id,
            name: item.name,
            price: item.price,
            qty: 1,
            category: item.category,
            description: item.description || item.category,
          },
        ];
      }
      return { ...b, lines };
    });
  }

  function removeFromCart(item: Item) {
    updateActiveBill((b) => {
      const line = b.lines.find((l) => l.itemId === item.id);
      if (!line) return b;
      let lines: CartLine[];
      if (line.qty > 1) {
        lines = b.lines.map((l) =>
          l.itemId === item.id ? { ...l, qty: l.qty - 1 } : l
        );
      } else {
        lines = b.lines.filter((l) => l.itemId !== item.id);
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

  async function saveItem(data: { name: string; price: number; color: string; category: string; description?: string; stockQuantity?: number | null }) {
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
    saveCachedItems(reordered);
    try {
      await api.put('/items/layout/reorder', { order: reordered.map((i) => i.id) });
    } catch (err) {
      console.warn('Failed to save layout reorder to backend:', err);
    }
  }

  async function handleConfirmPayment(details: {
    paymentMethod: 'upi' | 'cash' | 'udhaar';
    customerName?: string;
    customerPhone?: string;
    status: 'paid' | 'unpaid';
    action: 'save' | 'whatsapp' | 'print';
  }) {
    setCurrentReceiptDetails({
      paymentMethod: details.paymentMethod,
      customerName: details.customerName,
      customerPhone: details.customerPhone,
    });

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

    if (details.action === 'print' && details.paymentMethod !== 'udhaar' && user) {
      printBill({ bill: activeBill, user, items, subtotal, tax, total });
    } else if (details.action === 'whatsapp') {
      const itemsList = activeBill.lines
        .map((l) => {
          const catalogItem = items.find((i) => i.id === l.itemId);
          const desc = getItemDesc(l) || (catalogItem ? getItemDesc(catalogItem) : '');
          return `• *${l.name}*${desc ? ` (${desc})` : ''} x${l.qty} — ₹${(l.price * l.qty).toFixed(2)}`;
        })
        .join('\n');

      const textMessage = `*BillKaro Receipt — ${user?.storeName || 'BillKaro'}*\nDate: ${new Date().toLocaleDateString('en-IN')}\nBill: ${activeBill.label}${details.customerName ? `\nCustomer: ${details.customerName}` : ''}\n\n*Items Ordered:*\n${itemsList}\n\n----------------------------------\nSubtotal: ₹${subtotal.toFixed(2)}${tax > 0 ? `\nTax (${user?.taxPercent || 0}%): ₹${tax.toFixed(2)}` : ''}\n*Total Amount: ₹${total.toFixed(2)}*\nPayment: ${details.paymentMethod === 'udhaar' ? 'UDHAAR / UNPAID' : `PAID via ${details.paymentMethod.toUpperCase()}`}\n----------------------------------\n\nThank you for visiting us!`;

      const sendWhatsAppText = () => {
        if (details.customerPhone && details.customerPhone.trim()) {
          const cleanPhone = details.customerPhone.replace(/\D/g, '');
          const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
          window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(textMessage)}`, '_blank');
        } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(textMessage)}`, '_blank');
        }
      };

      try {
        if (receiptRef.current) {
          const blob = await toBlob(receiptRef.current, { pixelRatio: 2 });
          if (blob) {
            const file = new File([blob], `${activeBill.label.replace(/\s+/g, '_')}_Receipt.png`, { type: 'image/png' });
            
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: `BillKaro Receipt - ${activeBill.label}`,
                text: `Receipt from ${user?.storeName || 'BillKaro'} (Total: ₹${total.toFixed(2)})`,
                files: [file],
              });
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${activeBill.label.replace(/\s+/g, '_')}_Receipt.png`;
              a.click();
              URL.revokeObjectURL(url);

              sendWhatsAppText();
            }
          } else {
            sendWhatsAppText();
          }
        } else {
          sendWhatsAppText();
        }
      } catch (err) {
        console.warn('Failed to generate image receipt:', err);
        sendWhatsAppText();
      }
    }

    clearActiveBill();
    setShowPayment(false);
  }

  const [kdsSentToast, setKdsSentToast] = useState(false);

  async function handleSendToKitchen() {
    if (activeBill.lines.length === 0) return;
    try {
      await api.post('/bills/kds/send', {
        label: activeBill.label,
        items: activeBill.lines,
      });
      setKdsSentToast(true);
      setTimeout(() => setKdsSentToast(false), 3000);
    } catch (err) {
      console.error('Failed to send ticket to KDS:', err);
      alert('Could not send ticket to Kitchen.');
    }
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
          <span>➕</span> <span className="icon-btn-label">Item</span>
        </button>
        <button className="icon-btn" onClick={() => setShowInventory(true)} title="Stock & Inventory Manager">
          <span>📦</span> <span className="icon-btn-label">Stock</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => setLocked((v) => !v)}
          title={locked ? 'Unlock to rearrange' : 'Lock layout'}
        >
          <span>{locked ? '🔒' : '🔓'}</span> <span className="icon-btn-label">{locked ? 'Locked' : 'Arrange'}</span>
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

      {/* Mobile view selector (visible only on small mobile screens) */}
      <div className="mobile-view-tabs">
        <button
          className={`mobile-tab ${mobileView === 'items' ? 'active' : ''}`}
          onClick={() => setMobileView('items')}
        >
          🛍️ Items ({items.length})
        </button>
        <button
          className={`mobile-tab ${mobileView === 'cart' ? 'active' : ''}`}
          onClick={() => setMobileView('cart')}
        >
          🛒 Cart {activeBill?.lines.length ? `(${activeBill.lines.reduce((a, b) => a + b.qty, 0)})` : ''} • ₹{total.toFixed(0)}
        </button>
      </div>

      {/* Workspace */}
      <div className={`workspace ${mobileView === 'cart' ? 'show-cart-mobile' : 'show-items-mobile'}`}>
        {/* Items */}
        <div className="items-panel">
          <div className="items-toolbar">
            <h2>Items</h2>
            {!locked && (
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Drag to rearrange • tap ✎ to edit</span>
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
                    onDecrement={removeFromCart}
                    onEdit={openEditItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Sticky Mobile Floating Cart Bar */}
          {activeBill && activeBill.lines.length > 0 && (
            <div className="mobile-floating-cart" onClick={() => setMobileView('cart')}>
              <div className="m-cart-info">
                <span className="m-cart-count">🛒 {activeBill.lines.reduce((a, b) => a + b.qty, 0)} Items Selected</span>
                <span className="m-cart-total">₹{total.toFixed(2)}</span>
              </div>
              <button className="m-cart-pay-btn">
                View Cart / Pay →
              </button>
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="cart-panel">
          <div className="cart-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="mobile-back-btn" onClick={() => setMobileView('items')} title="Back to Items">
                ← Items
              </button>
              <span>🛒</span>
              <span>{activeBill?.label}</span>
              {activeBill?.kdsStatus === 'ready' && (
                <span style={{ fontSize: '0.75rem', background: '#166534', color: '#86efac', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                  ✅ Food Ready!
                </span>
              )}
              {activeBill?.kdsStatus === 'preparing' && (
                <span style={{ fontSize: '0.75rem', background: '#854d0e', color: '#fef08a', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                  🔥 Kitchen Preparing
                </span>
              )}
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

            <div className="cart-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Row 1: Restored Clean Side-by-side Layout */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={clearActiveBill}>Clear</button>
                <button
                  className="btn green"
                  style={{ flex: 2 }}
                  disabled={total <= 0}
                  onClick={() => setShowPayment(true)}
                >
                  💳 Pay ₹{total.toFixed(2)}
                </button>
              </div>

              {/* Row 2: Secondary Send to Kitchen button below Clear & Pay */}
              <button
                className="btn ghost"
                style={{
                  background: activeBill?.kdsStatus === 'ready' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.1)',
                  color: activeBill?.kdsStatus === 'ready' ? '#4ade80' : '#38bdf8',
                  border: activeBill?.kdsStatus === 'ready' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                }}
                disabled={!activeBill || activeBill.lines.length === 0}
                onClick={handleSendToKitchen}
                title="Send live ticket to Kitchen Display Screen"
              >
                {kdsSentToast
                  ? '✔ Ticket Sent to Kitchen!'
                  : activeBill?.kdsStatus === 'ready'
                  ? '✅ Food Ready to Serve!'
                  : activeBill?.kdsStatus === 'preparing'
                  ? '🔥 Cooking in Kitchen (Re-send Ticket)'
                  : '🍳 Send Ticket to Kitchen (KDS)'}
              </button>
            </div>
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
              © 2026 BillKaro POS • Made with ❤️ by Vansh Gupta
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

      {showHistory && user && <HistoryModal user={user} items={items} onClose={() => setShowHistory(false)} />}
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

      {/* Offscreen Receipt Component for PNG/JPG Image Generation */}
      {user && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', zIndex: -1 }}>
          <ReceiptCard
            ref={receiptRef}
            bill={activeBill}
            user={user}
            items={items}
            subtotal={subtotal}
            tax={tax}
            total={total}
            paymentMethod={currentReceiptDetails.paymentMethod}
            customerName={currentReceiptDetails.customerName}
            customerPhone={currentReceiptDetails.customerPhone}
          />
        </div>
      )}
    </div>
  );
}
