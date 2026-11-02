export type ListPath = '/sunreis' | '/sources' | '/places' | '/tags';

interface Router {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
}
type Browser = Pick<Window, 'history' | 'location'>;
const RETURN_KEY = 'sunreiAdminReturn';
let pendingVisit: { href: string; returnTo: string } | undefined;

const relative = (url: URL) => url.pathname + url.search + url.hash;

export function listQueryUrl(current: string, key: string, value: string): string {
  const url = new URL(current);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  return relative(url);
}

export function listPage(value: string | null): number {
  const page = Number(value);
  return value && /^\d+$/.test(value) && Number.isSafeInteger(page) && page > 0 ? page - 1 : 0;
}

/** Return links may only point to the originating list, within this app. */
export function listReturnTarget(candidate: string | null, list: ListPath): string {
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return list;
  try {
    const url = new URL(candidate, 'https://sunrei.invalid');
    return url.origin === 'https://sunrei.invalid' && url.pathname === list ? relative(url) : list;
  } catch {
    return list;
  }
}

export function openFromList(browser: Browser, router: Router, href: string, list: ListPath) {
  const returnTo = listReturnTarget(relative(new URL(browser.location.href)), list);
  const detail = new URL(href, browser.location.href);
  detail.searchParams.set('returnTo', returnTo);
  const destination = relative(detail);
  pendingVisit = { href: destination, returnTo };
  router.push(destination);
}

/** Mark only a detail actually reached from a list; a pasted URL has no parent history. */
export function rememberListReturn(browser: Browser, list: ListPath) {
  const url = new URL(browser.location.href);
  const href = relative(url);
  const returnTo = listReturnTarget(url.searchParams.get('returnTo'), list);
  if (pendingVisit?.href !== href || pendingVisit.returnTo !== returnTo) return;
  browser.history.replaceState({ ...browser.history.state, [RETURN_KEY]: { href, returnTo } }, '', href);
  pendingVisit = undefined;
}

export function returnToList(browser: Browser, router: Router, list: ListPath) {
  rememberListReturn(browser, list);
  const url = new URL(browser.location.href);
  const returnTo = listReturnTarget(url.searchParams.get('returnTo'), list);
  const visit = browser.history.state?.[RETURN_KEY];
  if (visit?.href === relative(url) && visit.returnTo === returnTo) router.back();
  else router.replace(returnTo);
}
