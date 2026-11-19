// Run with Electron after `npm run build`. Uses a temporary profile, not the user's library.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, screen, session } from 'electron';
import { APP_ORIGIN, DesktopLibrary } from '../dist-electron/electron/library.js';
import { VK_SESSION } from '../dist-electron/electron/vk-window.js';
import { acoustic, madam, remix } from './fixtures/recognition.mjs';
import { parseByteRange } from '../dist-electron/electron/protocol.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';
import { parseFile } from 'music-metadata';
import { taggedMp3 } from './fixtures/mp3.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const profile = await mkdtemp(join(tmpdir(), 'luma-desktop-smoke-'));
app.setAppPath(root);
app.setPath('appData', profile);
app.disableHardwareAcceleration();
delete process.env.LUMA_DEV_SERVER_URL;
process.env.LUMA_ACOUSTID_CLIENT = 'fixture-only';

async function waitFor(label, check) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}

const liveCatalog = process.env.LUMA_LIVE_CATALOG === '1';
const liveServices = process.env.LUMA_LIVE_SERVICES === '1';
const timer = setTimeout(() => fail(new Error('Desktop smoke test did not finish')), (liveCatalog || liveServices) ? 260_000 : 155_000);
// The main process must register its custom protocol before the ready event.
const sample = await readFile(join(root, 'public/demo/afterimage.mp3'));
const cover = await readFile(join(root, 'public/artwork/afterimage.webp'));
const tagged = join(profile, 'Ты здесь.mp3');
const broken = join(profile, 'Без обложки.mp3');
await writeFile(tagged, taggedMp3(sample, {
  title: 'Òû çäåñü', artist: 'Àðèÿ', album: 'Æèâîé çâóê', picture: { mime: 'image/webp', data: cover },
}));
await writeFile(broken, taggedMp3(sample, {
  title: "Ty Zdes'", picture: { mime: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
}));
const library = await DesktopLibrary.open(join(profile, 'Luma Player'));
assert.equal((await library.importPaths([tagged, broken])).added.length, 2);
// An upgraded library has no new audio-format fields; inspect an old track on demand, not at startup.
const libraryFile = join(profile, 'Luma Player', 'library.json');
const index = JSON.parse(await readFile(libraryFile, 'utf8'));
const legacyEntry = index.find((entry) => entry.path === broken);
assert.ok(legacyEntry?.format);
delete legacyEntry.format;
await writeFile(libraryFile, JSON.stringify(index));
const warnings = [];
let externalRuntimeErrors = 0;
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => {
    if (!/MediaImage src can only be|Content Security Policy|Uncaught /u.test(event.message)) return;
    // VK owns its renderer. Its live script errors are reported separately, not counted as Luma CSP/runtime regressions.
    if (contents.session === session.defaultSession) warnings.push(event.message);
    else if (/Uncaught /u.test(event.message)) externalRuntimeErrors++;
  });
});
await import('../dist-electron/electron/main.js');

