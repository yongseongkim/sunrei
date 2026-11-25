import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
async function load(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}
function store(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} }; new Function('require', 'module', 'exports', outputText)(require, module, module.exports); return module.exports;
}
const { markerVisual } = await load('../src/lib/map-markers.ts');
const { lookupPanorama, PanoramaUnavailable, mapsStreetViewUrl } = await load('../src/lib/street-view.ts');

test('source markers deduplicate source IDs instead of counting mentions', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  assert.deepEqual(markerVisual('source', 'CAFE', [a,a,a], () => 'real-avatar.jpg'), { kind: 'avatar', url: 'real-avatar.jpg' });
  assert.deepEqual(markerVisual('source', 'CAFE', [a,b,a,b], () => 'avatar.jpg'), { kind: 'count', count: 2 });
  assert.deepEqual(markerVisual('category', 'RESTAURANT', [a,b], () => 'avatar.jpg'), { kind: 'category', category: 'RESTAURANT' });
  assert.deepEqual(markerVisual('source', undefined, [], () => undefined), { kind: 'category', category: 'OTHER' });
  assert.deepEqual(markerVisual('source', 'SIGHTSEEING', [a], () => undefined), { kind: 'category', category: 'SIGHTSEEING' });
});
test('public panorama requests use exact saved IDs and never fall back to location', async () => {
  const requests = [];
  const service = { async getPanorama(request) { requests.push(request); return { data: { location: { pano: 'saved' }, imageDate: '2020-04' } }; } };
  assert.equal((await lookupPanorama(service, 'saved')).imageDate, '2020-04');
  assert.deepEqual(requests, [{ pano: 'saved' }]);
  await assert.rejects(lookupPanorama(service, 'expired'), PanoramaUnavailable);
  await assert.rejects(lookupPanorama({ getPanorama: async () => { throw { code: 'ZERO_RESULTS' }; } }, 'gone'), PanoramaUnavailable);
  await assert.rejects(lookupPanorama({ getPanorama: async () => { throw new Error('quota'); } }, 'saved'), /quota/);
});
test('Google Maps link carries camera values and encodes panorama ID', () => {
  const url = new URL(mapsStreetViewUrl({ panoramaId: 'pano&?+id', heading: 15, pitch: 10, zoom: 2 }));
  assert.equal(url.searchParams.get('pano'), 'pano&?+id'); assert.equal(url.searchParams.get('fov'), '45');
});
test('marker preference is SSR safe, versioned and tolerant of blocked storage', () => {
  const { useMarkerStore } = store('../src/stores/marker-store.ts');
  assert.equal(useMarkerStore.getState().mode, 'source');
  useMarkerStore.getState().hydrate();
  globalThis.localStorage = { getItem: () => 'category', setItem: (key, value) => { assert.equal(key, 'sunrei.marker-mode.v1'); assert.equal(value, 'source'); } };
  useMarkerStore.getState().hydrate(); assert.equal(useMarkerStore.getState().mode, 'category');
  useMarkerStore.getState().setMode('source');
  globalThis.localStorage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  useMarkerStore.getState().setMode('category'); useMarkerStore.getState().hydrate();
  assert.equal(useMarkerStore.getState().mode, 'category'); delete globalThis.localStorage;
});
test('Place-only selection never picks a spot; closing Roadview keeps the scene', () => {
  const { useUiStore } = store('../src/stores/ui-store.ts');
  const ui = () => useUiStore.getState();
  ui().selectSpot('p1', 's1', true);
  useUiStore.setState({ streetViewCamera: { panoramaId: 'walk', heading: 1, pitch: 2, zoom: 1 } });
  ui().closeStreetView(); assert.equal(ui().activeSpotId, 's1'); assert.equal(ui().activePlaceId, 'p1'); assert.equal(ui().streetViewCamera.panoramaId, 'walk');
  ui().selectSpot('p1', 's2', false); assert.equal(ui().streetViewCamera, null); assert.equal(ui().streetViewOpen, false);
  ui().setActivePlace('p1'); assert.equal(ui().activeSpotId, null);
  ui().selectSpot('p1', 's1', true); ui().unavailableStreetView(); assert.equal(ui().activeSpotId, 's1'); assert.equal(ui().streetViewNotice, true);
});
