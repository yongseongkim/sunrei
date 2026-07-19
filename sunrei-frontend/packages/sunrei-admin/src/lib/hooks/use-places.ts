import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { PlaceListItemDTO } from '@/api/admin';

export const placeKeys = {
  all: ['places'] as const,
  list: (q?: string) => [...placeKeys.all, 'list', { q }] as const,
};

export function usePlaces(q?: string) {
  return useQuery({
    queryKey: placeKeys.list(q),
    queryFn: async () => {
      const response = await adminApi.listPlaces(q, undefined, 100);
      return response.data.data || [];
    },
  });
}

export type { PlaceListItemDTO };
