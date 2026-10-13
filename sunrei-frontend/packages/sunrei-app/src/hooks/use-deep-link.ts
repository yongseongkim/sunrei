'use client';

import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';

/**
 * 마운트할 때 URL query의 sourceIds, tags, place, sunrei 값을 store에 넣는다.
 * 이후 store가 바뀌면 지도 페이지를 다시 불러오지 않도록 history.replaceState로 URL만 바꾼다.
 */
export function useDeepLinkSync() {
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || typeof window === 'undefined') return;
    hydrated.current = true;
    const p = new URLSearchParams(window.location.search);
    const sourceIds = p.get('sourceIds');
    if (sourceIds) useMapStore.getState().setSourceMode(sourceIds.split(',').filter(Boolean));
    const tags = p.get('tags');
    if (tags) useFilterStore.setState({ activeTagIds: tags.split(',').filter(Boolean) });
    const place = p.get('place');
    if (place) useUiStore.getState().setActivePlace(place);
    const sunrei = p.get('sunrei');
    if (sunrei) useUiStore.getState().enterVideoPreview(sunrei, 'nearby');
  }, []);

  const sourceIds = useMapStore((s) => s.selectedSourceIds);
  const activeTagIds = useFilterStore((s) => s.activeTagIds);
  const activePlaceId = useUiStore((s) => s.activePlaceId);
  const videoPreview = useUiStore((s) => s.videoPreview);

  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (sourceIds.length) p.set('sourceIds', sourceIds.join(','));
    if (activeTagIds.length) p.set('tags', activeTagIds.join(','));
    if (activePlaceId) p.set('place', activePlaceId);
    if (videoPreview) p.set('sunrei', videoPreview.sunreiId);
    const qs = p.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '');
    window.history.replaceState(null, '', url);
  }, [sourceIds, activeTagIds, activePlaceId, videoPreview]);
}
