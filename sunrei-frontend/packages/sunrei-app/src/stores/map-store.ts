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
  commitNextIdle: boolean; // auto-commit the next idle (e.g. after a location jump)
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
  // commitOnIdle: load the destination area on arrival (no "Search nearby" gate) —
  // used when the user explicitly picks a location from search.
  panTo: (c: LatLng, zoom?: number, commitOnIdle?: boolean) => void;
  fitToPoints: (points: LatLng[], maxZoom?: number) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  mode: 'nearby',
  selectedSourceIds: [],
  committedBounds: null,
  pendingArea: null,
  commitNextIdle: false,
  mapCenter: null,
  initialSeed: SEOUL,
  zoom: DEFAULT_ZOOM,
  map: null,

  setMap: (m) => set({ map: m }),
  setCenter: (c) => set({ mapCenter: c }),
  setZoom: (z) => set({ zoom: z }),

  onIdle: (b, center) => {
    const { mode, committedBounds, commitNextIdle } = get();
    set({ mapCenter: center });
    if (mode === 'nearby') {
      // First idle auto-commits the opening viewport so the list loads immediately;
      // an explicit location jump (commitNextIdle) also auto-loads on arrival;
      // later pans mark a pending area that the user confirms via "Search nearby".
      if (committedBounds == null || commitNextIdle) {
        set({ committedBounds: b, pendingArea: null, commitNextIdle: false });
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

  panTo: (c, zoom, commitOnIdle = false) => {
    const map = get().map;
    if (map) map.panTo(c);
    if (zoom) map?.setZoom(zoom);
    set({ mapCenter: c, commitNextIdle: commitOnIdle });
  },

  // Fit the map to a set of points (source-mode union, video-preview itinerary).
  // No-op for an empty set; pans+zooms for a single point.
  fitToPoints: (points, maxZoom = 16) => {
    const map = get().map;
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 64);
    const onceIdle = google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > maxZoom) map.setZoom(maxZoom);
    });
    void onceIdle;
  },
}));
