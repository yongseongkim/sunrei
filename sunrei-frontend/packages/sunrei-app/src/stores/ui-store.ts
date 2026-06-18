'use client';

import { create } from 'zustand';

export type MapMode = 'nearby' | 'source';

interface VideoPreview {
  sunreiId: string;
  returnTo: 'nearby' | 'source';
}

interface UiState {
  isMobile: boolean;
  setIsMobile: (m: boolean) => void;

  // Place list <-> detail
  activePlaceId: string | null; // selected marker/card
  setActivePlace: (id: string | null) => void;

  // Search + filters UI
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;

  // Video preview overlay
  videoPreview: VideoPreview | null;
  enterVideoPreview: (sunreiId: string, returnTo: MapMode) => void;
  exitVideoPreview: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isMobile: false,
  setIsMobile: (m) => set({ isMobile: m }),

  activePlaceId: null,
  setActivePlace: (id) => set({ activePlaceId: id }),

  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  filtersOpen: false,
  setFiltersOpen: (v) => set({ filtersOpen: v }),

  videoPreview: null,
  enterVideoPreview: (sunreiId, returnTo) => set({ videoPreview: { sunreiId, returnTo } }),
  exitVideoPreview: () => set({ videoPreview: null }),
}));
