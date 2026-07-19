'use client';

import { create } from 'zustand';

export type MapMode = 'nearby' | 'source';

interface VideoPreview {
  sunreiId: string;
  returnTo: 'nearby' | 'source';
  fromSearch?: boolean; // entered from search results → "back to list" reopens search
}

interface UiState {
  isMobile: boolean;
  setIsMobile: (m: boolean) => void;

  // Place list <-> detail
  activePlaceId: string | null; // selected marker/card
  setActivePlace: (id: string | null) => void;

  // Search + filters UI. The query lives here (not local to the search panel) so
  // it survives closing the panel to preview a video and coming back to the results.
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  openSearch: () => void; // fresh open (clears the query)
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // Source opened from a search result → the channel view's back reopens search.
  sourceFromSearch: boolean;
  setSourceFromSearch: (v: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;

  // Location-permission onboarding (§0): our priming card → "locating" → done.
  onboarding: 'priming' | 'locating' | 'done';
  setOnboarding: (v: 'priming' | 'locating' | 'done') => void;

  // Google sign-in modal (§6)
  loginOpen: boolean;
  setLoginOpen: (v: boolean) => void;

  // Video preview overlay (map itinerary — Bd-6)
  videoPreview: VideoPreview | null;
  enterVideoPreview: (sunreiId: string, returnTo: MapMode, fromSearch?: boolean) => void;
  exitVideoPreview: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isMobile: false,
  setIsMobile: (m) => set({ isMobile: m }),

  activePlaceId: null,
  setActivePlace: (id) => set({ activePlaceId: id }),

  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  openSearch: () => set({ searchOpen: true, searchQuery: '', sourceFromSearch: false }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  sourceFromSearch: false,
  setSourceFromSearch: (v) => set({ sourceFromSearch: v }),
  filtersOpen: false,
  setFiltersOpen: (v) => set({ filtersOpen: v }),

  onboarding: 'done',
  setOnboarding: (v) => set({ onboarding: v }),
  loginOpen: false,
  setLoginOpen: (v) => set({ loginOpen: v }),

  videoPreview: null,
  enterVideoPreview: (sunreiId, returnTo, fromSearch = false) =>
    // Clear any active place so the series view isn't shadowed by a stale place detail
    // (place detail now takes precedence over the series view).
    set({ videoPreview: { sunreiId, returnTo, fromSearch }, activePlaceId: null }),
  // Back from a search-originated preview reopens the (preserved) search results;
  // otherwise it just drops back to the underlying list.
  exitVideoPreview: () =>
    set((s) => (s.videoPreview?.fromSearch ? { videoPreview: null, searchOpen: true } : { videoPreview: null })),
}));
