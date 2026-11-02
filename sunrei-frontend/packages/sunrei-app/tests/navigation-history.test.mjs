import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the production module without a browser bundle or an additional test dependency.
const source = readFileSync(new URL('../src/lib/navigation-history.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createNavigationHistory, navigationFromUrl, navigationUrl, navigationScrollKey, mapScopeKey } =
  await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

const copy = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const initial = () => ({
  sourceIds: [], tagIds: [], placeId: null, preview: null,
  searchOpen: false, searchQuery: '', sourceFromSearch: false,
  overlay: null,
  mobileSnap: 'half', scrollTop: 0,
  map: {
    center: { lat: 37.5665, lng: 126.978 }, zoom: 12,
    bounds: { swLat: 37, swLng: 126, neLat: 38, neLng: 128 },
    pendingBounds: null, empty: false, savedView: null,
  },
});

function browser(href = 'https://sunrei.test/', state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['app'] }) {
  const events = new EventTarget();
  const entries = [{ href, state: copy(state) }];
  let index = 0;
  const location = { href };
  const result = {
    location, entries, exits: 0, writes: [],
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    pop(state) {
      const event = new Event('popstate');
      Object.defineProperty(event, 'state', { value: copy(state) });
      events.dispatchEvent(event);
    },
  };
  const go = (delta) => queueMicrotask(() => {
    if (!entries[index + delta]) { result.exits++; return; }
    index += delta;
    location.href = entries[index].href;
    result.pop(entries[index].state);
  });
  result.history = {
    get state() { return copy(entries[index].state); },
    get length() { return entries.length; },
    pushState(data, _, url) {
      const href = new URL(url, location.href).href;
      entries.splice(index + 1, entries.length, { href, state: copy(data) });
      index++;
      location.href = href;
      result.writes.push('push');
    },
    replaceState(data, _, url) {
      location.href = new URL(url, location.href).href;
      entries[index] = { href: location.href, state: copy(data) };
      result.writes.push('replace');
    },
    back() { go(-1); },
    forward() { go(1); },
  };
  return result;
}

function harness(url, historyState) {
  const win = browser(url, historyState);
  let current = initial();
  let controller;
  const restored = [];
  controller = createNavigationHistory({
    browser: win,
    read: () => copy(current),
    restore(snapshot, viewport) {
      current = copy(snapshot);
      restored.push({ snapshot: copy(snapshot), viewport });
      controller?.schedule(); // Store subscriptions must not write during popstate restoration.
    },
    onNavigate() { current.scrollTop = 0; },
  });
  return {
    win, controller, restored,
    get current() { return current; },
    update(patch) { current = { ...current, ...copy(patch) }; controller.schedule(); },
    scroll(top) { current.scrollTop = top; controller.recordScroll(top); },
    get saved() { return win.history.state.sunreiNavigation.snapshot; },
  };
}

test('Back and Forward traverse nearby → source → series → place without adding entries', async () => {
  const h = harness();
  h.update({ sourceIds: ['source-1'] }); await tick();
  h.update({ preview: { sunreiId: 'series-1', returnTo: 'source' } }); await tick();
  h.update({ placeId: 'place-1' }); await tick();
  assert.equal(h.win.history.length, 4);
  h.win.history.back(); await tick();
  assert.equal(h.current.placeId, null);
  assert.equal(h.current.preview.sunreiId, 'series-1');
  h.win.history.back(); await tick();
  assert.equal(h.current.preview, null);
  assert.deepEqual(h.current.sourceIds, ['source-1']);
  h.win.history.back(); await tick();
  assert.deepEqual(h.current.sourceIds, []);
  for (let i = 0; i < 3; i++) { h.win.history.forward(); await tick(); }
  assert.equal(h.current.placeId, 'place-1');
  assert.equal(h.win.history.length, 4);
  h.controller.dispose();
});

test('typing, filters, viewport changes and sheet size update the current screen', async () => {
  const h = harness();
  h.update({ searchOpen: true }); await tick();
  for (const searchQuery of ['카', '카덴']) { h.update({ searchQuery }); await tick(); }
  const map = { ...h.current.map, center: { lat: 35.16, lng: 129.16 }, zoom: 14 };
  h.update({ tagIds: ['food'], mobileSnap: 'full', map }); await tick();
  assert.equal(h.win.history.length, 2);
  h.win.history.back(); await tick();
  assert.equal(h.current.searchOpen, false);
  h.win.history.forward(); await tick();
  assert.equal(h.current.searchQuery, '카덴');
  assert.deepEqual(h.current.tagIds, ['food']);
  assert.equal(h.current.mobileSnap, 'full');
  assert.deepEqual(h.current.map.center, map.center);
  assert.equal(h.current.map.zoom, 14);
  assert.equal(h.restored.at(-1).viewport, true);
  h.controller.dispose();
});

test('one result selection coalesces updates across multiple stores into one history entry', async () => {
  const h = harness();
  h.update({ searchOpen: true, searchQuery: '비밀이야' }); await tick();
  h.scroll(420);
  h.update({ sourceIds: ['bimirya'] });
  h.update({ sourceFromSearch: true });
  h.update({ searchOpen: false });
  await tick();
  assert.equal(h.win.history.length, 3);
  assert.equal(h.saved.scrollTop, 0);
  h.win.history.back(); await tick();
  assert.equal(h.current.searchOpen, true);
  assert.equal(h.current.searchQuery, '비밀이야');
  assert.equal(h.current.scrollTop, 420);
  assert.deepEqual(h.current.sourceIds, []);
  h.controller.dispose();
});

test('a direct series/place link retains both selections and derives the source return scope', () => {
  const h = harness('https://sunrei.test/?sourceIds=s1,s1&sunrei=v1&place=p1&tags=t1');
  assert.deepEqual(h.current.sourceIds, ['s1']);
  assert.equal(h.current.placeId, 'p1');
  assert.deepEqual(h.current.preview, { sunreiId: 'v1', returnTo: 'source' });
  assert.deepEqual(h.current.tagIds, ['t1']);
  assert.equal(h.win.history.length, 1);
  h.controller.dispose();
});

test('in-app Back uses the existing entry, and a new selection discards only the forward branch', async () => {
  const h = harness();
  h.update({ sourceIds: ['s1'] }); await tick();
  h.update({ preview: { sunreiId: 'v1', returnTo: 'source' } }); await tick();
  h.controller.back(() => assert.fail('must use browser history'));
  await tick();
  assert.equal(h.current.preview, null);
  assert.deepEqual(h.current.sourceIds, ['s1']);
  h.update({ preview: { sunreiId: 'v2', returnTo: 'source' } }); await tick();
  assert.equal(h.win.history.length, 3);
  assert.equal(h.current.preview.sunreiId, 'v2');
  assert.equal(h.win.entries[2].state.sunreiNavigation.snapshot.preview.sunreiId, 'v2');
  h.controller.dispose();
});

test('a direct-entry in-app Back replaces the entry instead of creating a return loop', async () => {
  const h = harness('https://sunrei.test/?place=p1');
  h.controller.back(() => h.update({ placeId: null })); await tick();
  assert.equal(h.current.placeId, null);
  assert.equal(h.win.history.length, 1);
  assert.equal(new URL(h.win.location.href).search, '');
  h.win.history.back(); await tick();
  assert.equal(h.win.exits, 1); // The first entry still allows leaving Sunrei.
  h.controller.dispose();
});

test('Next.js router state and unrelated URL parameters/hash survive all transitions', async () => {
  const h = harness('https://sunrei.test/?utm_source=test#map');
  h.update({ sourceIds: ['s1'] }); await tick();
  h.update({ placeId: 'p1' }); await tick();
  h.win.history.back(); await tick();
  for (const entry of h.win.entries) {
    assert.equal(entry.state.__NA, true);
    assert.deepEqual(entry.state.__PRIVATE_NEXTJS_INTERNALS_TREE, ['app']);
    assert.equal(new URL(entry.href).searchParams.get('utm_source'), 'test');
    assert.equal(new URL(entry.href).hash, '#map');
  }
  h.controller.dispose();
});

test('reload restores search text, origin, viewport, list offset and mobile expansion', async () => {
  const h = harness();
  h.update({ searchOpen: true, searchQuery: '한국', sourceFromSearch: true, mobileSnap: 'full' }); await tick();
  h.scroll(500); h.controller.schedule(); await tick();
  const expected = copy(h.current);
  h.controller.dispose();
  const restored = harness(h.win.location.href, h.win.history.state);
  assert.deepEqual(restored.current, expected);
  assert.equal(restored.win.history.state.sunreiNavigation.index, 1);
  assert.equal(restored.restored[0].viewport, true);
  restored.controller.dispose();
});

test('scroll positions are remembered without a history write per scroll event', async () => {
  const h = harness();
  h.update({ sourceIds: ['s1'] }); await tick();
  const count = h.win.writes.length;
  for (let top = 1; top <= 100; top++) h.scroll(top);
  assert.equal(h.win.writes.length, count);
  h.win.history.back(); await tick();
  h.win.history.forward(); await tick();
  assert.equal(h.current.scrollTop, 100);
  h.controller.dispose();
});

test('entries without Sunrei state rehydrate the URL and clear stale panels', async () => {
  const h = harness();
  h.update({ sourceIds: ['s1'], preview: { sunreiId: 'v1', returnTo: 'source' } }); await tick();
  h.win.history.replaceState({ __NA: true }, '', '/?place=p2');
  h.win.pop(h.win.history.state); await tick();
  assert.deepEqual(h.current.sourceIds, []);
  assert.equal(h.current.preview, null);
  assert.equal(h.current.placeId, 'p2');
  h.controller.dispose();
});

test('Back flushes a pending selection before traversing it', async () => {
  const h = harness();
  h.update({ placeId: 'p1' });
  h.controller.back(() => assert.fail('selection should be recorded first'));
  await tick();
  assert.equal(h.current.placeId, null);
  assert.equal(h.win.history.length, 2);
  h.controller.dispose();
});

test('cleanup cancels pending writes and removes the popstate listener', async () => {
  const h = harness();
  h.update({ sourceIds: ['s1'] });
  h.controller.dispose(); await tick();
  assert.equal(h.win.history.length, 1);
  const count = h.restored.length;
  h.win.pop(h.win.history.state); await tick();
  assert.equal(h.restored.length, count);
});

test('URL parsing/formatting preserves search and each panel has a distinct scroll owner', () => {
  const url = new URL('https://sunrei.test/?sourceIds=s1&sunrei=v1&place=p1&search=카덴&extra=keep#map');
  const parsed = navigationFromUrl(url, initial());
  assert.equal(new URL(navigationUrl(parsed, url), url).searchParams.get('search'), '카덴');
  assert.equal(navigationScrollKey(parsed), 'search-results');
  parsed.searchOpen = false;
  assert.equal(navigationScrollKey(parsed), 'place-detail:p1');
  parsed.placeId = null;
  assert.equal(navigationScrollKey(parsed), 'video-places:v1');
  assert.equal(mapScopeKey(parsed), 'preview:v1');
  parsed.preview = null;
  assert.equal(navigationScrollKey(parsed), 'source-series:s1');
  assert.equal(mapScopeKey(parsed), 'source:s1');
  parsed.sourceIds = [];
  assert.equal(navigationScrollKey(parsed), 'nearby-list');
  assert.equal(mapScopeKey(parsed), 'nearby');
});

test('Back dismisses a root filter dialog without exiting and keeps the applied filters', async () => {
  const h = harness();
  h.scroll(320);
  h.update({ overlay: 'filters' }); await tick();
  assert.equal(h.saved.scrollTop, 320);
  h.update({ tagIds: ['food'] }); await tick();
  h.win.history.back(); await tick();
  assert.equal(h.current.overlay, null);
  assert.deepEqual(h.current.tagIds, ['food']);
  assert.equal(h.current.scrollTop, 320);
  assert.equal(h.win.exits, 0);
  h.win.history.back(); await tick();
  assert.equal(h.win.exits, 1);
  h.controller.dispose();
});

test('dialog close, Forward and reload keep the current content and latest filters', async () => {
  const h = harness();
  h.update({ sourceIds: ['s1'] }); await tick();
  h.update({ overlay: 'filters' }); await tick();
  h.update({ tagIds: ['food'] }); await tick();
  h.controller.back(() => assert.fail('dialog has a parent entry')); await tick();
  assert.deepEqual(h.current.sourceIds, ['s1']);
  h.update({ tagIds: ['coffee'] }); await tick();
  h.win.history.forward(); await tick();
  assert.equal(h.current.overlay, 'filters');
  assert.deepEqual(h.current.tagIds, ['coffee']);
  const restored = harness(h.win.location.href, h.win.history.state);
  assert.equal(restored.current.overlay, 'filters');
  assert.deepEqual(restored.current.tagIds, ['coffee']);
  restored.controller.dispose();
  h.controller.dispose();
});

test('login Back preserves a place, and the next Back returns to its list', async () => {
  const h = harness();
  h.update({ placeId: 'p1' }); await tick();
  h.update({ overlay: 'login' }); await tick();
  h.controller.back(() => assert.fail('login has a parent entry')); await tick();
  assert.equal(h.current.overlay, null);
  assert.equal(h.current.placeId, 'p1');
  h.win.history.back(); await tick();
  assert.equal(h.current.placeId, null);
  h.controller.dispose();
});

test('history entries created before dialogs were tracked still restore', () => {
  const old = harness();
  const state = old.win.history.state;
  delete state.sunreiNavigation.snapshot.overlay;
  const restored = harness(old.win.location.href, state);
  assert.equal(restored.current.placeId, null);
  assert.equal(restored.win.history.length, 1);
  restored.controller.dispose();
  old.controller.dispose();
});
