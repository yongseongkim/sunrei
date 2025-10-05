import { create } from 'zustand';

interface MapState {
  isLoaded: boolean;
  center: { lat: number; lng: number };
  zoom: number;

  setIsLoaded: (loaded: boolean) => void;
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

export const useMapStore = create<MapState>((set) => ({
  isLoaded: false,
  center: { lat: 35.6762, lng: 139.6503 },
  zoom: 12,

  setIsLoaded: (loaded) => set({ isLoaded: loaded }),
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
}));
