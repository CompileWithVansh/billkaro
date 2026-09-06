import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { user, updateUser, logout } = useAuth();
  const [storeName, setStoreName] = useState(user?.storeName ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [gstin, setGstin] = useState(user?.gstin ?? '');
  const [fssai, setFssai] = useState(user?.fssai ?? '');
  const [upiId, setUpiId] = useState(user?.upiId ?? '');
  const [payeeName, setPayeeName] = useState(user?.payeeName ?? '');
  const [taxEnabled, setTaxEnabled] = useState(
    Boolean(user?.taxEnabled ?? (user?.taxPercent ? user.taxPercent > 0 : false))
  );
  const [taxInclusive, setTaxInclusive] = useState(user?.taxInclusive !== false);
  const [taxPercent, setTaxPercent] = useState(String(user?.taxPercent ? user.taxPercent : 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const numRate = Number(taxPercent) || 0;
  const halfRate = +(numRate / 2).toFixed(2);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api.put('/auth/settings', {
        storeName: storeName.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
        fssai: fssai.trim() || null,
        upiId: upiId.trim() || null,
        payeeName: payeeName.trim() || null,
        taxEnabled,
        taxInclusive,
        taxPercent: taxEnabled ? (Number(taxPercent) || 0) : 0,
      });
      updateUser(res.data.user);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>⚙️ Store Settings</h3>
          <button type="button" className="btn ghost sm-btn" onClick={onClose} style={{ padding: '2px 8px' }}>
            ✕
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* SECTION 1: Restaurant Profile */}
          <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              🏪 Restaurant Profile
            </div>

            <div className="field">
              <label>Store / Restaurant name</label>
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Royal Biryani & Cafe" />
            </div>
            <div className="field">
              <label>Address — printed on receipts</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 12 MG Road, Sector 5, Delhi"
              />
            </div>
            <div className="field">
              <label>Contact number — printed on receipts</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="field">
              <label>GSTIN Number (Optional)</label>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 09AALFP2704M1ZW"
              />
            </div>
            <div className="field">
              <label>FSSAI License No. (Optional)</label>
              <input
                value={fssai}
                onChange={(e) => setFssai(e.target.value)}
                placeholder="e.g. 12723009000166"
              />
            </div>
          </div>

          {/* SECTION 2: Payments */}
          <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              💳 Payment Details
            </div>

            <div className="field">
              <label>UPI ID (for dynamic payment QR)</label>
              <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourshop@paytm" />
            </div>
            <div className="field">
              <label>Payee name on QR</label>
              <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="e.g. Royal Biryani Center" />
            </div>
          </div>

          {/* SECTION 3: GST & Tax */}
          <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: taxEnabled ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🏛️ GST & Tax Billing
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                  {taxEnabled ? 'GST billing active on invoices' : 'GST disabled — receipts print without tax'}
                </div>
              </div>

              <div
                onClick={() => setTaxEnabled(!taxEnabled)}
                style={{
                  width: 46,
                  height: 24,
                  background: taxEnabled ? '#10b981' : '#334155',
                  borderRadius: 12,
                  transition: 'background 0.2s',
                  position: 'relative',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={taxEnabled ? 'Click to disable GST' : 'Click to enable GST'}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    background: '#ffffff',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: 3,
                    left: taxEnabled ? 25 : 3,
                    transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
            </div>

            {taxEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    Calculation Mode
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setTaxInclusive(true)}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        textAlign: 'left',
                        border: taxInclusive ? '2px solid #10b981' : '1px solid var(--border)',
                        background: taxInclusive ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg, #0f172a)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: taxInclusive ? '#6ee7b7' : '#f8fafc', fontSize: '0.82rem' }}>
                        Inclusive (Restaurant)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                        Menu prices include GST
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTaxInclusive(false)}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        textAlign: 'left',
                        border: !taxInclusive ? '2px solid #38bdf8' : '1px solid var(--border)',
                        background: !taxInclusive ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg, #0f172a)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: !taxInclusive ? '#7dd3fc' : '#f8fafc', fontSize: '0.82rem' }}>
                        Exclusive (Add on top)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                        Tax added to bill total
                      </div>
                    </button>
                  </div>
                </div>

                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>Total GST Rate (%)</label>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>Restaurant GST: 5%</span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    placeholder="5"
                  />

                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {['5', '12', '18'].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setTaxPercent(rate)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: taxPercent === rate ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                          background: taxPercent === rate ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                          color: taxPercent === rate ? '#fbbf24' : '#cbd5e1',
                        }}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', marginBottom: 4 }}>
                    🧾 GST Breakdown: CGST {halfRate}% + SGST {halfRate}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {taxInclusive
                      ? `On a ₹190 bill: Subtotal ₹${(190 / (1 + numRate / 100)).toFixed(2)} + CGST/SGST = Total ₹190.00`
                      : `On a ₹190 bill: Subtotal ₹190.00 + ${(190 * (numRate / 100)).toFixed(2)} Tax = Total ₹${(190 * (1 + numRate / 100)).toFixed(2)}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <button className="btn danger" onClick={logout}>Log out</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

