import type { PlaceCategory, SourceDTO } from '@/dto';
export type MarkerVisual =
  | { kind: 'category'; category: PlaceCategory }
  | { kind: 'avatar'; url: string }
  | { kind: 'count'; count: number };
/** Counts sources, never videos or spots. Callers supply the sources visible in the current scope. */
export function markerVisual(
  mode: 'source' | 'category',
  category: PlaceCategory | undefined,
  sources: SourceDTO[],
  avatar: (source: SourceDTO) => string | undefined,
): MarkerVisual {
  const fallback: MarkerVisual = {
    kind: 'category',
    category: category ?? 'OTHER',
  };
  if (mode === 'category') return fallback;
  const unique = [
    ...new Map(sources.map((source) => [source.id, source])).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  if (unique.length > 1) return { kind: 'count', count: unique.length };
  const url = unique[0] && avatar(unique[0]);
  return url ? { kind: 'avatar', url } : fallback;
}
// Lucide geometry, matching the application's existing icon family.
export const categoryPaths: Record<PlaceCategory, string> = {
  RESTAURANT: 'M4 3v7a2 2 0 0 0 4 0V3M6 3v19M20 22V3c-5 0-5 10 0 10',
  CAFE: 'M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 8h2a3 3 0 1 1 0 6h-2M6 2v3M10 2v3M14 2v3',
  BAR: 'M8 22h8M12 12v10M3 2h18l-9 10ZM5 6h14',
  SHOP: 'M4 8h16l1 13H3ZM8 8V6a4 4 0 0 1 8 0v2',
  STAY: 'M3 18v4M21 18v4M3 18h18V9H3ZM7 9V5h10v4M3 13h18',
  SIGHTSEEING:
    'M3 10h18M4 20h16M6 10v10M10 10v10M14 10v10M18 10v10M2 22h20M12 2l10 6H2Z',
  PARK: 'M12 22v-5M12 2l7 9h-4l5 6H4l5-6H5Z',
  TRANSPORT:
    'M5 17h14V5a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3ZM5 10h14M8 21l2-4M16 21l-2-4M8 14h1M15 14h1',
  OTHER:
    'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
};
