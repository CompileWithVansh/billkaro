import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, getToken } from '../api';
import { clearCachedItems } from '../offlineStore';
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

const USER_KEY = 'billkaro_user';

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user immediately from localStorage to enable instant offline cold boots
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem(USER_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // If we already have a cached user profile, don't block the screen with a loading spinner
  const [loading, setLoading] = useState<boolean>(() => {
    const token = getToken();
    const cached = localStorage.getItem(USER_KEY);
    return !!token && !cached;
  });

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUser(null);
      localStorage.removeItem(USER_KEY);
      setLoading(false);
      return;
    }

    // If completely offline on boot, preserve the cached session immediately
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // Verify session with backend when online
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
        } catch (e) {
          console.warn('Failed to cache user profile locally:', e);
        }
      })
      .catch((err) => {
        // ONLY log out and erase token if the server explicitly returned 401 Unauthorized
        if (err?.response?.status === 401) {
          console.warn('[Auth] Server returned 401 Unauthorized; clearing credentials.');
          setToken(null);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        } else {
          // Network failure or offline: keep user logged in so billing continues!
          console.info('[Auth] Backend unreachable, preserving offline session.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    } catch (e) {
      console.warn('Failed to cache user profile locally:', e);
    }
  }

  async function register(data: RegisterData) {
    const res = await api.post('/auth/register', data);
    setToken(res.data.token);
    setUser(res.data.user);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    } catch (e) {
      console.warn('Failed to cache user profile locally:', e);
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USER_KEY);

    // Clear all store-specific cart and tab caches so switching restaurants never leaks cart items
    try {
      localStorage.removeItem('billkaro_tabs');
      localStorage.removeItem('billkaro_category_order_v1');
      localStorage.removeItem('billkaro_show_categories');

      // Purge any scoped billkaro_tabs_* keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('billkaro_tabs_') || key.startsWith('billkaro_cat_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('Failed to clean store caches on logout:', e);
    }

    // Purge cached menu items in IndexedDB so the next store starts completely fresh
    // Note: pending_bills is intentionally preserved so unsynced offline bills aren't lost
    clearCachedItems().catch((err) => console.warn('Failed to clear cached items on logout:', err));

    setUser(null);
  }

  function updateUser(u: User) {
    setUser(u);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch (e) {
      console.warn('Failed to update cached user profile locally:', e);
    }
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
