import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AuthPage from './pages/AuthPage';
import PosPage from './pages/PosPage';
import KdsPage from './pages/KdsPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Loading BillKaro…</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        path="/"
        element={user ? <PosPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/kds"
        element={user ? <KdsPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
