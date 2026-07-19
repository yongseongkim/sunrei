'use client';

import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';

/**
 * Deep-link sync (Bc-5): hydrate stores from URL query params on mount, then write
 * state back via history.replaceState (no navigation, keeps the map page persistent).
 * Synced params: sourceIds, tags, place (active), sunrei (preview).
 */
export function useDeepLinkSync() {
  const hydrated = useRef(false);

  // Params → stores (once, on mount).
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

  // Stores → URL (debounced via microtask through effect deps).
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
