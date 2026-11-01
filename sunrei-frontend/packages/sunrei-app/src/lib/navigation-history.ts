import type { Bounds, LatLng } from '@/hooks/use-map';

export interface NavigationSnapshot {
  sourceIds: string[];
  tagIds: string[];
  placeId: string | null;
  preview: { sunreiId: string; returnTo: 'nearby' | 'source'; fromSearch?: boolean } | null;
  searchOpen: boolean;
  searchQuery: string;
  sourceFromSearch: boolean;
  mobileSnap: 'peek' | 'half' | 'full';
  scrollTop: number;
  map: {
    center: LatLng | null;
    zoom: number;
    bounds: Bounds | null;
    pendingBounds: Bounds | null;
    empty: boolean;
    savedView: { center: LatLng; zoom: number } | null;
  };
}

const HISTORY_KEY = 'sunreiNavigation';
interface NavigationEntry {
  version: 1;
  session: string;
  index: number;
  snapshot: NavigationSnapshot;
}

function historyEntry(state: unknown): NavigationEntry | null {
  const entry = state?.[HISTORY_KEY] as NavigationEntry | undefined;
  if (
    entry?.version !== 1 || typeof entry.session !== 'string' ||
    !Number.isInteger(entry.index) || entry.index < 0 ||
    !Array.isArray(entry.snapshot?.sourceIds) || !Array.isArray(entry.snapshot?.tagIds) ||
    !entry.snapshot.map || typeof entry.snapshot.searchQuery !== 'string'
  ) return null;
  return entry;
}

const ids = (value: string | null) => [...new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean))];

export function navigationFromUrl(url: URL, current: NavigationSnapshot): NavigationSnapshot {
  const sourceIds = ids(url.searchParams.get('sourceIds'));
  const sunreiId = url.searchParams.get('sunrei');
  return {
    ...current,
    sourceIds,
    tagIds: ids(url.searchParams.get('tags')),
    placeId: url.searchParams.get('place') || null,
    preview: sunreiId ? { sunreiId, returnTo: sourceIds.length ? 'source' : 'nearby' } : null,
    searchOpen: url.searchParams.has('search'),
    searchQuery: url.searchParams.get('search') ?? '',
    sourceFromSearch: false,
    scrollTop: 0,
  };
}

