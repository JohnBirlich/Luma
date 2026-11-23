import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVkShareLink, vkPlaylistUrl, VK_MUSIC_URL } from '../src/shared/vk.js';
import { readMusicLink, musicLinkArgument } from '../src/shared/music-links.js';
import { readVkNowPlaying, readVkPosition, vkMusicPage, vkMusicSearchUrl, vkSeekRatio, vkSignInPage, vkSignInUrl, vkSiteEntry, vkSiteUrl, vkViewBounds } from '../src/shared/vk-site.js';

import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';

test('old VK layout preferences are ignored without losing the rest of the profile', () => {
  for (const vkSiteAppearance of ['standard', 'profile', 'minimal', { css: 'display: none' }]) {
    const preferences = decodePreferences(JSON.stringify({ vkSiteAppearance, volume: .42 }));
    assert.equal(preferences.volume, .42);
    assert.ok(!('vkSiteAppearance' in preferences));
    assert.doesNotMatch(encodePreferences(preferences, startQueue([])), /vkSiteAppearance/);
  }
});

test('VK entry accepts canonical music pages and bounded literal searches, not auth URLs, snippets or arbitrary redirects', () => {
  const search = vkMusicSearchUrl('  Руки Вверх — Я не отдам  &   #1  ');
  assert.equal(new URL(search!).searchParams.get('q'), 'Руки Вверх — Я не отдам & #1');
  assert.equal(new URL(search!).searchParams.size, 1);
  assert.equal(vkMusicSearchUrl('x'.repeat(141)), undefined);
  for (const url of [VK_MUSIC_URL, search, 'https://vk.ru/audio-42_4', 'https://vk.ru/music/playlist/-31_4_aShare']) assert.ok(vkSiteEntry(url), url);
  for (const url of [
    'https://vk.ru/', 'https://id.vk.ru/auth', 'https://vk.ru/audio-42_4?private=1', 'https://vk.ru/audio?q=jazz&q=other',
    'https://vk.com/audio', 'https://vk.ru/away.php?url=https://example.test', 'https://vk.ru/widget_playlist.php?oid=3&pid=4&hash=example',
    '<script>VK.Widgets.Playlist("p", 3, 4, "fixture")</script>',
  ]) assert.equal(vkSiteEntry(url), false, url);
});

test('native navigation stays first-party; the playback adapter never runs on a login page', () => {
  for (const url of ['https://vk.ru/feed', 'https://oauth.vk.com/authorize', 'https://id.vk.ru/auth?state=fixture', 'https://login.vk.com/', 'https://m.vk.com/audio']) assert.ok(vkSiteUrl(url), url);
  for (const url of ['https://vk.ru.evil.test/audio', 'https://vk.ru@evil.test/audio', 'https://user:pass@vk.ru/audio', 'https://vk.ru:80/audio',
    'https://vk.ru\\@evil.test/audio', 'http://vk.ru/audio', 'https://vk.ru/away.php?to=https://example.test',
    'file:///C:/Windows', 'luma://app/', 'luma-player://open/', 'data:text/html,hi', 'javascript:void(0)']) assert.equal(vkSiteUrl(url), undefined, url);
  for (const url of ['https://vk.ru/audio?q=джаз', 'https://vk.com/music/playlist/-31_4', 'https://m.vk.ru/audios-42']) assert.ok(vkMusicPage(url), url);
  for (const url of ['https://id.vk.ru/audio', 'https://vk.ru/login', 'https://vk.ru/audio.php', 'https://vk.ru/widget_playlist.php', 'https://vk.ru/im', 'https://vk.ru/audio../settings']) assert.equal(vkMusicPage(url), false, url);
});

test('official QR sign-in preserves a validated music return path and does not confuse music with login', () => {
  for (const target of [VK_MUSIC_URL, vkMusicSearchUrl('джаз & to=https://other.invalid/'),
    'https://vk.ru/audio-42_4', 'https://vk.ru/music/playlist/-31_4_aShare']) {
    const wanted = new URL(target!);
    const login = new URL(vkSignInUrl(target)!);
    assert.equal(login.origin + login.pathname, 'https://vk.ru/login');
    assert.deepEqual([...login.searchParams], [['to', wanted.pathname + wanted.search]]);
    assert.ok(vkSignInPage(login));
    assert.ok(!vkSignInPage(wanted));
  }
  for (const url of ['https://vk.ru/?to=/audio', 'https://vk.ru/authcheck', 'https://id.vk.ru/auth?state=fixture']) {
    assert.equal(vkSignInPage(new URL(url)), true, url);
    assert.equal(vkSignInUrl(url), undefined, url);
  }
  for (const value of [null, 'https://outside.invalid/audio', 'https://vk.ru/away.php?to=//other.invalid']) assert.equal(vkSignInUrl(value), undefined);
  assert.equal(vkSignInPage(new URL('https://vk.ru/feed')), false);
});

