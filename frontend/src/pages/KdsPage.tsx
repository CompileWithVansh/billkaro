import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

interface KdsTicket {
  id: string | number;
  label: string;
  items: Array<{ name: string; qty: number; category?: string }>;
  total: number;
  paymentMethod?: string;
  createdAt: string;
  status: 'new' | 'preparing' | 'ready';
}

function playAudioChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
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

export default function KdsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);

  useEffect(() => {
    if (!user) return;

    const socketUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api', '')
      : window.location.origin;

    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('join_store', user.id);
    });

    socket.on('kds:new-order', (ticket: KdsTicket) => {
      playAudioChime();
      setTickets((prev) => [ticket, ...prev]);
    });

    socket.on('kds:order-updated', ({ orderId, status }: { orderId: string | number; status: 'preparing' | 'ready' }) => {
      setTickets((prev) =>
        prev.map((t) => (t.id === orderId ? { ...t, status } : t))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  function updateStatus(ticketId: string | number, status: 'preparing' | 'ready') {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
    );
  }

  function clearTicket(ticketId: string | number) {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid #1e293b', paddingBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', color: '#38bdf8' }}>🍳 Kitchen Display System (KDS)</h2>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Store: {user?.storeName} • Live WebSocket Order Stream</div>
        </div>
        <button className="btn ghost" onClick={() => navigate('/')}>
          ← Return to Billing POS
        </button>
      </header>

      {tickets.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#64748b', fontSize: '1.2rem' }}>
          ☕ No active kitchen tickets. New orders placed by cashiers will pop up here in real time!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {tickets.map((t) => (
            <div
              key={t.id}
              style={{
                background: '#1e293b',
                borderRadius: 12,
                padding: 16,
                border: t.status === 'ready' ? '2px solid #22c55e' : t.status === 'preparing' ? '2px solid #eab308' : '2px solid #3b82f6',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9' }}>{t.label || 'Order'}</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: t.status === 'ready' ? '#166534' : t.status === 'preparing' ? '#854d0e' : '#1e40af',
                      color: t.status === 'ready' ? '#86efac' : t.status === 'preparing' ? '#fef08a' : '#bfdbfe',
                    }}
                  >
                    {t.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {t.items.map((line, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 500 }}>
                      <span>{line.name}</span>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>x{line.qty}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 12 }}>
                  Time: {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {t.status !== 'ready' && (
                    <button
                      className="btn primary"
                      style={{ flex: 1, padding: '6px 12px', fontSize: '0.85rem' }}
                      onClick={() => updateStatus(t.id, 'ready')}
                    >
                      ✔ Mark Ready
                    </button>
                  )}
                  <button
                    className="btn ghost"
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    onClick={() => clearTicket(t.id)}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #1e293b', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
        © 2026 BillKaro KDS • Made with ❤️ by Vansh Gupta
      </footer>
    </div>
  );
}
