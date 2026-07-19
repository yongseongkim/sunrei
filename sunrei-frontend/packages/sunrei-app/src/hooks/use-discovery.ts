'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { centerKey, qk } from '@/lib/query-keys';
import type { LatLng } from './use-map';

export function useSearch(q: string, center?: LatLng | null, enabled = true) {
  return useQuery({
    queryKey: qk.search(q, centerKey(center)),
    queryFn: async () => (await apiClient.search(q, center?.lat, center?.lng)).data,
    enabled: enabled && q.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: async () => (await apiClient.listTags()).data,
    staleTime: 5 * 60_000,
  });
}
