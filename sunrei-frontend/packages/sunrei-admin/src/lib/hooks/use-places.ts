import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { PlaceListItemDTO, UpdatePlaceRequest } from '@/api/admin';

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

export function useUpdatePlace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdatePlaceRequest) => {
      const response = await adminApi.updatePlace(id, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: placeKeys.all });
    },
  });
}

export type { PlaceListItemDTO };
