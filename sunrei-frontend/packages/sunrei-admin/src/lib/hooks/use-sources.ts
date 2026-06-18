import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import {
  CreateSourceRequest,
  UpdateSourceRequest,
  SourceDTO,
} from '@/api/admin';

export const sourceKeys = {
  all: ['sources'] as const,
  lists: () => [...sourceKeys.all, 'list'] as const,
  list: (q?: string) => [...sourceKeys.lists(), { q }] as const,
  search: (q: string) => [...sourceKeys.all, 'search', q] as const,
  details: () => [...sourceKeys.all, 'detail'] as const,
  detail: (id: string) => [...sourceKeys.details(), id] as const,
};

export function useSources(q?: string) {
  return useQuery({
    queryKey: sourceKeys.list(q),
    queryFn: async () => {
      const response = await adminApi.listSources(q, undefined, 100);
      return response.data.data || [];
    },
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: sourceKeys.detail(id),
    queryFn: async () => {
      const response = await adminApi.getSource(id);
      return response.data;
    },
    enabled: !!id,
  });
}

/** Lightweight source search for the Sunrei form source picker. */
export function useSearchSources(q: string, enabled = true) {
  return useQuery({
    queryKey: sourceKeys.search(q),
    queryFn: async () => {
      const response = await adminApi.listSources(q, undefined, 20);
      return response.data.data || [];
    },
    enabled: enabled && q.trim().length > 0,
  });
}

export function useCreateSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSourceRequest) => {
      const response = await adminApi.createSource(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourceKeys.lists() });
    },
  });
}

export function useUpdateSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSourceRequest }) => {
      const response = await adminApi.updateSource(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: sourceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sourceKeys.detail(variables.id) });
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await adminApi.deleteSource(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourceKeys.lists() });
    },
  });
}

export type { SourceDTO };
