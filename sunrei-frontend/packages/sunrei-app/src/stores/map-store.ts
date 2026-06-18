'use client';

import { create } from 'zustand';
import type { Bounds, LatLng, MapMode } from '@/hooks/use-map';

// Seoul default when geolocation is denied/absent.
export const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 12;

interface MapState {
  mode: MapMode;
  selectedSourceIds: string[];
  committedBounds: Bounds | null; // the bounds currently fetched (nearby)
  pendingArea: Bounds | null; // viewport moved but not yet refetched
  mapCenter: LatLng | null; // distance/sort anchor (NOT GPS)
  initialSeed: LatLng; // opening center (GPS if granted, else Seoul)
  zoom: number;
  map: google.maps.Map | null;

  setMap: (m: google.maps.Map | null) => void;
  setCenter: (c: LatLng) => void;
  setZoom: (z: number) => void;
  onIdle: (b: Bounds, center: LatLng) => void;
  commitSearchArea: () => void;
  setSourceMode: (ids: string[]) => void;
  addSource: (id: string) => void;
  removeSource: (id: string) => void;
  clearSources: () => void;
  panTo: (c: LatLng, zoom?: number) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  mode: 'nearby',
  selectedSourceIds: [],
  committedBounds: null,
  pendingArea: null,
  mapCenter: null,
  initialSeed: SEOUL,
  zoom: DEFAULT_ZOOM,
  map: null,

  setMap: (m) => set({ map: m }),
  setCenter: (c) => set({ mapCenter: c }),
  setZoom: (z) => set({ zoom: z }),

  onIdle: (b, center) => {
    const { mode, committedBounds } = get();
    set({ mapCenter: center });
    if (mode === 'nearby') {
      // First idle auto-commits the opening viewport so the list loads immediately;
      // later pans mark a pending area that the user confirms via "Search nearby".
      if (committedBounds == null) {
        set({ committedBounds: b, pendingArea: null });
        return;
      }
      const same =
        b.swLat === committedBounds.swLat &&
        b.swLng === committedBounds.swLng &&
        b.neLat === committedBounds.neLat &&
        b.neLng === committedBounds.neLng;
      set({ pendingArea: same ? null : b });
    }
  },

  commitSearchArea: () =>
    set((s) => ({
      committedBounds: s.pendingArea ?? s.committedBounds,
      pendingArea: null,
    })),

  setSourceMode: (ids) =>
    set({ mode: ids.length ? 'source' : 'nearby', selectedSourceIds: ids, pendingArea: null }),

  addSource: (id) =>
    set((s) => {
      const ids = s.selectedSourceIds.includes(id)
        ? s.selectedSourceIds
        : [...s.selectedSourceIds, id];
      return { mode: 'source', selectedSourceIds: ids };
    }),

  removeSource: (id) =>
    set((s) => {
      const ids = s.selectedSourceIds.filter((x) => x !== id);
      return { mode: ids.length ? 'source' : 'nearby', selectedSourceIds: ids };
    }),

  clearSources: () => set({ mode: 'nearby', selectedSourceIds: [] }),

  panTo: (c, zoom) => {
    const map = get().map;
    if (map) map.panTo(c);
    if (zoom) map?.setZoom(zoom);
    set({ mapCenter: c });
  },
}));
