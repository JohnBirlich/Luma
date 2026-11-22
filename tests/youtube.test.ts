import assert from 'node:assert/strict';
import { test } from 'node:test';
import { youTubeRecordings } from '../src/data/youtube.js';
import { readMusicLink, musicLaunchUrl, musicLinkArgument } from '../src/shared/music-links.js';
import { isYouTubeEmbedUrl, readYouTubeId, YOUTUBE_EMBED_SOURCE, YOUTUBE_FRAME_NAME, youTubeEmbedUrl, youTubeWatchUrl } from '../src/shared/youtube.js';
import { allowMusicEmbedFrame } from '../electron/embed-navigation.js';
import { youTubeAppHeaders, youTubePopupUrl } from '../electron/youtube.js';

const videoId = 'plnfIj7dkJE';
const watch = youTubeWatchUrl(videoId);
const embed = youTubeEmbedUrl(videoId, 'ru')!;

test('accepts a single official YouTube video link and strips tracking, list and time parameters', () => {
  for (const url of [
    ` https://youtu.be/${videoId}?si=private&t=60 `, `https://m.youtube.com/watch?v=${videoId}#t=70`,
    `https://music.youtube.com/watch?v=${videoId}&list=OLAK5uy_placeholder`, watch, embed,
  ]) {
    assert.equal(readYouTubeId(url), videoId);
    assert.deepEqual(readMusicLink(url), { provider: 'youtube', kind: 'track', url: watch });
  }
  const deepLink = musicLaunchUrl(readMusicLink(watch)!);
  assert.equal(musicLinkArgument(['--launch', deepLink]), watch);
  assert.equal(musicLinkArgument([watch]), undefined, 'does not take over browser HTTPS links');
});

test('rejects content other than a single video on a supported HTTPS host', () => {
  for (const value of [null, { url: watch }, videoId, `http://youtu.be/${videoId}`, `https://youtu.be.example.com/${videoId}`,
    `https://youtu.be:8443/${videoId}`, `https://user@youtu.be/${videoId}`, `https://youtu.be@site.test/${videoId}`,
    `https://youtu.be/${videoId}%2Fanything`, `https://youtu.be/${videoId}\n`, `https://youtu.be/${videoId}/extra`,
    `https://www.youtube.com/watch?v=${videoId}&v=hZPrKy2WgAo`, 'https://www.youtube.com/playlist?list=abc',
    `https://www.youtube.com/shorts/${videoId}`, `https://www.youtube.com/redirect?q=${watch}`,
    `https://www.youtube-nocookie.com/watch?v=${videoId}`, `https://www.youtube.com\\@evil.invalid/watch?v=${videoId}`,
    `<iframe src="${embed}"></iframe>`, 'luma://app/media/audio/123', `https://www.youtube.com/watch?v=${'a'.repeat(2048)}`,
  ]) {
    assert.equal(readYouTubeId(value), undefined, String(value));
    assert.equal(readMusicLink(value), undefined, String(value));
  }
  assert.equal(youTubeEmbedUrl('../watch?id=11', 'ru'), undefined);
});

test('five originals map to one visible embed each, with no autoplay or extracted media URLs', () => {
  assert.deepEqual(youTubeRecordings.map(({ id, duration }) => [id, duration]), [
    ['hZPrKy2WgAo', 209], ['NSoDdwhQ2gs', 283], [videoId, 230], ['KV-ZHPJNSOk', 335], ['4Jmz-OWycyk', 180],
  ]);
  for (const { id } of youTubeRecordings) {
    const src = youTubeEmbedUrl(id, 'en');
    assert.equal(src, `${YOUTUBE_EMBED_SOURCE}${id}?hl=en`);
    assert.equal(isYouTubeEmbedUrl(src), true);
    assert.equal(readYouTubeId(youTubeWatchUrl(id)), id);
  }
});

test('navigation exception is only a direct YouTube embed and its sandboxed web descendants', () => {
  const main = { url: 'luma://app/', parent: null, name: '' };
  const blank = { parent: main, url: '', name: YOUTUBE_FRAME_NAME };
  const player = { ...blank, url: embed };
  const sibling = { parent: main, url: '', name: 'different' };
  const nested = { parent: player, url: '', name: '' };
  assert.ok(allowMusicEmbedFrame(main, { url: embed, frame: blank, initiator: main }));
  assert.ok(allowMusicEmbedFrame(main, { url: embed, frame: null, initiator: main }));
  assert.ok(allowMusicEmbedFrame(main, { url: embed, frame: player, initiator: player }));
  assert.ok(allowMusicEmbedFrame(main, { url: 'https://www.youtube.com/some-embedded-resource', frame: nested, initiator: player }));
  assert.ok(allowMusicEmbedFrame(main, { url: 'about:blank', frame: nested, initiator: player }));
  for (const [url, frame, initiator] of [
    [watch, player, main], ['https://www.youtube-nocookie.com/', player, main], ['https://elsewhere.invalid/', player, player],
    [embed, main, player], [embed, sibling, player], [embed, null, player], ['luma://app/', nested, player],
    ['file:///private.txt', nested, player], ['luma-player://open/', nested, player],
  ] as const) assert.ok(!allowMusicEmbedFrame(main, { url, frame, initiator }), url);
});

test('native Referer identifies Luma only on its own initial embed request', () => {
  const details = { url: embed, webContentsId: 12, initiatorOrigin: 'luma://app', method: 'GET', resourceType: 'subFrame',
    requestHeaders: { referer: 'luma://app/index.html', Accept: 'text/html' } };
  assert.deepEqual(youTubeAppHeaders(details, 12, 'luma://app'), { Referer: 'https://lumaplayer.exe/', Accept: 'text/html' });
  for (const change of [{ webContentsId: 13 }, { initiatorOrigin: 'https://other.invalid' }, { initiatorOrigin: undefined },
    { method: 'POST' }, { resourceType: 'mainFrame' }, { resourceType: 'xhr' }, { url: watch }, { url: 'https://www.youtube-nocookie.com/' },
    { url: embed.replace('youtube-nocookie.com', 'youtube-nocookie.com.other.invalid') }]) {
    assert.equal(youTubeAppHeaders({ ...details, ...change }, 12, 'luma://app'), undefined);
  }
});

test('embedded watch and channel links open only canonical YouTube pages', () => {
  assert.equal(youTubePopupUrl(`${watch}&embeds_referring_euri=external`, embed), watch);
  assert.equal(youTubePopupUrl('https://www.youtube-nocookie.com/channel/UClYV6hHlupm_S_ObS1W-DYw?sub_confirmation=1', embed),
    'https://www.youtube.com/channel/UClYV6hHlupm_S_ObS1W-DYw');
  assert.equal(youTubePopupUrl(watch, 'luma://app/'), undefined);
  for (const url of ['https://example.invalid/', 'https://www.youtube.com/redirect?q=https://foo.invalid/', 'https://www.youtube.com:9443/watch?v=plnfIj7dkJE', embed])
    assert.equal(youTubePopupUrl(url, embed), undefined);
});
