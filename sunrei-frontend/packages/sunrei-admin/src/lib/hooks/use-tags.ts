import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { CreateTagRequest, UpdateTagRequest, TagDTO } from '@/api/admin';

// Query keys
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (nextToken?: string, size?: number) =>
    [...tagKeys.lists(), { nextToken, size }] as const,
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

// Search tags by either label (en or ko)
export function useSearchTags(query: string, enabled = true) {
  return useQuery({
    queryKey: tagKeys.search(query),
    queryFn: async () => {
      const response = await adminApi.searchTags(query);
      return response.data;
    },
    enabled: enabled && query.trim().length > 0,
  });
}

// Get single tag with associated spots
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

// Create bilingual tag
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

// Update tag labels
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

// Delete tag
export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await adminApi.deleteTag(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

// Detach a spot from a tag
export function useDetachSpotFromTag(tagId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spotId: string) => {
      await adminApi.detachSpotFromTag(tagId, spotId);
      return spotId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(tagId) });
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export type { TagDTO };
