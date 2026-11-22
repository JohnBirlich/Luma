import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StreamCache } from '../electron/stream-cache';
import { decodeOpenverse } from '../src/shared/online';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';

const release = (id: string, filename: string) => ({ ...commonsRecording, id,
  url: `https://upload.wikimedia.org/wikipedia/commons/e/e1/${filename}.mp3` });
const first = release(commonsRecording.id, 'song1'), next = release('61a70211-e1f3-48a9-834b-b196122c5bc1', 'song2');

test('bounded opt-in cache re-resolves Commons rights, evicts oldest, retains offline data across opens and clears without fetching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'luma-cache-'));
  try {
    const bytes = await readFile(new URL('../public/demo/night-garage.mp3', import.meta.url));
    let lookups = 0, files = 0, prohibited = true;
    const mocks = async (url: string, init?: RequestInit) => {
      assert.equal(init?.redirect, 'error');
      if (url.startsWith('https://api.openverse.org')) {
        lookups++;
        return Response.json(url.includes(first.id) ? first : next);
      }
      files++;
      return new Response(bytes, { headers: { 'Cache-Control': prohibited ? 'private, max-age=3600' : 'public' } });
    };
    const cache = await StreamCache.open(root, mocks, bytes.length * 1.5);
    const record = decodeOpenverse(first)!, second = decodeOpenverse(next)!;
    assert.equal(await cache.url(record), null);
    assert.equal(files + lookups, 0);
    assert.equal(await cache.save(decodeOpenverse(jamendoRecording)), false);
    assert.equal(await cache.save({ ...record, audioUrl: second.audioUrl }), false);
    assert.equal(files, 0);
    assert.equal(await cache.save(record), false);
    prohibited = false;
    assert.equal(await cache.save(record), true);
    assert.match((await cache.url(record))!, /^luma:\/\/app\/media\/cache\/[a-f0-9]{64}$/);
    assert.equal(await cache.save(record), true);
    assert.equal(files, 2);
    assert.equal(await cache.save(second), true);
    assert.equal(await cache.url(record), null);
    const reopened = await StreamCache.open(root, async () => { throw new Error('offline'); });
    assert.equal(await reopened.url(second), await cache.url(second));
    assert.deepEqual(reopened.info(), { count: 1, bytes: bytes.length });
    assert.deepEqual(await reopened.clear(), { count: 0, bytes: 0 });
    assert.equal(await reopened.url(second), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
