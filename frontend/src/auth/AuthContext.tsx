import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, getToken } from '../api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (u: User) => void;
}

export interface RegisterData {
  storeName: string;
  email: string;
  password: string;
  upiId?: string;
  payeeName?: string;
  taxPercent?: number;
  address?: string;
  phone?: string;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
  }

  async function register(data: RegisterData) {
    const res = await api.post('/auth/register', data);
    setToken(res.data.token);
    setUser(res.data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  function updateUser(u: User) {
    setUser(u);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
