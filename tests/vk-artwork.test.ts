import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchVkCover, MAX_VK_COVER, readVkCoverMeta } from '../electron/vk-artwork.js';
import { editorialPlaylist, vkPlaylistShareUrl } from '../src/shared/vk.js';

const cover = 'https://sun9-61.userapi.com/impg/example.jpg?w=400&h=400';
const publicPage = `<head><meta content='${cover.replace('&', '&amp;')}' property="og:image"></head><body></body>`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64');
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

test('VK link preview finds an official Open Graph cover without allowing third-party URLs', () => {
  assert.equal(readVkCoverMeta(publicPage), cover);
  for (const dest of ['http://sun9-61.userapi.com/example.jpg', 'https://sun9-61.userapi.com.evil.test/a.jpg', 'https://127.0.0.1/private',
    'https://sun9-61.userapi.com:1234/a', 'https://evil.test@sun9-61.userapi.com/a', 'file:///tmp/a.jpg']) {
    assert.equal(readVkCoverMeta(`<head><meta property="og:image" content="${dest}"></head>`), undefined);
  }
  assert.equal(readVkCoverMeta(`<head><!--${publicPage}--></head>`), undefined);
  assert.equal(readVkCoverMeta(`<head></head><body><meta property="og:image" content="${cover}"></body>`), undefined);
});

test('VK cover reader requests only the public share page and a bounded raster image', async () => {
  const requests: string[] = [];
  const actual = await fetchVkCover(editorialPlaylist, async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return requests.length === 1 ? html(publicPage) : new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  assert.deepEqual(requests, [vkPlaylistShareUrl(editorialPlaylist), cover]);
  assert.equal(actual?.mime, 'image/png');
  assert.deepEqual(actual && Buffer.from(actual.bytes), png);
});

test('VK cover reader falls back on unavailable metadata, non-images, and oversized image bodies', async () => {
  const invalid = { ...editorialPlaylist, hash: 'https://other.test' };
  let count = 0;
  assert.equal(await fetchVkCover(invalid, async () => { count++; return html(''); }), null);
  assert.equal(count, 0);
  assert.equal(await fetchVkCover(editorialPlaylist, async () => { count++; return html('Please sign in'); }), null);
  assert.equal(count, 1);
  assert.equal(await fetchVkCover(editorialPlaylist, async () => html(publicPage, 403)), null);
  const spoofed = new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { headers: { 'Content-Type': 'image/png' } });
  assert.equal(await fetchVkCover(editorialPlaylist, async (url) => url === cover ? spoofed : html(publicPage)), null);
  const large = new Response(new Uint8Array(MAX_VK_COVER + 1), { headers: { 'Content-Type': 'image/webp' } });
  assert.equal(await fetchVkCover(editorialPlaylist, async (url) => url === cover ? large : html(publicPage)), null);
});
