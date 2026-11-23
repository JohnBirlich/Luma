import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultAudioQuality, describeAudioFormat, describeStream, isMetered, readAudioFormat, readAudioQuality, streamUrl } from '../src/shared/audio-quality.js';
import { commonsMp3Export, decodeOpenverse } from '../src/shared/online.js';
import { encodePreferences, decodePreferences } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';
import { jamendoRecording, commonsRecording } from './fixtures/openverse.mjs';
import { activeLyricLine, lyricsUrl, readLocalLyrics, readLyrics, readLyricsQuery, timedLines } from '../src/shared/lyrics.js';
import { defaultKaraokeStyle } from '../src/shared/karaoke-style.js';
import { createLyricsService } from '../src/shared/lyrics-service.js';

const jamendo = decodeOpenverse(jamendoRecording)!;
const commons = decodeOpenverse(commonsRecording)!;

test('select documented Jamendo stream variants while preserving other originals and not guessing metering by speed', () => {
  const economy = streamUrl(jamendo, 'economy');
  assert.equal(new URL(economy).searchParams.get('format'), 'mp31');
  assert.equal(new URL(economy).searchParams.get('trackid'), new URL(jamendo.audioUrl).searchParams.get('trackid'));
  assert.match(describeStream(jamendo, economy), /96 кбит/);
  assert.match(describeStream(jamendo, streamUrl(jamendo, 'standard')), /VBR/);
  assert.equal(streamUrl(jamendo, 'source'), jamendo.audioUrl);
  assert.equal(streamUrl(commons, 'economy'), commons.audioUrl);
  assert.equal(isMetered('auto', undefined), false);
  assert.equal(isMetered('auto', { type: 'cellular' }), true);
  assert.equal(isMetered('auto', { type: 'wifi', saveData: true }), true);
  assert.equal(isMetered('normal', { saveData: true }), false);
  assert.equal(isMetered('metered'), true);
  assert.deepEqual(readAudioQuality({ normal: '320', metered: 'constructor', network: 3 }), defaultAudioQuality);
  assert.equal(describeAudioFormat(readAudioFormat({ codec: 'FLAC', sampleRate: 44100, bitsPerSample: 24 }), 'ru-RU'), 'FLAC · 44,1 кГц · 24 бит');
  assert.equal(readAudioFormat({ codec: {}, bitrate: Infinity, sampleRate: -1, bitsPerSample: 128 }), undefined);
});

