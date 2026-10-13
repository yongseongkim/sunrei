'use client';

import { create } from 'zustand';

export type MapMode = 'nearby' | 'source';

interface VideoPreview {
  sunreiId: string;
  returnTo: 'nearby' | 'source';
  fromSearch?: boolean; // 검색 결과에서 열었으면 뒤로 가기가 검색 화면을 다시 연다.
}

interface UiState {
  isMobile: boolean;
  setIsMobile: (m: boolean) => void;

  activePlaceId: string | null;
  setActivePlace: (id: string | null) => void;

  // 검색어를 검색 패널이 아니라 여기 두어야 미리보기를 보고 돌아왔을 때 검색 결과가 남아 있다.
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  openSearch: () => void; // 검색어를 비우고 연다.
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // 검색 결과에서 Source를 열었으면 채널 화면의 뒤로 가기가 검색 화면을 다시 연다.
  sourceFromSearch: boolean;
  setSourceFromSearch: (v: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;

  onboarding: 'priming' | 'locating' | 'done';
  setOnboarding: (v: 'priming' | 'locating' | 'done') => void;

  loginOpen: boolean;
  setLoginOpen: (v: boolean) => void;

  // Sunrei 하나의 장소만 지도와 목록에 보여 주는 미리보기이며 nearby와 source 모드 위에 겹쳐 열린다.
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
    // 장소 상세가 미리보기보다 우선하므로 열려 있던 장소를 닫아야 미리보기가 보인다.
    set({ videoPreview: { sunreiId, returnTo, fromSearch }, activePlaceId: null }),
  exitVideoPreview: () =>
    set((s) => (s.videoPreview?.fromSearch ? { videoPreview: null, searchOpen: true } : { videoPreview: null })),
}));
