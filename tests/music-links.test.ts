import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '../src/shared/media.js';
import { musicLaunchUrl, musicLinkArgument, readMusicLink } from '../src/shared/music-links.js';
import { buildSharedPlaylist, readSharedPlaylist } from '../src/shared/playlist-share.js';
import { playlistImportFormat, previewPlaylist, readPlaylistImport } from '../src/shared/playlist-import.js';

test('music links canonicalize official tracks, playlists, and Windows handoffs', () => {
  const vk = readMusicLink('https://vk.com/audio?z=audio_playlist-102_555%2Fpublic12&utm_source=share');
  assert.deepEqual(vk, { provider: 'vk', kind: 'playlist', url: 'https://vk.ru/music/playlist/-102_555_public12' });
  assert.deepEqual(readMusicLink('https://vk.com/music/track/-102_555?key=discarded'), { provider: 'vk', kind: 'track', url: 'https://vk.ru/audio-102_555' });
  const yandex = readMusicLink('https://music.yandex.ru/album/123/track/456?utm_campaign=share#play');
  assert.deepEqual(yandex, { provider: 'yandex', kind: 'track', url: 'https://music.yandex.ru/album/123/track/456' });
  assert.equal(readMusicLink('https://music.yandex.com/users/test.playlists/playlists/104')?.kind, 'playlist');
  assert.equal(readMusicLink('https://openverse.org/audio/00000000-0000-0000-0000-0000000000AB')?.url, 'https://openverse.org/audio/00000000-0000-0000-0000-0000000000ab/');
  const uri = musicLaunchUrl(vk!);
  assert.deepEqual(readMusicLink(uri), vk);
  assert.equal(musicLinkArgument(['--test', uri]), vk!.url);
  assert.equal(musicLinkArgument([yandex!.url]), undefined, 'does not intercept browser HTTPS links');
});

test('URL boundary refuses lookalike hosts, local media URLs and malformed parameters', () => {
  const good = 'https://vk.ru/audio1_2';
  for (const url of [
    'https://vk.ru.evil.invalid/audio1_2', 'https://vk.ru@evil.invalid/audio1_2', 'https://name:pass@vk.ru/audio1_2', 'https://vk.ru:3/audio1_2',
    'https://vk.ru/audio?z=audio1_2&z=audio1_3', 'luma://app/media/audio/1', 'https://music.yandex.ru/album/1/track/2%2F..',
    'https://music.yandex.ru\\@evil.invalid/album/1/track/2', 'https://music.yandex.ru/search?text=title', 'http://vk.ru/audio1_2',
    `luma-player://open/?url=${encodeURIComponent(good)}&url=${encodeURIComponent(good)}`, 'luma-player://open/?url=file:///C:/a.exe',
    `luma-player://open/?url=${encodeURIComponent(good)}#anything`, `luma-player://unknown?url=${encodeURIComponent(good)}`,
    `luma-player://open/doc?url=${encodeURIComponent(good)}`, 'https://vk.ru/audio\n1_2',
  ]) assert.equal(readMusicLink(url), undefined, url);
});

const file: Track = { id: 'uuid', title: 'Песня', artist: 'Автор', album: 'Альбом', duration: 220.04, isrc: 'USABC0100002',
  audioUrl: 'file:///C:/Secret/audio/1.mp3', artworkUrl: 'https://example.net/cover?token=secret', fileName: 'private.mp3' };

test('portable playlist files export metadata only, then enter the normal reviewed import', () => {
  const share = buildSharedPlaylist('Вечер', [file, { ...file, id: 'audius-Abc' }, { ...file, demo: true }]);
  assert.deepEqual(share, { format: 'luma-playlist', version: 1, title: 'Вечер', tracks: [{ title: file.title, artist: file.artist,
    album: file.album, duration: 220, isrc: file.isrc }] });
  assert.ok(!JSON.stringify(share).match(/url|fileName|secret|uuid|audius/i));
  const name = 'test.luma.json';
  const [draft] = readPlaylistImport(new TextEncoder().encode(JSON.stringify(share)), playlistImportFormat(name)!, name);
  const live = { ...file, id: 'live', duration: 190, isrc: 'USABC0100001' };
  assert.deepEqual(previewPlaylist(draft, [live, file]).items, [file]);
  assert.equal(previewPlaylist(draft, [live]).rows[0].status, 'unmatched');
  assert.equal(readSharedPlaylist({ ...share, version: 2 }), undefined);
  assert.equal(readSharedPlaylist({ ...share, tracks: Array(101).fill(file) }), undefined);
});
