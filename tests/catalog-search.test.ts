import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogQuery, catalogTargets, createCatalogSearch, mergeCatalogResults } from '../src/data/catalog-search.js';
import type { CatalogResult } from '../src/data/catalog-search.js';
import { CatalogRateLimit } from '../src/data/online.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { archiveTracks } from '../src/shared/community-catalogs.js';
import { catalogRetryDelay, decodeOpenverse } from '../src/shared/online.js';
import type { OnlineFilter, OnlineTrack } from '../src/shared/online.js';
import { startQueue } from '../src/shared/queue.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';

const jamendo = decodeOpenverse(jamendoRecording)!;
const commons = decodeOpenverse(commonsRecording)!;
const [archive] = archiveTracks('SCL108', {
  metadata: { identifier: 'SCL108', mediatype: 'audio', collection: ['netlabels', 'southern-citys-lab'],
    licenseurl: 'https://creativecommons.org/licenses/by/4.0/', creator: 'Анатолий Никулин', title: 'Газ' },
  files: [{ source: 'original', name: 'Газ.mp3', format: 'VBR MP3', title: 'Газ' }],
});

test('one normalized query starts every desktop catalog and publishes partial results without waiting', async () => {
  const calls: [string, OnlineFilter, AbortSignal][] = [];
  const settle = new Map<OnlineFilter, (rows: OnlineTrack[]) => void>();
  const search = createCatalogSearch((query, source, signal) => {
    calls.push([query, source, signal]);
    return new Promise((resolve) => settle.set(source, resolve));
  });
  const controller = new AbortController();
  const results: CatalogResult[] = [];
  const finished = search('  jazz\t café ', catalogTargets(true), controller.signal, (result) => results.push(result));
  assert.deepEqual(calls, ['all', 'netlabels', 'audius', 'southern_city'].map((source) => ['jazz café', source, controller.signal]));
  settle.get('all')!([jamendo, commons]);
  await Promise.resolve();
  assert.deepEqual(results, [{ id: 'openverse', tracks: [jamendo, commons] }], 'do not wait for Archive');
  settle.get('netlabels')!([archive]);
  settle.get('audius')!([]);
  settle.get('southern_city')!([archive]);
  await finished;
  assert.deepEqual(results.map(({ id }) => id), ['openverse', 'netlabels', 'audius', 'southern_city']);
  assert.deepEqual(mergeCatalogResults(results), [jamendo, archive, commons]);
});

test('canceled searches cannot update results or populate the cache even if a provider responds late', async () => {
  const settle: ((rows: OnlineTrack[]) => void)[] = [];
  const search = createCatalogSearch(async () => new Promise((resolve) => settle.push(resolve)));
  const controller = new AbortController();
  const results: CatalogResult[] = [];
  const old = search('jazz', catalogTargets(false), controller.signal, (result) => results.push(result));
  controller.abort();
  settle[0]([commons]);
  await old;
  assert.deepEqual(results, []);
  const next = search('jazz', catalogTargets(false), new AbortController().signal, (result) => results.push(result));
  assert.equal(settle.length, 2);
  settle[1]([jamendo]);
  await next;
  assert.deepEqual(results, [{ id: 'openverse', tracks: [jamendo] }]);
});

test('one upstream can fail or throttle without removing other results; only success is cached', async () => {
  let now = 10_000, openverseCalls = 0, archiveCalls = 0;
  const search = createCatalogSearch(async (_query, source) => {
    if (source === 'all') {
      if (++openverseCalls === 1) throw new CatalogRateLimit(4000);
      return [commons];
    }
    if (source === 'netlabels' || source === 'southern_city') { archiveCalls++; return [archive]; }
    return [];
  }, () => now);
  const run = async (query: string) => {
    const results: CatalogResult[] = [];
    await search(query, catalogTargets(true), new AbortController().signal, (row) => results.push(row));
    return results;
  };
  const limited = await run('jazz');
  assert.equal(limited.filter((row) => 'error' in row).length, 1);
  assert.deepEqual(mergeCatalogResults(limited), [archive]);
  now += 3000;
  await run('jazz');
  await run('folk');
  assert.equal(openverseCalls, 1, 'a different query or Retry click does not bypass Retry-After');
  assert.equal(archiveCalls, 4, 'successful scopes reused for the same query');
  now += 1000;
  assert.deepEqual(mergeCatalogResults(await run('jazz')), [archive, commons]);
  assert.equal(openverseCalls, 2);
  assert.equal(archiveCalls, 4);
  now += 121_000;
  await run('jazz');
  assert.equal(openverseCalls, 3);
  assert.equal(archiveCalls, 6);
});

test('search length and throttling bounds are independent of UI, and opting out survives reload', async () => {
  assert.equal(catalogQuery('...'), '');
  assert.equal(catalogQuery(' О '), '');
  assert.equal(catalogQuery('a'.repeat(300)).length, 140);
  assert.deepEqual(catalogTargets(false).map(({ id }) => id), ['openverse']);
  assert.equal(catalogRetryDelay('4'), 4000);
  assert.equal(catalogRetryDelay('0'), 1000);
  assert.equal(catalogRetryDelay('Thu, 01 Jan 1970 00:00:04 GMT', 1_000), 3000);
  assert.equal(catalogRetryDelay(null), 60_000);
  const prefs = decodePreferences(null);
  assert.equal(prefs.autoCatalogSearch, true);
  assert.equal(decodePreferences(encodePreferences({ ...prefs, autoCatalogSearch: false }, startQueue([]))).autoCatalogSearch, false);
  let started = false;
  const search = createCatalogSearch(async () => { started = true; return []; });
  await search('!', catalogTargets(true), new AbortController().signal, () => {});
  await search('jazz', catalogTargets(true), AbortSignal.abort(), () => {});
  assert.equal(started, false);
});
