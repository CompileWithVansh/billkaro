import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  onClose: () => void;
}

export default function ConnectKdsModal({ onClose }: Props) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const kdsUrl = `${window.location.origin}/kds`;

  useEffect(() => {
    QRCode.toDataURL(kdsUrl, { width: 280, margin: 2 })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error('Failed to generate QR:', err));
  }, [kdsUrl]);

  function handleCopy() {
    navigator.clipboard.writeText(kdsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center' }}>
        <h3>📲 Connect Kitchen Display (KDS)</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 16 }}>
          No typing required! Scan this QR code from any kitchen phone or tablet to connect immediately.
        </p>

        {/* QR Code Container */}
        <div
          style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 16,
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          }}
        >
          {qrUrl ? (
            <img src={qrUrl} alt="Kitchen KDS QR Code" style={{ width: 220, height: 220, borderRadius: 8 }} />
          ) : (
            <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
              Generating QR…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button className="btn primary block" onClick={handleCopy}>
            {copied ? '✔ Link Copied to Clipboard!' : '📋 Copy Link (Send via WhatsApp)'}
          </button>
          <button
            className="btn ghost block"
            onClick={() => window.open('/kds', '_blank')}
          >
            ↗️ Open Kitchen Screen in New Window
          </button>
        </div>

        <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 12, padding: 12, fontSize: '0.85rem', color: '#38bdf8', textAlign: 'left' }}>
          💡 <strong>Pro-Tip for Shopkeepers:</strong> Once opened on the kitchen phone, tap <strong>"Add to Home Screen"</strong> in Chrome/Safari to create a 1-tap App Icon!
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn ghost block" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
