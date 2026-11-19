import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveTracks, communitySearchUrl, mixterResults, searchCommunity } from '../src/shared/community-catalogs';
import { isOnlineExternalUrl, readOnlineShelf, readOnlineTrack } from '../src/shared/online';

const netlabel = { metadata: { identifier: 'SCL108', mediatype: 'audio', collection: ['netlabels', 'southern-citys-lab'],
  licenseurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/', creator: 'Анатолий Никулин', title: 'Газ' },
  files: [{ source: 'original', format: 'VBR MP3', name: '01 - Газ.mp3', title: 'Газ', length: '285.05', genre: 'Avantgarde' }] };
const ccTrack = { upload_name: 'reFramed', user_name: 'airtone', upload_extra: { nsfw: false }, upload_tags: ',remix,media,',
  license_url: 'http://creativecommons.org/licenses/by-nc/3.0/', file_page_url: 'https://ccmixter.org/files/airtone/71367',
  files: [{ file_order: 0, file_is_remote: 0, file_format_info: { mime_type: 'audio/mpeg', ps: '2:36' }, download_url: 'https://ccmixter.org/content/airtone/airtone_-_reFramed.mp3' }] };

test('ccMixter only returns licensed, non-explicit full MP3 mixes at the author path', () => {
  const [track] = mixterResults([ccTrack, { ...ccTrack, upload_extra: { nsfw: true } }, { ...ccTrack, upload_tags: ',samples,media,' }]);
  assert.equal(track.id, 'ccmixter-71367');
  assert.equal(track.duration, 156);
  assert.equal(track.online.license, 'CC BY-NC 3.0');
  assert.deepEqual(readOnlineShelf([track, track]), [track]);
  assert.equal(readOnlineTrack({ ...track, audioUrl: 'https://ccmixter.org/content/other/test.mp3' }), undefined);
  assert.equal(readOnlineTrack({ ...track, id: 'ccmixter-71368' }), undefined);
  assert.ok(isOnlineExternalUrl(track.online.page));
});

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
