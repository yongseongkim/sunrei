'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useUiStore } from '@/stores/ui-store';
import { useFilterStore } from '@/stores/filter-store';
import {
  createNavigationHistory,
  mapScopeKey,
  navigationScrollKey,
  navigationViewKey,
  registerNavigationBack,
  type NavigationSnapshot,
} from '@/lib/navigation-history';

function capture(restoring?: NavigationSnapshot): NavigationSnapshot {
  const map = useMapStore.getState();
  const ui = useUiStore.getState();
  const snapshot: NavigationSnapshot = {
    sourceIds: [...map.selectedSourceIds],
    tagIds: [...useFilterStore.getState().activeTagIds],
    placeId: ui.activePlaceId,
    preview: ui.videoPreview ? { ...ui.videoPreview } : null,
    searchOpen: ui.searchOpen,
    searchQuery: ui.searchQuery,
    sourceFromSearch: ui.sourceFromSearch,
    mobileSnap: ui.mobileSnap,
    scrollTop: 0,
    map: {
      center: map.mapCenter,
      zoom: map.zoom,
      bounds: map.committedBounds,
      pendingBounds: map.pendingArea,
      empty: map.committedEmpty,
      savedView: map.savedView,
    },
  };
  snapshot.scrollTop = restoring && navigationViewKey(restoring) === navigationViewKey(snapshot)
    ? restoring.scrollTop
    : document.querySelector<HTMLElement>(
      `[data-navigation-scroll="${navigationScrollKey(snapshot)}"]`,
    )?.scrollTop ?? 0;
  return snapshot;
}

/** Wait for cached or fetched list content before restoring a nested scroll container. */
function restoreScroll(snapshot: NavigationSnapshot, onDone: () => void): () => void {
  const selector = `[data-navigation-scroll="${navigationScrollKey(snapshot)}"]`;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('wheel', stop, true);
    document.removeEventListener('touchstart', stop, true);
    onDone();
  };
  const apply = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.scrollTop = snapshot.scrollTop;
    if (Math.abs(element.scrollTop - snapshot.scrollTop) < 1) stop();
  };
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('wheel', stop, { capture: true, passive: true });
  document.addEventListener('touchstart', stop, { capture: true, passive: true });
  const timer = setTimeout(stop, 10_000);
  frame = requestAnimationFrame(apply);
  return stop;
}

/** Browser Back/Forward and in-app Back restore the same navigation snapshot. */
export function useDeepLinkSync() {
  useEffect(() => {
    let cancelScroll = () => {};
    let pendingScroll: NavigationSnapshot | undefined;
    let scrollTimer: ReturnType<typeof setTimeout>;
    const history = createNavigationHistory({
      browser: window,
      read: () => capture(pendingScroll),
      restore(snapshot, restoreViewport) {
        cancelScroll();
        clearTimeout(scrollTimer);
        pendingScroll = snapshot;
        const state = snapshot.map;
        useMapStore.setState({
          mode: snapshot.sourceIds.length ? 'source' : 'nearby',
          selectedSourceIds: [...snapshot.sourceIds],
          mapCenter: state.center,
          zoom: state.zoom,
          committedBounds: state.bounds,
          pendingArea: state.pendingBounds,
          committedEmpty: state.empty,
          savedView: state.savedView,
          commitNextIdle: !snapshot.sourceIds.length && !state.pendingBounds,
          restoredScopeKey: restoreViewport ? mapScopeKey(snapshot) : null,
        });
        useFilterStore.setState({ activeTagIds: [...snapshot.tagIds] });
        useUiStore.setState({
          activePlaceId: snapshot.placeId,
          videoPreview: snapshot.preview,
          searchOpen: snapshot.searchOpen,
          searchQuery: snapshot.searchQuery,
          sourceFromSearch: snapshot.sourceFromSearch,
          mobileSnap: snapshot.mobileSnap,
          filtersOpen: false,
          loginOpen: false,
        });
        if (restoreViewport && state.center) {
          const map = useMapStore.getState().map;
          map?.setCenter(state.center);
          map?.setZoom(state.zoom);
        }
        cancelScroll = restoreScroll(snapshot, () => { pendingScroll = undefined; });
      },
      onNavigate() {
        cancelScroll();
        clearTimeout(scrollTimer);
        useMapStore.setState({ restoredScopeKey: null });
      },
    });
    const subscriptions = [
      useMapStore.subscribe(history.schedule),
      useUiStore.subscribe(history.schedule),
      useFilterStore.subscribe(history.schedule),
    ];
    const unregister = registerNavigationBack(history.back);
    const onScroll = (event: Event) => {
      if (pendingScroll) return;
      const element = event.target;
      if (!(element instanceof HTMLElement) || element.dataset.navigationScroll !== navigationScrollKey(capture())) return;
      history.recordScroll(element.scrollTop);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(history.schedule, 150);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => {
      history.dispose();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      unregister();
      cancelScroll();
      clearTimeout(scrollTimer);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);
}
