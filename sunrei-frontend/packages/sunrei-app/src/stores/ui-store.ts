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

  // Video preview overlay (map itinerary — Bd-6)
  videoPreview: VideoPreview | null;
  enterVideoPreview: (sunreiId: string, returnTo: MapMode) => void;
  exitVideoPreview: () => void;

  // Source / work info page (Bg-1/2/3): YouTube intro or managed work page
  sourceDetailId: string | null;
  openSourceDetail: (id: string) => void;
  closeSourceDetail: () => void;

  // Tag-grouped video summary (Bg-4), distinct from the map-itinerary preview
  videoDetailId: string | null;
  openVideoDetail: (id: string) => void;
  closeVideoDetail: () => void;
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
  enterVideoPreview: (sunreiId, returnTo) =>
    set({ videoPreview: { sunreiId, returnTo }, sourceDetailId: null, videoDetailId: null }),
  exitVideoPreview: () => set({ videoPreview: null }),

  sourceDetailId: null,
  openSourceDetail: (id) => set({ sourceDetailId: id }),
  closeSourceDetail: () => set({ sourceDetailId: null }),

  videoDetailId: null,
  openVideoDetail: (id) => set({ videoDetailId: id }),
  closeVideoDetail: () => set({ videoDetailId: null }),
}));
