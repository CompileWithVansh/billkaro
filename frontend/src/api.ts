import axios from 'axios';

// Resolve the API base URL:
//  - If VITE_API_URL is set, always use it (e.g. separate API host).
//  - In a production build, default to same-origin "/api" (single-process
//    deploy where the backend also serves this frontend).
//  - In dev, default to the local backend on port 4000.
const baseURL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

export const api = axios.create({ baseURL });

const TOKEN_KEY = 'billkaro_token';

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Attach JWT to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear token and cached user so the app redirects to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null);
      localStorage.removeItem('billkaro_user');
    }
    return Promise.reject(err);
  }
);