async function smoke() {
  await app.whenReady();
  const window = await waitFor('application window', () => BrowserWindow.getAllWindows()[0]);
  window.webContents.setAudioMuted(true);
  const run = (script) => window.webContents.executeJavaScript(script, true);
  const readMetadata = () => run(`(() => {
    const data = navigator.mediaSession?.metadata;
    return data && { title: data.title, artist: data.artist, album: data.album, picture: data.artwork[0] };
  })()`);
  const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click(); void 0;`);
  const fill = (selector, value) => run(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const preferences = () => run(`JSON.parse(localStorage.getItem('luma-player:v1'))`);
  const select = (selector, value) => run(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const settings = async (label) => {
    await click('.title-settings');
    await waitFor('settings menu', () => run(`!!document.querySelector('.settings-page [aria-label="Внешний вид"]')`));
    await click(`.settings-page [aria-label="${label}"]`);
  };

  const withArt = (title) => waitFor(`metadata and artwork for ${title}`, async () => {
    const data = await readMetadata();
    return data?.title === title && data.picture ? data : undefined;
  });
  const first = await withArt('Ты здесь');
  assert.equal(new URL(window.webContents.getURL()).hostname, 'app');
  assert.ok(window.webContents.getURL().startsWith(APP_ORIGIN));
  assert.equal(await run('document.documentElement.lang'), 'ru');
  assert.equal(first.artist, 'Ария');
  assert.equal(first.album, 'Живой звук');
  assert.equal(first.picture.type, 'image/jpeg');
  assert.equal(first.picture.sizes, '384x384');
  assert.match(first.picture.src, /^data:image\/jpeg;base64,/);
  const dimensions = await run(`(async () => {
    const image = new Image(); image.src = navigator.mediaSession.metadata.artwork[0].src;
    await image.decode(); return [image.naturalWidth, image.naturalHeight];
  })()`);
  assert.deepEqual(dimensions, [384, 384]);

  await run(`[...document.querySelectorAll('.nav-item')].find((item) => item.textContent.startsWith('Медиатека')).click()`);
  const second = `.card-play[aria-label="Воспроизвести Ty Zdes'"]`;
  await waitFor('second track', () => run(`!!document.querySelector(${JSON.stringify(second)})`));
  await run(`document.querySelector(${JSON.stringify(second)}).click()`);
  const fallback = await withArt("Ty Zdes'");
  assert.match(fallback.picture.src, /^data:image\/jpeg;base64,/);
  assert.notEqual(fallback.picture.src, first.picture.src, 'broken cover does not keep the previous track’s artwork');
  assert.equal(window.getTitle(), "Ty Zdes' — Luma Player");
  assert.equal((await run('window.luma.getAppInfo()')).version, version);
  const go = (name) => run(`[...document.querySelectorAll('nav .nav-item')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(name)}).click()`);
  await go('Главная');
  await waitFor('appearance button', () => run(`!!document.querySelector('.scene-open')`));
  await run(`document.querySelector('.scene-open').click()`);
  await waitFor('appearance dialog', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  await run(`[...document.querySelectorAll('.scene-layouts button')].find((item) => item.textContent === 'Винил').click()`);
  // Each user click commits React state before the next choice; do not batch them into a single script.
  await waitFor('vinyl preview', () => run(`!!document.querySelector('.scene-preview-record')`));
  await run(`document.querySelector('.scene-choice[aria-label="Призма"]').click()`);
  await waitFor('prism preview', () => run(`!!document.querySelector('.scene-dialog-preview .scene-prism')`));
  await run(`document.querySelector('.scene-dialog .primary-button').click()`);
  await waitFor('vinyl and prism applied to the actual player', () => run(`!!document.querySelector('.hero .record-platter') && !!document.querySelector('.hero .scene-prism')`));
  // Hosted Windows runners can suppress motion or lack an audio output. The native smoke checks
  // layout and transport identity independent of those settings; playing vinyl is covered in Chromium.
  await waitFor('seekable audio', () => run(`Number.isFinite(document.querySelector('audio').duration)`));
  await run(`window.testAudio = document.querySelector('audio'); window.testAudio.pause(); window.testAudio.currentTime = 4;`);
  const waitForDialog = () => waitFor('expanded player dialog', () => run(`!!document.querySelector('.immersive-player[open]')`));
  const expand = () => run(`document.querySelector('.hero-fullscreen').focus(); document.querySelector('.hero-fullscreen').click()`);
  async function collapseWithPointer() {
    const point = await run(`(() => {
      const button = document.querySelector('.immersive-collapse');
      const { left, top, width, height } = button.getBoundingClientRect();
      const x = Math.round(left + width / 2), y = Math.round(top + height / 2);
      return { x, y, hit: document.elementFromPoint(x, y)?.closest('button') === button,
        drag: getComputedStyle(document.querySelector('.native-title-bar')).getPropertyValue('app-region') };
    })()`);
    assert.equal(point.hit, true);
    assert.equal(point.drag, 'no-drag');
    const { x, y } = point;
    window.focus();
    window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x, y });
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x, y });
    await waitFor('pointer exit and opener focus', () => run(`!document.querySelector('.immersive-player') && !document.fullscreenElement && document.activeElement?.matches('.hero-fullscreen')`));
  }
  const windowed = window.getBounds();
  const display = screen.getDisplayMatching(windowed);
  const waitForMonitor = () => waitFor('native monitor fullscreen', () => {
    const bounds = window.getBounds();
    return window.isFullScreen() && Object.keys(display.bounds).every((key) => Math.abs(bounds[key] - display.bounds[key]) <= 1);
  });
  await expand();
  await waitForDialog();
  await waitForMonitor();
  assert.equal(await run('document.fullscreenElement === null'), true, 'the window, not the DOM, fills the monitor');
  assert.equal(await run(`document.querySelector('.immersive-player h1')?.textContent`), "Ty Zdes'");
  assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused && Math.abs(window.testAudio.currentTime - 4) < .2`), true);
  assert.equal(await run(`!!document.querySelector('.immersive-player .record-platter')`), true);
  assert.deepEqual(await run(`[...document.querySelectorAll('.upcoming-copy strong')].map((item) => item.textContent)`), ['Отблеск', 'Отлив', 'Фиолетовый час', 'Бумажные спутники', 'Синий меридиан']);
  await click('.immersive-queue-toggle');
  await waitFor('fullscreen queue hidden and saved', async () => !(await preferences()).appearance.fullscreenQueue && await run(`!document.getElementById('immersive-upcoming')`));
  await collapseWithPointer();
  await waitFor('windowed bounds restored', () => !window.isFullScreen()
    && Object.keys(windowed).every((key) => Math.abs(window.getBounds()[key] - windowed[key]) <= 1));
  await expand();
  await waitForDialog();
  await waitForMonitor();
  assert.equal(await run(`document.querySelector('.immersive-queue-toggle').getAttribute('aria-expanded')`), 'false');
  window.setFullScreen(false);
  await waitFor('system exit removes dialog and restores focus', () => run(`!document.querySelector('.immersive-player') && document.activeElement?.matches('.hero-fullscreen')`));
  await expand();
  await waitForMonitor();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor('Esc exits native fullscreen', async () => !window.isFullScreen() && await run(`!document.querySelector('.immersive-player')`));
  assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused && Math.abs(window.testAudio.currentTime - 4) < .2`), true);
  console.log(`::notice title=Native fullscreen::Electron fullscreen reached ${display.bounds.width}×${display.bounds.height} monitor bounds; button, Esc, and host exit passed.`);
  await click('.scene-open');
  await waitFor('scene dialog reopens', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  if (!await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) {
    await click('.scene-choice[aria-label="Волны"]');
    const clip = await waitFor('silent sea loop decodes from the app protocol', () => run(`(() => {
      const clip = document.querySelector('.scene-dialog-preview video');
      return clip?.currentTime > .04 ? [clip.videoWidth, clip.videoHeight, clip.muted, clip.loop] : null;
    })()`));
    assert.deepEqual(clip, [960, 400, true, true]);
    await click('.scene-choice[aria-label="Фейерверк"]');
    await waitFor('fireworks use one bounded canvas', () => run(`(() => {
      const canvas = document.querySelector('.scene-dialog-preview canvas');
      return canvas && canvas.width * canvas.height > 0 && canvas.width * canvas.height <= 480000;
    })()`));
  }
  await click('.scene-dialog .primary-button');
  await run(`document.querySelector('.title-settings').click()`);
  await waitFor('settings page', () => run(`!!document.querySelector('.settings-page [aria-label="Обновления приложения"]')`));
  await run(`document.querySelector('.settings-page [aria-label="Обновления приложения"]').click()`);
  await waitFor('settings show package version', () => run(`document.querySelector('.settings-page .setting-card header')?.textContent.includes(${JSON.stringify(`Установлена версия ${version}.`)})`));
  await go('Меню');
  await waitFor('about action', () => run(`!!document.querySelector('[aria-label="О приложении"]')`));
  await run(`document.querySelector('[aria-label="О приложении"]').click()`);
  await waitFor('About has package version', () => run(`document.querySelector('.about-build strong')?.textContent === ${JSON.stringify(`Версия ${version}`)}`));

  await settings('Качество аудио');
  await waitFor('file format', () => run(`document.querySelector('[aria-label="Текущий трек"]')?.textContent.includes('64 кбит/с')`));
  await select('[aria-label="Качество воспроизведения"] select', 'metered');
  await waitFor('configured network profile', async () => (await preferences()).audioQuality.network === 'metered');
  await click('.settings-back');
  await click('.settings-page [aria-label="Интеграции"]');
  await waitFor('widget setting', () => run(`!!document.querySelector('[aria-label="Виджеты рабочего стола"] select')`));
  await select('[aria-label="Виджеты рабочего стола"] select', 'white');
  const widgetBounds = window.getBounds();
  const widgetTime = await run('document.querySelector("audio").currentTime');
  await click('[aria-label="Виджеты рабочего стола"] button');
  await waitFor('floating widget opens without replacing the renderer', async () => window.isAlwaysOnTop() && window.getBounds().width < widgetBounds.width
    && await run(`document.querySelector('.widget-mode > .desktop-widget')?.dataset.widgetBackground === 'white' && window.testAudio === document.querySelector('audio')`));
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  await click('.widget-window-buttons [aria-label="Вернуться в плеер"]');
  await waitFor('widget restores the old window', async () => !window.isAlwaysOnTop() && !await run(`!!document.querySelector('.widget-mode > .desktop-widget')`));
  assert.deepEqual(window.getBounds(), widgetBounds);
  assert.equal(await run('document.querySelector("audio").currentTime'), widgetTime);
  await click('[aria-label="Сохранять текст с новым MP3"]');
  await waitFor('opt-in to MP3 lyric tagging', async () => (await preferences()).exportLyrics);
  await click('.settings-back');
  await click('.settings-page [aria-label="Воспроизведение"]');
  await waitFor('crossfade preference', () => run(`!!document.querySelector('[aria-label="Воспроизведение в Luma"] select')`));
  await select('[aria-label="Воспроизведение в Luma"] select', '4');
  await waitFor('crossfade preference saved', async () => (await preferences()).playback.crossfade === 4);


  const catalogCalls = [];
  const streamCalls = [];
  const titleQueries = [];
  const fingerprints = [];
  const vkSession = session.fromPartition(VK_SESSION);
  const fixtureHeaders = { 'Access-Control-Allow-Origin': '*' };
  const mp3Fixture = (id, title) => ({ ...commonsRecording, id, title, creator: 'Исполнитель', duration: 32000,
    url: `https://upload.wikimedia.org/wikipedia/commons/e/e1/${encodeURIComponent(title)}.mp3` });
  const synced = mp3Fixture('61a70211-e1f3-48a9-834b-b196122c5bc1', 'Запись с LRC');
  const plain = mp3Fixture('61a70211-e1f3-48a9-834b-b196122c5bc2', 'Запись с тегом');
  const lrcText = '[00:00.25] Первый куплет\n[00:01.25] Второй';
  const plainText = 'Первый куплет\nВторой';
  const lyricQueries = [];
  const economyUrl = jamendoRecording.url.replace('format=mp32', 'format=mp31');

  session.defaultSession.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    if (url.origin === 'https://itunes.apple.com' && url.pathname === '/search') {
      const term = url.searchParams.get('term');
      titleQueries.push(term);
      return Response.json({ results: term === 'мадам брошкина' ? [madam, remix] : [] });
    }
    if (url.origin === 'https://api.acoustid.org' && url.pathname === '/v2/lookup') {
      assert.equal(request.method, 'POST');
      fingerprints.push(Object.fromEntries(new URLSearchParams(await request.text())));
      return Response.json(acoustic);
    }
    if (url.pathname.endsWith('/thumb/') && url.origin === 'https://api.openverse.org') {
      return new Response(cover, { headers: { ...fixtureHeaders, 'Content-Type': 'image/webp' } });
    }
    if (url.origin === 'https://lrclib.net' && url.pathname === '/api/get') {
      const title = url.searchParams.get('track_name');
      lyricQueries.push(Object.fromEntries(url.searchParams));
      return title === synced.title || title === plain.title ? Response.json({ trackName: title, artistName: 'Исполнитель', duration: 32,
        plainLyrics: plainText, syncedLyrics: title === synced.title ? lrcText : null }) : new Response(null, { status: 404 });
    }
    if (url.origin === 'https://api.openverse.org' && url.pathname.startsWith('/v1/audio/')) {
      catalogCalls.push(url);
      const rows = url.searchParams.get('q') === 'fixture-mp3' ? [synced, plain] : [jamendoRecording, commonsRecording];
      return Response.json(url.pathname === '/v1/audio/' ? { results: rows } : [...rows, synced, plain].find((item) => url.pathname.endsWith(`/${item.id}/`)), { headers: fixtureHeaders });
    }
    if ([jamendoRecording.url, economyUrl, commonsRecording.url, synced.url, plain.url].includes(url.href)) {
      // Exercise the production CSP and a real decoder without requiring network or a specific codec CDN.
      streamCalls.push(url.href);
      const range = request.headers.get('Range');
      const bytes = range && parseByteRange(range, sample.length);
      const body = bytes ? sample.subarray(bytes.start, bytes.end + 1) : sample;
      return new Response(body, { status: bytes ? 206 : 200, headers: {
        'Content-Type': 'audio/mpeg', 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes',
        ...(bytes && { 'Content-Range': `bytes ${bytes.start}-${bytes.end}/${sample.length}` }),
      } });
    }
    if (url.origin === 'https://vk.ru' && url.pathname === '/widget_playlist.php') {
      return new Response('<!doctype html><title>Mock VK widget</title>', { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response(null, { status: 404 });
  });
  vkSession.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    const html = (body) => new Response(`<!doctype html><title>Page-controlled title</title>${body}`, { headers: { 'Content-Type': 'text/html' } });
    if (url.origin === 'https://id.vk.ru') return html('<a id="signin" href="https://vk.ru/audio?signed=1">Sign in fixture</a>');
    if (url.origin !== 'https://vk.ru') return new Response('Untrusted destination', { status: 418 });
    if (url.searchParams.has('signed')) return html('<script>document.cookie = "lumaFixture=1; Max-Age=3600; Secure";</script><p>Signed-in fixture</p>');
    if (url.pathname === '/audio') return html('<a id="vkid" target="_blank" href="https://id.vk.ru/auth">VK ID fixture</a>');
    return html('<p>Playlist fixture</p><a id="outside" href="https://example.invalid/">Outside</a><a id="popup" href="https://example.invalid/" target="_blank">Outside popup</a>');
  });
  const onlineAudio = 'audio[data-online-audio]';
  const playOnline = '.online-result-actions button[aria-label="Слушать онлайн: All About Jazz"]';
  const queueOnline = '.online-result-actions button[aria-label="В очередь: Jazz-Sax"]';
  try {
    await go('Главная');
    await waitFor('local track metadata editor', () => run(`!!document.querySelector('.track-details-button')`));
    await click('.track-details-button');
    await waitFor('track details dialog', () => run(`!!document.querySelector('.track-details-dialog[open]')`));
    await click('.metadata-lookup summary');
    await fill('.metadata-search-controls input', 'Madam Broshkina');
    await click('.metadata-search-controls button');
    await waitFor('two recording versions', () => run(`document.querySelectorAll('.metadata-results li').length === 2`));
    assert.deepEqual(titleQueries, ['Madam Broshkina', 'мадам брошкина']);
    assert.equal(await run(`document.querySelector('.track-details-fields input').value`), "Ty Zdes'");
    assert.match(await run(`document.querySelector('.metadata-results li').textContent`), /Мадам Брошкина.*Алла Пугачёва/);
    await click('.metadata-results li button');
    assert.equal(await run(`document.querySelector('.track-details-fields input').value`), 'Мадам Брошкина');
    assert.equal(await run(`document.querySelectorAll('.track-details-fields input')[1].value`), 'Неизвестный исполнитель');
    assert.equal(await run(`document.querySelector('.hero h2').textContent`), "Ty Zdes'", 'the draft is not applied automatically');
    await click('.metadata-sound button');
    await waitFor('decoded local audio fingerprint candidate', () => run(`document.querySelector('.metadata-results li')?.textContent.includes('Отблеск (тест)')`));
    assert.equal(fingerprints.length, 1);
    assert.deepEqual(Object.keys(fingerprints[0]).sort(), ['client', 'duration', 'fingerprint', 'format', 'meta']);
    assert.match(fingerprints[0].fingerprint, /^AQ[A-Za-z0-9_-]{14,16384}$/);
    assert.equal(fingerprints[0].client, 'fixture-only');
    assert.ok(Math.abs(Number(fingerprints[0].duration) - await run('window.testAudio.duration')) < 1);
    await click('.track-details-dialog button[type="submit"]');
    await withArt('Мадам Брошкина');
    assert.equal((await readFile(broken)).equals(taggedMp3(sample, {
      title: "Ty Zdes'", picture: { mime: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
    })), true, 'the music file and embedded data remain unchanged');
    await click('.hero-action');
    await waitFor('local track is playing', () => run(`!document.querySelector('audio').paused && document.querySelector('audio').currentTime > 4.15`));
    await run(`(() => { const audio = document.querySelector('audio'); audio.currentTime = audio.duration - 4.8; })()`);
    await waitFor('local crossfade overlaps with the following track', () => run(`(() => {
      const [from, to] = document.querySelectorAll('audio');
      return !from.paused && !to.paused && to.currentTime > .05 && document.querySelector('.hero h2').textContent === 'Отблеск';
    })()`));
    await click('.player-bar .play-button');
    await waitFor('pause cancels the retiring deck', () => run(`[...document.querySelectorAll('audio')].every((item) => item.paused) && !document.querySelector('audio').hasAttribute('src')`));
    console.log('::notice title=Local crossfade::Two decoded tracks overlap before the first ends. Pausing stops both decks immediately.');

    await go('Поиск');
    await waitFor('collection search', () => run(`!!document.querySelector('main input[type="search"]')`));
    await fill('main input[type="search"]', 'jazz');
    await waitFor('online fallback prompt', () => run(`!!document.querySelector('.online-search-form button')`));
    assert.equal(catalogCalls.length, 0, 'typing stays local until the user opts in');
    assert.equal(await run(`document.querySelectorAll('.service-search-link').length`), 0);
    assert.deepEqual(await run(`[...document.querySelector('.online-search-form select').options].map(option => option.value)`), ['all', 'jamendo', 'wikimedia_audio']);
    await click('.online-search-form button');
    await waitFor('both online sources', () => run(`document.querySelectorAll('.online-results li').length === 2`));
    assert.equal(catalogCalls.length, 1);
    assert.equal(catalogCalls[0].searchParams.get('q'), 'jazz');
    await click(queueOnline);
    await waitFor('an online reference queued', async () => (await preferences()).onlineRefs.length === 1);
    assert.deepEqual(streamCalls, [], 'queueing does not fetch audio');
    await click(playOnline);
    await waitFor('online audio decoded', () => run(`Number.isFinite(document.querySelector('${onlineAudio}').duration)`));
    await withArt('All About Jazz');
    assert.ok(streamCalls.includes(economyUrl));
    assert.ok(!streamCalls.includes(jamendoRecording.url), 'metered profile requests the actual MP3 96 variant');
    assert.equal(await run(`document.querySelector('audio').paused`), true);
    assert.equal((await preferences()).onlineTracks.length, 0, 'playing is not a library save');
    await click('button[aria-label="Сохранить: All About Jazz"]');
    await waitFor('online link saved', async () => (await preferences()).onlineTracks.length === 1);
    await go('Главная');
    await waitFor('online attribution shown in player', () => run(`document.querySelector('.hero .online-credit')?.textContent.includes('CC BY-NC-ND 3.0')`));
    await go('VK Музыка');
    await waitFor('native VK shelf', () => run(`!!document.querySelector('.vk-native-shelf')`));
    assert.equal(await run(`!!document.querySelector('iframe')`), false, 'the shelf does not open a website or a player automatically');
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    const childView = () => window.contentView.children.find((view) => view.webContents?.session === vkSession);
    await click('.vk-account-actions .primary-button');
    const vk = await waitFor('VK is attached to the main window', childView);
    const contents = vk.webContents;
    const vkRun = (script) => contents.executeJavaScript(script, true);
    await waitFor('VK home fixture', () => vkRun(`!!document.getElementById('vkid')`));
    assert.equal(vk.webContents.session, vkSession);
    assert.ok(vkSession.storagePath?.includes('luma-vk-web'));
    assert.notEqual(vk.webContents.session, window.webContents.session);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    const measured = () => run(`(() => { const { x, y, width, height } = document.querySelector('.vk-site-slot').getBoundingClientRect(); return { x, y, width, height }; })()`);
    await waitFor('VK is bounded to the measured slot', async () => {
      const bounds = vk.getBounds(), slot = await measured();
      return slot.width > 0 && slot.height > 0 && Object.keys(slot).every((key) => Math.abs(slot[key] - bounds[key]) <= 1);
    });
    assert.equal(await vkRun(`typeof window.luma === 'undefined' && typeof require === 'undefined' && typeof process === 'undefined'`), true);
    await vkRun(`document.getElementById('vkid').click(); void 0;`);
    await waitFor('VK ID stays inside the main window', () => vk.webContents.getURL() === 'https://id.vk.ru/auth');
    await waitFor('trusted hostname in the toolbar', () => run(`document.querySelector('.vk-site-origin span').textContent === 'id.vk.ru'`));
    await vkRun(`document.getElementById('signin').click(); void 0;`);
    await waitFor('signed-in VK session fixture', () => vkRun(`document.cookie.includes('lumaFixture=1')`));
    await click('.vk-site-toolbar [aria-label="Закрыть сайт VK"]');
    await waitFor('VK view and renderer closed', () => !childView() && contents.isDestroyed());
    await click('.vk-add');
    await fill('#vk-widget-code', 'https://vk.com/audios-42?z=audio_playlist-42_7/Share-Key');
    await click('#vk-playlist-form button[type="submit"]');
    await waitFor('copied playlist share canonicalized', () => run(`JSON.parse(localStorage.getItem('luma-player:vk-playlists:v1'))?.playlists[0]?.shareKey === 'Share-Key'`));
    assert.equal(await run(`!!document.querySelector('.vk-widget-toggle')`), false);
    await click('.vk-spotlight-actions .primary-button');
    const playlist = await waitFor('playlist opens in the signed-in VK partition', () => {
      const child = childView();
      return child?.webContents.getURL() === 'https://vk.ru/music/playlist/-42_7_Share-Key' ? child : undefined;
    });
    assert.equal(await playlist.webContents.executeJavaScript(`document.cookie.includes('lumaFixture=1')`), true);
    assert.equal((await session.defaultSession.cookies.get({ name: 'lumaFixture' })).length, 0);
    await playlist.webContents.executeJavaScript(`document.getElementById('outside').click(); document.getElementById('popup').click(); void 0;`, true);
    assert.equal(playlist.webContents.getURL(), 'https://vk.ru/music/playlist/-42_7_Share-Key');
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    await settings('Интеграции');
    await waitFor('navigating away closes VK', () => !childView());
    const originalMessage = dialog.showMessageBox;
    try {
      dialog.showMessageBox = async () => ({ response: 1 });
      await click('[aria-label="VK Music"] .settings-actions button:last-child');
      await waitFor('reset confirms local partition cleanup', () => run(`document.querySelector('[aria-label="VK Music"] [role="status"]')?.textContent.includes('очищены')`));
    } finally { dialog.showMessageBox = originalMessage; }
    assert.equal((await vkSession.cookies.get({ name: 'lumaFixture' })).length, 0);
    await go('VK Музыка');
    await waitFor('reset leaves the bookmark intact', () => run(`document.querySelector('#vk-playlist-title')?.textContent === 'Плейлист 7'`));
    await click('.vk-playlist-item');
    await waitFor('editorial widget available', () => run(`!!document.querySelector('.vk-widget-toggle')`));
    await click('.vk-widget-toggle');
    await waitFor('explicit official widget', () => run(`!!document.querySelector('iframe.vk-frame-loaded')`));
    assert.equal(await run(`document.querySelector('${onlineAudio}').paused`), true);
    await click('.vk-mode-bar button');
    await waitFor('widget closed without opening browser windows', () => run(`!document.querySelector('iframe')`));
    await go('Главная');
    await withArt('All About Jazz');
    await go('Поиск');
    await waitFor('MP3 catalog query', () => run(`!!document.querySelector('main input[type="search"]')`));
    await fill('main input[type="search"]', 'fixture-mp3');
    await waitFor('downloadable sources form', () => run(`!!document.querySelector('.online-search-form button')`));
    await click('.online-search-form button');
    await waitFor('only the two permitted MP3 downloads', () => run(`document.querySelectorAll('.online-result-actions [aria-label^="Скачать MP3"]').length === 2`));
    const choosePath = dialog.showSaveDialog;
    try {
      const syncedPath = join(profile, 'new-synced.mp3');
      const plainPath = join(profile, 'new-plain.mp3');
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: syncedPath });
      await click(`button[aria-label="Скачать MP3: ${synced.title}"]`);
      await waitFor('both lyrics formats are saved when available', () => run(`(() => {
        const result = document.querySelector('.toast small')?.textContent;
        return result?.includes('сохранён в .lrc') && result.includes('в тег MP3');
      })()`));
      assert.equal((await parseFile(syncedPath)).common.lyrics[0].text, plainText);
      assert.equal((await run(`window.luma.lyrics.local(${JSON.stringify('non-library-id')})`)), null, 'lyrics IPC only reads tracks in the index');
      assert.equal(await readFile(syncedPath.replace('.mp3', '.lrc'), 'utf8'), `${lrcText}\n`);
      assert.match(await readFile(syncedPath.replace('.mp3', '.source.txt'), 'utf8'), /creativecommons.org/);
      await delay(400); // Respect the lyrics provider's request spacing.
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: plainPath });
      await click(`button[aria-label="Скачать MP3: ${plain.title}"]`);
      await waitFor('plain text embedded in MP3', () => run(`document.querySelector('.toast small')?.textContent.includes('в тег MP3')`));
      assert.equal((await parseFile(plainPath)).common.lyrics[0].text, plainText);
      await assert.rejects(readFile(plainPath.replace('.mp3', '.lrc')), { code: 'ENOENT' });
      assert.deepEqual(lyricQueries.map(({ track_name, duration }) => [track_name, duration]), [[synced.title, '32'], [plain.title, '32']]);
      await click(`button[aria-label="Скачать MP3: ${plain.title}"]`);
      await waitFor('existing destination is not overwritten', () => run(`document.querySelector('.toast-error small')?.textContent.includes('Файл уже существует')`));
      assert.equal((await parseFile(plainPath)).common.lyrics[0].text, plainText);
      const existingLrc = join(profile, 'with-existing.lrc');
      await writeFile(existingLrc, '[00:01.00] Existing local lyrics');
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: existingLrc.replace('.lrc', '.mp3') });
      await click(`button[aria-label="Скачать MP3: ${synced.title}"]`);
      await waitFor('existing sidecar is not overwritten', () => run(`document.querySelector('.toast small')?.textContent.includes('Существующий .lrc не изменён')`));
      assert.equal(await readFile(existingLrc, 'utf8'), '[00:01.00] Existing local lyrics');
      assert.equal((await parseFile(existingLrc.replace('.lrc', '.mp3'))).common.lyrics[0].text, plainText);
    } finally { dialog.showSaveDialog = choosePath; }
  } finally {
    session.defaultSession.protocol.unhandle('https');
    vkSession.protocol.unhandle('https');
    await vkSession.clearStorageData();
  }
  console.log('Desktop smoke: monitor fullscreen; compact widget restores bounds; Apple/WASM; metered MP3; lyrics export; same-window VK and isolated reset.');
  if (liveServices) {
    const suggestions = await run(`window.luma.recognition.search('Madam Broshkina', 'ru-RU')`);
    assert.ok(suggestions.some(({ title }) => title === 'Мадам Брошкина'), 'live Apple Music transliteration lookup');
    console.log('::notice title=Live Apple Music::Cyrillic recording candidates returned for a transliterated title.');
    try {
      const text = await run(`window.luma.lyrics.lookup({ title: 'Yellow', artist: 'Coldplay', duration: 267 })`);
      assert.ok(text?.synced || text?.plain);
      console.log('::notice title=Live LRCLIB::The official endpoint returned text for a matching recording.');
    } catch {
      console.log('::warning title=Live LRCLIB::The endpoint did not return matching lyrics from this network. The controlled checks passed.');
    }

    try {
      await go('VK Музыка');
      await waitFor('VK account action', () => run(`!!document.querySelector('.vk-account-actions .primary-button')`));
      await click('.vk-account-actions .primary-button');
      await waitFor('VK service finished navigating', () => run(`document.querySelector('.vk-site-origin small')?.textContent === 'Официальный сайт'`));
      await delay(2200); // Give VK's own SPA time to report an initialization error.
      console.log(externalRuntimeErrors
        ? '::warning title=Live VK navigation::First-party page loaded but reported a site script error. Account access and playback are unverified.'
        : '::notice title=Live VK navigation::First-party page loaded in the main window; this does not verify login or playback.');
      await click('.vk-site-toolbar [aria-label="Закрыть сайт VK"]');
    } catch {
      console.log('::warning title=Live VK navigation::Public VK page did not load in this network. The deterministic session checks passed.');
    }
  }
  if (await run(`!!document.querySelector('.vk-site-toolbar')`)) await click('.vk-site-toolbar [aria-label="Закрыть сайт VK"]');
  const journalFile = join(profile, 'Luma Player', 'logs', 'diagnostics.json');
  const snapshot = await waitFor('desktop and renderer startup events', async () => {
    const data = await run('window.luma.diagnostics.snapshot()');
    const names = data.entries.map(({ event }) => event);
    return ['desktop.start', 'desktop.ready', 'renderer.start', 'library.opened', 'audio.ready'].every((name) => names.includes(name)) ? data : undefined;
  });
  assert.match(snapshot.environment.runtime, /Electron .*Chromium/);
  assert.equal(snapshot.environment.version, version);
  assert.equal(snapshot.storage, 'file');
  if (process.platform === 'win32') {
    assert.match(snapshot.environment.system, /^Windows(?: 10| 11| Server)? /);
    assert.ok(snapshot.environment.system.includes(`сборка ${release().split('.')[2]} · приложение ${process.arch}`));
    console.log(`Native diagnostics: ${snapshot.environment.system}`);
  }
  await run(`window.luma.diagnostics.record('audio.error', { code: 4, path: 'private-test-path.mp3', token: 'private-test-token' });
    window.luma.diagnostics.record('desktop.failed', { code: 1 });`);
  const persisted = await waitFor('persisted filtered diagnostics', async () => {
    const raw = await readFile(journalFile, 'utf8').catch(() => '');
    return raw.includes('"code":4') ? raw : undefined;
  });
  assert.doesNotMatch(persisted, /private-test|desktop\.failed/u);
  await run(`document.querySelector('.sidebar-diagnostic').click()`);
  await waitFor('diagnostics page', () => run(`document.querySelector('h1')?.textContent === 'Диагностика' && !!document.querySelector('.journal-entry.level-error')`));
  const reportFile = join(profile, 'Отчёт Luma.log');
  const saveDialog = dialog.showSaveDialog;
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: reportFile });
    assert.equal(await run('window.luma.diagnostics.saveReport()'), true);
  } finally { dialog.showSaveDialog = saveDialog; }
  const report = await readFile(reportFile, 'utf8');
  assert.ok(report.startsWith(`Luma Player ${version} ·`));
  assert.match(report, /Система: .*Electron/s);
  assert.match(report, /audio\.error/u);
  assert.doesNotMatch(report, /private-test/u);
  assert.deepEqual((await run('window.luma.diagnostics.clear()')).entries, []);
  assert.deepEqual(JSON.parse(await readFile(journalFile, 'utf8')), []);
  assert.deepEqual(warnings, []);
  console.log('Desktop smoke: native diagnostics recorded, persisted, exported, and cleared.');
  console.log('Desktop smoke: Cyrillic and embedded/fallback artwork published from luma:// with production CSP.');
  if (liveCatalog) {
    await session.defaultSession.clearCache();
    const failed = [];
    for (const source of ['jamendo', 'wikimedia_audio']) {
      // The controlled check exercised mp31. The live check confirms the requested variant really plays.

      let result;
      try {
        await go('Главная');
        await go('Поиск');
        await waitFor('live search field', () => run(`!!document.querySelector('main input[type="search"]')`));
        await fill('main input[type="search"]', source === 'jamendo' ? 'jazz' : 'Bach chaconne');
        await waitFor('live catalog form', () => run(`!!document.querySelector('.online-search-form select')`));
        await run(`(() => {
          const choice = document.querySelector('.online-search-form select');
          choice.value = ${JSON.stringify(source)};
          choice.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        await click('.online-search-form button');
        const options = await waitFor(`${source} live results`, async () => {
          const outcome = await run(`(() => {
            const problem = document.querySelector('.online-panel .error');
            return problem ? { error: problem.textContent } : [...document.querySelectorAll('.online-results li .online-result-actions button:first-child')].map((button) => button.getAttribute('aria-label'));
          })()`);
          if (outcome?.error) throw new Error(outcome.error);
          return outcome?.length ? outcome : undefined;
        });
        for (const name of options.slice(0, 3)) {
          const selector = `.online-result-actions button[aria-label=${JSON.stringify(name)}]`;
          // Search returned official provider URLs; ask the same audio element used by the app to decode them.
          await click(selector);
          const decoded = await waitFor(`${source} audio attempt`, () => run(`(() => {
            const media = document.querySelector('${onlineAudio}');
            return media.currentTime > .15 ? new URL(media.currentSrc).searchParams.get('format') ?? 'original' : media.error ? 'unavailable' : null;
          })()`)).catch(() => 'timed out');
          if (decoded === 'mp31' && source === 'jamendo' || decoded === 'original' && source === 'wikimedia_audio') {
            result = `live search and playback passed (${name.replace('Слушать онлайн: ', '')}, ${decoded})`;
            break;
          }
        }
        if (!result) throw new Error('catalog returned results, but audio did not play from the first three URLs');
      } catch (error) {
        result = error instanceof Error ? error.message : String(error);
        failed.push(source);
      }
      console.log(`::notice title=Live catalog ${source}::${result.replace(/%/g, '%25').replace(/\r?\n/g, ' ')}`);
    }
    assert.deepEqual(failed, [], 'Live provider check (optional, depends on the network and these services)');
  }
}

void smoke().then(() => finish(0), fail);
process.on('exit', () => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still have cache files open. */ } });
function fail(error) {
  console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = (error instanceof Error ? error.message : String(error)).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Electron smoke::${message}`);
  }
  finish(1);
}
function finish(code) {
  clearTimeout(timer);
  app.exit(code);
}
