import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { CreateTagRequest, UpdateTagRequest, TagDTO } from '@/api/admin';

// Query keys
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (nextToken?: string, size?: number) => [...tagKeys.lists(), { nextToken, size }] as const,
  search: (query: string) => [...tagKeys.all, 'search', query] as const,
  details: () => [...tagKeys.all, 'detail'] as const,
  detail: (id: string) => [...tagKeys.details(), id] as const,
};

// List tags with pagination
export function useTags(nextToken?: string, size?: number) {
  return useQuery({
    queryKey: tagKeys.list(nextToken, size),
    queryFn: async () => {
      const response = await adminApi.listTags(nextToken, size);
      return response.data;
    },
  });
}

// Search tags by name
export function useSearchTags(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: tagKeys.search(query),
    queryFn: async () => {
      const response = await adminApi.searchTags(query);
      return response.data;
    },
    enabled: enabled && query.trim().length > 0,
  });
}

// Get single tag with Sunrei IDs
export function useTag(id: string) {
  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: async () => {
      const response = await adminApi.getTag(id);
      return response.data;
    },
    enabled: !!id,
  });
}

// Create tag
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTagRequest) => {
      const response = await adminApi.createTag(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

// Update tag
export function useUpdateTag(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateTagRequest) => {
      const response = await adminApi.updateTag(id, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(id) });
    },
  });
}

// Remove Sunrei from tag
export function useRemoveSunreiFromTag(tagId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sunreiId: string) => {
      await adminApi.removeSunreiFromTag(tagId, sunreiId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(tagId) });
    },
  });
}
