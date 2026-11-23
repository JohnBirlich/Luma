import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVkNowPlaying, vkArtworkUrl } from '../src/shared/vk-site.js';
import { MAX_VK_ARTWORK_BYTES, fetchVkArtwork } from '../electron/vk-artwork.js';

const src = 'https://sun9-72.userapi.com/impg/music-fixture?size=720x720&quality=95&sign=test';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('VK art accepts only raster routes on numbered VK image servers', () => {
  assert.equal(vkArtworkUrl(src), src);
  assert.equal(vkArtworkUrl('https://sun9.userapi.com/s/v1/if1/example.jpg'), 'https://sun9.userapi.com/s/v1/if1/example.jpg');
  for (const url of [null, {}, 'data:image/png;base64,AA', 'blob:https://vk.ru/example', 'https://vk.ru/audio',
    'http://sun9.userapi.com/art.jpg', 'https://sun9.userapi.com.invalid/impg/music-fixture', 'https://sun9.userapi.com:433/art.jpg',
    'https://img.userapi.com/art.jpg', 'https://user@sun9.userapi.com/art.jpg', 'https://sun9.userapi.com/art.svg',
    'https://sun9.userapi.com/impg/%2f%2f..', 'https://sun9.userapi.com/%2Fart.jpg', 'https://sun9.userapi.com/art.jpg#asset',
    'https://sun9.userapi.com/impg/art.jpg?access_token=private', 'https://sun9.userapi.com/impg/art.jpg?u=' + 'x'.repeat(3000)]) {
    assert.equal(vkArtworkUrl(url), undefined, String(url));
  }
});

test('VK art is a bounded, no-cookie, no-referrer raster fetch with redirects disabled', async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(await fetchVkArtwork(async (url, init) => {
    assert.equal(url, src);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.signal, signal);
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  }, src, signal), { bytes: png, mime: 'image/png' });
  await fetchVkArtwork(async () => assert.fail('must not fetch unknown origin'), 'https://invalid.test/foo.jpg', signal);
  for (const response of [Response.redirect('https://invalid.test/image.png'), new Response(png, { headers: { 'Content-Type': 'image/jpeg' } }),
    new Response(png, { headers: { 'Content-Type': 'image/svg+xml' } }), new Response(null, { status: 404 }),
    new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(MAX_VK_ARTWORK_BYTES + 1) } }),
    new Response(new Uint8Array(MAX_VK_ARTWORK_BYTES + 1), { headers: { 'Content-Type': 'image/png' } })]) {
    assert.equal(await fetchVkArtwork(async () => response, src, signal), undefined);
  }
  const cancelled = AbortSignal.abort();
  assert.equal(await fetchVkArtwork(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }), src, cancelled), undefined);
});

test('VK player options exist only when backed by a recognized capability', () => {
  const playable = { title: 'Трек', artist: 'VK', toggle: true };
  const track = readVkNowPlaying({ ...playable, shuffle: false, favorite: false, repeat: 'one', volume: 0 });
  assert.equal(track?.shuffle, false);
  assert.equal(track?.favorite, false);
  assert.equal(track?.repeat, 'one');
  assert.equal(track?.volume, 0);
  for (const volume of [-1, 1.5, '0.4', Infinity]) {
    const omitted = readVkNowPlaying({ ...playable, volume, repeat: true, favorite: 'false', shuffle: 1 });
    assert.equal(omitted?.volume, undefined);
    assert.equal(omitted?.repeat, undefined);
    assert.equal(omitted?.favorite, undefined);
    assert.equal(omitted?.shuffle, undefined);
  }
});
