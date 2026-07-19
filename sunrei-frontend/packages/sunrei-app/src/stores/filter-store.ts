'use client';

import { create } from 'zustand';

// Client-side tag filter state. Toggling tags does NOT refetch the map — it filters
// the already-returned in-scope set and dims non-matching pins.
interface FilterState {
  activeTagIds: string[];
  toggleTag: (id: string) => void;
  setTags: (ids: string[]) => void;
  clear: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  activeTagIds: [],
  toggleTag: (id) =>
    set((s) => ({
      activeTagIds: s.activeTagIds.includes(id)
        ? s.activeTagIds.filter((x) => x !== id)
        : [...s.activeTagIds, id],
    })),
  setTags: (ids) => set({ activeTagIds: ids }),
  clear: () => set({ activeTagIds: [] }),
}));
