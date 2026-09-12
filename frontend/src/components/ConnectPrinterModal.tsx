import { useState, useEffect } from 'react';
import {
  isWebBluetoothSupported,
  isPrinterConnected,
  getConnectedDeviceName,
  connectPrinter,
  disconnectPrinter,
  printTestReceipt,
} from '../utils/bluetoothPrinter';

interface Props {
  onClose: () => void;
}

export default function ConnectPrinterModal({ onClose }: Props) {
  const [connected, setConnected] = useState(isPrinterConnected());
  const [deviceName, setDeviceName] = useState<string | null>(getConnectedDeviceName());
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const supported = isWebBluetoothSupported();

  useEffect(() => {
    setConnected(isPrinterConnected());
    setDeviceName(getConnectedDeviceName());
  }, []);

  async function handleConnect() {
    setError('');
    setSuccessMsg('');
    setConnecting(true);
    try {
      const res = await connectPrinter();
      if (res.success) {
        setConnected(true);
        setDeviceName(res.deviceName || 'SC588');
        setSuccessMsg(`✅ Successfully connected to ${res.deviceName || 'SC588'}!`);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectPrinter();
    setConnected(false);
    setDeviceName(null);
    setSuccessMsg('Printer disconnected.');
    setTimeout(() => setSuccessMsg(''), 2500);
  }

  async function handleTest() {
    setError('');
    setSuccessMsg('');
    setTesting(true);
    try {
      const res = await printTestReceipt();
      if (res.success) {
        setSuccessMsg('🎉 Test receipt printed on SC588!');
        setTimeout(() => setSuccessMsg(''), 3500);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Test print failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: 'center', padding: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🖨️</span> Bluetooth Thermal Printer
          </h3>
          <button type="button" className="btn ghost sm-btn" onClick={onClose} style={{ padding: '2px 8px' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 12px', borderRadius: 10, fontSize: '0.82rem', marginBottom: 12, textAlign: 'left' }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '10px 12px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, marginBottom: 12 }}>
            {successMsg}
          </div>
        )}

        {/* Status Card */}
        <div
          style={{
            background: connected
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)'
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: connected ? '1px solid #10b981' : '1px solid var(--border)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
            Printer Connection Status
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '10px 0' }}>
            <span style={{ fontSize: '1.4rem' }}>{connected ? '🟢' : '⚪'}</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: connected ? '#34d399' : '#94a3b8' }}>
              {connected ? `${deviceName || 'SC588'} Connected` : 'Not Connected'}
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
            {connected
              ? 'Receipts will print directly in 0.1s without switching apps or opening print previews.'
              : 'Connect your SC588 printer to enable ultra-fast, zero-app-switch thermal billing.'}
          </div>

          {connected && (
            <button
              type="button"
              className="btn ghost sm-btn"
              onClick={handleDisconnect}
              style={{ marginTop: 10, padding: '4px 12px', fontSize: '0.75rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              Disconnect Printer
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!connected ? (
            <button
              type="button"
              className="btn primary block"
              disabled={connecting || !supported}
              onClick={handleConnect}
              style={{ padding: '14px', fontSize: '1rem', fontWeight: 800, borderRadius: 12 }}
            >
              {connecting ? 'Scanning for SC588…' : '🔍 Scan & Connect Printer'}
            </button>
          ) : (
            <button
              type="button"
              className="btn green block"
              disabled={testing}
              onClick={handleTest}
              style={{ padding: '12px', fontSize: '0.95rem', fontWeight: 800, borderRadius: 12 }}
            >
              {testing ? 'Printing Test…' : '🧪 Print Test Receipt'}
            </button>
          )}

          {!supported && (
            <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4 }}>
              ℹ️ Web Bluetooth requires Google Chrome, Microsoft Edge, or Samsung Internet on Android, Windows, or Mac.
            </div>
          )}
        </div>

        {/* How it works steps */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: 12,
            marginTop: 16,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', marginBottom: 6 }}>
            💡 Quick Setup Guide:
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.5 }}>
            <li>Turn on your <strong>SC588 printer</strong> (Power light ON).</li>
            <li>Make sure <strong>Bluetooth</strong> is turned ON on your phone/PC.</li>
            <li>Tap <strong>Scan & Connect Printer</strong> and choose <strong>SC588</strong> from the list.</li>
            <li>Tap <strong>Print Test Receipt</strong> to verify paper feed!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
