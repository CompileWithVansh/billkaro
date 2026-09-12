import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import ConnectPrinterModal from './ConnectPrinterModal';
import { isPrinterConnected, getConnectedDeviceName, printTestReceipt } from '../utils/bluetoothPrinter';

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
  const [paperWidth, setPaperWidth] = useState<string>(
    () => localStorage.getItem('billkaro_printer_paper_width') || '58mm'
  );
  const [printQr, setPrintQr] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('billkaro_print_qr_enabled') : null) !== 'false'
  );
  const [btPrinterEnabled, setBtPrinterEnabled] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const val = localStorage.getItem('billkaro_bt_printer_enabled');
    if (val !== null) return val === 'true';
    return Boolean(localStorage.getItem('billkaro_bt_printer_name'));
  });
  const [profileExpanded, setProfileExpanded] = useState<boolean>(false);
  const [thermalExpanded, setThermalExpanded] = useState<boolean>(false);
  const [paymentExpanded, setPaymentExpanded] = useState<boolean>(false);
  const [taxExpanded, setTaxExpanded] = useState<boolean>(false);
  const [securityExpanded, setSecurityExpanded] = useState<boolean>(false);
  const [showPairModal, setShowPairModal] = useState<boolean>(false);
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

  const [upiPassword, setUpiPassword] = useState('');
  const isUpiChanged =
    (upiId.trim() || '') !== (user?.upiId || '') ||
    (payeeName.trim() || '') !== (user?.payeeName || '');

  // Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passBusy, setPassBusy] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passErr, setPassErr] = useState('');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassErr('');
    setPassMsg('');
    if (!currentPass) {
      setPassErr('Please enter your current password.');
      return;
    }
    if (newPass.length < 6) {
      setPassErr('New password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassErr('New passwords do not match.');
      return;
    }
    setPassBusy(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: currentPass,
        newPassword: newPass,
      });
      setPassMsg('Password updated successfully!');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPassMsg(''), 4000);
    } catch (err: any) {
      setPassErr(err?.response?.data?.error || 'Could not update password.');
    } finally {
      setPassBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setSavedToast(false);
    if (isUpiChanged && !upiPassword.trim()) {
      setError('Owner password is required to change UPI payment destination.');
      setBusy(false);
      return;
    }
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
        currentPassword: isUpiChanged ? upiPassword.trim() : undefined,
      });
      updateUser(res.data.user);
      localStorage.setItem('billkaro_printer_paper_width', paperWidth);
      localStorage.setItem('billkaro_print_qr_enabled', String(printQr));
      localStorage.setItem('billkaro_bt_printer_enabled', String(btPrinterEnabled));
      setUpiPassword('');
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

        {/* SECTION 1: Restaurant Profile (Compact Accordion) */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div
            onClick={() => setProfileExpanded(!profileExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏪</span> Restaurant Profile
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {storeName.trim() || 'Store Name Not Set'}
                </span>
                {phone.trim() && (
                  <span style={{ background: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1', padding: '1px 6px', borderRadius: 4 }}>
                    📞 {phone.trim()}
                  </span>
                )}
                {gstin.trim() && (
                  <span style={{ background: 'rgba(16, 185, 129, 0.18)', color: '#34d399', padding: '1px 6px', borderRadius: 4 }}>
                    GSTIN: {gstin.trim().toUpperCase()}
                  </span>
                )}
                {fssai.trim() && (
                  <span style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4 }}>
                    FSSAI: {fssai.trim()}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
              <span>{profileExpanded ? 'Close ▲' : 'Configure ▼'}</span>
            </div>
          </div>

          {profileExpanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
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

              <div className="field">
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
                  placeholder="e.g. 9876543210"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    GSTIN (Optional)
                  </label>
                  <input
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
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
          )}
        </div>

        {/* SECTION: Thermal Receipt & Printer Settings (Compact Accordion) */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div
            onClick={() => setThermalExpanded(!thermalExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🖨️</span> Thermal Printer & Receipts
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {paperWidth}
                </span>
                <span style={{ background: btPrinterEnabled ? 'rgba(16, 185, 129, 0.18)' : 'rgba(148, 163, 184, 0.18)', color: btPrinterEnabled ? '#34d399' : '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>
                  {btPrinterEnabled ? '🔵 Bluetooth ON' : '⚪ Standard Print'}
                </span>
                <span style={{ background: printQr ? 'rgba(56, 189, 248, 0.18)' : 'rgba(16, 185, 129, 0.18)', color: printQr ? '#38bdf8' : '#34d399', padding: '1px 6px', borderRadius: 4 }}>
                  {printQr ? 'QR Code ON' : '🟢 QR OFF (Save Paper)'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
              <span>{thermalExpanded ? 'Close ▲' : 'Configure ▼'}</span>
            </div>
          </div>

          {thermalExpanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* TOGGLE 1: Bluetooth Thermal Printer Mode */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc' }}>
                    Bluetooth Thermal Printer (PSF588)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: btPrinterEnabled ? '#34d399' : '#94a3b8', marginTop: 2 }}>
                    {btPrinterEnabled
                      ? '🟢 Enabled — Direct 1-click Bluetooth printing to PSF588.'
                      : '⚪ Disabled — Standard browser print. Disables all Bluetooth popups & reconnect prompts.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !btPrinterEnabled;
                    setBtPrinterEnabled(next);
                    localStorage.setItem('billkaro_bt_printer_enabled', String(next));
                  }}
                  style={{
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    background: btPrinterEnabled ? '#10b981' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 2,
                  }}
                  aria-label="Toggle Bluetooth Printer"
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#ffffff',
                      transform: btPrinterEnabled ? 'translateX(22px)' : 'translateX(0px)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>
              </div>

              {/* Paired Device Status & Connection Button */}
              {btPrinterEnabled && (
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{isPrinterConnected() ? '🟢' : '⚪'}</span>
                    <span>Device: <strong>{getConnectedDeviceName() || (typeof localStorage !== 'undefined' && localStorage.getItem('billkaro_bt_printer_name')) || 'PSF588'}</strong></span>
                    <span style={{ fontSize: '0.7rem', color: isPrinterConnected() ? '#34d399' : '#94a3b8' }}>
                      ({isPrinterConnected() ? 'Connected' : 'Offline / Sleeping'})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn ghost sm-btn"
                      onClick={() => setShowPairModal(true)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
                    >
                      🔍 Pair / Reconnect
                    </button>
                    {isPrinterConnected() && (
                      <button
                        type="button"
                        className="btn ghost sm-btn"
                        onClick={() => printTestReceipt()}
                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
                      >
                        🧪 Test Print
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* TOGGLE 2: Print UPI QR Code on Receipts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc' }}>
                    Print UPI Payment QR Code
                  </div>
                  <div style={{ fontSize: '0.72rem', color: printQr ? '#94a3b8' : '#34d399', marginTop: 2 }}>
                    {printQr
                      ? 'QR Code will be printed on bills (scannable with GPay, PhonePe, Paytm).'
                      : '🟢 QR Code is OFF — Saves 2–3 cm paper per receipt to save paper roll!'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !printQr;
                    setPrintQr(next);
                    localStorage.setItem('billkaro_print_qr_enabled', String(next));
                  }}
                  style={{
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    background: printQr ? '#10b981' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 2,
                  }}
                  aria-label="Toggle Print QR Code"
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#ffffff',
                      transform: printQr ? 'translateX(22px)' : 'translateX(0px)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>
              </div>

              {/* Paper Roll Width */}
              <div className="field">
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                  Printer Paper Roll Width
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPaperWidth('58mm');
                      localStorage.setItem('billkaro_printer_paper_width', '58mm');
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: 10,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: paperWidth === '58mm' ? '2px solid #f59e0b' : '1px solid var(--border)',
                      background: paperWidth === '58mm' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg, #0f172a)',
                      color: paperWidth === '58mm' ? '#fbbf24' : '#cbd5e1',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>58mm (2-inch Standard)</span>
                      {paperWidth === '58mm' && <span>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3, fontWeight: 400 }}>
                      PSF588, SC588, Nirvana, Everycom, POS-58
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaperWidth('80mm');
                      localStorage.setItem('billkaro_printer_paper_width', '80mm');
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: 10,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: paperWidth === '80mm' ? '2px solid #f59e0b' : '1px solid var(--border)',
                      background: paperWidth === '80mm' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg, #0f172a)',
                      color: paperWidth === '80mm' ? '#fbbf24' : '#cbd5e1',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>80mm (3-inch Wide)</span>
                      {paperWidth === '80mm' && <span>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3, fontWeight: 400 }}>
                      Epson, TVS, Citizen (Supermarket & dining bills)
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Payment Settings (Compact Accordion) */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div
            onClick={() => setPaymentExpanded(!paymentExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💳</span> Payment Settings
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: upiId.trim() ? 'rgba(74, 222, 128, 0.18)' : 'rgba(239, 68, 68, 0.15)', color: upiId.trim() ? '#4ade80' : '#fca5a5', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {upiId.trim() ? `UPI: ${upiId.trim()}` : '⚠️ No UPI ID Configured'}
                </span>
                {payeeName.trim() && (
                  <span style={{ background: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1', padding: '1px 6px', borderRadius: 4 }}>
                    Payee: {payeeName.trim()}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ade80', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
              <span>{paymentExpanded ? 'Close ▲' : 'Configure ▼'}</span>
            </div>
          </div>

          {paymentExpanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
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

              {/* Security lock indicator & confirmation */}
              {isUpiChanged && (
                <div style={{ marginTop: 6, background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fde047', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span>🔒</span> Security Lock: Owner Password Required
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#fef08a', marginBottom: 8, lineHeight: 1.4 }}>
                    To protect against payment diversion, please enter your store password to confirm changes to your UPI payment destination.
                  </div>
                  <input
                    type="password"
                    value={upiPassword}
                    onChange={(e) => setUpiPassword(e.target.value)}
                    placeholder="Enter current owner password"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '15px', borderRadius: 8, background: '#0f172a', border: '1px solid #eab308', color: '#f8fafc' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 4: GST & Tax Configuration (Compact Accordion) */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div
            onClick={() => setTaxExpanded(!taxExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏛️</span> GST & Tax Billing
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: taxEnabled ? 'rgba(16, 185, 129, 0.18)' : 'rgba(148, 163, 184, 0.18)', color: taxEnabled ? '#34d399' : '#94a3b8', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {taxEnabled ? '🟢 GST Active' : '⚪ GST Disabled'}
                </span>
                {taxEnabled && (
                  <>
                    <span style={{ background: 'rgba(167, 139, 250, 0.18)', color: '#c4b5fd', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                      Rate: {taxPercent}%
                    </span>
                    <span style={{ background: taxInclusive ? 'rgba(56, 189, 248, 0.18)' : 'rgba(245, 158, 11, 0.18)', color: taxInclusive ? '#38bdf8' : '#fbbf24', padding: '1px 6px', borderRadius: 4 }}>
                      {taxInclusive ? 'Inclusive (Restaurant Standard)' : 'Exclusive (Add on top)'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a78bfa', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
              <span>{taxExpanded ? 'Close ▲' : 'Configure ▼'}</span>
            </div>
          </div>

          {taxExpanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* TOGGLE: GST On/Off */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc' }}>
                    Enable GST Tax Billing
                  </div>
                  <div style={{ fontSize: '0.72rem', color: taxEnabled ? '#34d399' : '#94a3b8', marginTop: 2 }}>
                    {taxEnabled ? '🟢 Active — Invoices and receipts include CGST + SGST itemization.' : '⚪ Disabled — Invoices and receipts print clean totals without tax.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTaxEnabled(!taxEnabled)}
                  style={{
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    background: taxEnabled ? '#10b981' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 2,
                  }}
                  aria-label="Toggle GST Billing"
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#ffffff',
                      transform: taxEnabled ? 'translateX(22px)' : 'translateX(0px)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>
              </div>

              {taxEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
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
                            border: taxPercent === p.val ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                            background: taxPercent === p.val ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: taxPercent === p.val ? '#c4b5fd' : '#cbd5e1',
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
          )}
        </div>

        {/* SECTION 5: Account Security & Password (Compact Accordion) */}
        <div style={{ background: 'var(--panel-2, #1e293b)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div
            onClick={() => setSecurityExpanded(!securityExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔐</span> Account Security & Password
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(236, 72, 153, 0.18)', color: '#f472b6', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                  Store Owner Access & Credentials
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ec4899', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
              <span>{securityExpanded ? 'Close ▲' : 'Configure ▼'}</span>
            </div>
          </div>

          {securityExpanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {passMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
                  ✅ {passMsg}
                </div>
              )}

              {passErr && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem' }}>
                  ⚠️ {passErr}
                </div>
              )}

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="Enter existing password"
                    style={{ width: '100%', padding: '9px 12px', fontSize: '15px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="Min 6 characters"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '15px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      placeholder="Repeat new password"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '15px', borderRadius: 8, background: 'var(--bg, #0f172a)', border: '1px solid var(--border)', color: '#f8fafc' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={passBusy}
                  style={{ marginTop: 4, padding: '10px 14px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 700 }}
                >
                  {passBusy ? 'Updating Password…' : '🔑 Change Password'}
                </button>
              </form>
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

      {showPairModal && <ConnectPrinterModal onClose={() => setShowPairModal(false)} />}
    </div>
  );
}
