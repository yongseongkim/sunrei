import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/sunrei-thumbnails.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { sunreiThumbnailCandidates, youtubeThumbnail } =
  await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const image = url => ({ images: [{url, width:320, height:180}] });

test('a saved playlist cover takes priority over an arbitrary video or place image', () => {
  const cover = 'https://i.ytimg.com/playlist-cover.jpg';
  const candidates = sunreiThumbnailCandidates({
    images:[{images:[{url:cover}]}], link:'https://www.youtube.com/playlist?list=PLtest',
    spots:[{images:[image('/place.jpg')],sourceLink:'https://youtu.be/abcdefghijk'}],
  });
  assert.equal(candidates[0],cover);
});

test('use saved content, then spot, video and source images without duplicates', () => {
  const sunrei = {
    images:[image('/cover.jpg')],
    spots:[{images:[image('/spot.jpg')], sourceLink:'https://youtu.be/abcdefghijk'}],
    link:'https://www.youtube.com/watch?v=abcdefghijk',
    source:{posterImage:image('/profile.jpg')},
  };
  assert.deepEqual(sunreiThumbnailCandidates(sunrei), [
    '/cover.jpg','/spot.jpg','https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg','/profile.jpg',
  ]);
});

test('an empty Sunrei cover still uses an Instagram spot or a channel poster', () => {
  assert.deepEqual(sunreiThumbnailCandidates({images:[],spots:[{images:[image('/instagram.jpg')]}]}), ['/instagram.jpg']);
  assert.deepEqual(sunreiThumbnailCandidates({source:{posterImage:image('/poster.jpg')}}), ['/poster.jpg']);
  assert.deepEqual(sunreiThumbnailCandidates({images:[{images:[]}],spots:[],source:{}}), []);
});

test('prefer an adequate small image but retain other sizes for load failure fallback', () => {
  const sizes = {images:[{url:'/large.jpg',width:1200},{url:'/tiny.jpg',width:80},{url:'/small.jpg',width:240},{url:'  '}]};
  const original = structuredClone(sizes);
  assert.deepEqual(sunreiThumbnailCandidates({images:[sizes]}), ['/small.jpg','/large.jpg','/tiny.jpg']);
  assert.deepEqual(sizes,original);
});

test('recognize actual watch, shorts, embed, live and short YouTube video links', () => {
  for (const url of [
    'https://www.youtube.com/watch?list=PLtest&v=abcdefghijk&t=90',
    'https://youtu.be/abcdefghijk?t=10',
    'https://m.youtube.com/shorts/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://www.youtube.com/live/abcdefghijk',
  ]) assert.equal(youtubeThumbnail(url),'https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg');
});

test('do not fabricate thumbnails for playlists, channels, malformed links or lookalike hosts', () => {
  for (const url of [
    null,'','not a URL','https://www.youtube.com/playlist?list=PLtest',
    'https://www.youtube.com/@channel','https://evil.test/watch?v=abcdefghijk',
    'https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtu.be/abcdefghijkEXTRA',
    'https://www.youtube.com/watch?v=short',
  ]) assert.equal(youtubeThumbnail(url),null);
});
