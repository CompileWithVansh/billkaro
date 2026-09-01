import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { user, updateUser, logout } = useAuth();
  const [storeName, setStoreName]   = useState(user?.storeName ?? '');
  const [address, setAddress]       = useState(user?.address   ?? '');
  const [phone, setPhone]           = useState(user?.phone     ?? '');
  const [upiId, setUpiId]           = useState(user?.upiId     ?? '');
  const [payeeName, setPayeeName]   = useState(user?.payeeName ?? '');
  const [taxPercent, setTaxPercent] = useState(String(user?.taxPercent ?? 0));
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api.put('/auth/settings', {
        storeName:  storeName.trim(),
        address:    address.trim()  || null,
        phone:      phone.trim()    || null,
        upiId:      upiId.trim()    || null,
        payeeName:  payeeName.trim() || null,
        taxPercent: Number(taxPercent) || 0,
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Store settings</h3>
        {error && <div className="error-box">{error}</div>}

        <div className="settings-section-label">Store info</div>

        <div className="field">
          <label>Store / restaurant name</label>
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
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

        <div className="settings-section-label">Payments</div>

        <div className="field">
          <label>UPI ID (for payment QR)</label>
          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourshop@paytm" />
        </div>
        <div className="field">
          <label>Payee name on QR</label>
          <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
        </div>
        <div className="field">
          <label>Tax %</label>
          <input type="number" step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button className="btn danger" onClick={logout}>Log out</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