test('only a Commons source MP3 with a reusable license has the export action', () => {
  assert.equal(commonsMp3Export(jamendo), false);
  assert.equal(commonsMp3Export(commons), false);
  const mp3 = { ...commons, audioUrl: commons.audioUrl.replace(/\.[a-z]+$/i, '.mp3') };
  assert.equal(commonsMp3Export(mp3), true);
  assert.equal(commonsMp3Export({ ...mp3, online: { ...mp3.online, licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' } }), false);
  assert.equal(commonsMp3Export({ ...mp3, audioUrl: 'https://upload.wikimedia.org.example.org/wikipedia/commons/a/ab/track.mp3' }), false);
});

test('turning off queue persistence retains history and bookmarks, but drops queue-only online refs', () => {
  const preferences = decodePreferences(null);
  const queue = startQueue([jamendo.id, commons.id]);
  const store = encodePreferences({ ...preferences, onlineRefs: [jamendo, commons], recent: [commons.id], playback: { ...preferences.playback, rememberQueue: false } }, queue);
  const restored = decodePreferences(store);
  assert.deepEqual(restored.onlineRefs, [commons]);
  assert.equal(restored.queue, undefined);
});

const query = { title: 'Ёлка & соль', artist: 'Исполнитель', duration: 101 };
const response = { trackName: 'Елка & соль', artistName: 'Исполнитель', duration: 102, plainLyrics: 'Первая\r\nВторая', syncedLyrics: '[00:00.20] Первая\n[00:04.0] Вторая' };

test('only a matching recording can provide synced lyrics and timestamps follow seeks', () => {
  assert.equal(lyricsUrl(query).searchParams.get('track_name'), query.title);
  assert.equal(lyricsUrl(query).searchParams.has('path'), false);
  assert.deepEqual(readLyricsQuery({ ...query, album: 'Без альбома', audioUrl: 'private' }), query);
  assert.equal(readLyricsQuery({ ...query, artist: 'Неизвестный исполнитель' }), undefined);
  const lyrics = readLyrics(response, query);
  assert.equal(lyrics?.plain, 'Первая\nВторая');
  assert.equal(readLyrics({ ...response, duration: 144 }, query), null);
  assert.equal(readLyrics({ ...response, artistName: 'Другой' }, query), null);
  assert.deepEqual(readLyrics({ ...response, instrumental: true }, query), { instrumental: true });
  assert.equal(readLyrics(response, { ...query, duration: undefined })?.synced, undefined);
  const lines = timedLines('[offset:-100]\n[00:00.20] Первый\n[00:04.0][00:05.000] Второй');
  assert.deepEqual(lines, [{ time: .1, text: 'Первый' }, { time: 3.9, text: 'Второй' }, { time: 4.9, text: 'Второй' }]);
  for (const [time, line] of [[0, -1], [3.9, 1], [4.95, 2], [3, 0]]) assert.equal(activeLyricLine(lines, time), line);
  assert.equal(readLocalLyrics('plain')?.plain, 'plain');
  assert.equal(readLocalLyrics(undefined, 'not a timed file'), null);
});

test('lyrics requests send only recording tags, identify client, cache and honor Retry-After without retrying', async () => {
  let calls = 0;
  const find = createLyricsService(async (href, options) => {
    calls++;
    const url = new URL(href);
    assert.equal(url.origin, 'https://lrclib.net');
    assert.equal(url.pathname, '/api/get');
    assert.deepEqual([...url.searchParams.keys()], ['track_name', 'artist_name', 'duration']);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.match(new Headers(options.headers).get('Lrclib-Client') ?? '', /^LumaPlayer\/dev \(https:\/\/github\.com\/JohnBirlich\/Luma\)$/);
    return Response.json(response);
  });
  const signal = new AbortController().signal;
  assert.ok((await find(query, signal))?.synced);
  assert.ok((await find({ ...query, path: 'private' }, signal))?.plain);
  assert.equal(calls, 1);
  const limited = createLyricsService(async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '30' } }); });
  await assert.rejects(limited(query, signal), /недоступен/);
  await assert.rejects(limited({ ...query, title: 'Другой' }, signal), /Подождите/);
  assert.equal(calls, 2);
});

test('karaoke typography survives preference round trips and repairs untrusted values', () => {
  const preferences = decodePreferences(JSON.stringify({ karaokeStyle: { size: 52, weight: 600, spacing: 7, align: 'center' } }));
  assert.deepEqual(decodePreferences(encodePreferences(preferences, startQueue([]))).karaokeStyle, { size: 52, weight: 600, spacing: 7, align: 'center' });
  assert.deepEqual(decodePreferences(null).karaokeStyle, defaultKaraokeStyle);
  assert.deepEqual(decodePreferences(JSON.stringify({ karaokeStyle: { size: -1, weight: 'bad', spacing: 1000, align: 'invalid' } })).karaokeStyle,
    { size: 20, weight: 750, spacing: 36, align: 'left' });
});

test('manual LRCLIB refresh bypasses cached text without bypassing cooldown', async () => {
  let calls = 0;
  const find = createLyricsService(async () => { calls++; return Response.json({ ...response, plainLyrics: `Text ${calls}` }); });
  const signal = new AbortController().signal;
  assert.equal((await find(query, signal))?.plain, 'Text 1');
  assert.equal((await find(query, signal))?.plain, 'Text 1');
  await assert.rejects(find(query, signal, true), /Подождите/);
  await new Promise((resolve) => setTimeout(resolve, 375));
  assert.equal((await find(query, signal, true))?.plain, 'Text 2');
  assert.equal(calls, 2);
});
