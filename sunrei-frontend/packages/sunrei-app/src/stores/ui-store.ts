import { create } from 'zustand';

interface ModalSpot {
  id: string;
  title: string;
  description?: string;
  youtubeLink?: string | null;
  images: any[];
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  sunreiId: string;
  sunreiTitle: string;
}

interface UIState {
  selectedSunrei: string | null;
  hoveredMarker: string | null;
  modalSpot: ModalSpot | null;
  searchQuery: string;
  selectedPlaceId: string | null;
  bottomBarDetailSpot: ModalSpot | null;
  isMobile: boolean;

  setSelectedSunrei: (id: string | null) => void;
  setHoveredMarker: (id: string | null) => void;
  setModalSpot: (spot: ModalSpot | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedPlaceId: (id: string | null) => void;
  closeModal: () => void;
  setBottomBarDetailSpot: (spot: ModalSpot | null) => void;
  setIsMobile: (isMobile: boolean) => void;
}

const LG_BREAKPOINT = 1024;

export const useUIStore = create<UIState>((set) => ({
  selectedSunrei: null,
  hoveredMarker: null,
  modalSpot: null,
  searchQuery: '',
  selectedPlaceId: null,
  bottomBarDetailSpot: null,
  isMobile: typeof window !== 'undefined' ? window.innerWidth < LG_BREAKPOINT : false,

  setSelectedSunrei: (id) => set({ selectedSunrei: id }),
  setHoveredMarker: (id) => set({ hoveredMarker: id }),
  setModalSpot: (spot) => set({ modalSpot: spot }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  closeModal: () => set({ modalSpot: null }),
  setBottomBarDetailSpot: (spot) => set({ bottomBarDetailSpot: spot }),
  setIsMobile: (isMobile) => set({ isMobile }),
}));

// Set up resize listener only on client side
if (typeof window !== 'undefined') {
  const handleResize = () => {
    useUIStore.getState().setIsMobile(window.innerWidth < LG_BREAKPOINT);
  };

  window.addEventListener('resize', handleResize);
}
