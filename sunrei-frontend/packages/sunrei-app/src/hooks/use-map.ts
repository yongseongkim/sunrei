'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { boundsKey, centerKey, qk } from '@/lib/query-keys';
import { useFilterStore } from '@/stores/filter-store';
import type { PlaceCardDTO, SunreiSpotDTO } from '@/dto';

export type MapMode = 'nearby' | 'source';
export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };
export type LatLng = { lat: number; lng: number };

export interface MapQuery {
  mode: MapMode;
  bounds: Bounds | null;
  center: LatLng | null;
  sourceIds: string[];
}

/** Fetch PlaceCards for nearby (viewport bounds) or source (global) mode. */
export function useMapPlaces(q: MapQuery) {
  const ckey = centerKey(q.center);
  const key =
    q.mode === 'source'
      ? qk.map.source(q.sourceIds.join(','), ckey)
      : qk.map.nearby(boundsKey(q.bounds), ckey);

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      if (q.mode === 'source') {
        const res = await apiClient.getMapData(
          undefined, undefined, undefined, undefined,
          q.center?.lat, q.center?.lng,
          q.sourceIds.join(',') || undefined
        );
        return res.data;
      }
      const b = q.bounds!;
      const res = await apiClient.getMapData(b.swLat, b.swLng, b.neLat, b.neLng, q.center?.lat, q.center?.lng);
      return res.data;
    },
    enabled: q.mode === 'source' ? q.sourceIds.length > 0 : q.bounds !== null,
    staleTime: 30_000,
  });
}

export function usePlaceDetail(id: string | null, center?: LatLng | null) {
  return useQuery({
    queryKey: qk.place(id ?? '', centerKey(center)),
    queryFn: async () => (await apiClient.getPlace(id!, center?.lat, center?.lng)).data,
    enabled: !!id,
  });
}

export function useSunreiDetail(id: string | null) {
  return useQuery({
    queryKey: qk.sunrei(id ?? ''),
    queryFn: async () => (await apiClient.getSunrei(id!)).data,
    enabled: !!id,
  });
}

export function useSourceDetail(id: string | null, center?: LatLng | null) {
  return useQuery({
    queryKey: qk.source(id ?? '', centerKey(center)),
    queryFn: async () => (await apiClient.getSource(id!, center?.lat, center?.lng)).data,
    enabled: !!id,
  });
}

/**
 * Shared client-side tag filter selector (Bd-1/Bf-3). Returns the same `cards`
 * (list is NOT trimmed — non-matches stay visible) plus the set of place ids whose
 * tags don't match the active filter, so both the list and the markers dim the same
 * places. Empty filter → nothing dimmed.
 */
export function useTagFilter(cards: PlaceCardDTO[]): { dimmedIds: Set<string>; hasFilter: boolean } {
  const activeTagIds = useFilterStore((s) => s.activeTagIds);
  return useMemo(() => {
    const dimmedIds = new Set<string>();
    if (activeTagIds.length === 0) return { dimmedIds, hasFilter: false };
    for (const c of cards) {
      const ids = new Set((c.tags ?? []).map((t) => t.id));
      if (!activeTagIds.every((id) => ids.has(id))) dimmedIds.add(c.place.id);
    }
    return { dimmedIds, hasFilter: true };
  }, [cards, activeTagIds]);
}

/** Group a video's spots by ward/area label for the itinerary list (Bd-6). */
export function groupSpotsByArea(spots: SunreiSpotDTO[]): { area: string; spots: SunreiSpotDTO[] }[] {
  const groups = new Map<string, SunreiSpotDTO[]>();
  for (const s of spots) {
    const area = s.place.areaLabel || s.place.address || '—';
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(s);
  }
  return Array.from(groups, ([area, spots]) => ({ area, spots }));
}
