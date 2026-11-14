'use client';
import { create } from 'zustand';
export type MarkerMode = 'source' | 'category';
const key = 'sunrei.marker-mode.v1';
export const useMarkerStore = create<{
  mode: MarkerMode;
  hydrate: () => void;
  setMode: (mode: MarkerMode) => void;
}>((set) => ({
  mode: 'source',
  hydrate: () => {
    try {
      const value = localStorage.getItem(key);
      if (value === 'source' || value === 'category') set({ mode: value });
    } catch {}
  },
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(key, mode);
    } catch {}
  },
}));
