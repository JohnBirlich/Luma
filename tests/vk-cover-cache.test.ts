import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { MAX_VK_COVERS, VkCoverCache, vkCoverKey } from '../electron/vk-cover-cache.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 5, 6]);

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'luma-vk-covers-'));
  return { dir, cache: new VkCoverCache(() => dir) };
}

test('a VK cover is stored under an opaque key and served back with its own type', async () => {
  const { dir, cache } = await workspace();
  try {
    const key = vkCoverKey('https://sun9-42.userapi.com/impg/luma-fixture-cover.webp?size=640x640&sign=fixture');
    assert.match(key, /^[a-f0-9]{32}$/);
    assert.notEqual(key, vkCoverKey('https://sun9-42.userapi.com/s/v1/luma-fixture-inline.webp'));
    await cache.put(key, { bytes: png, mime: 'image/png' });
    await cache.put(vkCoverKey('webp'), { bytes: webp, mime: 'image/webp' });
    assert.deepEqual(await cache.get(key), { bytes: png, mime: 'image/png' });
    assert.deepEqual(await cache.get(vkCoverKey('webp')), { bytes: webp, mime: 'image/webp' });
    assert.equal(await cache.get('a'.repeat(32)), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the cover cache refuses foreign keys, mismatched bytes and oversized images', async () => {
  const { dir, cache } = await workspace();
  try {
    for (const key of ['', 'https://sun9-42.userapi.com/a.webp', 'a'.repeat(31), 'A'.repeat(32), 'z'.repeat(32), '../etc/passwd']) {
      assert.equal(await cache.get(key), undefined, key);
      await cache.put(key, { bytes: png, mime: 'image/png' });
    }
    assert.deepEqual(await readdir(dir), []);
    // Declared type must match the actual signature, and the size stays bounded.
    await cache.put(vkCoverKey('mismatch'), { bytes: png, mime: 'image/webp' });
    await cache.put(vkCoverKey('huge'), { bytes: new Uint8Array(512 * 1024 + 1), mime: 'image/png' });
    await cache.put(vkCoverKey('text'), { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' });
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the on-disk cover cache keeps a bounded number of the newest listens', async () => {
  const { dir, cache } = await workspace();
  try {
    for (let index = 0; index < MAX_VK_COVERS + 12; index++) await cache.put(vkCoverKey(`track-${index}`), { bytes: png, mime: 'image/png' });
    let files = await readdir(dir);
    for (let attempt = 0; attempt < 40 && files.length > MAX_VK_COVERS; attempt++) { await delay(25); files = await readdir(dir); }
    assert.equal(files.length, MAX_VK_COVERS);
    const newest = vkCoverKey(`track-${MAX_VK_COVERS + 11}`);
    assert.ok(files.includes(`${newest}.png`), 'the latest listen keeps its cover');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
