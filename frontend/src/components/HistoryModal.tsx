import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SavedBill, User } from '../types';
import { printBill } from './PrintReceipt';

interface Props {
  user: User;
  onClose: () => void;
}

export default function HistoryModal({ user, onClose }: Props) {
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    try {
      setLoading(true);
      const res = await api.get('/bills');
      setBills(res.data.bills || []);
    } catch (err) {
      console.error('Failed to load past bills:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid(billId: string | number) {
    try {
      setUpdatingId(billId);
      await api.put(`/bills/${billId}/status`, { status: 'paid' });
      setBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, status: 'paid' } : b))
      );
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Could not update status.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteBill(billId: string | number, label: string) {
    if (!window.confirm(`Delete bill entry "${label}" permanently?`)) return;
    try {
      setUpdatingId(billId);
      await api.delete(`/bills/${billId}`);
      setBills((prev) => prev.filter((b) => b.id !== billId));
    } catch (err) {
      console.error('Failed to delete bill:', err);
      alert('Could not delete bill.');
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredBills = bills.filter((b) => {
    if (filter === 'paid' && b.status !== 'paid') return false;
    if (filter === 'unpaid' && b.status !== 'unpaid') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = b.customerName?.toLowerCase().includes(q);
      const phoneMatch = b.customerPhone?.includes(q);
      const labelMatch = b.label?.toLowerCase().includes(q);
      return nameMatch || phoneMatch || labelMatch;
    }
    return true;
  });

  const totalUdhaar = bills
    .filter((b) => b.status === 'unpaid')
    .reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Bill History & Udhaar Ledger</h3>
          {totalUdhaar > 0 && (
            <div style={{ background: '#ef4444', color: '#fff', padding: '4px 12px', borderRadius: 16, fontSize: '0.85rem', fontWeight: 600 }}>
              Total Udhaar Pending: ₹{totalUdhaar.toFixed(2)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '16px 0' }}>
          <input
            style={{ flex: 1 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, phone, or bill #"
          />
          <button
            type="button"
            className={`btn ${filter === 'all' ? 'primary' : 'ghost'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`btn ${filter === 'paid' ? 'primary' : 'ghost'}`}
            onClick={() => setFilter('paid')}
          >
            Paid
          </button>
          <button
            type="button"
            className={`btn ${filter === 'unpaid' ? 'danger' : 'ghost'}`}
            onClick={() => setFilter('unpaid')}
          >
            Udhaar ({bills.filter((b) => b.status === 'unpaid').length})
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>Loading bill history…</div>
        ) : filteredBills.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No bills found.</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Bill / Customer</th>
                  <th style={{ padding: '8px 12px' }}>Method</th>
                  <th style={{ padding: '8px 12px' }}>Total</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {new Date(b.createdAt).toLocaleDateString()} {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{b.label || 'Bill'}</div>
                      {b.customerName && (
                        <div style={{ fontSize: '0.8rem', color: '#a7f3d0' }}>
                          👤 {b.customerName} {b.customerPhone ? `(${b.customerPhone})` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textTransform: 'uppercase', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {b.paymentMethod || 'UPI'}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      ₹{Number(b.total).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: b.status === 'paid' ? '#065f46' : '#991b1b',
                          color: b.status === 'paid' ? '#6ee7b7' : '#fca5a5',
                        }}
                      >
                        {b.status === 'paid' ? 'PAID' : 'UDHAAR'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {b.status === 'unpaid' && (
                          <button
                            className="btn green"
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            disabled={updatingId === b.id}
                            onClick={() => handleMarkPaid(b.id)}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          className="btn ghost"
                          style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          onClick={() =>
                            printBill({
                              bill: { id: String(b.id), label: b.label || 'Receipt', lines: b.items || [] },
                              user,
                              subtotal: b.subtotal,
                              tax: b.tax,
                              total: b.total,
                            })
                          }
                        >
                          Print
                        </button>
                        <button
                          className="btn danger"
                          style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          disabled={updatingId === b.id}
                          onClick={() => handleDeleteBill(b.id, b.label || 'Bill')}
                          title="Delete Bill Entry"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
