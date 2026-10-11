'use client';

import { create } from 'zustand';
import type { Bounds, LatLng, MapMode } from '@/hooks/use-map';

export const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 12;

type SavedView = { center: LatLng; zoom: number };

interface MapState {
  mode: MapMode;
  selectedSourceIds: string[];
  committedBounds: Bounds | null; // nearby 목록을 불러온 영역
  committedEmpty: boolean; // 불러온 영역에 장소가 하나도 없었는지
  pendingArea: Bounds | null; // 지도를 옮겼지만 아직 불러오지 않은 영역
  commitNextIdle: boolean; // 다음 idle에서 버튼 없이 바로 불러올지
  mapCenter: LatLng | null; // 거리 계산과 정렬의 기준이며 GPS 위치가 아니다.
  initialSeed: LatLng; // 위치 권한이 있으면 현재 위치, 없으면 서울
  zoom: number;
  map: google.maps.Map | null;
  // source 모드는 지도를 Source의 모든 장소에 맞춰 옮기므로, 들어가기 전 nearby 화면을 저장했다가 나올 때 되돌린다.
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
  // commitOnIdle은 검색에서 위치를 고른 경우처럼 도착한 영역을 버튼 없이 바로 불러올 때 켠다.
  panTo: (c: LatLng, zoom?: number, commitOnIdle?: boolean) => void;
  fitToPoints: (points: LatLng[], maxZoom?: number) => void;
}

export const useMapStore = create<MapState>((set, get) => {
  const captureView = (): SavedView | null => {
    const m = get().map;
    if (!m) return null;
    const c = m.getCenter();
    if (!c) return null;
    return { center: c.toJSON(), zoom: m.getZoom() ?? DEFAULT_ZOOM };
  };

  // 되돌린 화면의 영역이 저장 전과 조금 달라도 "이 주변 검색" 버튼이 뜨지 않도록 다음 idle에서 바로 불러온다.
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
        // 첫 idle에서는 시작 화면을 바로 불러오고, commitNextIdle이 켜져 있으면 도착한 영역을 바로 불러온다.
        // 그 밖의 이동은 pendingArea에만 기록하고, 사용자가 "이 주변 검색"을 눌러야 불러온다.
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
        // 지금 영역에 장소가 없으면 새로 불러와도 보고 있던 목록이 바뀌지 않으므로 지도를 옮기는 즉시 새 영역을 불러온다.
        // committedEmpty를 여기서 끄므로, 새 영역에 결과가 있으면 그다음 이동부터는 다시 버튼을 눌러야 한다.
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
