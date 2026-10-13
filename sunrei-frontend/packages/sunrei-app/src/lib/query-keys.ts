// 태그 필터는 이미 받은 결과를 브라우저에서 거르기만 하므로 지도 query key에 태그를 넣지 않는다.
export const qk = {
  map: {
    nearby: (bounds: string, center: string) => ['map', 'nearby', bounds, center] as const,
    source: (sourceIds: string, center: string) => ['map', 'source', sourceIds, center] as const,
  },
  place: (id: string, center?: string) => ['place', id, center ?? ''] as const,
  source: (id: string, center?: string) => ['source', id, center ?? ''] as const,
  sunrei: (id: string) => ['sunrei', id] as const,
  search: (q: string, center?: string) => ['search', q, center ?? ''] as const,
  tags: ['tags'] as const,
};

export const centerKey = (c?: { lat: number; lng: number } | null) =>
  c ? `${c.lat.toFixed(4)},${c.lng.toFixed(4)}` : '';

export const boundsKey = (b?: {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
} | null) => (b ? `${b.swLat},${b.swLng},${b.neLat},${b.neLng}` : '');
