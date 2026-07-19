'use client';

import { create } from 'zustand';
import type { Bounds, LatLng, MapMode } from '@/hooks/use-map';

// Seoul default when geolocation is denied/absent.
export const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 12;

type SavedView = { center: LatLng; zoom: number };

interface MapState {
  mode: MapMode;
  selectedSourceIds: string[];
  committedBounds: Bounds | null; // the bounds currently fetched (nearby)
  committedEmpty: boolean; // the committed area returned no places (drives auto-load on pan)
  pendingArea: Bounds | null; // viewport moved but not yet refetched
  commitNextIdle: boolean; // auto-commit the next idle (e.g. after a location jump)
  mapCenter: LatLng | null; // distance/sort anchor (NOT GPS)
  initialSeed: LatLng; // opening center (GPS if granted, else Seoul)
  zoom: number;
  map: google.maps.Map | null;
  // The nearby viewport saved on entering source mode, restored when the user backs out
  // (source mode fits the map to all of a source's spots; back should return home's view).
  savedView: SavedView | null;

  setMap: (m: google.maps.Map | null) => void;
  setCenter: (c: LatLng) => void;
  setZoom: (z: number) => void;
  setCommittedEmpty: (v: boolean) => void;
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

export const useMapStore = create<MapState>((set, get) => {
  // Snapshot the live map viewport (used when leaving nearby for source mode).
  const captureView = (): SavedView | null => {
    const m = get().map;
    if (!m) return null;
    const c = m.getCenter();
    if (!c) return null;
    return { center: c.toJSON(), zoom: m.getZoom() ?? DEFAULT_ZOOM };
  };

  // Return to the saved nearby viewport when backing out of source mode. commitNextIdle
  // lets the restored view auto-load cleanly (no stray "Search this area" prompt).
  const restoreView = () => {
    const { map, savedView } = get();
    if (map && savedView) {
      map.panTo(savedView.center);
      map.setZoom(savedView.zoom);
      set({ savedView: null, commitNextIdle: true });
    } else {
      set({ savedView: null });
    }
  };

  return {
    mode: 'nearby',
    selectedSourceIds: [],
    committedBounds: null,
    committedEmpty: false,
    pendingArea: null,
    commitNextIdle: false,
    mapCenter: null,
    initialSeed: SEOUL,
    zoom: DEFAULT_ZOOM,
    map: null,
    savedView: null,

    setMap: (m) => set({ map: m }),
    setCenter: (c) => set({ mapCenter: c }),
    setZoom: (z) => set({ zoom: z }),
    setCommittedEmpty: (v) => set({ committedEmpty: v }),

    onIdle: (b, center) => {
      const { mode, committedBounds, commitNextIdle, committedEmpty } = get();
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
        if (same) {
          set({ pendingArea: null });
          return;
        }
        // When the current area has no places there's nothing to disrupt, so moving the
        // map auto-loads the new area instead of gating behind "Search this area". This
        // is one-shot: clear committedEmpty now so that once the new area's results come
        // in, further moves fall back to the manual gate (never auto-refresh while
        // results exist). committedEmpty re-arms only if the new area is itself empty.
        if (committedEmpty) {
          set({ committedBounds: b, pendingArea: null, committedEmpty: false });
          return;
        }
        set({ pendingArea: b });
      }
    },

    commitSearchArea: () =>
      set((s) => ({
        committedBounds: s.pendingArea ?? s.committedBounds,
        pendingArea: null,
      })),

    setSourceMode: (ids) => {
      if (ids.length === 0) {
        set({ mode: 'nearby', selectedSourceIds: [] });
        restoreView();
        return;
      }
      set((s) => ({
        mode: 'source',
        selectedSourceIds: ids,
        pendingArea: null,
        // Save the nearby view once, on the nearby → source transition.
        savedView: s.mode === 'nearby' && !s.savedView ? captureView() : s.savedView,
      }));
    },

    addSource: (id) =>
      set((s) => {
        const ids = s.selectedSourceIds.includes(id)
          ? s.selectedSourceIds
          : [...s.selectedSourceIds, id];
        return {
          mode: 'source',
          selectedSourceIds: ids,
          savedView: s.mode === 'nearby' && !s.savedView ? captureView() : s.savedView,
        };
      }),

    removeSource: (id) => {
      const ids = get().selectedSourceIds.filter((x) => x !== id);
      if (ids.length) {
        set({ selectedSourceIds: ids });
      } else {
        set({ mode: 'nearby', selectedSourceIds: [] });
        restoreView();
      }
    },

    clearSources: () => {
      set({ mode: 'nearby', selectedSourceIds: [] });
      restoreView();
    },

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
  };
});
