import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { CreateSunreiRequest, UpdateSunreiRequest, SunreiDTO } from '@/api/admin';

// Query keys
export const sunreiKeys = {
  all: ['sunreis'] as const,
  lists: () => [...sunreiKeys.all, 'list'] as const,
  list: (page: number, size: number) => [...sunreiKeys.lists(), page, size] as const,
  details: () => [...sunreiKeys.all, 'detail'] as const,
  detail: (id: string) => [...sunreiKeys.details(), id] as const,
};

// List sunreis
export function useSunreis(page: number = 1, size: number = 100) {
  return useQuery({
    queryKey: sunreiKeys.list(page, size),
    queryFn: async () => {
      const response = await adminApi.listSunreis(page, size);
      return response.data.data || [];
    },
  });
}

// Get single sunrei
export function useSunrei(id: string) {
  return useQuery({
    queryKey: sunreiKeys.detail(id),
    queryFn: async () => {
      const response = await adminApi.getSunrei(id);
      return response.data;
    },
    enabled: !!id,
  });
}

// Create sunrei
export function useCreateSunrei() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSunreiRequest) => {
      const response = await adminApi.createSunrei(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sunreiKeys.lists() });
    },
  });
}

// Update sunrei
export function useUpdateSunrei() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSunreiRequest }) => {
      const response = await adminApi.updateSunrei(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: sunreiKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sunreiKeys.detail(variables.id) });
    },
  });
}

// Delete sunrei
export function useDeleteSunrei() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await adminApi.deleteSunrei(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sunreiKeys.lists() });
    },
  });
}
