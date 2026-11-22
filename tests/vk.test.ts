import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isVkExternalUrl, isVkPlaylist, isVkWidgetFrameUrl, parseVkPlaylist, parseVkShareLink, vkPlaylistUrl, vkShelfUrl,
  vkWidgetUrl, VK_MUSIC_URL, VK_WIDGET_FRAME_NAME, VK_WIDGET_URL,
} from '../src/shared/vk.js';
import { youTubeEmbedUrl } from '../src/shared/youtube.js';
import { allowMusicEmbedFrame } from '../electron/embed-navigation.js';

const playlist = { ownerId: -147845620, playlistId: 5, hash: 'c09c1c34cdf7190efb' };

test('VK playlist input accepts the official generator snippet and embed URL', () => {
  assert.deepEqual(parseVkPlaylist(`
    <script src="https://vk.ru/js/api/openapi.js?169"></script>
    <div id="vk_playlist_-147845620_5"></div>
    <script>VK.Widgets.Playlist('vk_playlist_-147845620_5', -147845620, 5, 'c09c1c34cdf7190efb');</script>
  `), playlist);
  assert.deepEqual(parseVkPlaylist('VK.Widgets.Playlist("p", -147845620, 5, "c09c1c34cdf7190efb", {width: 620});'), playlist);
  assert.deepEqual(parseVkPlaylist('https://vk.com/widget_playlist.php?oid=-147845620&pid=5&hash=c09c1c34cdf7190efb'), playlist);
});

test('Luma reads only widget fields and rebuilds a canonical VK frame URL', () => {
  const base = `${VK_WIDGET_URL}?oid=-147845620&pid=5&hash=c09c1c34cdf7190efb`;
  const value = parseVkPlaylist(`<iframe width="340" src="https://vk.com/widget_playlist.php?pid=5&amp;oid=-147845620&amp;hash=c09c1c34cdf7190efb&amp;width=300&amp;ref=test#ignored"></iframe>`);
  assert.deepEqual(value, playlist);
  assert.equal(vkWidgetUrl(value!), base);
  assert.ok(isVkWidgetFrameUrl(base));
  for (const url of [base.replace('vk.ru', 'vk.com'), `${base}&autoplay=1`, `${base}&hash=abc`, `${base}#fragment`,
    base.replace('vk.ru', 'vk.ru.example.test'), base.replace('https:', 'http:'), base.replace('vk.ru', 'user@vk.ru'),
    `${VK_WIDGET_URL}?pid=5&oid=-147845620&hash=c09c1c34cdf7190efb`, vkPlaylistUrl(playlist), VK_MUSIC_URL]) {
    assert.equal(isVkWidgetFrameUrl(url), false, url);
  }
});

test('the VK frame exception cannot load the full site, nested documents or another provider', () => {
  const main = { url: 'luma://app/', parent: null, name: '' };
  const blank = { url: 'about:blank', parent: main, name: VK_WIDGET_FRAME_NAME };
  const widget = vkWidgetUrl(playlist);
  const active = { ...blank, url: widget };
  const nested = { url: '', parent: active, name: VK_WIDGET_FRAME_NAME };
  const youTube = youTubeEmbedUrl('plnfIj7dkJE', 'ru')!;
  assert.ok(allowMusicEmbedFrame(main, { url: widget, frame: null, initiator: main }));
  assert.ok(allowMusicEmbedFrame(main, { url: widget, frame: blank, initiator: null }));
  assert.ok(allowMusicEmbedFrame(main, { url: widget, frame: active, initiator: active }));
  for (const [url, frame, initiator] of [
    [widget, main, active], [widget, null, active], [VK_MUSIC_URL, active, active], [vkPlaylistUrl(playlist), active, main],
    ['https://id.vk.ru/', active, active], [widget, nested, active], ['about:blank', nested, active],
    ['luma://app/', active, active], [youTube, active, active], ['https://example.invalid/', active, active],
  ] as const) assert.ok(!allowMusicEmbedFrame(main, { url, frame, initiator }), url);
});