export function navigationUrl(snapshot: NavigationSnapshot, current: URL): string {
  const url = new URL(current);
  const params = url.searchParams;
  const values = {
    sourceIds: snapshot.sourceIds.join(','),
    tags: snapshot.tagIds.join(','),
    place: snapshot.placeId,
    sunrei: snapshot.preview?.sunreiId,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  if (snapshot.searchOpen) params.set('search', snapshot.searchQuery);
  else params.delete('search');
  return url.pathname + url.search + url.hash;
}

export function navigationViewKey(snapshot: NavigationSnapshot): string {
  // Typing, filtering, moving the map and resizing the sheet update the current entry.
  return JSON.stringify([snapshot.sourceIds, snapshot.preview?.sunreiId, snapshot.placeId, snapshot.searchOpen]);
}

export function mapScopeKey(snapshot: Pick<NavigationSnapshot, 'sourceIds' | 'preview'>): string {
  if (snapshot.preview) return 'preview:' + snapshot.preview.sunreiId;
  return snapshot.sourceIds.length ? 'source:' + snapshot.sourceIds.join(',') : 'nearby';
}

export function navigationScrollKey(snapshot: Pick<NavigationSnapshot, 'searchOpen' | 'placeId' | 'preview' | 'sourceIds'>): string {
  if (snapshot.searchOpen) return 'search-results';
  if (snapshot.placeId) return 'place-detail:' + encodeURIComponent(snapshot.placeId);
  if (snapshot.preview) return 'video-places:' + encodeURIComponent(snapshot.preview.sunreiId);
  return snapshot.sourceIds.length ? 'source-series:' + encodeURIComponent(snapshot.sourceIds[0]) : 'nearby-list';
}

interface HistoryOptions {
  browser: Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener'>;
  read: () => NavigationSnapshot;
  restore: (snapshot: NavigationSnapshot, restoreViewport: boolean) => void;
  onNavigate?: () => void;
}

/** Own only our state key: Next.js keeps its router tree in the same history entry. */
export function createNavigationHistory({ browser, read, restore, onNavigate }: HistoryOptions) {
  const existing = historyEntry(browser.history.state);
  let entry: NavigationEntry = existing ?? {
    version: 1,
    session: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    index: 0,
    snapshot: navigationFromUrl(new URL(browser.location.href), read()),
  };
  let restoring = false;
  let scheduled = false;
  let disposed = false;
  let replaceNext = false;
  let traversing = false;
  let scrollDirty = false;
  const remembered = new Map<string, NavigationSnapshot>();
  const entryKey = (value: NavigationEntry) => `${value.session}:${value.index}`;

  const write = (method: 'pushState' | 'replaceState') => {
    remembered.set(entryKey(entry), entry.snapshot);
    browser.history[method](
      { ...browser.history.state, [HISTORY_KEY]: entry },
      '',
      navigationUrl(entry.snapshot, new URL(browser.location.href)),
    );
  };
  const apply = (snapshot: NavigationSnapshot, viewport: boolean) => {
    restoring = true;
    try { restore(snapshot, viewport); }
    finally { restoring = false; }
  };

  apply(entry.snapshot, !!existing?.snapshot.map.center);
  write('replaceState');

  const flush = () => {
    scheduled = false;
    if (disposed || restoring || traversing) return;
    const snapshot = read();
    const changedView = navigationViewKey(snapshot) !== navigationViewKey(entry.snapshot);
    const method = changedView && !replaceNext ? 'pushState' : 'replaceState';
    replaceNext = false;
    if (JSON.stringify(snapshot) === JSON.stringify(entry.snapshot) && !scrollDirty) return;
    if (changedView) {
      if (scrollDirty) write('replaceState');
      snapshot.scrollTop = 0;
      onNavigate?.();
    }
    scrollDirty = false;
    entry = { ...entry, index: entry.index + (method === 'pushState' ? 1 : 0), snapshot };
    write(method);
  };

  const schedule = () => {
    if (disposed || restoring || scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  const pop = (event: PopStateEvent) => {
    traversing = false;
    const target = historyEntry(event.state);
    entry = target ? { ...target, snapshot: remembered.get(entryKey(target)) ?? target.snapshot } : {
      version: 1,
      session: entry.session,
      index: 0,
      snapshot: navigationFromUrl(new URL(browser.location.href), read()),
    };
    replaceNext = false;
    scrollDirty = false;
    apply(entry.snapshot, !!target?.snapshot.map.center);
    write('replaceState');
  };
  browser.addEventListener('popstate', pop);

  return {
    schedule,
    recordScroll(scrollTop: number) {
      if (disposed || restoring || traversing || scrollTop === entry.snapshot.scrollTop) return;
      entry = { ...entry, snapshot: { ...entry.snapshot, scrollTop } };
      remembered.set(entryKey(entry), entry.snapshot);
      scrollDirty = true;
    },
    back(fallback: () => void) {
      if (traversing) return;
      flush();
      if (entry.index > 0) {
        traversing = true;
        browser.history.back();
      } else {
        // A directly opened detail has no in-app parent entry. Do not create a back loop.
        replaceNext = true;
        fallback();
        schedule();
      }
    },
    dispose() {
      disposed = true;
      browser.removeEventListener('popstate', pop);
    },
  };
}

let activeBack: ((fallback: () => void) => void) | undefined;

export function registerNavigationBack(back: (fallback: () => void) => void) {
  activeBack = back;
  return () => { if (activeBack === back) activeBack = undefined; };
}

export function navigateBack(fallback: () => void) {
  if (activeBack) activeBack(fallback);
  else fallback();
}
