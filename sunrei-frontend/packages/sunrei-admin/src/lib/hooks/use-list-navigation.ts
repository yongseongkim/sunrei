'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { listQueryUrl, openFromList, rememberListReturn, returnToList, type ListPath } from '@/lib/list-navigation';

const QUERY_EVENT = 'sunrei-admin:query';
function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(QUERY_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(QUERY_EVENT, onChange);
  };
}
const getSearch = () => window.location.search;
const getServerSearch = () => '';

/** Native query updates keep the list and its focused search input mounted. */
function useListSearch() {
  return useSyncExternalStore(subscribe, getSearch, getServerSearch);
}

export function useListNavigation(list: ListPath) {
  const search = useListSearch();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const setParam = useCallback((key: string, value: string, push = false) => {
    const url = listQueryUrl(window.location.href, key, value);
    if (url === window.location.pathname + window.location.search + window.location.hash) return;
    window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', url);
    window.dispatchEvent(new Event(QUERY_EVENT));
  }, []);
  const openDetail = useCallback((href: string) => openFromList(window, router, href, list), [list, router]);
  return { params, setParam, openDetail };
}

export function useReturnToList(list: ListPath) {
  const router = useRouter();
  const search = useListSearch();
  useEffect(() => { rememberListReturn(window, list); }, [list, search]);
  return useCallback(() => returnToList(window, router, list), [list, router]);
}
