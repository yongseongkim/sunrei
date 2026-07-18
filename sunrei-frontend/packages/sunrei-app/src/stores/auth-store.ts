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
  /** Restore a persisted session on mount (localStorage). */
  hydrate: () => void;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => void;
}

/**
 * Public-app auth (§6). Google sign-in currently unlocks no features; it just
 * connects the account (persisted to localStorage) for saving/following later.
 */
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
      /* ignore malformed storage */
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
