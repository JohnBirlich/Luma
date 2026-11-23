import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVkNowPlaying, vkArtworkPixels, vkArtworkUrl } from '../src/shared/vk-site.js';
import { MAX_VK_ARTWORK_BYTES, fetchVkArtwork } from '../electron/vk-artwork.js';

const src = 'https://sun9-72.userapi.com/impg/music-fixture?size=720x720&quality=95&sign=test';
const photo = 'https://sun9-104.vkuserphoto.ru/impg/music-fixture.jpg?size=200x200&quality=95&sign=test&c_uniq_tag=test&type=album';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('VK art accepts only raster routes on numbered VK image servers', () => {
  assert.equal(vkArtworkUrl(src), src);
  assert.equal(vkArtworkUrl(photo), photo);
  const cdn = 'https://sun1-7.vkuserphoto.ru/s/v1/ig2/current.jpg?as=80x80,160x160&cs=160x160';
  assert.equal(vkArtworkUrl(cdn), cdn);
  assert.equal(vkArtworkUrl('https://sun9-72.userapi.com/s/v1/ig2/track-cover?from=bu&cs=400x400'), 'https://sun9-72.userapi.com/s/v1/ig2/track-cover?from=bu&cs=400x400');
  assert.equal(vkArtworkUrl('https://sun9.userapi.com/s/v1/if1/example.jpg'), 'https://sun9.userapi.com/s/v1/if1/example.jpg');
  for (const url of [null, {}, 'data:image/png;base64,AA', 'blob:https://vk.ru/example', 'https://vk.ru/audio',
    'http://sun9.userapi.com/art.jpg', 'https://sun9.userapi.com.invalid/impg/music-fixture', 'https://sun9.userapi.com:433/art.jpg',
    'https://img.userapi.com/art.jpg', 'https://user@sun9.userapi.com/art.jpg', 'https://sun9.userapi.com/art.svg',
    'https://sun9.userapi.com/impg/%2f%2f..', 'https://sun9.userapi.com/%2Fart.jpg', 'https://sun9.userapi.com/art.jpg#asset',
    'https://sun9.vkuserphoto.ru.invalid/impg/music-fixture.jpg', 'https://img.vkuserphoto.ru/impg/music-fixture.jpg',
    'https://sun9.vkuserphoto.ru/audio/file.jpg', 'https://sun9.vkuserphoto.ru/impg/animated.gif',
    'https://sun9.vkuserphoto.ru/impg/music-fixture.jpg?url=https://example.invalid/',
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
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  assert.deepEqual(await fetchVkArtwork(async (url, init) => {
    assert.equal(url, photo);
    assert.equal(init.credentials, 'omit');
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
  }, photo, signal), { bytes: jpeg, mime: 'image/jpeg' });
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
  const track = readVkNowPlaying({ ...playable, shuffle: false, favorite: false, repeat: 'one', volume: 0, canMute: true });
  assert.equal(track?.shuffle, false);
  assert.equal(track?.favorite, false);
  assert.equal(track?.repeat, 'one');
  assert.equal(track?.volume, 0);
  assert.equal(track?.canMute, true);
  assert.equal(readVkNowPlaying({ ...playable, volume: 1 })?.canMute, false);
  for (const volume of [-1, 1.5, '0.4', Infinity]) {
    const omitted = readVkNowPlaying({ ...playable, volume, repeat: true, favorite: 'false', shuffle: 1 });
    assert.equal(omitted?.volume, undefined);
    assert.equal(omitted?.repeat, undefined);
    assert.equal(omitted?.favorite, undefined);
    assert.equal(omitted?.shuffle, undefined);
  }
});

test('VK art advertises the rendition it carries so the sharpest one is kept', () => {
  assert.equal(vkArtworkPixels(src), 720);
  assert.equal(vkArtworkPixels(photo), 200);
  assert.equal(vkArtworkPixels('https://sun1-7.vkuserphoto.ru/s/v1/ig2/current.jpg?as=80x80,160x160&cs=160x160'), 160);
  assert.equal(vkArtworkPixels('https://sun9-42.userapi.com/s/v1/luma-fixture-inline.webp'), 0);
  assert.equal(vkArtworkPixels('https://sun9-42.userapi.com/s/v1/ig2/track-cover?from=bu&cs=1080x1080'), 1080);
  for (const value of [null, 42, {}, 'https://sun9.userapi.com/impg/art.jpg?size=big', 'https://sun9.userapi.com/impg/art.jpg?size=0x0']) {
    assert.equal(vkArtworkPixels(value), 0, String(value));
  }
});

test('VK feedback pair is read from the rendered player, not assumed', () => {
  const playable = { title: 'Трек', artist: 'VK', toggle: true };
  assert.equal(readVkNowPlaying({ ...playable, liked: true, disliked: false })?.liked, true);
  assert.equal(readVkNowPlaying({ ...playable, liked: true, disliked: false })?.disliked, false);
  assert.equal(readVkNowPlaying({ ...playable, liked: 'true', disliked: 1 })?.liked, undefined);
  assert.equal(readVkNowPlaying({ ...playable, liked: 'true', disliked: 1 })?.disliked, undefined);
});