test('VK playlist input rejects share links without the widget hash and invalid origins or fields', () => {
  assert.equal(parseVkPlaylist(vkPlaylistUrl(playlist)), null);
  assert.equal(parseVkPlaylist('https://vk.ru.evil.test/widget_playlist.php?oid=-147845620&pid=5&hash=abc'), null);
  assert.equal(parseVkPlaylist('https://vk.ru/widget_playlist.php?oid=3&pid=4&pid=5&hash=abc'), null);
  assert.equal(parseVkPlaylist('https://vk.ru/widget_playlist.php?oid=3&pid=4&hash=%3Cscript%3E'), null);
  assert.equal(parseVkPlaylist('VK.Widgets.Playlist("p", (40+2), 5, "abc");'), null);
  assert.equal(isVkPlaylist({ ownerId: 1e16, playlistId: 3, hash: 'abc' }), false);
  assert.equal(isVkPlaylist({ ownerId: 3, playlistId: 0, hash: 'abc' }), false);
});

test('VK bookmarks open only canonical music links in the system browser', () => {
  assert.equal(isVkExternalUrl(VK_MUSIC_URL), true);
  assert.equal(isVkExternalUrl(vkPlaylistUrl(playlist)), true);
  for (const url of [`${VK_MUSIC_URL}?q=джаз`, `${vkPlaylistUrl(playlist)}?next=https://example.com`,
    `${vkPlaylistUrl(playlist)}\n`, 'https://vk.ru/away.php?to=https://example.com', 'file:///C:/Windows',
    'https://vk.ru/widget_playlist.php?oid=3&pid=4&hash=abc', 'https://id.vk.ru/auth']) {
    assert.equal(isVkExternalUrl(url), false, url);
  }
});

test('VK share links are canonicalized and remain bookmarks until a widget hash is supplied', () => {
  const url = 'https://vk.com/music/playlist/-14_5_Shared-Key?ref=copy#details';
  const data = parseVkShareLink(url);
  assert.deepEqual(data, { ownerId: -14, playlistId: 5, shareKey: 'Shared-Key' });
  assert.equal(isVkPlaylist(data), false);
  assert.equal(parseVkPlaylist(url), null);
  assert.equal(vkShelfUrl({ ...data!, name: 'Вечер' }), 'https://vk.ru/music/playlist/-14_5_Shared-Key');
  assert.equal(isVkExternalUrl(vkShelfUrl({ ...data!, name: 'Вечер' })), true);
  for (const url of ['http://vk.ru/music/playlist/-14_5', 'https://vk.ru.example.test/music/playlist/-14_5',
    'https://someone@vk.ru/music/playlist/-14_5', 'https://vk.ru:8080/music/playlist/-14_5', 'file:///music/playlist/-14_5',
    'https://vk.ru/music/playlist/-14_5_abc%2f', 'https://vk.ru/music/playlist/-14_0']) {
    assert.equal(parseVkShareLink(url), undefined, url);
  }
});

test('VK import reads copied overlay links without turning a share key into a widget credential', () => {
  const expected = { ownerId: -42, playlistId: 7, shareKey: 'Shared-42_abc' };
  for (const url of ['https://vk.ru/music?z=audio_playlist-42_7/Shared-42_abc',
    'https://vk.com/audios-42?z=audio_playlist-42_7%2FShared-42_abc', 'https://vk.ru/audio?z=audio_playlist-42_7_Shared-42_abc']) {
    assert.deepEqual(parseVkShareLink(url), expected);
    assert.equal(parseVkPlaylist(url), null);
  }
  assert.equal(parseVkShareLink('https://vk.ru/audio?z=audio_playlist-42_7&z=audio_playlist-42_8'), undefined);
  assert.equal(parseVkShareLink('https://vk.ru/away.php?z=audio_playlist-42_7'), undefined);
  const embedded = `<iframe src="https://vk.com/widget_playlist.php?oid=-147845620&amp;pid=5&amp;hash=c09c1c34cdf7190efb" onload="alert(1)"></iframe>`;
  assert.deepEqual(parseVkPlaylist(embedded), playlist);
  assert.equal(parseVkPlaylist(embedded.replace('vk.com', 'vk.com.attacker.test')), null);
});
