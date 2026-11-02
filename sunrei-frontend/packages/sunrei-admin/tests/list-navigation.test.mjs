import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/list-navigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { listQueryUrl, listPage, listReturnTarget, openFromList, rememberListReturn, returnToList } =
  await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

function harness(href, state = { __NA: true, tree: ['app'] }) {
  const entries = [{ href, state }];
  let index = 0;
  const calls = [];
  const browser = {
    location: { href },
    history: {
      get state() { return structuredClone(entries[index].state); },
      replaceState(state, _, url) {
        browser.location.href = new URL(url, browser.location.href).href;
        entries[index] = { href: browser.location.href, state: structuredClone(state) };
      },
    },
  };
  const router = {
    push(url) {
      calls.push('push');
      const href = new URL(url, browser.location.href).href;
      entries.splice(++index, entries.length, { href, state: { __NA: true, tree: ['detail'] } });
      browser.location.href = href;
    },
    replace(url) {
      calls.push('replace');
      browser.history.replaceState({ __NA: true }, '', url);
    },
    back() {
      calls.push('back');
      assert.ok(index > 0, 'must not leave the app from a direct link');
      browser.location.href = entries[--index].href;
    },
  };
  return { browser, router, entries, calls };
}

test('query edits preserve other filters, unrelated parameters and the hash', () => {
  const first = listQueryUrl('https://admin.test/sunreis?status=drafts&type=YOUTUBE&extra=keep#list', 'q', '서울 식당');
  const url = new URL(first, 'https://admin.test');
  assert.equal(url.searchParams.get('q'), '서울 식당');
  assert.equal(url.searchParams.get('status'), 'drafts');
  assert.equal(url.searchParams.get('type'), 'YOUTUBE');
  assert.equal(url.searchParams.get('extra'), 'keep');
  assert.equal(url.hash, '#list');
  const cleared = new URL(listQueryUrl(url.href, 'q', ''), url);
  assert.equal(cleared.searchParams.has('q'), false);
  assert.equal(cleared.searchParams.get('status'), 'drafts');
});

test('page parsing rejects malformed, negative, fractional and unsafe values', () => {
  for (const input of [null, '', '0', '-1', '1.5', '2e2', 'Infinity', '9007199254740992']) {
    assert.equal(listPage(input), 0, String(input));
  }
  assert.equal(listPage('1'), 0);
  assert.equal(listPage('3'), 2);
});

test('return destinations are restricted to the corresponding internal list', () => {
  assert.equal(listReturnTarget('/tags?page=3#row', '/tags'), '/tags?page=3#row');
  for (const candidate of ['https://evil.test/tags', '//evil.test/tags', '/sunreis', '/tags/42', '/\\evil.test/tags', 'javascript:alert(1)']) {
    assert.equal(listReturnTarget(candidate, '/tags'), '/tags');
  }
});

test('Cancel or Save returns to the filtered list without adding another entry', () => {
  const h = harness('https://admin.test/sunreis?q=food&status=drafts&type=YOUTUBE');
  openFromList(h.browser, h.router, '/sunreis/42/edit', '/sunreis');
  const detail = new URL(h.browser.location.href);
  assert.equal(detail.searchParams.get('returnTo'), '/sunreis?q=food&status=drafts&type=YOUTUBE');
  rememberListReturn(h.browser, '/sunreis');
  assert.equal(h.browser.history.state.__NA, true);
  assert.deepEqual(h.browser.history.state.tree, ['detail']);
  returnToList(h.browser, h.router, '/sunreis');
  assert.equal(h.browser.location.href, h.entries[0].href);
  assert.deepEqual(h.calls, ['push', 'back']);
  assert.equal(h.entries.length, 2);
});

test('creating a Source also returns to its originating search', () => {
  const h = harness('https://admin.test/sources?q=secret');
  openFromList(h.browser, h.router, '/sources/new', '/sources');
  returnToList(h.browser, h.router, '/sources');
  assert.equal(new URL(h.browser.location.href).searchParams.get('q'), 'secret');
  assert.deepEqual(h.calls, ['push', 'back']);
});

test('a direct edit link replaces itself with its validated list destination', () => {
  const h = harness('https://admin.test/tags/42?returnTo=%2Ftags%3Fpage%3D3');
  returnToList(h.browser, h.router, '/tags');
  assert.equal(h.browser.location.href, 'https://admin.test/tags?page=3');
  assert.deepEqual(h.calls, ['replace']);
  assert.equal(h.entries.length, 1);
});

test('a pasted edit link without a return target falls back to its list', () => {
  const h = harness('https://admin.test/sources/42/edit');
  returnToList(h.browser, h.router, '/sources');
  assert.equal(h.browser.location.href, 'https://admin.test/sources');
  assert.deepEqual(h.calls, ['replace']);
});

test('reload retains a recorded list origin, while copied URLs do not claim one', () => {
  const h = harness('https://admin.test/tags?page=3');
  openFromList(h.browser, h.router, '/tags/42', '/tags');
  rememberListReturn(h.browser, '/tags');
  const url = h.browser.location.href;
  const state = structuredClone(h.browser.history.state);
  h.browser.history.replaceState(state, '', url); // A reload preserves native history state.
  returnToList(h.browser, h.router, '/tags');
  assert.equal(h.calls.at(-1), 'back');
  const copied = harness(url);
  returnToList(copied.browser, copied.router, '/tags');
  assert.deepEqual(copied.calls, ['replace']);
});
