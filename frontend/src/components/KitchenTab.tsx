import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, getToken } from '../api';
import type { User } from '../types';

interface KdsTicket {
  id: string | number;
  label: string;
  items: Array<{ name: string; qty: number; category?: string; description?: string }>;
  total: number;
  paymentMethod?: string;
  createdAt: string;
  status: 'new' | 'preparing' | 'ready';
  invoiceNumber?: string | null;
  customerName?: string | null;
}

interface Props {
  user: User;
}

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

export default function KitchenTab({ user }: Props) {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [socketInst, setSocketInst] = useState<Socket | null>(null);
  const [filter, setFilter] = useState<'all' | 'preparing' | 'ready'>('all');

  const storeId = String(user.id);

  // Fetch initial active tickets
  useEffect(() => {
    setLoading(true);
    api
      .get(`/bills/kds/orders?store=${storeId}`)
      .then((res) => {
        if (Array.isArray(res.data?.bills)) {
          setTickets(
            res.data.bills.map((b: any) => ({
              id: b.id,
              label: b.label || 'Order',
              items: b.items || [],
              total: b.total,
              paymentMethod: b.paymentMethod,
              createdAt: b.createdAt,
              status: b.status || 'preparing',
              invoiceNumber: b.invoiceNumber || null,
              customerName: b.customerName || null,
            }))
          );
        }
      })
      .catch((err) => console.warn('Failed to load kitchen tickets:', err))
      .finally(() => setLoading(false));
  }, [storeId]);

  // Connect WebSockets for live stream
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : window.location.origin;

    const token = getToken();
    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    setSocketInst(socket);

    socket.on('connect', () => {
      socket.emit('join_store', storeId);
    });

    socket.on('kds:new-order', (ticket: KdsTicket) => {
      playAudioChime();
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
    });

    socket.on('kds:order-updated', (data: { orderId: string | number; status?: 'preparing' | 'ready'; invoiceNumber?: string; customerName?: string }) => {
      setTickets((prev) =>
        prev.map((t) => (t.id === data.orderId ? { ...t, ...data } : t))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [storeId]);

  function updateStatus(ticketId: string | number, status: 'preparing' | 'ready') {
    const target = tickets.find((t) => t.id === ticketId);
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
    );
    if (socketInst) {
      socketInst.emit('kds:update-status', {
        userId: storeId,
        orderId: ticketId,
        label: target?.label || 'Order',
        status,
      });
    }
  }

  async function clearTicket(ticketId: string | number) {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    try {
      await api.post('/bills/kds/clear-ticket', { storeId, ticketId });
    } catch (err) {
      console.warn('Failed to clear ticket from server:', err);
    }
  }

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'preparing') return t.status === 'preparing';
    if (filter === 'ready') return t.status === 'ready';
    return true;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 'max(90px, calc(90px + env(safe-area-inset-bottom, 0px)))', overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ padding: '14px 16px', background: 'var(--panel-2, #1e293b)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🍳 Kitchen Orders (KDS)</span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: 12, fontWeight: 700, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              🟢 Live Stream
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
            {user.storeName} • {tickets.length} active ticket(s)
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn sm-btn ${filter === 'all' ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 14 }}
            onClick={() => setFilter('all')}
          >
            All ({tickets.length})
          </button>
          <button
            type="button"
            className={`btn sm-btn ${filter === 'preparing' ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 14, color: filter === 'preparing' ? '#fff' : '#f59e0b' }}
            onClick={() => setFilter('preparing')}
          >
            🔥 Cooking ({tickets.filter((t) => t.status === 'preparing').length})
          </button>
          <button
            type="button"
            className={`btn sm-btn ${filter === 'ready' ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 14, color: filter === 'ready' ? '#fff' : '#4ade80' }}
            onClick={() => setFilter('ready')}
          >
            ✅ Ready ({tickets.filter((t) => t.status === 'ready').length})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: 14, flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <div className="spinner-inline" style={{ marginBottom: 12 }} />
            <div>Loading live kitchen tickets…</div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--panel-2, #1e293b)', border: '1px dashed var(--border)', borderRadius: 16, margin: '10px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🍳</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
              No Active Kitchen Orders
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: 360, margin: '0 auto', lineHeight: 1.4 }}>
              Orders sent to the kitchen from the Billing tab will automatically pop up here in real-time with sound notifications!
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filteredTickets.map((t) => {
              const orderTime = new Date(t.createdAt);
              const elapsedMins = Math.max(0, Math.floor((Date.now() - orderTime.getTime()) / 60000));
              const isUrgent = elapsedMins > 15;
              const isReady = t.status === 'ready';

              return (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--panel-2, #1e293b)',
                    border: isReady ? '1.5px solid #10b981' : isUrgent ? '1.5px solid #ef4444' : '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                  }}
                >
                  <div>
                    {/* Ticket Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
                            {t.label || 'Table Order'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: '#0284c7',
                              color: '#ffffff',
                              padding: '2px 8px',
                              borderRadius: 6,
                              letterSpacing: '0.5px',
                            }}
                          >
                            {t.invoiceNumber ? (t.invoiceNumber.startsWith('#') ? t.invoiceNumber : `#${t.invoiceNumber}`) : `#${t.id}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                          🕒 Ordered {orderTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            background: isReady ? '#065f46' : isUrgent ? '#991b1b' : 'rgba(245, 158, 11, 0.15)',
                            color: isReady ? '#6ee7b7' : isUrgent ? '#fca5a5' : '#f59e0b',
                            border: `1px solid ${isReady ? '#10b981' : isUrgent ? '#ef4444' : '#f59e0b'}`,
                          }}
                        >
                          {isReady ? '✅ READY' : isUrgent ? `⚠️ ${elapsedMins}m AGO` : `🔥 ${elapsedMins}m AGO`}
                        </span>
                        {t.customerName && (
                          <div style={{ fontSize: '0.75rem', color: '#e2e8f0', marginTop: 4 }}>
                            👤 {t.customerName}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ordered Items List */}
                    <div style={{ background: 'var(--bg, #0f172a)', borderRadius: 10, padding: '10px 12px', margin: '8px 0 12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {(t.items || []).map((item, idx) => {
                        const isNew = (item as any).isNew;
                        const isUpdated = (item as any).isUpdated;
                        const newQty = (item as any).newQty;
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 0',
                              borderBottom: idx === t.items.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                              fontSize: '0.92rem',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                  {item.name}
                                </span>
                                {isNew && (
                                  <span style={{ fontSize: '0.68rem', background: '#f59e0b', color: '#000', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                                    +NEW
                                  </span>
                                )}
                                {isUpdated && (
                                  <span style={{ fontSize: '0.68rem', background: '#38bdf8', color: '#000', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                                    +{newQty} MORE
                                  </span>
                                )}
                              </div>
                              {item.description &&
                                item.description.trim() &&
                                item.description.trim().toLowerCase() !== (item.category || '').trim().toLowerCase() && (
                                  <span style={{ fontSize: '0.8rem', color: '#fde68a', fontWeight: 500, marginTop: 2 }}>
                                    📝 {item.description}
                                  </span>
                                )}
                            </div>
                            <span style={{ fontWeight: 800, color: isNew ? '#f59e0b' : '#38bdf8', marginLeft: 8 }}>
                              x{item.qty}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {!isReady ? (
                      <button
                        type="button"
                        className="btn green sm-btn"
                        style={{ flex: 1, padding: '10px 12px', fontSize: '0.88rem', fontWeight: 800 }}
                        onClick={() => updateStatus(t.id, 'ready')}
                      >
                        ✅ Mark Ready
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn sm-btn ghost"
                          style={{ flex: 1, color: '#f59e0b', borderColor: '#f59e0b', fontSize: '0.82rem' }}
                          onClick={() => updateStatus(t.id, 'preparing')}
                        >
                          ↩ Re-cook
                        </button>
                        <button
                          type="button"
                          className="btn sm-btn primary"
                          style={{ flex: 1.5, padding: '10px 12px', fontSize: '0.88rem', fontWeight: 800 }}
                          onClick={() => clearTicket(t.id)}
                        >
                          ✔ Served / Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
