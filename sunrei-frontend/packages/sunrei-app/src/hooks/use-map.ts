'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { boundsKey, centerKey, qk } from '@/lib/query-keys';

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
