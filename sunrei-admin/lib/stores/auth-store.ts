import { create } from 'zustand';
import Cookies from 'js-cookie';
import { LoginRequest } from '@/api/admin';
import axios from 'axios';

const TOKEN_COOKIE = 'adminToken';
const COOKIE_EXPIRES = 7; // 7 days

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,

  initialize: () => {
    if (typeof window !== 'undefined') {
      const token = Cookies.get(TOKEN_COOKIE) || null;
      set({ token, isAuthenticated: !!token });
    }
  },

  login: async (credentials: LoginRequest) => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';

    const response = await axios.post(
      `${API_BASE}/admin/auth/login`,
      credentials,
    );

    const authHeader = response.headers['authorization'] || response.headers['Authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      Cookies.set(TOKEN_COOKIE, token, {
        expires: COOKIE_EXPIRES,
        sameSite: 'Lax',
        path: '/',
      });

      set({ token, isAuthenticated: true });
    } else {
      throw new Error('No authorization token in response');
    }
  },

  logout: () => {
    Cookies.remove(TOKEN_COOKIE, { path: '/' });
    set({ token: null, isAuthenticated: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
}));
