import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { user, updateUser, logout } = useAuth();
  const [storeName, setStoreName] = useState(user?.storeName ?? '');
  const [upiId, setUpiId] = useState(user?.upiId ?? '');
  const [payeeName, setPayeeName] = useState(user?.payeeName ?? '');
  const [taxPercent, setTaxPercent] = useState(String(user?.taxPercent ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api.put('/auth/settings', {
        storeName: storeName.trim(),
        upiId: upiId.trim(),
        payeeName: payeeName.trim(),
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

        <div className="field">
          <label>Store name</label>
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </div>
        <div className="field">
          <label>UPI ID (payment link)</label>
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
