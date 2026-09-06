import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function SettingsTab() {
  const { user, updateUser, logout } = useAuth();
  const [storeName, setStoreName] = useState(user?.storeName ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [upiId, setUpiId] = useState(user?.upiId ?? '');
  const [payeeName, setPayeeName] = useState(user?.payeeName ?? '');
  const [taxPercent, setTaxPercent] = useState(String(user?.taxPercent ?? 0));
  const [busy, setBusy] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    setSavedToast(false);
    try {
      const res = await api.put('/auth/settings', {
        storeName: storeName.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        upiId: upiId.trim() || null,
        payeeName: payeeName.trim() || null,
        taxPercent: Number(taxPercent) || 0,
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
          Configure restaurant profile, receipt branding, tax rates, and UPI payment keys
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

        {/* Store Info Card */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            🏪 Restaurant Profile
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

          <div className="field">
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
        </div>

        {/* Payments Card */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            💳 Payments & Tax
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

          <div className="field" style={{ marginBottom: 12 }}>
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

          <div className="field">
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              GST / Tax % (e.g. 5 for 5% Restaurant GST)
            </label>
            <input
              type="number"
              step="0.01"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
            />
          </div>
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)',
              cursor: 'pointer',
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
