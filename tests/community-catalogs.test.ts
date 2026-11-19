import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveTracks, communitySearchUrl, searchCommunity } from '../src/shared/community-catalogs';
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
