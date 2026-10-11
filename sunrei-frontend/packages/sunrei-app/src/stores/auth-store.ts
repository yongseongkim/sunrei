'use client';

import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const USER_KEY = 'sunrei_user';
const TOKEN_KEY = 'sunrei_token';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  hydrate: () => void;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => void;
}

// public 앱은 로그인해도 열리는 기능이 없고, 계정 연결 상태만 localStorage에 남긴다.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const u = localStorage.getItem(USER_KEY);
      const t = localStorage.getItem(TOKEN_KEY);
      if (u && t) set({ user: JSON.parse(u) as AuthUser, token: t });
    } catch {
      /* 저장된 값이 깨졌으면 로그인하지 않은 상태로 둔다. */
    }
  },
  setSession: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_KEY, token);
    }
    set({ user, token });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ user: null, token: null });
  },
}));
