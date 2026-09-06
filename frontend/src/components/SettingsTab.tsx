import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function SettingsTab() {
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
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState('');

  const numRate = Number(taxPercent) || 0;
  const halfRate = +(numRate / 2).toFixed(2);

  const sampleGross = 190;
  const sampleTaxable = taxInclusive
    ? +(sampleGross / (1 + numRate / 100)).toFixed(2)
    : sampleGross;
  const sampleCgst = +(sampleTaxable * (halfRate / 100)).toFixed(2);
  const sampleSgst = +(sampleTaxable * (halfRate / 100)).toFixed(2);
  const sampleTotal = taxInclusive
    ? sampleGross
    : +(sampleGross + (sampleTaxable * (numRate / 100))).toFixed(2);

  async function save() {
    setBusy(true);
    setError('');
    setSavedToast(false);
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
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    if (window.confirm('Are you sure you want to log out of BillKaro POS?')) {
      logout();
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 'max(90px, calc(90px + env(safe-area-inset-bottom, 0px)))', overflowY: 'auto' }}>
      {/* Page Header */}
      <div style={{ padding: '14px 16px', background: 'var(--panel-2, #1e293b)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
          ⚙️ Store Settings
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
          Manage restaurant profile, GSTIN & FSSAI details, payments, and GST tax billing
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {savedToast && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}>
            ✅ Store settings saved successfully!
          </div>
        )}

        {/* SECTION 1: Restaurant Profile */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🏪</span> Restaurant Profile
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Store / Restaurant Name
            </label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. Royal Biryani & Cafe"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Address (Printed on receipts)
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 12 MG Road, Sector 5, Delhi"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Contact Number (Printed on receipts)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 4 }}>
            <div className="field">
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                GSTIN Number (Optional)
              </label>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 09AALFP2704M1ZW"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, display: 'block' }}>
                Printed on bills if entered; hidden if blank
              </span>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                FSSAI License No. (Optional)
              </label>
              <input
                value={fssai}
                onChange={(e) => setFssai(e.target.value)}
                placeholder="e.g. 12723009000166"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, display: 'block' }}>
                Food safety license number on receipts
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 2: Payment Settings */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💳</span> Payment Settings
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              UPI ID (For Dynamic QR & Counter Soundbox)
            </label>
            <input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. store@paytm or 9876543210@ybl"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>

          <div className="field">
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Payee Name (Shown on customer UPI app)
            </label>
            <input
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="e.g. Royal Biryani Center"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>
        </div>

        {/* SECTION 3: GST & Tax Configuration */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: taxEnabled ? 14 : 0 }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏛️</span> GST & Tax Billing
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                {taxEnabled ? 'GST billing is enabled on all orders' : 'GST disabled — bills print without tax'}
              </div>
            </div>

            <div
              onClick={() => setTaxEnabled(!taxEnabled)}
              style={{
                width: 48,
                height: 26,
                background: taxEnabled ? '#10b981' : '#334155',
                borderRadius: 14,
                transition: 'background 0.2s',
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title={taxEnabled ? 'Click to disable GST' : 'Click to enable GST'}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 8 }}>
                  GST Calculation Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTaxInclusive(true)}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      border: taxInclusive ? '2px solid #10b981' : '1px solid var(--border)',
                      background: taxInclusive ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg, #0f172a)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, color: taxInclusive ? '#6ee7b7' : '#f8fafc', fontSize: '0.88rem' }}>
                        Inclusive (Restaurant Standard)
                      </span>
                      {taxInclusive && <span style={{ fontSize: '0.8rem' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, lineHeight: 1.3 }}>
                      Prices already include GST. Customer pays exact menu rate. Tax is extracted & itemized on bill.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTaxInclusive(false)}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      border: !taxInclusive ? '2px solid #38bdf8' : '1px solid var(--border)',
                      background: !taxInclusive ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg, #0f172a)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, color: !taxInclusive ? '#7dd3fc' : '#f8fafc', fontSize: '0.88rem' }}>
                        Exclusive (Add on top)
                      </span>
                      {!taxInclusive && <span style={{ fontSize: '0.8rem' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, lineHeight: 1.3 }}>
                      GST is added on top of item prices (e.g. ₹190 + 5% = ₹199.50 total).
                    </div>
                  </button>
                </div>
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                    Total GST Rate (%)
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                    Standard Restaurant GST is 5%
                  </span>
                </div>

                <input
                  type="number"
                  step="0.1"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  placeholder="5"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
                />

                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: '5% (Restaurant)', val: '5' },
                    { label: '12% (Standard)', val: '12' },
                    { label: '18% (Services)', val: '18' },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setTaxPercent(p.val)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: taxPercent === p.val ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                        background: taxPercent === p.val ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                        color: taxPercent === p.val ? '#fbbf24' : '#cbd5e1',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  🧾 Types of GST (Intrastate 50-50 Split)
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 120, background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Central GST (CGST)</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>{halfRate}%</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>State GST (SGST)</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981' }}>{halfRate}%</div>
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
                  <strong style={{ color: '#f8fafc' }}>Live Example:</strong> On a ₹{sampleGross.toFixed(2)} item:
                  <div style={{ marginTop: 2, color: '#cbd5e1' }}>
                    Subtotal: ₹{sampleTaxable.toFixed(2)} + CGST ({halfRate}%): ₹{sampleCgst.toFixed(2)} + SGST ({halfRate}%): ₹{sampleSgst.toFixed(2)} = <strong style={{ color: '#4ade80' }}>Total ₹{sampleTotal.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            className="btn green block"
            style={{ padding: '14px', fontSize: '1rem', fontWeight: 800, borderRadius: 12 }}
            disabled={busy}
            onClick={save}
          >
            {busy ? 'Saving Changes…' : 'Save Settings'}
          </button>

          <button
            type="button"
            className="btn block"
            style={{
              padding: '14px',
              fontSize: '1rem',
              fontWeight: 800,
              borderRadius: 12,
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              marginTop: 4,
            }}
            onClick={handleLogout}
          >
            <span>🚪</span>
            <span>Log Out of Store</span>
          </button>
        </div>
      </div>
    </div>
  );
}
