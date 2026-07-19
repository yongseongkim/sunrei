// Query keys. The map key encodes mode/sourceIds/center — NOT tags (tag filtering is
// client-side post-query state, so it must not refetch the map).
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
