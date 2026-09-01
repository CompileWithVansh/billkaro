import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // register-only
  const [storeName, setStoreName] = useState('');
  const [address, setAddress]     = useState('');
  const [phone, setPhone]         = useState('');
  const [upiId, setUpiId]         = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [taxPercent, setTaxPercent] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          storeName:  storeName.trim(),
          email:      email.trim(),
          password,
          address:    address.trim()   || undefined,
          phone:      phone.trim()     || undefined,
          upiId:      upiId.trim()     || undefined,
          payeeName:  payeeName.trim() || undefined,
          taxPercent: taxPercent ? Number(taxPercent) : 0,
        });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="brand">Bill<span>Karo</span></h1>
        <p className="subtitle">
          {mode === 'login' ? 'Sign in to your counter' : 'Register your store'}
        </p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label>Store name</label>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Sharma Restaurant"
                required
              />
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@store.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="field">
                <label>Address — printed on receipts (optional)</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 12 MG Road, Sector 5, Delhi"
                />
              </div>
              <div className="field">
                <label>Contact number — printed on receipts (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div className="field">
                <label>UPI ID (for payment QR) — optional</label>
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. yourshop@paytm"
                />
              </div>
              <div className="field">
                <label>Payee name shown on QR — optional</label>
                <input
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="Defaults to store name"
                />
              </div>
              <div className="field">
                <label>Tax % applied to bills — optional</label>
                <input
                  type="number"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  placeholder="0"
                />
              </div>
            </>
          )}

          <button className="btn block" disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create store'}
          </button>
        </form>

        <div className="switch-link">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button onClick={() => { setMode('register'); setError(''); }}>
                Register your store
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
          © 2026 BillKaro • Made with ❤️ by Vansh Gupta
        </div>
      </div>
    </div>
  );
}
