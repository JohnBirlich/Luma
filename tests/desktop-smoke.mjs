// Run with Electron after `npm run build`. Uses a temporary profile, not the user's library.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { APP_ORIGIN, DesktopLibrary } from '../dist-electron/electron/library.js';
import { VK_MUSIC_URL } from '../dist-electron/src/shared/vk.js';
import { parseByteRange } from '../dist-electron/electron/protocol.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';
import { taggedMp3 } from './fixtures/mp3.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const profile = await mkdtemp(join(tmpdir(), 'luma-desktop-smoke-'));
app.setAppPath(root);
app.setPath('appData', profile);
app.disableHardwareAcceleration();
delete process.env.LUMA_DEV_SERVER_URL;

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
const timer = setTimeout(() => fail(new Error('Desktop smoke test did not finish')), liveCatalog ? 240_000 : 135_000);
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
const warnings = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => {
    if (/MediaImage src can only be|Content Security Policy|Uncaught /u.test(event.message)) warnings.push(event.message);
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
  await expand();
  await waitForDialog();
  assert.equal(await run(`document.querySelector('.immersive-player h1')?.textContent`), "Ty Zdes'");
  assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused && Math.abs(window.testAudio.currentTime - 4) < .2`), true);
  assert.equal(await run(`!!document.querySelector('.immersive-player .record-platter')`), true);
  assert.deepEqual(await run(`[...document.querySelectorAll('.upcoming-copy strong')].map((item) => item.textContent)`), ['Отблеск', 'Отлив', 'Фиолетовый час', 'Бумажные спутники', 'Синий меридиан']);
  await collapseWithPointer();
  // Simulate a host that never settles its request, without waiting to show or close the player.
  await run(`window.lumaRequestFullscreen = HTMLElement.prototype.requestFullscreen;
    HTMLElement.prototype.requestFullscreen = () => new Promise(() => {}); void 0;`);
  try {
    await expand();
    await waitForDialog();
    await collapseWithPointer();
    assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused && Math.abs(window.testAudio.currentTime - 4) < .2`), true);
  } finally { await run(`HTMLElement.prototype.requestFullscreen = window.lumaRequestFullscreen; void 0;`); }
  await run(`document.querySelector('.title-settings').click()`);
  await waitFor('settings page', () => run(`!!document.querySelector('.settings-page [aria-label="Обновления приложения"]')`));
  await run(`document.querySelector('.settings-page [aria-label="Обновления приложения"]').click()`);
  await waitFor('settings show package version', () => run(`document.querySelector('.settings-page .setting-card header')?.textContent.includes(${JSON.stringify(`Установлена версия ${version}.`)})`));
  await go('Меню');
  await waitFor('about action', () => run(`!!document.querySelector('[aria-label="О приложении"]')`));
  await run(`document.querySelector('[aria-label="О приложении"]').click()`);
  await waitFor('About has package version', () => run(`document.querySelector('.about-build strong')?.textContent === ${JSON.stringify(`Версия ${version}`)}`));

  const catalogCalls = [];
  const streamCalls = [];
  const fixtureHeaders = { 'Access-Control-Allow-Origin': '*' };
  session.defaultSession.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/thumb/') && url.origin === 'https://api.openverse.org') {
      return new Response(cover, { headers: { ...fixtureHeaders, 'Content-Type': 'image/webp' } });
    }
    if (url.origin === 'https://api.openverse.org' && url.pathname.startsWith('/v1/audio/')) {
      catalogCalls.push(url);
      const pair = [jamendoRecording, commonsRecording];
      return Response.json(url.pathname === '/v1/audio/' ? { results: pair } : pair.find((item) => url.pathname.endsWith(`/${item.id}/`)), { headers: fixtureHeaders });
    }
    if ([jamendoRecording.url, commonsRecording.url].includes(url.href)) {
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
  const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click(); void 0;`);
  const fill = (selector, value) => run(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const preferences = () => run(`JSON.parse(localStorage.getItem('luma-player:v1'))`);
  const onlineAudio = 'audio[data-online-audio]';
  const playOnline = '.online-result-actions button[aria-label="Слушать онлайн: All About Jazz"]';
  const queueOnline = '.online-result-actions button[aria-label="В очередь: Jazz-Sax"]';
  try {
    await go('Поиск');
    await waitFor('collection search', () => run(`!!document.querySelector('main input[type="search"]')`));
    await fill('main input[type="search"]', 'jazz');
    await waitFor('online fallback prompt', () => run(`!!document.querySelector('.online-search-form button')`));
    assert.equal(catalogCalls.length, 0, 'typing stays local until the user opts in');
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
    assert.ok(streamCalls.includes(jamendoRecording.url));
    assert.equal(await run(`document.querySelector('audio').paused`), true);
    assert.equal((await preferences()).onlineTracks.length, 0, 'playing is not a library save');
    await click('button[aria-label="Сохранить: All About Jazz"]');
    await waitFor('online link saved', async () => (await preferences()).onlineTracks.length === 1);
    await go('Главная');
    await waitFor('online attribution shown in player', () => run(`document.querySelector('.hero .online-credit')?.textContent.includes('CC BY-NC-ND 3.0')`));
    await go('VK Музыка');
    await waitFor('native VK shelf', () => run(`!!document.querySelector('.vk-native-shelf')`));
    assert.equal(await run(`typeof window.luma.openVkWebsite`), 'undefined');
    assert.equal(await run(`!!document.querySelector('iframe')`), false, 'the shelf does not open a website or a player automatically');
    await click('.vk-native-account summary');
    const launch = shell.openExternal;
    const openedUrls = [];
    try {
      shell.openExternal = async (url) => { openedUrls.push(url); };
      assert.equal(await run(`document.querySelector('a.vk-account-open').href`), VK_MUSIC_URL);
      await click('a.vk-account-open');
      await waitFor('official sign-in URL handed to browser', () => openedUrls.length);
      assert.deepEqual(openedUrls, [VK_MUSIC_URL]);
      assert.equal(BrowserWindow.getAllWindows().length, 1, 'VK site does not open inside Luma');
      shell.openExternal = async () => { throw new Error('fixture: browser handler unavailable'); };
      await click('a.vk-account-open');
      await waitFor('visible browser launch error', () => run(`document.querySelector('.vk-link-error')?.textContent.includes(${JSON.stringify(VK_MUSIC_URL)})`));
    } finally { shell.openExternal = launch; }
    await click('.vk-spotlight-actions .primary-button');
    await waitFor('explicit official widget', () => run(`!!document.querySelector('iframe.vk-frame-loaded')`));
    assert.equal(await run(`document.querySelector('${onlineAudio}').paused`), true);
    await click('.vk-mode-bar button');
    await waitFor('widget closed without opening browser windows', () => run(`!document.querySelector('iframe')`));
    await go('Главная');
    await withArt('All About Jazz');
  } finally {
    session.defaultSession.protocol.unhandle('https');
  }
  console.log('Desktop smoke: fullscreen pointer exit, queue, catalog import/playback with production CSP, and native VK shelf + explicit widget.');
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
            return media.currentTime > .15 ? 'playing' : media.error ? 'unavailable' : null;
          })()`)).catch(() => 'timed out');
          if (decoded === 'playing') { result = `live search and playback passed (${name.replace('Слушать онлайн: ', '')})`; break; }
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
