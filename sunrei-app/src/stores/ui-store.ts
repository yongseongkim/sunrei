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

  setSelectedSunrei: (id: string | null) => void;
  setHoveredMarker: (id: string | null) => void;
  setModalSpot: (spot: ModalSpot | null) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedSunrei: null,
  hoveredMarker: null,
  modalSpot: null,

  setSelectedSunrei: (id) => set({ selectedSunrei: id }),
  setHoveredMarker: (id) => set({ hoveredMarker: id }),
  setModalSpot: (spot) => set({ modalSpot: spot }),
  closeModal: () => set({ modalSpot: null }),
}));
