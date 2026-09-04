import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onClose: () => void;
}

export default function ConnectKdsModal({ onClose }: Props) {
  const { user, updateUser } = useAuth();
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    async function resolveTargetUrl() {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      let baseUrl = window.location.origin;

      if (isLocalhost) {
        try {
          const res = await api.get('/info');
          if (res.data?.localIp) {
            baseUrl = `http://${res.data.localIp}:${res.data.port || 4000}`;
          }
        } catch (err) {
          console.warn('Could not fetch local network IP:', err);
        }
      }

      const storeIdParam = user?.id ? `?store=${user.id}&name=${encodeURIComponent(user.storeName || 'Store')}` : '';
      setTargetUrl(`${baseUrl}/kds${storeIdParam}`);
    }

    resolveTargetUrl();
  }, [user]);

  useEffect(() => {
    if (!targetUrl) return;
    QRCode.toDataURL(targetUrl, { width: 280, margin: 2 })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error('Failed to generate QR:', err));
  }, [targetUrl]);

  async function handleResetPin() {
    if (!window.confirm('Regenerate a new Kitchen Pairing PIN? Existing connected kitchen screens will need to re-enter the new PIN.')) return;
    try {
      setResetting(true);
      const res = await api.post('/auth/kds-reset-pin');
      if (user && res.data?.kdsPin) {
        updateUser({ ...user, kdsPin: res.data.kdsPin });
      }
    } catch (err) {
      console.error('Failed to reset PIN:', err);
      alert('Could not reset PIN.');
    } finally {
      setResetting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, textAlign: 'center' }}>
        <h3>📲 Connect Kitchen Display Screen</h3>

        {/* 6-Digit PIN Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #38bdf8',
            borderRadius: 16,
            padding: 16,
            margin: '16px 0',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
            Kitchen Pairing PIN
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#38bdf8', letterSpacing: 6, margin: '6px 0' }}>
            {user?.kdsPin || '••••••'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
            Open <strong>/kds</strong> on any kitchen phone/tablet & enter this 6-digit PIN!
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 8, padding: '4px 12px', fontSize: '0.75rem' }}
            disabled={resetting}
            onClick={handleResetPin}
          >
            🔄 Regenerate PIN
          </button>
        </div>

        {/* QR Code Container */}
        <div
          style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 16,
            display: 'inline-flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          }}
        >
          {qrUrl ? (
            <img src={qrUrl} alt="Kitchen KDS QR Code" style={{ width: 200, height: 200, borderRadius: 8 }} />
          ) : (
            <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
              Generating QR…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <button className="btn primary block" onClick={handleCopy}>
            {copied ? '✔ Direct KDS Link Copied!' : '📋 Copy Direct Kitchen Link'}
          </button>
          <button
            className="btn ghost block"
            onClick={() => window.open(targetUrl, '_blank')}
          >
            ↗️ Open Kitchen Display in New Tab
          </button>
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn ghost block" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