test('VK seek accepts only numeric fractions and bounded media position values', () => {
  for (const value of [undefined, null, '0.5', true, {}, NaN, Infinity, -0.1, 1.001]) assert.equal(vkSeekRatio(value), undefined);
  for (const value of [0, 0.5, 1]) assert.equal(vkSeekRatio(value), value);
  for (const value of [null, {}, { duration: 90, position: NaN }, { duration: Infinity, position: 4 }, { duration: 0, position: 0 },
    { duration: 86_401, position: 0 }, { duration: '90', position: 50 }]) assert.equal(readVkPosition(value), undefined);
  assert.deepEqual(readVkPosition({ duration: 90, position: -1, seek: 'true' }), { duration: 90, position: 0, seek: false });
  assert.deepEqual(readVkNowPlaying({ title: 'Трек', timeline: { duration: 90, position: 91, seek: true, url: 'https://outside.invalid' } })?.timeline,
    { duration: 90, position: 90, seek: true });
});

test('native view bounds are contained in the owner, including zoom and undersized slots', () => {
  assert.deepEqual(vkViewBounds({ x: 110, y: 148, width: 530, height: 401 }, 1.25, 600, 520), { x: 138, y: 185, width: 462, height: 335 });
  for (const bounds of [null, {}, { x: -1, y: 0, width: 210, height: 200 }, { x: 0, y: 0, width: NaN, height: 200 }, { x: 470, y: 0, width: 210, height: 200 }]) assert.equal(vkViewBounds(bounds, 1, 620, 520), undefined);
});

test('only current title/artist and boolean playback capabilities are received from VK', () => {
  assert.deepEqual(readVkNowPlaying({ title: ' Трек\n\u202e 1 ', artist: ' Автор  ', playing: true, toggle: true, next: true, previous: 'yes',
    url: 'https://example.test/secret', password: 'fixture', audio: 'https://example.test/audio.mp3', artwork: [] }),
  { title: 'Трек 1', artist: 'Автор', playing: true, toggle: true, next: true, previous: false });
  assert.equal(readVkNowPlaying({ title: 'Трек', artwork: 'https://sun9-9.userapi.com/impg/a.webp?size=600x600&sign=x' })?.artwork,
    'https://sun9-9.userapi.com/impg/a.webp?size=600x600&sign=x');
  assert.equal(readVkNowPlaying({ title: 'Трек', artwork: 'https://files.example.test/a.webp' })?.artwork, undefined);
  assert.equal(readVkNowPlaying({ playing: true }), undefined);
  assert.equal(readVkNowPlaying({ title: 'a'.repeat(1000) })?.title.length, 160);
});

test('copied track and playlist links canonicalize, retaining only the public playlist share key', () => {
  const expected = { ownerId: -42, playlistId: 7, shareKey: 'Shared-42_abc' };
  for (const url of ['https://vk.ru/music?z=audio_playlist-42_7/Shared-42_abc',
    'https://vk.com/audios-42?z=audio_playlist-42_7%2FShared-42_abc', 'https://vk.ru/audio?z=audio_playlist-42_7_Shared-42_abc',
    'https://vk.com/music/playlist/-42_7_Shared-42_abc?ignored=1']) {
    assert.deepEqual(parseVkShareLink(url), expected);
    assert.equal(readMusicLink(url)?.url, vkPlaylistUrl(expected));
  }
  for (const url of ['https://vk.ru/audio?z=audio_playlist-42_7&z=audio_playlist-42_8', 'https://vk.ru/away.php?z=audio_playlist-42_7',
    'https://vk.ru/music/playlist/-42_7_abc%2f', 'https://vk.ru/music/playlist/-42_0']) assert.equal(parseVkShareLink(url), undefined, url);
});

test('the music dialog and Windows handoff no longer accept YouTube destinations', () => {
  for (const url of ['https://youtu.be/plnfIj7dkJE', 'https://www.youtube.com/watch?v=plnfIj7dkJE', 'https://music.youtube.com/watch?v=plnfIj7dkJE',
    'https://www.youtube-nocookie.com/embed/plnfIj7dkJE']) {
    assert.equal(readMusicLink(url), undefined);
    assert.equal(musicLinkArgument([`luma-player://open?${new URLSearchParams({ url })}`]), undefined);
    assert.equal(vkSiteEntry(url), false);
  }
});
