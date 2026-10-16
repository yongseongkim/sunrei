import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import {
  CreateSunreiRequest,
  UpdateSunreiRequest,
  SunreiDTO,
} from '@/api/admin';

export const sunreiKeys = {
  all: ['sunreis'] as const,
  lists: () => [...sunreiKeys.all, 'list'] as const,
  list: (params: {
    nextToken?: string;
    size?: number;
    q?: string;
    sourceId?: string;
    published?: boolean;
  }) => [...sunreiKeys.lists(), params] as const,
  details: () => [...sunreiKeys.all, 'detail'] as const,
  detail: (id: string) => [...sunreiKeys.details(), id] as const,
};

export function useSunreis(params: {
  nextToken?: string;
  size?: number;
  q?: string;
  sourceId?: string;
  published?: boolean;
} = {}) {
  const { nextToken, size = 100, q, sourceId, published } = params;
  return useQuery({
    queryKey: sunreiKeys.list({ nextToken, size, q, sourceId, published }),
    queryFn: async () => {
      const response = await adminApi.listSunreis(
        nextToken,
        size,
        q,
        sourceId,
        published
      );
      return response.data.data || [];
    },
  });
}

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

/** 서버는 published_at이 비어 있을 때만 현재 시각을 넣으므로, 공개된 Sunrei를 다시 저장해도 처음 공개한 시각이 남는다. */
export function useSetSunreiPublished() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const response = await adminApi.updateSunrei(id, { published });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sunreiKeys.lists() });
    },
  });
}

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

export type { SunreiDTO };
