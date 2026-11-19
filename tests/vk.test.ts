import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  editorialPlaylist, isVkExternalUrl, isVkPlaylist, isVkWebsiteUrl, isVkWidgetFrameUrl, parseVkPlaylist, vkPlaylistUrl, vkWidgetUrl,
  VK_MUSIC_URL, VK_WIDGET_DOCS_URL,
} from '../src/shared/vk.js';

const playlist = { ownerId: -147845620, playlistId: 5, hash: 'c09c1c34cdf7190efb' };

test('VK playlist input accepts the official generator snippet and embed URL', () => {
  assert.deepEqual(parseVkPlaylist(`
    <script src="https://vk.ru/js/api/openapi.js?169"></script>
    <div id="vk_playlist_-147845620_5"></div>
    <script>VK.Widgets.Playlist('vk_playlist_-147845620_5', -147845620, 5, 'c09c1c34cdf7190efb');</script>
  `), playlist);
  assert.deepEqual(parseVkPlaylist('VK.Widgets.Playlist("p", -147845620, 5, "c09c1c34cdf7190efb", {width: 620});'), playlist);
  assert.deepEqual(parseVkPlaylist('https://vk.com/widget_playlist.php?oid=-147845620&pid=5&hash=c09c1c34cdf7190efb'), playlist);
  assert.equal(vkWidgetUrl(editorialPlaylist), 'https://vk.ru/widget_playlist.php?oid=-147845620&pid=5&hash=c09c1c34cdf7190efb');
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

test('VK navigation allows only the canonical frame and narrow external links', () => {
  const frame = vkWidgetUrl(playlist);
  assert.equal(isVkWidgetFrameUrl(frame), true);
  assert.equal(isVkWidgetFrameUrl(`${frame}&url=https://example.com`), false);
  assert.equal(isVkWidgetFrameUrl(frame.replace('vk.ru', 'vk.ru:9999')), false);
  assert.equal(isVkWidgetFrameUrl(frame.replace('vk.ru', 'user@vk.ru')), false);
  assert.equal(isVkExternalUrl(VK_MUSIC_URL), true);
  assert.equal(isVkExternalUrl(VK_WIDGET_DOCS_URL), true);
  assert.equal(isVkExternalUrl(vkPlaylistUrl(playlist)), true);
  assert.equal(isVkExternalUrl(`${vkPlaylistUrl(playlist)}?next=https://example.com`), false);
  assert.equal(isVkExternalUrl(`${vkPlaylistUrl(playlist)}\n`), false);
  assert.equal(isVkExternalUrl('https://vk.ru/away.php?to=https://example.com'), false);
  assert.equal(isVkExternalUrl('file:///C:/Windows'), false);
  assert.equal(isVkExternalUrl(frame), false);
});


test('the isolated VK window is limited to first-party HTTPS music and sign-in pages', () => {
  assert.equal(isVkWebsiteUrl(VK_MUSIC_URL), true);
  assert.equal(isVkWebsiteUrl('https://vk.ru/?u=2'), true);
  assert.equal(isVkWebsiteUrl('https://id.vk.ru/auth?state=example'), true);
  assert.equal(isVkWebsiteUrl('https://login.vk.com/authorize'), true);
  assert.equal(isVkWidgetFrameUrl(VK_MUSIC_URL), false);
  for (const url of ['http://vk.ru/audio', 'https://vk.ru.example.test/audio', 'https://vk.ru@untrusted.test/',
    'https://someone@vk.ru/audio', 'https://vk.ru:8080/audio', 'blob:https://vk.ru/id', 'file:///tmp/audio', 'luma://app/']) {
    assert.equal(isVkWebsiteUrl(url), false, url);
  }
});
