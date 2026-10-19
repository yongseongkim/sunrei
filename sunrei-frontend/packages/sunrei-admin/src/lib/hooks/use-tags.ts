import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { CreateTagRequest, UpdateTagRequest, TagDTO } from '@/api/admin';

export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  search: (query: string) => [...tagKeys.all, 'search', query] as const,
  details: () => [...tagKeys.all, 'detail'] as const,
  detail: (id: string) => [...tagKeys.details(), id] as const,
};

/** 태그 화면은 번호로 페이지를 넘기므로 서버 페이지를 모두 이어 받아 브라우저에서 나눈다. */
export function useAllTags() {
  return useQuery({
    queryKey: [...tagKeys.lists(), 'all'] as const,
    queryFn: async () => {
      const tags: TagDTO[] = [];
      const spotCountByTagId: Record<string, number> = {};
      let token: string | undefined;
      do {
        const { data } = await adminApi.listTags(token, 100);
        tags.push(...data.data);
        Object.assign(spotCountByTagId, data.spotCountByTagId ?? {});
        token = data.nextToken ?? undefined;
      } while (token);
      return { tags, spotCountByTagId };
    },
  });
}

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
