'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { boundsKey, centerKey, qk } from '@/lib/query-keys';
import { useFilterStore } from '@/stores/filter-store';
import type { PlaceCardDTO } from '@/dto';

export type MapMode = 'nearby' | 'source';
export type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };
export type LatLng = { lat: number; lng: number };

export interface MapQuery {
  mode: MapMode;
  bounds: Bounds | null;
  center: LatLng | null;
  sourceIds: string[];
}

/** nearby 모드는 지도 화면 영역 안의 장소를, source 모드는 화면과 관계없이 선택한 Source의 모든 장소를 가져온다. */
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

/**
 * "주변 소스" 레일에는 전체 Source가 아니라 불러온 영역 안 장소들의 Source만 보여 준다.
 * nearby 지도 조회와 같은 query key를 쓰므로 nearby 모드에서는 요청이 따로 나가지 않는다.
 */
export function useNearbySources(bounds: Bounds | null, center: LatLng | null) {
  const ckey = centerKey(center);
  return useQuery({
    queryKey: qk.map.nearby(boundsKey(bounds), ckey),
    queryFn: async () => {
      const b = bounds!;
      const res = await apiClient.getMapData(b.swLat, b.swLng, b.neLat, b.neLng, center?.lat, center?.lng);
      return res.data;
    },
    enabled: bounds !== null,
    staleTime: 30_000,
    select: (data) => data.sources ?? [],
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
 * 선택한 태그를 모두 가진 장소만 필터에 맞는 것으로 보고, 맞지 않는 장소 id를 dimmedIds로 돌려준다.
 * 목록은 이 장소를 빼고, 지도는 핀을 지우지 않고 흐리게만 표시한다.
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
