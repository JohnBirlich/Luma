import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveTracks, communitySearchUrl, createCommunitySearch, searchCommunity } from '../src/shared/community-catalogs';
import { isOnlineExternalUrl, readOnlineShelf, readOnlineTrack } from '../src/shared/online';

const netlabel = { metadata: { identifier: 'SCL108', mediatype: 'audio', collection: ['netlabels', 'southern-citys-lab'],
  licenseurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/', creator: 'Анатолий Никулин', title: 'Газ' },
  files: [{ source: 'original', format: 'VBR MP3', name: '01 - Газ.mp3', title: 'Газ', length: '285.05', genre: 'Avantgarde' }] };
test('Netlabels uses only public CC releases and their own original tagged MP3 files', () => {
  const [track] = archiveTracks('SCL108', netlabel);
  assert.equal(track.title, 'Газ');
  assert.equal(track.audioUrl, 'https://archive.org/download/SCL108/01%20-%20%D0%93%D0%B0%D0%B7.mp3');
  assert.deepEqual(readOnlineShelf([track]), [track]);
  assert.ok(isOnlineExternalUrl(track.online.page));
  assert.deepEqual(archiveTracks('SCL108', { ...netlabel, metadata: { ...netlabel.metadata, access_restricted_item: 'true' } }), []);
  assert.deepEqual(archiveTracks('SCL108', { ...netlabel, metadata: { ...netlabel.metadata, licenseurl: '' } }), []);
  assert.deepEqual(archiveTracks('SCL108', { ...netlabel, files: [{ ...netlabel.files[0], name: 'nested/file.mp3' }] }), []);
  assert.equal(readOnlineTrack({ ...track, audioUrl: track.audioUrl.replace('SCL108', 'SCL109') }), undefined);
  assert.equal(readOnlineTrack({ ...track, audioUrl: 'https://archive.org/download/SCL108/a%2Fb.mp3' }), undefined);
});

test('archive lookup uses literal terms, deduplicates release ids and rejects arbitrary metadata URLs', async () => {
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    return Response.json(urls.length === 1 ? { response: { docs: [{ identifier: 'SCL108' }, { identifier: '../secrets' }, { identifier: 'SCL108' }] } } : netlabel);
  };
  const target = communitySearchUrl('Газ) OR collection:movies', 'netlabels');
  assert.equal(target.searchParams.get('q'), 'collection:netlabels AND mediatype:audio AND licenseurl:* AND ("Газ" AND "OR" AND "collection" AND "movies")');
  const results = await searchCommunity(fetcher, 'Газ', 'netlabels', new AbortController().signal);
  assert.equal(results.length, 1);
  assert.equal(urls[1], 'https://archive.org/metadata/SCL108');
  assert.equal(urls.length, 2);
});

test('Russia label selection is a scoped collection, and archive metadata must confirm it', () => {
  assert.match(communitySearchUrl('Газ', 'southern_city').searchParams.get('q')!, /^collection:southern-citys-lab /);
  assert.equal(archiveTracks('SCL108', netlabel, 'southern_city').length, 1);
  assert.deepEqual(archiveTracks('SCL108', { ...netlabel, metadata: { ...netlabel.metadata, collection: 'netlabels' } }, 'southern_city'), []);
});

test('IPC search scopes run concurrently and only their own latest requests replace each other', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const signals: AbortSignal[] = [];
  const catalog = createCommunitySearch(async (url, init) => {
    const signal = init!.signal!;
    if (url.startsWith('https://archive.org/metadata/')) return Response.json(netlabel);
    signals.push(signal);
    await gate;
    signal.throwIfAborted();
    return Response.json({ response: { docs: [{ identifier: 'SCL108' }] } });
  });
  const wide = catalog.search(1, 'джаз', 'netlabels');
  const label = catalog.search(2, 'Газ', 'southern_city');
  assert.deepEqual(signals.map((signal) => signal.aborted), [false, false]);
  assert.deepEqual(await catalog.search(3, '../', 'netlabels'), []);
  const latest = catalog.search(3, 'Газ', 'netlabels');
  assert.deepEqual(signals.map((signal) => signal.aborted), [true, false, false]);
  catalog.cancel(1);
  assert.deepEqual(signals.map((signal) => signal.aborted), [true, false, false]);
  release();
  await assert.rejects(wide, { name: 'AbortError' });
  assert.equal((await label)[0].title, 'Газ');
  assert.equal((await latest)[0].title, 'Газ');

  const canceled = catalog.search(4, 'Газ', 'netlabels');
  const unaffected = catalog.search(5, 'Газ', 'southern_city');
  catalog.cancel(4);
  await assert.rejects(canceled, { name: 'AbortError' });
  assert.equal((await unaffected)[0].title, 'Газ');
});

test('Archive Retry-After is respected across both scopes', async () => {
  let now = 10_000, calls = 0;
  const catalog = createCommunitySearch(async () => ++calls === 1
    ? new Response(null, { status: 429, headers: { 'Retry-After': '8' } })
    : Response.json({ response: { docs: [] } }), () => now);
  await assert.rejects(catalog.search(1, 'jazz', 'netlabels'), /недоступен/);
  await assert.rejects(catalog.search(2, 'Газ', 'southern_city'), /недоступен/);
  assert.equal(calls, 1);
  now += 8000;
  assert.deepEqual(await catalog.search(3, 'Газ', 'southern_city'), []);
  assert.equal(calls, 2);
});
