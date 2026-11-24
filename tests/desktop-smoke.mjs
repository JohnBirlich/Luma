// Run with Electron after `npm run build`. Uses a temporary profile, not the user's library.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, powerMonitor, screen, session, shell } from 'electron';
import { APP_ORIGIN, DesktopLibrary } from '../dist-electron/electron/library.js';
import { AUDIUS_MEDIA_PARTITION } from '../dist-electron/electron/audius-network.js';
import { RADIO_LISTINGS, STATIONS } from '../dist-electron/src/shared/radio.js';
import { APP_NAME, APP_PROFILE_DIR } from '../dist-electron/src/shared/app-info.js';
import { LEGACY_VK_SESSION, VK_MUSIC_URL } from '../dist-electron/src/shared/vk.js';
import { VK_SITE_PARTITION, vkMusicSearchUrl, vkSignInUrl } from '../dist-electron/src/shared/vk-site.js';
import { vkFixtureArtist, vkFixtureAuth, vkFixtureCovers, vkFixturePhoto, vkFixturePrivate, vkFixtureReturn, vkFixtureTracks, vkHeadlessPlayerPage, vkPlayerPage,
  vkPublicPage, vkQrPage, vkSignInPage } from './fixtures/vk-site.mjs';
import { acoustic, madam, remix } from './fixtures/recognition.mjs';
import { alternateRecording, recording } from './fixtures/musicbrainz.mjs';
import { audioDbTrack, phishSong, phishTrack, untimedLyrics } from './fixtures/free-sources.mjs';
import { wordLyrics } from './fixtures/word-lyrics.mjs';
import { installerName, LATEST_RELEASE_API, RELEASE_REPO } from '../dist-electron/src/shared/release-updates.js';
import { musicLaunchUrl, readMusicLink } from '../dist-electron/src/shared/music-links.js';
import { parseByteRange } from '../dist-electron/electron/protocol.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';
import { audiusRecording, creatorStream, storageStream } from './fixtures/public-catalogs.mjs';
import { parseFile } from 'music-metadata';
import { taggedMp3 } from './fixtures/mp3.mjs';
import { probeRadio } from './live-radio.mjs';
import { browserStation, discoveryStation, geniusSearchResponse, geniusReferentsResponse, geniusToken, jamendoClient,
  jamendoResponse, listenBrainzToken, openwhydExample, openwhydResponse } from './fixtures/music-providers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const nextVersion = `${Number(version.split('.')[0]) + 1}.0.0`;
const profile = await mkdtemp(join(tmpdir(), 'luma-desktop-smoke-'));
app.setAppPath(root);
app.setPath('appData', profile);
app.disableHardwareAcceleration();
delete process.env.LUMA_DEV_SERVER_URL;
delete process.env.LUMA_LASTFM_API_KEY;
delete process.env.LUMA_LASTFM_SECRET;
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
const liveRadio = process.env.LUMA_LIVE_RADIO === '1';
// GitHub limits notices per step. Leave that budget for actual provider results in live runs.
const fixtureNotice = (title, message) => console.log(liveCatalog || liveServices || liveRadio
  ? `${title}: ${message}` : `::notice title=${title}::${message}`);
// Maximum raster size expected in compact scene previews. The renderer module is not emitted by the Electron compiler.
const COMPACT_SCENE_PIXELS = 460_800;
const timer = setTimeout(() => fail(new Error('Desktop smoke test did not finish')), liveRadio ? 410_000 : liveCatalog ? 400_000 : liveServices ? 260_000 : 170_000);
// The main process must register its custom protocol before the ready event.
const sample = await readFile(join(root, 'public/demo/afterimage.mp3'));
const cover = await readFile(join(root, 'public/artwork/afterimage.webp'));
const tagged = join(profile, 'Ты здесь.mp3');
const broken = join(profile, 'Без обложки.mp3');
await writeFile(join(profile, 'Ты здесь.lrc'), '[00:00.00] Локальная строка\n[00:01.25] Следующая строка');
await writeFile(join(profile, 'Ты здесь.lyrics.txt'), 'Простой текст локальной записи');
await writeFile(tagged, taggedMp3(sample, {
  title: 'Òû çäåñü', artist: 'Àðèÿ', album: 'Æèâîé çâóê', isrc: 'USABC1200001', picture: { mime: 'image/webp', data: cover },
}));
await writeFile(broken, taggedMp3(sample, {
  title: "Ty Zdes'", picture: { mime: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
}));
try {
  const library = await DesktopLibrary.open(join(profile, APP_PROFILE_DIR));
  const { added } = await library.importPaths([tagged, broken]);
  assert.equal(added.length, 2);
  const localTagged = library.list().find(({ id }) => id === added[0]);
  assert.equal(localTagged.isrc, 'USABC1200001');
  // An upgraded library has no format fields. Find the fixture by ID: realpath can expand Windows short names.
  const libraryFile = join(profile, APP_PROFILE_DIR, 'library.json');
  const index = JSON.parse(await readFile(libraryFile, 'utf8'));
  const legacyEntry = index.find((entry) => entry.id === added[1]);
  assert.ok(legacyEntry?.format);
  delete legacyEntry.format;
  await writeFile(libraryFile, JSON.stringify(index));
} catch (error) { fail(error); }
const indexedLocal = (await DesktopLibrary.open(join(profile, APP_PROFILE_DIR))).list().find(({ fileName }) => fileName === 'Ты здесь.mp3');
const groupedJamendo = { ...jamendoRecording, id: 'f1a70211-e1f3-48a9-834b-b196122c5bc1', title: indexedLocal.title,
  creator: indexedLocal.artist, duration: Math.round(indexedLocal.duration * 1000), audio_set: { title: indexedLocal.album }, isrc: indexedLocal.isrc,
  foreign_landing_url: 'https://www.jamendo.com/track/3111002', url: 'https://prod-1.storage.jamendo.com/?trackid=3111002&format=mp32' };
const warnings = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => {
    if (!/MediaImage src can only be|Content Security Policy|Uncaught /u.test(event.message)) return;
    warnings.push(event.message);
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
  const click = async (selector) => {
    assert.ok(await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click(); return true;
    })()`), `Missing control: ${selector}`);
  };
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
    if (await run(`document.querySelector('.settings-back')?.getAttribute('aria-label') === 'Назад к настройкам'`)) await click('.settings-back');
    await waitFor('settings menu', () => run(`!!document.querySelector('.settings-page [aria-label="Внешний вид"]')`));
    await click(`.settings-page [aria-label="${label}"]`);
  };

  const closeSettings = async () => {
    if (!await run(`!!document.querySelector('.settings-reset')`)) {
      await click('.settings-back');
      await waitFor('left arrow returns to settings index', () => run(`!!document.querySelector('.settings-reset')`));
    }
    await click('.settings-back');
  };
  const clickLastFm = (label) => run(`[...document.querySelectorAll('[aria-label="Last.fm"] button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)}).click()`);

  const withArt = (title) => waitFor(`metadata and artwork for ${title}`, async () => {
    const data = await readMetadata();
    return data?.title === title && data.picture ? data : undefined;
  });
  const first = await withArt('Ты здесь');
  assert.equal(new URL(window.webContents.getURL()).hostname, 'app');
  assert.ok(window.webContents.getURL().startsWith(APP_ORIGIN));
  assert.equal(await run('document.documentElement.lang'), 'ru');
  assert.equal(await run('window.luma.floatOutput.start("48000")'), 'failed', 'Float IPC rejects a non-numeric rate');
  let hasSystemSink = true;
  if (process.platform === 'win32') {
    assert.equal(await run('window.luma.floatOutput.available()'), true, 'the WASAPI helper was built');
    const mode = await run('window.luma.floatOutput.start(48000)');
    assert.ok(['running', 'unsupported'].includes(mode), `WASAPI helper starts or reports device incompatibility: ${mode}`);
    await run('window.luma.floatOutput.stop()');
    const module = (await readdir(join(root, 'dist', 'assets'))).find((name) => /^float\.worklet-.*\.js$/.test(name));
    assert.ok(module, 'Float worklet shipped with the renderer');
    const graphCheck = await run(`(async () => {
      const ctx = new AudioContext();
      let stage = 'audioWorklet.addModule';
      try {
        await ctx.audioWorklet.addModule(${JSON.stringify(`/assets/${module}`)});
        stage = 'AudioContext.setSinkId(none)';
        await ctx.setSinkId({ type: 'none' });
        stage = 'AudioContext.setSinkId(default)';
        await ctx.setSinkId('');
        return 'ok';
      } catch (error) {
        if (stage === 'AudioContext.setSinkId(default)' && error.name === 'NotFoundError') return 'no-system-output';
        return stage + ': ' + error.name + ': ' + error.message;
      }
      finally { await ctx.close(); }
    })()`);
    assert.ok(['ok', 'no-system-output'].includes(graphCheck), `Chromium Float audio graph preflight: ${graphCheck}`);
    hasSystemSink = graphCheck === 'ok';
    fixtureNotice('WASAPI Float probe', `Driver result for stereo 48 kHz Float32 on the runner: ${mode}.`);
  }
  assert.equal(await run('window.luma.lastfm.status().then(({ enabled }) => enabled)'), false);
  assert.equal(await run('window.luma.discord.status()'), process.platform === 'win32' ? 'off' : 'unsupported');
  assert.equal(await run(`window.luma.updates.install(${JSON.stringify(nextVersion)})`), 'unavailable', 'a source build cannot launch an installer');
  assert.equal(await run(`window.luma.updates.download(${JSON.stringify(nextVersion)})`), 'unavailable', 'a source build cannot download an update');
  assert.deepEqual(await run('window.luma.updates.downloadState()'), { state: 'idle' });
  assert.equal(await run('window.luma.updates.revealDownload()'), false, 'only a completed download can be revealed');
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
  await waitFor('sidecar LRC has priority over plain lyrics', () => run(`document.querySelector('.lyrics-scroll [aria-current="true"]')?.textContent === 'Локальная строка'`));
  await click('.lyrics-scroll p:nth-child(2) .lyric-line-seek');
  await waitFor('clicking a timed line seeks on the audio deck', () => run(`Math.abs(document.querySelector('audio').currentTime - 1.25) < .05`));
  await waitFor('seek updates the highlighted line', () => run(`document.querySelector('.lyrics-scroll [aria-current="true"]')?.textContent === 'Следующая строка'`));
  await click('.hero-action');
  await waitFor('audio is playing before the sleep timer', () => run(`!document.querySelector('audio').paused`));
  await click('.sleep-timer-open');
  await waitFor('sleep timer is reachable from now playing', () => run(`!!document.querySelector('.sleep-timer button')`));
  await click('.sleep-timer button:first-child');
  await waitFor('timer has an in-session deadline', () => run(`document.querySelector('.sleep-timer button')?.textContent === 'Отменить таймер'`));
  await run(`void (window.originalClock = Date.now, Date.now = () => window.originalClock() + 6 * 60_000)`);
  try {
    powerMonitor.emit('resume');
    await waitFor('an expired timer pauses playback and clears itself on system resume', () => run(`document.querySelector('audio').paused && document.querySelector('.sleep-timer button')?.textContent === '5 мин'`));
  } finally { await run(`void (Date.now = window.originalClock, delete window.originalClock)`); }
  await closeSettings();
  await run(`(() => { document.querySelector('audio').currentTime = 1.5; })()`);
  await run(`(() => {
    const field = document.querySelector('.lyrics-card input[type="file"]');
    const file = new DataTransfer();
    file.items.add(new File(['Прикреплённый текст'], 'lyrics.txt', { type: 'text/plain' }));
    field.files = file.files; field.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor('manual TXT replaces the sidecar', () => run(`document.querySelector('.lyrics-plain')?.textContent === 'Прикреплённый текст'`));
  await run(`window.testKaraokeAudio = document.querySelector('audio'); document.querySelector('.hero-karaoke').focus(); document.querySelector('.hero-karaoke').click();`);
  await waitFor('karaoke reuses current lyrics and album art', () => run(`document.querySelector('.karaoke-track h1')?.textContent === 'Ты здесь'
    && document.querySelector('.karaoke-track .artwork img')?.complete && document.querySelector('.karaoke-lyrics .lyrics-plain')?.textContent === 'Прикреплённый текст'`));
  assert.equal(await run(`document.querySelector('.karaoke-lyrics').textContent.includes('Без синхронизации')`), true);
  assert.equal(await run(`(() => {
    const art = document.querySelector('.karaoke-track .artwork').getBoundingClientRect();
    const text = document.querySelector('.karaoke-lyrics').getBoundingClientRect();
    return innerWidth <= 690 || (art.width >= 150 && art.right < text.left);
  })()`), true, 'karaoke keeps only a bounded cover next to lyrics');
  assert.equal(await run(`!document.querySelector('.karaoke-stage > :is(.scene-cover,.immersive-backdrop)')`), true, 'karaoke does not mount a second cover');
  assert.equal(await run(`getComputedStyle(document.querySelector('.karaoke-track h1')).userSelect`), 'none');
  assert.equal(await run(`getComputedStyle(document.querySelector('.karaoke-lyrics .lyrics-scroll')).userSelect`), 'text');
  await click('.karaoke-settings-toggle');
  await waitFor('karaoke text settings opens', () => run(`!!document.querySelector('.karaoke-settings:popover-open')`));
  await fill('.karaoke-settings input[aria-label="Размер текста"]', '47');
  await click('.karaoke-settings .karaoke-align button:nth-child(2)');
  await waitFor('karaoke typography updates', async () => (await preferences()).karaokeStyle.size === 47
    && await run(`getComputedStyle(document.querySelector('.karaoke-lyrics .lyrics-scroll')).textAlign === 'center'`));
  await run(`[...document.querySelectorAll('.karaoke-sources button')].find((item) => item.textContent === 'Убрать текст из файла').click()`);
  await waitFor('karaoke highlights the sidecar from current playback position', () => run(`document.querySelector('.karaoke-lyrics [aria-current="true"]')?.textContent === 'Следующая строка'`));
  await run(`(() => {
    const seek = document.querySelector('.karaoke-controls .timeline input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(seek, '0.5');
    seek.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor('karaoke seek changes the active line', () => run(`document.querySelector('.karaoke-lyrics [aria-current="true"]')?.textContent === 'Локальная строка'`));
  await click('.karaoke-lyrics .lyrics-scroll p:nth-child(2) .lyric-line-seek');
  await waitFor('karaoke line click uses the same deck', () => run(`window.testKaraokeAudio === document.querySelector('audio') && Math.abs(window.testKaraokeAudio.currentTime - 1.25) < .05`));
  await click('.karaoke-lyrics .lyrics-scroll p:first-child .lyric-line-seek');
  await run(`(() => { window.testKaraokeAudio.currentTime = .5; })()`);
  await run(`[...document.querySelectorAll('.karaoke-sources button')].find((item) => item.textContent === 'Добавить свой текст…').click()`);
  await waitFor('text editor receives focus', () => run(`document.activeElement?.matches('.karaoke-custom textarea')`));
  await fill('.karaoke-custom textarea', '[00:00.10] Своя строка\n[00:02.00] Ещё одна строка');
  await click('.karaoke-custom button[type="submit"]');
  await waitFor('pasted LRC follows the same clock and returns focus', () => run(`document.querySelector('.karaoke-lyrics [aria-current="true"]')?.textContent === 'Своя строка'
    && document.activeElement?.matches('.karaoke-settings-toggle') && !document.querySelector('.karaoke-settings:popover-open')`));
  await click('.karaoke-settings-toggle');
  await run(`[...document.querySelectorAll('.karaoke-sources button')].find((item) => item.textContent === 'Убрать свой текст').click()`);
  await click('.karaoke-settings-toggle');
  await click('.immersive-karaoke-toggle');
  await waitFor('player and karaoke share transport', () => run(`!!document.querySelector('.immersive-main') && window.testKaraokeAudio === document.querySelector('audio')`));
  await click('.immersive-karaoke-toggle');
  await waitFor('karaoke can reopen without keeping two stages', () => run(`!!document.querySelector('.karaoke-grid') && document.querySelectorAll('.immersive-player').length === 1`));
  await click('.immersive-collapse');
  await waitFor('karaoke closes with focus restored', async () => !window.isFullScreen() && await run(`!document.querySelector('.immersive-player') && document.activeElement?.matches('.hero-karaoke')`));
  await run(`[...document.querySelectorAll('.nav-item')].find((item) => item.textContent.startsWith('Медиатека')).click()`);
  const second = `.card-play[aria-label="Воспроизвести Ty Zdes'"]`;
  await waitFor('second track', () => run(`!!document.querySelector(${JSON.stringify(second)})`));
  await run(`document.querySelector(${JSON.stringify(second)}).click()`);
  const fallback = await withArt("Ty Zdes'");
  assert.match(fallback.picture.src, /^data:image\/jpeg;base64,/);
  assert.notEqual(fallback.picture.src, first.picture.src, 'broken cover does not keep the previous track’s artwork');
  assert.equal(window.getTitle(), `Ty Zdes' — ${APP_NAME}`);
  assert.equal((await run('window.luma.getAppInfo()')).version, version);
  const go = (name) => run(`[...document.querySelectorAll('nav .nav-item, .glass-navigation button')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(name)}).click()`);
  await go('Главная');
  assert.ok(!(await run(`document.querySelector('.lyrics-card')?.textContent.includes('Локальная строка')`)), 'previous lyrics do not carry over');
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
  assert.deepEqual(await run(`[...document.querySelectorAll('.upcoming-copy strong')].map((item) => item.textContent)`), ['Отблеск', 'Отлив', 'Фиолетовый час', 'Бумажные спутники', 'Синий меридиан', 'Ночной гараж', 'Синее кафе', 'Бит квартала', 'Стеклянный вальс', 'Сигнальный контур']);
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
  fixtureNotice('Native fullscreen', `Electron fullscreen reached ${display.bounds.width}×${display.bounds.height} monitor bounds; button, Esc, and host exit passed.`);
  await click('.scene-open');
  await waitFor('scene dialog reopens', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  for (const [label, effect] of [['Спектр', 'spectrum'], ['Ленты', 'columns'], ['Ноты', 'notes']]) {
    await click(`.scene-choice[aria-label="${label}"]`);
    await waitFor(`${label} previews on a bounded canvas`, () => run(`(() => {
      const backdrop = document.querySelector('.scene-dialog-preview .scene-${effect}');
      const canvas = backdrop?.querySelector('canvas');
      return canvas && canvas.width * canvas.height > 0 && canvas.width * canvas.height <= ${COMPACT_SCENE_PIXELS}
        && (${JSON.stringify(effect)} === 'notes' || !backdrop.classList.contains('scene-moving'));
    })()`));
  }
  if (!await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) {
    await click('.scene-choice[aria-label="Волны"]');
    const clip = await waitFor('silent sea loop decodes from the app protocol', () => run(`(() => {
      const clip = document.querySelector('.scene-dialog-preview video');
      return clip?.currentTime > .04 ? [clip.videoWidth, clip.videoHeight, clip.muted, clip.loop] : null;
    })()`));
    assert.deepEqual(clip, [1440, 618, true, true]);
    await click('.scene-choice[aria-label="Фейерверк"]');
    await waitFor('fireworks use one bounded canvas', () => run(`(() => {
      const canvas = document.querySelector('.scene-dialog-preview canvas');
      return canvas && canvas.width * canvas.height > 0 && canvas.width * canvas.height <= ${COMPACT_SCENE_PIXELS};
    })()`));
  }
  if (!await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) {
    await click('.scene-choice[aria-label="Звёзды"]');
    await click('.scene-dialog .primary-button');
    await waitFor('Stars move while the native track is paused', () => run(`!!document.querySelector('.hero .scene-stars.scene-moving canvas') && document.querySelector('audio').paused`));
    assert.ok(await run(`(async () => {
      const canvas = document.querySelector('.hero .scene-stars canvas'), first = canvas.toDataURL();
      await new Promise(resolve => setTimeout(resolve, 180));
      return first !== canvas.toDataURL();
    })()`));
    await click('.scene-open');
    await waitFor('effect picker reopened', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  }
  await click('.scene-choice[aria-label="Тоннель"]');
  await waitFor('the tunnel replaces the background effect with bounded SVG geometry', () => run(`document.querySelectorAll('.scene-dialog-preview .scene-tunnel .tunnel-frame').length === 7
    && !document.querySelector('.scene-dialog-preview canvas, .scene-dialog-preview video, .scene-choice[aria-label="Обложка на фоне"]')`));
  await run(`[...document.querySelectorAll('.scene-layouts button')].find((item) => item.textContent === 'Обложка').click()`);
  await waitFor('cover layout keeps the selected effect', async () => {
    const { hero, effect } = (await preferences()).appearance;
    return hero === 'cover' && effect === 'tunnel' && await run(`!!document.querySelector('.scene-dialog-preview .scene-preview-art')`);
  });
  await click('.scene-choice[aria-label="Без эффекта"]');
  await click('.scene-dialog .primary-button');
  await expand();
  await waitFor('normal fullscreen still shows artwork in the cover layout', () => run(`!!document.querySelector('.immersive-stage.immersive-cover .immersive-art .artwork')
    && !document.querySelector('.immersive-stage > .scene-background')`));
  await click('.immersive-karaoke-toggle');
  await waitFor('karaoke keeps its own ambient light and foreground cover', () => run(`!!document.querySelector('.karaoke-track .artwork') && !document.querySelector('.karaoke-stage > :is(.scene-background,.immersive-backdrop,.immersive-scrim)')`));
  await click('.immersive-karaoke-toggle');
  await click('.immersive-tools button[aria-label="Оформление полноэкранного плеера"]');
  await waitFor('fullscreen scene dialog', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  await click('.scene-choice[aria-label="Переливы Luma"]');
  await waitFor('Luma Flow previews and saves while the full-screen player updates', async () => (await preferences()).appearance.effect === 'mix-flow'
    && await run(`!!document.querySelector('.scene-dialog-preview .mix-flow-light')
      && !!document.querySelector('.immersive-stage > .scene-mix-flow .mix-flow-light')
      && !document.querySelector('.scene-dialog-preview .mix-flow-ribbons, .scene-dialog-preview .scene-mix-flow canvas')`));
  await click('.scene-dialog .primary-button');
  await click('.immersive-karaoke-toggle');
  await waitFor('karaoke uses the selected scene with only the foreground art', () => run(`!!document.querySelector('.karaoke-stage > .scene-mix-flow')
    && !!document.querySelector('.karaoke-track .artwork') && !document.querySelector('.karaoke-stage > .immersive-backdrop')`));
  await click('.immersive-collapse');
  await waitFor('fullscreen exits after switching modes', async () => !window.isFullScreen() && await run(`!document.querySelector('.immersive-player')`));
  assert.ok(await run(`(() => {
    const player = document.querySelector('.hero .scene-mix-flow[data-cover-tone]');
    const banner = document.querySelector('.hub-hero .scene-mix-flow:not([data-cover-tone])');
    const light = (scene) => getComputedStyle(scene.querySelector('.mix-flow-light'));
    return !!player && !!banner && light(player).backgroundImage.includes('radial-gradient')
      && !light(player).backgroundImage.includes('conic-gradient') && light(player).backgroundImage !== light(banner).backgroundImage
      && light(player).animationName === light(banner).animationName
      && getComputedStyle(player).getPropertyValue('--scene-tone').trim() === getComputedStyle(document.querySelector('.hero')).getPropertyValue('--hero-tone').trim();
  })()`), 'the softened mix effect shares motion with the banner and uses the current cover tone');

  assert.equal(await run(`document.querySelector('.home-now [aria-label="Эквалайзер"]')`), null);
  await click('.sidebar [aria-label="Эквалайзер из боковой панели"]');
  await waitFor('parametric EQ and response graph', () => run(`document.querySelectorAll('.equalizer-dialog[open] .eq-band input').length === 10 && !!document.querySelector('.eq-response-path')`));
  const volumeBeforeEq = (await preferences()).volume;
  await select('.preset-label select', 'bass');
  await waitFor('EQ preset activates filters', async () => (await preferences()).equalizer.preset === 'bass');
  assert.equal((await preferences()).volume, volumeBeforeEq);
  const beforeEq = await run(`document.querySelector('.eq-response-path').getAttribute('points')`);
  await click('.eq-band:nth-child(4) .eq-band-choice');
  await select('.eq-type select', 'notch');
  const frequency = '.eq-inspector input[type="number"]';
  await run(`document.querySelector(${JSON.stringify(frequency)}).focus()`);
  await fill(frequency, '950');
  await run(`document.querySelector(${JSON.stringify(frequency)}).blur()`);
  await waitFor('EQ frequency edit changes the actual response curve', async () => {
    const eq = (await preferences()).equalizer;
    return eq.preset === 'custom' && eq.enabled && eq.bands[3].type === 'notch' && eq.bands[3].hz === 950
      && (await run(`document.querySelector('.eq-response-path').getAttribute('points')`)) !== beforeEq;
  });
  await click('.eq-tools button:last-child');
  const editedEq = await waitFor('EQ bypass keeps the edit', async () => {
    const eq = (await preferences()).equalizer;
    return !eq.enabled && eq.bands[3].hz === 950 && eq;
  });
  await click('.equalizer-content .dialog-footer .primary-button');
  assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused`), true);
  const setupName = installerName(nextVersion);
  let updateLookups = 0;
  session.defaultSession.protocol.handle('https', (request) => {
    if (request.url !== LATEST_RELEASE_API) return new Response(null, { status: 404 });
    updateLookups++;
    return Response.json({ tag_name: `v${nextVersion}`, draft: false, prerelease: false, assets: [{ id: 31415, name: setupName, state: 'uploaded', size: 1234,
      browser_download_url: `https://github.com/JohnBirlich/Luma-Renamed/releases/download/v${nextVersion}/${setupName}`, digest: `sha256:${'b'.repeat(64)}` }] });
  });
  try {
    await run(`document.querySelector('.title-settings').click()`);
    await waitFor('settings page', () => run(`!!document.querySelector('.settings-page [aria-label="Обновления приложения"]')`));
    await run(`document.querySelector('.settings-page [aria-label="Обновления приложения"]').click()`);
    await waitFor('settings show package version', () => run(`document.querySelector('.settings-page .setting-card header')?.textContent.includes(${JSON.stringify(`Установлена версия ${version}.`)})`));
    const report = await run('window.luma.updates.check()');
    assert.deepEqual(report, { state: 'available', mode: 'development', version: nextVersion, bytes: 1234, downloadable: false });
    await waitFor('latest release is detected without installing from a development build', () => run(`document.querySelector('.settings-page .update-status')?.textContent.includes('Доступна версия ${nextVersion}.')
      && ![...document.querySelectorAll('.settings-page .update-status button')].some(button => button.matches('[data-update-download]') || button.textContent.includes('Скачать и установить'))`));
    assert.equal(updateLookups, 1, 'settings and an explicit check reuse the same release request');
  } finally { session.defaultSession.protocol.unhandle('https'); }
  await go('Меню');
  const externalOpens = [];
  const systemBrowser = shell.openExternal;
  shell.openExternal = async (url) => { externalOpens.push(url); };
  const originalUrl = window.webContents.getURL();
  try {
    assert.equal(await run(`!!document.querySelector('.radio-shortcut, .radio-title, .radio-sidebar, .radio-dock, [data-home-tab="radio"]')`), false,
      'Radio left Luma entirely: sidebar, dock, title bar and the home strip all lost it');
    assert.equal(await run(`!!document.querySelector('[aria-label="Радио"], [title="Радио"]')`), false, 'nothing in Luma is labelled Radio');
    assert.equal(await run(`!!document.querySelector('[aria-label="Зайти в VK"], [aria-label="Музыка онлайн"]') || 'openVkMusic' in window.luma`), false);
    await go('Главная');
    await waitFor('home search field', () => run(`!!document.querySelector('.hub-search input')`));
    await fill('.hub-search input', 'search that stays put');
    await waitFor('a typed search is not replaced by a radio section', () => run(`document.querySelector('.hub-search input')?.value === 'search that stays put'`));
    assert.deepEqual(externalOpens, []);
    assert.equal(window.webContents.getURL(), originalUrl);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
  } finally { shell.openExternal = systemBrowser; }
  await go('Меню');
  fixtureNotice('Radio removal', 'No Radio entry survives in Luma chrome or the home strip.');
  assert.equal(await run(`!!document.querySelector('.menu-page [aria-label="Импортировать треки"]')`), false);
  assert.ok(await run(`!!document.querySelector('.title-bar [aria-label="Добавить музыку"]')`), 'file import remains in the main toolbar');
  assert.equal(await run(`document.querySelector('.title-caption') === null && getComputedStyle(document.querySelector('.sidebar')).userSelect === 'none'`), true);
  await run(`document.querySelector('[aria-label="О приложении"]').click()`);
  await waitFor('About has package version', () => run(`document.querySelector('.about-build strong')?.textContent === ${JSON.stringify(`Версия ${version}`)}`));

  await settings('Качество аудио');
  await waitFor('file format', () => run(`document.querySelector('[aria-label="Текущий трек"]')?.textContent.includes('64 кбит/с')`));
  await select('[aria-label="Качество воспроизведения"] select', 'metered');
  await waitFor('configured network profile', async () => (await preferences()).audioQuality.network === 'metered');
  await click('.settings-back');
  await click('.settings-page [aria-label="Интеграции"]');
  await waitFor('widget setting', () => run(`!!document.querySelector('[aria-label="Виджеты рабочего стола"] select')`));
  await select('[aria-label="Виджеты рабочего стола"] select', 'liquid');
  await waitFor('widget material updates in place', () => run(`document.querySelector('.widget-sample')?.dataset.widgetBackground === 'liquid'`));
  assert.equal(await run(`document.querySelectorAll('[aria-label="Виджеты рабочего стола"] select option').length`), 10);
  const widgetBounds = window.getBounds();
  const widgetTime = await run('document.querySelector("audio").currentTime');
  await click('[aria-label="Виджеты рабочего стола"] button');
  await waitFor('floating widget opens without replacing the renderer', async () => window.isAlwaysOnTop() && window.getBounds().width < widgetBounds.width
    && await run(`document.querySelector('.widget-mode > .desktop-widget')?.dataset.widgetBackground === 'liquid' && window.testAudio === document.querySelector('audio')`));
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  if (!await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) await waitFor('widget scene keeps moving at idle', () => run(`
    document.querySelector('audio').paused && !!document.querySelector('.widget-mode > .desktop-widget .scene-mix-flow.scene-moving')
    && !document.querySelector('.main-pane .scene-moving')`));
  await click('.widget-window-buttons [aria-label="Вернуться в плеер"]');
  await waitFor('widget restores the old window', async () => !window.isAlwaysOnTop() && !await run(`!!document.querySelector('.widget-mode > .desktop-widget')`));
  assert.deepEqual(window.getBounds(), widgetBounds);
  assert.equal(await run('document.querySelector("audio").currentTime'), widgetTime);
  assert.equal(await run(`document.querySelector('[aria-label="Виджеты рабочего стола"] button').getAttribute('aria-keyshortcuts')`), 'Control+Shift+R');
  const sendWidgetChord = async () => {
    window.focus();
    await waitFor('native window focused for the widget shortcut', () => window.isFocused());
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['control', 'shift'] });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'R', modifiers: ['control', 'shift'] });
  };
  const widgetOpen = async () => window.isAlwaysOnTop() && await run(`!!document.querySelector('.widget-mode') && window.testAudio === document.querySelector('audio')`);
  const widgetClosed = async () => !window.isAlwaysOnTop() && await run(`!document.querySelector('.widget-mode') && window.testAudio === document.querySelector('audio')`);
  let navigations = 0;
  const watchReload = ({ isMainFrame, isSameDocument }) => { if (isMainFrame && !isSameDocument) navigations++; };
  window.webContents.on('did-start-navigation', watchReload);
  try {
    await sendWidgetChord();
    await waitFor('Ctrl+Shift+R opens the widget', widgetOpen);
    await sendWidgetChord();
    await waitFor('Ctrl+Shift+R toggles it back', widgetClosed);
    assert.deepEqual(window.getBounds(), widgetBounds);
    await sendWidgetChord();
    await waitFor('widget reopens without reloading playback', widgetOpen);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await waitFor('Esc restores the widget window', widgetClosed);
    assert.deepEqual(window.getBounds(), widgetBounds);
    assert.equal(await run('document.querySelector("audio").currentTime'), widgetTime);
    assert.equal(navigations, 0, 'Ctrl+Shift+R must not reload the renderer');
    fixtureNotice('Widget shortcut', 'Focused Ctrl+Shift+R opens and restores Luma without reload; Esc restores it too.');
  } finally { window.webContents.off('did-start-navigation', watchReload); }
  assert.equal(await run(`!!document.querySelector('.settings-return')`), false);

  // Use the real Last.fm UI, IPC and isolated main-process client, never a real account.
  const fakeToken = 'token-'.repeat(5), fakeSession = 'session-'.repeat(4);
  const authPages = [];
  let apiStatus = 11;
  const listensPosted = [];
  const originalOpen = shell.openExternal;
  const cacheSession = session.defaultSession;
  shell.openExternal = async (url) => { authPages.push(url); };
  cacheSession.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    if (url.origin === 'https://api.listenbrainz.org') {
      assert.equal(request.headers.get('Authorization'), `Token ${listenBrainzToken}`);
      assert.equal(url.search, '');
      if (url.pathname === '/1/validate-token') return Response.json({ valid: true, user_name: 'Fixture listener' });
      if (url.pathname === '/1/submit-listens') { listensPosted.push(await request.json()); return Response.json({ status: 'ok' }); }
    }
    if (url.origin !== 'https://ws.audioscrobbler.com') return new Response(null, { status: 404 });
    if (url.searchParams.get('method') === 'auth.getToken') return apiStatus
      ? Response.json({ error: apiStatus }, { status: 503 }) : Response.json({ token: fakeToken });
    if (url.searchParams.get('method') === 'auth.getSession' && url.searchParams.get('token') === fakeToken)
      return Response.json({ session: { name: 'Smoke Listener', key: fakeSession } });
    return Response.json({ error: 3 }, { status: 400 });
  });
  try {
    await waitFor('credential form needs no launch environment', () => run(`!!document.querySelector('.lastfm-form')`));
    await fill('.lastfm-form input[name="api-key"]', 'a'.repeat(32));
    await fill('.lastfm-form input[name="shared-secret"]', 'f'.repeat(32));
    await click('.lastfm-form button[type="submit"]');
    await waitFor('credentials accepted locally', () => run(`window.luma.lastfm.status().then((s) => s.configuration === 'local' && !document.querySelector('.lastfm-form'))`));
    await clickLastFm('Подключить Last.fm');
    await waitFor('Last.fm outage gets a distinct code and retry hint', () => run(`document.querySelector('.lastfm-issue')?.textContent.includes('Код Last.fm: 11') && document.querySelector('.lastfm-issue').textContent.includes('временно недоступен')`));
    assert.equal(authPages.length, 0);
    apiStatus = 0;
    await clickLastFm('Подключить Last.fm');
    await waitFor('authorized browser handoff', () => run(`window.luma.lastfm.status().then((s) => s.waiting && !s.issue)`));
    assert.equal(authPages.length, 1);
    assert.equal(new URL(authPages[0]).origin, 'https://www.last.fm');
    await clickLastFm('Завершить подключение');
    await waitFor('account is connected with scrobbling disabled', () => run(`document.querySelector('[aria-label="Last.fm"] .setting-status')?.textContent === 'Smoke Listener' && document.querySelector('[aria-label="Отправлять прослушивания в Last.fm"]')?.getAttribute('aria-checked') === 'false'`));
    await clickLastFm('Удалить ключи и отключить');
    await waitFor('credentials and session are cleared', () => run(`window.luma.lastfm.status().then((s) => !s.configured && !s.user && !s.enabled)`));
    const listenBrainz = '.music-service[aria-label="ListenBrainz"]';
    await waitFor('ListenBrainz uses its own token', () => run(`!!document.querySelector('${listenBrainz} input[type=password]')`));
    await fill(`${listenBrainz} input[type=password]`, listenBrainzToken);
    await click(`${listenBrainz} button[type=submit]`);
    await waitFor('connection does not grant consent to publish', () => run(`document.querySelector('${listenBrainz} .setting-status')?.textContent === 'Fixture listener'
      && document.querySelector('${listenBrainz} input[type=checkbox]')?.checked === false`));
    await click(`${listenBrainz} input[type=checkbox]`);
    await waitFor('ListenBrainz requires the separate opt-in switch', () => run(`window.luma.musicServices.status('listenbrainz').then(s => s.enabled)`));
    assert.equal(await run(`window.luma.lastfm.status().then(s => s.enabled)`), false);
    await run(`void [...document.querySelectorAll('${listenBrainz} button')].find(button => button.textContent === 'Удалить ключ').click()`);
    await waitFor('removing the token turns off ListenBrainz', () => run(`window.luma.musicServices.status('listenbrainz').then(s => !s.configured && !s.enabled)`));
    assert.deepEqual(listensPosted, []);

  } finally {
    cacheSession.protocol.unhandle('https');
    shell.openExternal = originalOpen;
  }
  fixtureNotice('Widget and Last.fm', 'Widget shortcut and restore; key setup UI, API error 11 and retry with a fixture verified.');
  await click('[aria-label="Сохранять текст с новым MP3"]');
  await waitFor('opt-in to MP3 lyric tagging', async () => (await preferences()).exportLyrics);
  await click('.settings-back');
  await click('.settings-page [aria-label="Воспроизведение"]');
  await waitFor('crossfade preference', () => run(`!!document.querySelector('[aria-label="Воспроизведение в Luma"] select')`));
  await select('[aria-label="Воспроизведение в Luma"] select', '4');
  await waitFor('crossfade preference saved', async () => (await preferences()).playback.crossfade === 4);


  const catalogCalls = [];
  const archiveCalls = [];
  let failSouthernFixture = true;
  const audiusCalls = [];
  // Use a synthetic identifier: the Archive metadata cache outlives renderer reloads.
  const archiveRelease = { metadata: { identifier: 'Luma-Desktop-Smoke-Only-Archive-2026', mediatype: 'audio', collection: ['netlabels', 'southern-citys-lab'],
    licenseurl: 'https://creativecommons.org/licenses/by/4.0/', creator: 'Fixture label', title: 'Jazz release' },
    files: [{ name: 'Jazz archive.mp3', source: 'original', format: 'VBR MP3', title: 'Jazz archive', length: '32' }] };
  const streamCalls = [];
  const radioCalls = [];
  const recordStation = STATIONS.find(({ id }) => id === 'radio-record-record');
  const piStation = STATIONS.find(({ id }) => id === 'radio-ru-pi-fm');
  const russkoeStation = STATIONS.find(({ id }) => id === 'radio-ru-russkoe');
  const missingLogoStation = STATIONS.find(({ id }) => id === 'radio-record-rus');
  const radioFixtureUrls = new Set([recordStation.stream, piStation.stream, russkoeStation.stream, discoveryStation.url_resolved]);
  const directorySearches = [];
  const titleQueries = [];
  const musicBrainzQueries = [];
  const audioDbQueries = [];
  const plainLyricQueries = [];
  const phishCalls = [];
  const fingerprints = [];
  const legacyVk = session.fromPartition(LEGACY_VK_SESSION);
  const isolatedVk = session.fromPartition(VK_SITE_PARTITION);
  const legacyBookmarks = { selected: '-31_4', playlists: [{ ownerId: -31, playlistId: 4, name: 'Старая закладка', hash: 'legacy-1' }] };
  const legacyTracks = [{ title: 'Ты здесь', artist: 'Ария', album: 'Живой звук' }, { title: 'Список VK', artist: 'Тест', album: '' }];
  const oldVkData = (seed = false) => run(`new Promise((resolve, reject) => {
    const key = 'luma-player:vk-playlists:v1';
    if (${seed}) localStorage.setItem(key, JSON.stringify(${JSON.stringify(legacyBookmarks)}));
    const request = indexedDB.open('luma-vk-tracks', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore('lists');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('lists', ${JSON.stringify(seed ? 'readwrite' : 'readonly')});
      const list = tx.objectStore('lists');
      if (${seed}) list.put(${JSON.stringify(legacyTracks)}, 'tracks');
      const rows = list.get('tracks');
      tx.oncomplete = () => { db.close(); resolve({ bookmarks: JSON.parse(localStorage.getItem(key)), tracks: rows.result }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  })`);
  const fixtureHeaders = { 'Access-Control-Allow-Origin': '*' };
  const mp3Fixture = (id, title) => ({ ...commonsRecording, id, title, creator: 'Исполнитель', duration: 32000,
    url: `https://upload.wikimedia.org/wikipedia/commons/e/e1/${encodeURIComponent(title)}.mp3` });
  const synced = mp3Fixture('61a70211-e1f3-48a9-834b-b196122c5bc1', 'Запись с LRC');
  const plain = mp3Fixture('61a70211-e1f3-48a9-834b-b196122c5bc2', 'Запись с тегом');
  const lrcText = '[00:00.25] Первый куплет\n[00:01.25] Второй';
  const plainText = 'Первый куплет\nВторой';
  const lyricQueries = [];
  const lyricSearchQueries = [];
  let missLyricSignature = false;
  const economyUrl = jamendoRecording.url.replace('format=mp32', 'format=mp31');

  let offlineFixture = false;
  const vkRequests = [];
  const audiusFixtureHops = [];
  const testAudioPath = '/luma-smoke-audio.mp3';
  const fixtureAudio = (request) => {
    const range = request.headers.get('Range');
    const bytes = range && parseByteRange(range, sample.length);
    const body = bytes ? sample.subarray(bytes.start, bytes.end + 1) : sample;
    return new Response(body, { status: bytes ? 206 : 200, headers: {
      'Content-Type': 'audio/mpeg', 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes',
      ...(bytes && { 'Content-Range': `bytes ${bytes.start}-${bytes.end}/${sample.length}` }),
    } });
  };
  // Record provider hops in the real, in-memory media session, not in the browser session.
  const audiusMediaSession = session.fromPartition(AUDIUS_MEDIA_PARTITION);
  audiusMediaSession.protocol.handle('https', (request) => {
    if (offlineFixture) return new Response(null, { status: 503 });
    const url = new URL(request.url);
    assert.equal(request.headers.has('Cookie'), false);
    if (url.origin === 'https://api.audius.co' && url.pathname === '/v1/tracks/DX0Xb/stream' && url.searchParams.get('no_redirect') === 'true') {
      audiusFixtureHops.push('resolve');
      return Response.json({ data: creatorStream });
    }
    if (url.href === creatorStream) {
      audiusFixtureHops.push('redirect');
      return Response.redirect(storageStream, 307);
    }
    if (url.href === storageStream) {
      audiusFixtureHops.push('media');
      streamCalls.push(url.href);
      return fixtureAudio(request);
    }
    return new Response(null, { status: 404 });
  });
  const authCookie = { url: VK_MUSIC_URL, name: 'fixtureVkAuthorized', value: vkFixturePrivate };
  const vkCoverRequests = [];
  const vkInlineImage = await readFile(join(root, 'public/artwork/blue-cafe.webp'));
  const playerHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  const fakeQr = (entry) => `https://vk.ru/?${new URLSearchParams({ to: new URL(entry).pathname + new URL(entry).search })}`;
  isolatedVk.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    if (url.href === vkFixturePhoto) return new Response(vkInlineImage, { headers: { 'Content-Type': 'image/webp' } });
    if (url.hostname === 'sun9-42.userapi.com') return new Response(null, { status: 404 }); // only Luma's image loader receives these fixture bytes
    vkRequests.push(url.href);
    if (url.href === vkFixtureAuth) return new Response(vkSignInPage, { headers: playerHeaders });
    if (url.origin !== 'https://vk.ru') return new Response(null, { status: 404 });
    if (url.pathname === testAudioPath) return fixtureAudio(request);
    if (url.pathname === '/login') return Response.redirect(`${url.origin}/${url.search}`, 302);
    if (url.pathname === '/') return new Response(vkQrPage, { headers: playerHeaders });
    if (url.href === vkFixtureReturn) {
      await isolatedVk.cookies.set(authCookie);
      return new Response('<!doctype html><h1>VK feed after sign-in</h1>', { headers: playerHeaders });
    }
    if (!(await isolatedVk.cookies.get({ name: authCookie.name })).length) return new Response(vkPublicPage, { headers: playerHeaders });
    if (url.pathname === '/feed' && url.searchParams.get('fixture') === 'handlers') return new Response(vkHeadlessPlayerPage(testAudioPath, true), { headers: playerHeaders });
    if (url.pathname === '/audio' && url.searchParams.get('fixture') === 'detached') return new Response(vkHeadlessPlayerPage(testAudioPath, false), { headers: playerHeaders });
    if (['/audio', '/music/playlist/-31_4_aShare', '/audio123_456'].includes(url.pathname)) {
      const legacy = url.pathname === '/audio123_456';
      return new Response(vkPlayerPage(testAudioPath, { legacy, inline: legacy, unmarked: legacy }), { headers: playerHeaders });
    }
    return new Response(null, { status: 404 });
  });
  session.defaultSession.protocol.handle('https', async (request) => {
    if (offlineFixture) return new Response(null, { status: 503 });
    const url = new URL(request.url);
    if (url.href === vkFixturePhoto || vkFixtureCovers.includes(url.href)) {
      assert.equal(request.headers.get('Cookie'), null);
      assert.equal(request.headers.get('Referer'), null);
      vkCoverRequests.push(url.href);
      return new Response(url.href === vkFixtureCovers[0] ? cover : vkInlineImage, { headers: { 'Content-Type': 'image/webp' } });
    }
    if (url.origin === 'https://api.jamendo.com' && url.pathname === '/v3.0/tracks/') {
      assert.equal(url.searchParams.get('client_id'), jamendoClient);
      return Response.json(jamendoResponse);
    }
    if (url.origin === 'https://api.genius.com') {
      assert.equal(request.headers.get('Authorization'), `Bearer ${geniusToken}`);
      if (url.pathname === '/search') return Response.json(geniusSearchResponse);
      if (url.pathname === '/referents') return Response.json(geniusReferentsResponse);
    }
    if (url.href === `${openwhydExample}?format=json&limit=201`) return Response.json(openwhydResponse);
    if (/^[a-z0-9-]+\.api\.radio-browser\.info$/.test(url.hostname)) {
      if (url.pathname === '/json/stations/search') {
        directorySearches.push(Object.fromEntries(url.searchParams));
        return Response.json([discoveryStation, browserStation]);
      }
      if (url.pathname === `/json/url/${discoveryStation.stationuuid}`) return Response.json({ ok: true });
    }
    if (url.origin === 'https://itunes.apple.com' && url.pathname === '/search') {
      const term = url.searchParams.get('term');
      titleQueries.push(term);
      return Response.json({ results: term === 'мадам брошкина' ? [madam, remix] : [] });
    }
    if (url.origin === 'https://musicbrainz.org' && url.pathname === '/ws/2/recording') {
      musicBrainzQueries.push({ query: url.searchParams.get('query'), agent: request.headers.get('User-Agent') });
      return Response.json({ recordings: [recording, alternateRecording] });
    }
    if (url.origin === 'https://www.theaudiodb.com' && url.pathname === '/api/v1/json/123/searchtrack.php') {
      audioDbQueries.push(Object.fromEntries(url.searchParams));
      return Response.json({ track: [audioDbTrack] });
    }
    if (url.href === `${audioDbTrack.strTrackThumb}/small`) return new Response(cover, { headers: { 'Content-Type': 'image/webp' } });
    if (url.origin === 'https://api.lyrics.ovh') {
      plainLyricQueries.push(url.pathname.split('/').map(decodeURIComponent));
      return Response.json({ lyrics: untimedLyrics, synced: lrcText });
    }
    if (url.origin === 'https://phish.in' && url.pathname.startsWith('/api/v2/')) {
      phishCalls.push(url.pathname);
      return Response.json(url.pathname.endsWith('/tracks')
        ? { tracks: [phishTrack, { ...phishTrack, id: 30345, title: 'Partial', audio_status: 'partial' }] }
        : { songs: url.pathname.endsWith('/search/Llama') ? [phishSong] : [] }, { headers: fixtureHeaders });
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
      if (title === synced.title && !missLyricSignature) return Response.json(wordLyrics(title, 'Исполнитель!', 32));
      return title === plain.title ? Response.json({ trackName: title, artistName: 'Исполнитель', duration: 32, plainLyrics: plainText })
        : new Response(null, { status: 404 });
    }
    if (url.origin === 'https://lrclib.net' && url.pathname === '/api/search') {
      lyricSearchQueries.push(Object.fromEntries(url.searchParams));
      return Response.json(url.searchParams.get('track_name') === synced.title
        ? [wordLyrics(`${synced.title} (ремикс)`, 'Исполнитель!', 32), wordLyrics(synced.title, 'Исполнитель!', 32)] : []);
    }
    if (url.origin === 'https://api.openverse.org' && url.pathname.startsWith('/v1/audio/')) {
      catalogCalls.push(url);
      const rows = url.searchParams.get('q') === 'Живой звук' ? [groupedJamendo]
        : url.searchParams.get('q') === 'fixture-mp3' ? [synced, plain]
        : url.searchParams.get('source') === 'jamendo' ? [jamendoRecording] : [jamendoRecording, commonsRecording];
      return Response.json(url.pathname === '/v1/audio/' ? { results: rows } : [...rows, synced, plain].find((item) => url.pathname.endsWith(`/${item.id}/`)), { headers: fixtureHeaders });
    }
    if (url.origin === 'https://archive.org' && url.pathname === '/advancedsearch.php') {
      const query = url.searchParams.get('q');
      archiveCalls.push(query);
      // Give the two IPC searches time to overlap, and exercise a partial failure on Home.
      await delay(250);
      if (failSouthernFixture && query.startsWith('collection:southern-citys-lab ') && query.includes('"Ты"')) return new Response(null, { status: 503 });
      return Response.json({ response: { docs: query.includes('"jazz"') ? [{ identifier: 'Luma-Desktop-Smoke-Only-Archive-2026' }] : [] } });
    }
    if (url.origin === 'https://api.audius.co' && url.pathname === '/v1/tracks/search') {
      audiusCalls.push(url);
      return Response.json({ data: url.searchParams.get('query') === 'jazz' ? [audiusRecording, { ...audiusRecording, id: '1233T', title: 'Restricted', is_stream_gated: true }] : [] });
    }
    if (url.href === 'https://archive.org/metadata/Luma-Desktop-Smoke-Only-Archive-2026') return Response.json(archiveRelease);
    if (url.href === missingLogoStation.logo) return new Response(null, { status: 404 });
    if (RADIO_LISTINGS.some(({ logo }) => logo === url.href)) return new Response(cover, { headers: { ...fixtureHeaders, 'Content-Type': 'image/webp' } });
    const radioFixture = radioFixtureUrls.has(url.href);
    if (radioFixture || [jamendoRecording.url, economyUrl, commonsRecording.url, synced.url, plain.url, phishTrack.mp3_url].includes(url.href)) {
      // Exercise the production CSP and a real decoder without requiring network or a specific codec CDN.
      (radioFixture ? radioCalls : streamCalls).push(url.href);
      return fixtureAudio(request);
    }
    return new Response(null, { status: 404 });
  });
  const onlineAudio = 'audio[data-online-audio]';
  const playOnline = '.online-result-actions button[aria-label="Слушать онлайн: All About Jazz"]';
  const queueOnline = '.online-result-actions button[aria-label="В очередь: Jazz-Sax"]';
  try {
    const services = 'window.luma.musicServices';
    try {
      assert.equal(await run(`${services}.configure('jamendo', ${JSON.stringify(jamendoClient)}).then(s => s.configured)`), true);
      assert.deepEqual(await run(`${services}.searchJamendo(531, 'jazz').then(({ tracks, issue }) => issue ?? tracks.map(({ id }) => id))`), ['jamendo-1348466', 'jamendo-1848357']);
      assert.equal(await run(`${services}.configure('genius', ${JSON.stringify(geniusToken)}).then(s => s.configured)`), true);
      assert.equal(await run(`${services}.searchGenius('Coldplay Yellow').then(rows => rows[0]?.page)`), 'https://genius.com/Coldplay-yellow-lyrics');
      assert.deepEqual(await run(`${services}.geniusAnnotations(235729)`), [{ id: 903, excerpt: 'A short contextual note.' }]);
    } finally {
      await run(`(async () => { await ${services}.remove('jamendo'); await ${services}.remove('genius'); })()`);
    }
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
    await select('.metadata-source select', 'musicbrainz');
    await fill('.metadata-search-controls input', 'Крошка моя');
    assert.equal(musicBrainzQueries.length, 0, 'selecting a catalog or typing does not send the request');
    await click('.metadata-search-controls button');
    await waitFor('MusicBrainz recording versions and ISRC', () => run(`document.querySelectorAll('.metadata-results li').length === 2
      && document.querySelector('.metadata-results li').textContent.includes('ISRC RUA1B9800001')`));
    assert.deepEqual(musicBrainzQueries, [{ query: '(recording:"Крошка моя") AND NOT video:true',
      agent: `LumaPlayer/${version} (https://github.com/${RELEASE_REPO})` }]);
    assert.equal(await run(`document.querySelector('.metadata-results li a').href`), `https://musicbrainz.org/recording/${recording.id}`);
    assert.equal(await run(`document.querySelector('.track-details-fields input').value`), 'Мадам Брошкина');
    const draftAlbum = await run(`document.querySelector('.track-details-fields label:nth-child(3) input').value`);
    await click('.metadata-results li .metadata-result-actions button:nth-child(2)');
    assert.deepEqual(await run(`[...document.querySelectorAll('.track-details-fields input')].slice(0, 3).map((field) => field.value)`),
      ['Крошка моя', 'Руки вверх!', draftAlbum], 'a recording with several editions does not change the album');
    await fill('.track-details-fields label:nth-child(1) input', 'Мадам Брошкина');
    await fill('.track-details-fields label:nth-child(2) input', 'Неизвестный исполнитель');
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
    await click('.track-details-button');
    await waitFor('reopened details editor', () => run(`!!document.querySelector('.track-details-dialog[open]')`));
    await click('.metadata-lookup summary');
    await select('.metadata-source select', 'theaudiodb');
    await fill('.metadata-search-controls input', 'Yellow');
    assert.equal(await run(`document.querySelector('.metadata-search-controls button').disabled`), true);
    await fill('.track-details-fields label:nth-child(2) input', 'Coldplay');
    assert.deepEqual(audioDbQueries, [], 'selecting a catalog and typing does not contact TheAudioDB');
    await click('.metadata-search-controls button');
    await waitFor('TheAudioDB shows a credited metadata candidate and a decoded thumbnail', () => run(`(() => {
      const row = document.querySelector('.metadata-results li');
      const image = row?.querySelector('.metadata-artwork img');
      return row?.textContent.includes('TheAudioDB') && row.textContent.includes('Parachutes')
        && image?.src === ${JSON.stringify(`${audioDbTrack.strTrackThumb}/small`)} && image.naturalWidth > 0;
    })()`));
    assert.deepEqual(audioDbQueries, [{ s: 'Coldplay', t: 'Yellow' }]);
    assert.equal(await run(`document.querySelector('.metadata-results li a').href`), 'https://www.theaudiodb.com/track/32724184');
    await click('.metadata-result-actions button:nth-child(2)');
    assert.deepEqual(await run(`[...document.querySelectorAll('.track-details-fields input')].slice(0, 3).map((field) => field.value)`), ['Yellow', 'Coldplay', 'Parachutes']);
    await click('.track-details-dialog .dialog-header button');
    assert.equal(await run(`document.querySelector('.hero h2').textContent`), 'Мадам Брошкина', 'cancelling leaves values and cover unchanged');
    await click('.hero-action');
    await waitFor('local track is playing', () => run(`!document.querySelector('audio').paused && document.querySelector('audio').currentTime > 4.15`));
    await run(`(() => { const audio = document.querySelector('audio'); audio.currentTime = audio.duration - 4.8; })()`);
    await waitFor('local crossfade overlaps with the following track', () => run(`(() => {
      const [from, to] = document.querySelectorAll('audio');
      return !from.paused && !to.paused && to.currentTime > .05 && document.querySelector('.hero h2').textContent === 'Отблеск';
    })()`));
    await click('.player-bar .play-button');
    await waitFor('pause cancels the retiring deck', () => run(`[...document.querySelectorAll('audio')].every((item) => item.paused) && !document.querySelector('audio').hasAttribute('src')`));
    fixtureNotice('Local crossfade', 'Two decoded tracks overlap before the first ends. Pausing stops both decks immediately.');

    if (process.platform === 'win32') {
      await settings('Качество аудио');
      const toggle = '[role="switch"][aria-label="Попробовать Float-вывод"]';
      await waitFor('experimental Float toggle available', () => run(`document.querySelector('${toggle}')?.disabled === false`));
      await click(toggle);
      await click('.player-bar .play-button');
      const statusSelector = '.settings-page .setting-body-copy[role="status"]';
      const status = await waitFor('Float graph reaches driver result', () => run(`(() => {
        const state = document.querySelector(${JSON.stringify(statusSelector)})?.textContent;
        return /WASAPI Exclusive|Устройство занято или не приняло Float32|Системный выход не найден|Сбой Float-вывода|Float-вывод недоступен/.test(state ?? '') ? state : false;
      })()`));
      assert.match(status, hasSystemSink ? /WASAPI Exclusive|Устройство занято или не приняло Float32/ : /WASAPI Exclusive|Системный выход не найден/);
      await waitFor('local decoding continues', () => run(`[...document.querySelectorAll('audio:not([data-online-audio])')].some((audio) => !audio.paused && audio.currentTime > .5)`));
      await click(toggle);
      const systemLabel = hasSystemSink ? 'Системный вывод' : 'Системный выход не найден. Подключите устройство и попробуйте снова.';
      await waitFor('system output fallback or explicit missing device', () => run(`document.querySelector(${JSON.stringify(statusSelector)})?.textContent === ${JSON.stringify(systemLabel)}`));
      await click('.player-bar .play-button');
      await closeSettings();
      fixtureNotice('Float output in playback', status);
    }

    await go('Поиск');
    await waitFor('collection search', () => run(`!!document.querySelector('main input[type="search"]')`));
    await run(`(async () => {
      const input = document.querySelector('main input[type="search"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const value of ['ja', 'jazz']) {
        set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
        if (value === 'ja') await new Promise(resolve => setTimeout(resolve, 90));
      }
    })()`);
    await waitFor('automatic results from all three catalog backends', () => run(`document.querySelectorAll('.catalog-sources [data-state="done"]').length === 4
      && document.querySelectorAll('.online-results li').length === 4 && !document.querySelector('.catalog-details').open`));
    assert.equal(await run(`!!document.querySelector('.catalog-search select, .music-sites')`), false);
    assert.equal(catalogCalls.length, 1);
    assert.equal(catalogCalls[0].searchParams.get('q'), 'jazz');
    assert.equal(catalogCalls[0].searchParams.get('source'), 'jamendo,wikimedia_audio');
    assert.deepEqual(audiusCalls.map((url) => [url.origin, url.searchParams.get('query')]), [['https://api.audius.co', 'jazz']]);
    await click('.catalog-details summary');
    assert.equal(await run(`document.querySelector('.catalog-details').open && !!document.querySelector('.catalog-details a[href="https://audius.co/legal/api-terms"]')`), true);
    await click('.catalog-details summary');
    assert.deepEqual(archiveCalls.map((q) => q.split(' ')[0]).sort(), ['collection:netlabels', 'collection:southern-citys-lab']);
    assert.equal(await run(`document.querySelectorAll('.online-results [data-source="netlabels"]').length`), 1, 'overlapping Archive results deduplicate');
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
    const streamReady = (url) => run(`(() => {
      const media = document.querySelector('${onlineAudio}');
      return media.currentSrc === ${JSON.stringify(url)} && media.currentTime > .15 && !media.paused;
    })()`);
    assert.equal(await run(`document.querySelectorAll('.online-results li[data-source="audius"] button').length`), 2, 'Audius offers play and queue, not save or download');
    const ephemeralUrl = 'luma://app/media/audius/DX0Xb';
    await click('.online-results li[data-source="audius"] button:first-child');
    try { await waitFor('Audius stream decodes through the private protocol', () => streamReady(ephemeralUrl)); }
    catch (error) {
      const media = await run(`(() => {
        const el = document.querySelector('${onlineAudio}');
        return { src: el.currentSrc, position: el.currentTime, duration: el.duration, paused: el.paused, ready: el.readyState,
          error: el.error?.code, message: el.error?.message, notice: document.querySelector('.toast-error strong')?.textContent };
      })()`);
      throw new Error(`${error.message}: ${JSON.stringify({ hops: audiusFixtureHops, media })}`, { cause: error });
    }
    assert.ok(streamCalls.includes(storageStream));
    await go('Главная');
    await waitFor('Audius does not offer lyrics or saved listening actions', () => run(`document.querySelector('.hero h2')?.textContent === 'Siberian Jazz'
      && document.querySelector('.hero-karaoke')?.disabled && !document.querySelector('.lyrics-card')`));
    assert.ok(!lyricQueries.some(({ track_name }) => track_name === audiusRecording.title));
    await go('Поиск');
    const searchField = 'main input[type="search"]';
    const manualSearch = '.catalog-controls button[aria-label="Искать во всех каталогах"]';
    const autoSearch = '.catalog-controls input[type="checkbox"]';
    await waitFor('catalog search ready', () => run(`!!document.querySelector('${searchField}')`));
    await click(autoSearch);
    const beforeManualSearch = catalogCalls.length;
    await fill(searchField, 'manual first');
    await delay(800);
    assert.equal(catalogCalls.length, beforeManualSearch);
    await click(manualSearch);
    await waitFor('manual search made a request', () => catalogCalls.length === beforeManualSearch + 1);
    await fill(searchField, 'manual second');
    await delay(800);
    assert.equal(catalogCalls.length, beforeManualSearch + 1, 'editing a submitted term must not send another request');
    await click(autoSearch);
    await fill(searchField, 'jazz');
    await waitFor('catalog results visible again', () => run(`!!document.querySelector(${JSON.stringify(playOnline)})`));
    assert.doesNotMatch(JSON.stringify(await preferences()), /audius-|DX0Xb|Siberian Jazz|cidstream/);
    const partialAudius = await run(`(async () => {
      const response = await fetch(${JSON.stringify(ephemeralUrl)}, { headers: { Range: 'bytes=24-31' } });
      return [response.status, response.headers.get('Cache-Control'), [...new Uint8Array(await response.arrayBuffer())]];
    })()`);
    assert.deepEqual(partialAudius, [206, 'no-store', [...sample.subarray(24, 32)]]);

    const networkSelect = '[aria-label="Качество воспроизведения"] select';
    const autoNextSwitch = '[role="switch"][aria-label="Следующий трек автоматически"]';
    await settings('Качество аудио');
    await select(networkSelect, 'normal');
    await waitFor('normal network allows preloading finite recordings', async () => (await preferences()).audioQuality.network === 'normal');
    await closeSettings();
    await settings('Воспроизведение');
    await click(autoNextSwitch);
    await waitFor('automatic advance is off', async () => (await preferences()).playback.autoNext === false);
    await closeSettings();
    await click(playOnline);
    await waitFor('manual switch still overlaps two decoded streams with automatic advance off', () => run(`(() => {
      const from = document.querySelector('${onlineAudio}'), to = document.querySelector('audio[data-online-blend-audio]');
      return from.currentSrc === ${JSON.stringify(ephemeralUrl)} && to.currentSrc === ${JSON.stringify(jamendoRecording.url)}
        && !from.paused && !to.paused && to.currentTime > .05 && from.volume > 0 && to.volume > 0;
    })()`));
    await click('.player-bar .play-button');
    await waitFor('a pause leaves no playing stream deck', () => run(`[...document.querySelectorAll('audio')].every(a => a.paused)
      && !document.querySelector('${onlineAudio}').hasAttribute('src')`));
    await settings('Воспроизведение');
    await click(autoNextSwitch);
    await waitFor('automatic advance restored', async () => (await preferences()).playback.autoNext === true);
    await closeSettings();
    await settings('Качество аудио');
    await select(networkSelect, 'metered');
    await waitFor('metered settings restored', async () => (await preferences()).audioQuality.network === 'metered');
    await closeSettings();
    await click('.online-results li[data-source="audius"] button:first-child');
    await waitFor('ordinary stream switch uses a single deck again', () => streamReady(ephemeralUrl));
    await click(playOnline);
    await waitFor('back on Jamendo', () => streamReady(economyUrl));
    console.log('Two finite streams decoded during manual crossfade; pausing retired the old stream.');
    await go('Главная');
    await waitFor('online attribution shown in player', () => run(`document.querySelector('.hero .online-credit')?.textContent.includes('CC BY-NC-ND 3.0')`));
    const opened = [];
    const openExternal = shell.openExternal;
    shell.openExternal = async (url) => { opened.push(url); };
    try {
      assert.deepEqual(await oldVkData(true), { bookmarks: legacyBookmarks, tracks: legacyTracks });
      const sessionCookie = { url: 'https://vk.ru/audio', name: 'lumaFixture', value: '1', secure: true };
      await legacyVk.cookies.set(sessionCookie);
      await session.defaultSession.cookies.set(sessionCookie);
      await isolatedVk.cookies.set({ ...sessionCookie, value: 'isolated' });
      await go('Главная');
      await waitFor('merged Home keeps discovery and now-playing together', () => run(`!!document.querySelector('.home-page .hub-hero') && !!document.querySelector('.home-page .home-now')`));
      assert.equal(await run(`!!document.querySelector('nav [aria-label="Музыка"]')`), false);
      assert.equal(await run(`!!document.querySelector('iframe, [data-home-tab="youtube"]') || 'clearLegacyVkSession' in window.luma`), false);
      assert.ok(window.contentView.children.every((view) => view.webContents?.session !== legacyVk));
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      assert.equal(await run(`document.querySelector('${onlineAudio}').paused`), false, 'entering Home leaves online playback alone');
      assert.equal(opened.length, 0);
      const homeSearchStart = catalogCalls.length;
      const homeAudiusStart = audiusCalls.length;
      await fill('.hub-search input', 'Ария — Ты здесь');
      await run(`(() => { document.querySelector('.hub-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); })()`);
      await waitFor('explicit queries are kept on the device', async () => (await preferences())?.searchHistory?.[0] === 'Ария — Ты здесь');
      await waitFor('native search finds a local track', () => run(`document.querySelector('.hub-track strong')?.textContent === 'Ты здесь'`));
      assert.equal(await run(`!!document.querySelector('.vk-track-matches')`), false);
      await waitFor('Home finds local and online matches despite a failed catalog', () => run(`document.querySelectorAll('.catalog-sources [data-state="done"]').length === 3
        && document.querySelector('[data-catalog="southern_city"]').dataset.state === 'error'
        && document.querySelectorAll('.online-results li').length === 2`));
      assert.deepEqual(catalogCalls.slice(homeSearchStart).map((url) => url.searchParams.get('q')), ['Ария — Ты здесь']);
      assert.deepEqual(audiusCalls.slice(homeAudiusStart).map((url) => url.searchParams.get('query')), ['Ария — Ты здесь']);
      assert.equal(opened.length, 0, 'no browser tab from automatic searches');
      assert.equal(await run(`!!document.querySelector('.music-sites, .music-site-grid')`), false);
      for (const url of ['https://example.invalid/', VK_MUSIC_URL, 'https://vk.ru/audio?q=jazz', 'https://my.mail.ru/music', 'https://music.yandex.ru/']) {
        assert.equal(await run(`window.luma.openOnlineLink(${JSON.stringify(url)}).then(() => false, () => true)`), true);
      }
      assert.deepEqual(await run(`[...document.querySelectorAll('.hub-tabs button')].map(button => button.textContent)`),
        ['Для вас', 'Моя музыка', 'VK Музыка'], 'the strip keeps only music sections');
      failSouthernFixture = false;
      await click('.catalog-request');
      await waitFor('Retry only retries the failed source and keeps the other results', () => run(`
        document.querySelector('[data-catalog="southern_city"]').dataset.state === 'done' && document.querySelectorAll('.online-results li').length === 2`));
      assert.equal(catalogCalls.length, homeSearchStart + 1, 'Openverse was not searched again');
      assert.equal(audiusCalls.length, homeAudiusStart + 1, 'Audius was not searched again');
      const vkView = () => window.contentView.children.find((view) => view.webContents?.session === isolatedVk && !view.webContents.isDestroyed());
      const waitVk = (url) => waitFor('VK native view at official destination', () => {
        const view = vkView();
        return view?.webContents.getURL() === url && view;
      });
      assert.deepEqual(vkRequests, [], 'VK receives no query while the user is typing');
      await isolatedVk.cookies.set(authCookie); // A returning session, including after an update.
      await click('[data-catalog-vk]');
      await waitVk(vkMusicSearchUrl('Ария — Ты здесь'));
      assert.ok(!vkRequests.some((value) => new URL(value).pathname === '/login'), 'authorized searches go directly to music');
      await isolatedVk.cookies.remove(authCookie.url, authCookie.name);
      await click('.vk-site-bar [aria-label="Закрыть сайт VK"]');
      await waitFor('explicit close destroys the website', () => !vkView());
      await click('.player-bar .play-button');
      await waitFor('Luma can resume its own stream', () => run(`!document.querySelector('${onlineAudio}').paused`));
      await click('[data-home-tab="home"]');
      await waitFor('genres, moods and former Browse collections are together, in order', () => run(`(() => {
        const headings = [...document.querySelectorAll('.home-page .hub-shelf-head h2')].map(h => h.textContent);
        const expected = ['Жанры', 'Настроения и занятия', 'Подборки Luma'];
        return expected.every((title, index) => headings.filter(h => h === title).length === 1 &&
          (index === 0 || headings.indexOf(title) > headings.indexOf(expected[index - 1]))) && !headings.includes('Жанры и настроения');
      })()`));
      const originalBounds = window.getBounds();
      const originalZoom = window.webContents.getZoomFactor();
      const homeLayout = (wide) => run(`(() => {
        const pane = document.querySelector('.main-pane'), home = document.querySelector('.home-page');
        const now = home.querySelector('.home-now').getBoundingClientRect(), mix = home.querySelector('.hub-hero').getBoundingClientRect();
        return Math.abs(home.getBoundingClientRect().width - pane.clientWidth) <= 1 && pane.scrollWidth <= pane.clientWidth + 1
          && (${wide} ? mix.left > now.right && Math.abs(now.top - mix.top) <= 1 : mix.top > now.bottom);
      })()`);
      try {
        window.webContents.setZoomFactor(.48);
        await waitFor('wide Home fills the pane and places Now Playing alongside the mix', () => homeLayout(true));
        window.webContents.setZoomFactor(originalZoom);
        window.setSize(620, 560);
        await waitFor('narrow Home stacks the cards without horizontal overflow', () => homeLayout(false));
      } finally { window.webContents.setZoomFactor(originalZoom); window.setBounds(originalBounds); }
      const homeImport = '.hub-top-actions [data-playlist-import]';
      assert.deepEqual(await run(`[...document.querySelectorAll('.hub-top-actions button')].map(button => [button.textContent.trim(), button.getAttribute('aria-label')])`),
        [['', 'Добавить музыку'], ['', 'Импорт из сервисов'], ['', 'Открыть музыкальную ссылку']]);
      await click('[data-open-music-link]');
      await waitFor('link dialog accepts pasted links', () => run(`!!document.querySelector('.music-link-dialog[open]')`));
      await fill('.music-link-dialog input', 'https://music.yandex.ru/album/42/track/51?utm_source=fixture');
      await click('.music-link-dialog button[type="submit"]');
      await waitFor('Yandex track is recognized inside Luma', () => run(`!!document.querySelector('.music-link-target[data-provider="yandex"]')`));
      assert.equal(opened.length, 0, 'parsing never opens the source');
      await click('.music-link-dialog .music-link-target a');
      assert.deepEqual(opened.splice(0), ['https://music.yandex.ru/album/42/track/51']);
      await click('.music-link-dialog header button');
      const vkLink = readMusicLink('https://vk.com/audio?z=audio_playlist-31_4%2FaShare');
      for (const rejected of ['https://example.invalid/', vkLink.url, VK_MUSIC_URL]) {
        assert.equal(await run(`window.luma.musicLinks.openBrowser(${JSON.stringify(rejected)}).then(() => false, () => true)`), true);
      }
      assert.equal(await run(`window.luma.vkSite.open(1, 'https://outside.invalid/', { x: 0, y: 0, width: 350, height: 300 }).then(() => false, () => true)`), true);
      const vkQueue = (await preferences()).queue;
      const lumaRecent = (await preferences()).recent;
      await run(`window.vkFixtureStates = []; void window.luma.vkSite.onState((id, state) => window.vkFixtureStates.push({ id, state }));`);
      const readyView = () => run(`document.querySelector('.vk-site-slot')?.getAttribute('aria-busy') === 'false'`);
      const noLayoutChoice = () => run(`!document.querySelector('.vk-site select') && !('setAppearance' in window.luma.vkSite)`);
      const waitQr = async (entry) => {
        const view = await waitVk(fakeQr(entry));
        await waitFor('official QR greeting and explanation above the native view', async () => await readyView() && view.getVisible()
          && await view.webContents.executeJavaScript('!!document.getElementById("fixture-qr")')
          && await run(`(() => { const login = document.querySelector('.vk-site-login'), slot = document.querySelector('.vk-site-slot');
            return login?.querySelector('strong')?.textContent === 'Войдите в VK по QR-коду' && login.getBoundingClientRect().bottom <= slot.getBoundingClientRect().top + 1;
          })()`));
        assert.equal(await noLayoutChoice(), true, 'no layout selector during sign-in');
        return view;
      };
      const startRequest = vkRequests.length;
      await click('[data-home-tab="vk"]');
      const firstView = await waitQr(VK_MUSIC_URL);
      assert.deepEqual(vkRequests.slice(startRequest), [VK_MUSIC_URL, vkSignInUrl(VK_MUSIC_URL), fakeQr(VK_MUSIC_URL)]);
      assert.equal(await run(`!!document.querySelector('.vk-site-intro, .vk-site a[target="_blank"], [data-vk-open], iframe')`), false);
      assert.equal(await run(`!!document.querySelector('.vk-site-bar [data-vk-reset]:enabled')`), true);
      assert.equal(await run(`document.querySelector('${onlineAudio}').paused`), true);
      assert.equal(await firstView.webContents.executeJavaScript('typeof window.__lumaVkPlayback'), 'undefined');

      app.emit('second-instance', {}, [process.execPath, '--', musicLaunchUrl(vkLink)]);
      await waitFor('Windows playlist handoff closes a live guest for the link dialog', async () => !vkView()
        && await run(`!!document.querySelector('.music-link-dialog[open] [data-provider="vk"]')`));
      assert.equal(await run(`!!document.querySelector('.music-link-dialog [data-provider="vk"] a')`), false);
      await click('.music-link-dialog .music-link-target .primary-button');
      const nativeView = await waitQr(vkLink.url), guest = nativeView.webContents;
      const guestRun = (code) => guest.executeJavaScript(code, true);
      assert.ok(vkRequests.includes(vkSignInUrl(vkLink.url)), 'QR sign-in retains the playlist target');
      await guestRun(`document.getElementById('fixture-auth').click()`);
      await waitVk(vkFixtureAuth);
      await waitFor('VK ID hostname visible, with no guest bridge or playback controls', async () => await readyView()
        && await guestRun(`!!document.getElementById('fixture-password')`)
        && await run(`document.querySelector('.vk-site-origin strong')?.textContent === 'id.vk.ru' && !document.querySelector('.vk-site-transport')`));
      assert.equal(await noLayoutChoice(), true, 'no layout selector on VK ID');
      assert.deepEqual(await guestRun(`[typeof window.luma, typeof window.require, typeof window.process, typeof window.__lumaVkPlayback]`),
        ['undefined', 'undefined', 'undefined', 'undefined']);
      assert.equal(await guestRun(`navigator.permissions.query({ name: 'geolocation' }).then(s => s.state)`), 'denied');
      assert.ok(!isolatedVk.protocol.isProtocolHandled('luma'), 'the VK partition has no application protocol handler');
      assert.equal((await isolatedVk.cookies.get({ name: 'lumaFixture' }))[0].value, 'isolated');
      await guestRun(`document.getElementById('fixture-sign-in').click()`);
      await waitVk(vkLink.url);
      assert.ok(vkRequests.includes(vkFixtureReturn), 'generic VK feed returns to the requested playlist');
      const titleIs = (index) => run(`window.vkFixtureStates.at(-1)?.state.track?.title === ${JSON.stringify(vkFixtureTracks[index])}
        && window.vkFixtureStates.at(-1)?.state.track?.artist === ${JSON.stringify(vkFixtureArtist)}`);
      const vkCommand = (action, ratio) => run(`window.luma.vkSite.command(window.vkFixtureStates.at(-1).id, ${JSON.stringify(action)}, ${JSON.stringify(ratio)})`);
      const vkDock = '.player-bar[data-playback-source="vk"]';
      const toggleVk = `${vkDock} .play-button`;
      const vkStage = '.immersive-player[open][data-playback-source="vk"]';
      const mirrored = (selector, index) => run(`document.querySelector(${JSON.stringify(selector)})?.textContent === ${JSON.stringify(vkFixtureTracks[index])}`);
      const coverAt = (selector, src) => run(`(() => { const img = document.querySelector(${JSON.stringify(selector)});
        return img?.naturalWidth > 0 && (img.src === ${JSON.stringify(src)}); })()`);
      const guestCover = () => run(`window.vkFixtureStates.at(-1)?.state.cover`);
      await waitFor('the selected page exposes title and artist without a duplicate Luma transport', () => titleIs(0));
      assert.equal(await run(`!!document.querySelector('.vk-site-transport, .vk-site-timeline')`), false);
      assert.equal(await run(`!!document.querySelector('.vk-site-login')`), false);
      assert.equal(await guestRun(`document.querySelector('audio').paused`), true, 'no VK autoplay by Luma');
      const shellIs = (mode) => guestRun(`(() => {
        const header = document.querySelector('#page_header_cont'), sidebar = document.querySelector('#layout_sidebar');
        const body = document.querySelector('#page_body');
        const link = sidebar?.querySelector('#l_pr a'), feed = sidebar?.querySelector('#l_feed'), chat = document.querySelector('#fixture-chat');
        if (!header || !link || !feed || !body || !chat) return false;
        const mode = ${JSON.stringify(mode)};
        const headerStyle = getComputedStyle(header), bodyRect = body.getBoundingClientRect();
        const displayed = (el) => el.getBoundingClientRect().width > 0;
        if (mode === 'standard') return headerStyle.opacity === '1' && displayed(link) && displayed(feed) && displayed(chat) && bodyRect.left >= 164;
        const hidden = headerStyle.opacity === '0' && getComputedStyle(header.querySelector('ul')).getPropertyValue('interactivity') === 'inert';
        const player = header.querySelector('#top_audio_layer_place'), bar = header.getBoundingClientRect();
        const viewport = document.documentElement.clientWidth;
        return !displayed(sidebar) && !displayed(chat) && viewport - bodyRect.width <= 33 && bodyRect.left >= 0 && bodyRect.right <= viewport + 1
          && document.documentElement.scrollWidth <= viewport + 1 && (player
            ? headerStyle.opacity === '1' && displayed(player) && Math.abs(bar.left - bodyRect.left) < 1 && bar.bottom <= bodyRect.top
              && !displayed(header.querySelector('#fixture-vk-home')) && !displayed(header.querySelector('#fixture-vk-search'))
              && !displayed(header.querySelector('#fixture-vk-account'))
            : hidden && bodyRect.top < 32);
      })()`);
      assert.equal(await noLayoutChoice(), true);
      await waitFor('signed-in VK opens without the general panels by default', () => shellIs('minimal'));
      assert.equal(await guestRun(`(() => {
        const search = document.querySelector('#fixture-vk-search'); search.focus(); return document.activeElement === search;
      })()`), false, 'hidden chrome does not take focus');
      await guestRun(`document.querySelector('#fixture-toggle').click()`);
      await waitFor('the native VK Play remains clickable, and the site audio decodes', () => guestRun(`(() => {
        const audio = document.querySelector('audio'); return !audio.paused && audio.currentTime > .15 && audio.readyState >= 2;
      })()`));
      const waitPauseVk = () => waitFor('VK dock follows playing state', () => run(`document.querySelector('${toggleVk}')?.getAttribute('aria-label') === 'Пауза'`));
      await waitPauseVk();
      const firstCover = await waitFor('larger VK MediaSession art is mirrored through the private app protocol', guestCover);
      assert.match(firstCover, /^luma:\/\/app\/media\/vk-cover\/[0-9a-f-]{36}$/);
      await waitFor('the new cover decodes in the dock', () => coverAt(`${vkDock} .playing-mini img`, firstCover));
      assert.deepEqual(vkCoverRequests, [vkFixtureCovers[0]]);
      const historyArtwork = await waitFor('the saved VK listen keeps only an opaque cover key',
        async () => (await preferences()).vkRecent[0]?.artwork);
      assert.match(historyArtwork, /^[a-f0-9]{32}$/);
      assert.equal(await run(`fetch('luma://app/media/vk-listen/${historyArtwork}').then(r => r.ok && r.headers.get('Content-Type'))`),
        'image/webp', 'the history cover decodes through the app protocol, not a VK address');
      const pageCount = () => vkRequests.filter((value) => new URL(value).pathname !== testAudioPath).length;
      const beforeLayout = pageCount();
      await waitFor('a playing VK track is recorded in the separate history', async () => (await preferences()).vkRecent[0]?.title === vkFixtureTracks[0]);
      await click(toggleVk);
      await waitFor('Luma pauses VK through the compact player', () => guestRun(`document.querySelector('audio').paused`));
      await click(`${vkDock} [aria-label="Следующий трек"]`);
      await waitFor('the compact player updates from rendered text without MediaSession', () => titleIs(1));
      const secondCover = await waitFor('scoped player artwork replaces MediaSession cover', guestCover);
      assert.notEqual(firstCover, secondCover);
      assert.ok(vkCoverRequests.includes(vkFixtureCovers[1]));
      await waitFor('the DOM fallback cover decodes in the dock', () => coverAt(`${vkDock} .playing-mini img`, secondCover));
      assert.equal(await run(`fetch(${JSON.stringify(firstCover)}).then(r => r.status)`), 404, 'the previous VK image is no longer served');
      await click(`${vkDock} [aria-label="Перемешать треки VK"]`);
      await waitFor('shuffle from the dock changes only the player on VK', () => guestRun(`document.querySelector('#fixture-shuffle').getAttribute('aria-pressed') === 'true'`));
      await click(`${vkDock} [aria-label="Повтор выключен"]`);
      await waitFor('repeat delegates to the native player', () => guestRun(`document.querySelector('#fixture-repeat').dataset.repeat === 'all'`));
      assert.equal(await vkCommand('like'), true);
      await waitFor('a VK like is delegated and read back from the rendered player',
        () => guestRun(`document.querySelector('#fixture-like').getAttribute('aria-pressed') === 'true'`));
      assert.equal(await vkCommand('dislike'), true);
      await waitFor('a switch that ignores scripted clicks still receives real input',
        () => guestRun(`document.querySelector('#fixture-dislike').getAttribute('aria-pressed') === 'true'`));
      await waitFor('the mirrored VK snapshot carries both feedback marks as state', () => run(`(() => {
        const track = window.vkFixtureStates.at(-1)?.state?.track;
        return track?.liked === true && track?.disliked === true;
      })()`));
      await fill(`${vkDock} .volume input`, '34');
      await waitFor('VK volume delegates to the native slider', () => guestRun(`Math.abs(document.querySelector('audio').volume - .34) < .01`));
      const catalogueFits = () => guestRun(`(() => {
        const viewWidth = document.documentElement.clientWidth;
        return ['[role=tablist]', '#fixture-music-search', '#fixture-mix', '#fixture-music-row', '#fixture-recommendation', '#fixture-genre'].every(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= viewWidth + 1;
        });
      })()`);
      assert.equal(await catalogueFits(), true);
      assert.equal(await guestRun(`(() => {
        const search = document.querySelector('#fixture-music-search'); search.focus({ preventScroll: true });
        document.querySelector('#fixture-chat').focus({ preventScroll: true });
        return document.activeElement === search && getComputedStyle(document.body).colorScheme === 'dark';
      })()`), true, 'chat shortcuts cannot take focus, but native music search still can');
      await guestRun(`document.getElementById('fixture-mix').click()`);
      await waitFor('native Mix starts the fixture audio in minimal mode', () => guestRun(`!document.querySelector('audio').paused`));
      await waitFor('the second played title gets a history entry', async () => (await preferences()).vkRecent.some(({ title, artist }) =>
        title === vkFixtureTracks[1] && artist === vkFixtureArtist));
      assert.equal(await guestRun(`(() => {
        const control = document.querySelector('#fixture-toggle'), rect = control.getBoundingClientRect();
        if (!control.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))) return false;
        control.click(); return true;
      })()`), true, 'nothing intercepts the compact player');
      await waitFor('native compact player pauses playback', () => guestRun(`document.querySelector('audio').paused`));
      const beforeScroll = nativeView.getBounds();
      await guestRun(`window.scrollTo(0, 900)`);
      await waitFor('the retained compact transport sticks within the scrolled VK viewport', () => guestRun(`scrollY > 400
        && Math.abs(document.querySelector('#page_header_cont').getBoundingClientRect().top) < 1`));
      assert.deepEqual(nativeView.getBounds(), beforeScroll);
      assert.equal(await run(`document.querySelector('.main-pane').scrollTop`), 0);
      await click(`${vkDock} [aria-label="Предыдущий трек"]`);
      await waitFor('Luma Previous still delegates while VK is scrolled', () => titleIs(0));
      await guestRun(`window.scrollTo(0, 0)`);
      const wideBounds = window.getBounds();
      window.setSize(620, 520);
      try {
        await waitFor('minimal and the host transport fit a narrow window', async () => await shellIs('minimal') && await catalogueFits()
          && await run(`!document.querySelector('.vk-site select') && innerWidth <= 640
            && document.querySelector('.vk-site-bar').getBoundingClientRect().bottom <= document.querySelector('.vk-site-slot').getBoundingClientRect().top + 1`));
      } finally { window.setBounds(wideBounds); }
      assert.equal(vkView(), nativeView);
      assert.equal(pageCount(), beforeLayout);
      assert.equal(guest.getURL(), vkLink.url);
      const profileUrl = 'https://vk.ru/id42';
      await guestRun(`history.pushState(null, '', '${profileUrl}')`);
      await waitVk(profileUrl);
      await waitFor('VK profile page keeps all of its own navigation', () => shellIs('standard'));
      assert.equal(nativeView.webContents.isAudioMuted(), true, 'an unrelated VK page never inherits the music lease');
      await waitFor('non-music route clears the mirror', () => run(`!document.querySelector('.player-bar[data-playback-source="vk"]')`));
      await guestRun(`history.pushState(null, '', ${JSON.stringify(vkLink.url)})`);
      await waitVk(vkLink.url);
      await waitFor('SPA return to music reapplies the minimal layout', () => shellIs('minimal'));

      const feedUrl = 'https://vk.ru/feed?fixture=handlers', handlersUrl = 'https://vk.ru/audio?fixture=handlers';
      await guestRun(`setTimeout(() => { location.href = '${feedUrl}'; }, 0)`);
      await waitVk(feedUrl);
      await waitFor('the SPA feed settles with standard layout and without playback', async () => await readyView()
        && await guestRun('!!window.fixtureAudio') && await shellIs('standard'));
      assert.equal(await guestRun(`typeof window.__lumaVkPlayback?.()`), 'undefined', 'the observer is inert on the feed');
      await guestRun(`history.pushState(null, '', '${handlersUrl}')`);
      await waitVk(handlersUrl);
      const seekInput = `${vkDock} .timeline input`;
      await waitFor('MediaSession-only VK takes full width without an empty bar: play, next, previous and seek enabled', async () => await shellIs('minimal') && await titleIs(0) && await run(`(() => {
        const p = window.vkFixtureStates.at(-1)?.state.track; return p?.toggle && p?.next && p?.previous && p?.timeline?.seek;
      })()`));
      assert.equal(await guestRun(`document.querySelector('audio, #top_audio_layer_place')`), null);
      assert.equal(await guestRun(`window.fixtureAudio.paused`), true);
      for (const invalid of ['0.5', -1, 2, null]) assert.equal(await vkCommand('seek', invalid), false);
      assert.equal(await vkCommand('unknown'), false);
      assert.equal(await vkCommand('toggle'), true);
      await waitFor('MediaSession play calls the actual handler and decodes its audio', () => guestRun(`window.fixtureAction === 'play' && fixtureAudio.currentTime > .15 && fixtureAudio.readyState >= 2`));
      await waitPauseVk();
      await click(toggleVk);
      await waitFor('MediaSession pause delegates', () => guestRun(`window.fixtureAction === 'pause' && fixtureAudio.paused`));
      const half = (await guestRun(`fixtureAudio.duration`)) / 2;
      await fill(seekInput, String(half));
      await waitFor('timeline delegates to seekto with seconds and actually seeks', () => guestRun(`window.fixtureAction === 'seekto'
        && !fixtureAudio.seeking && Math.abs(fixtureAudio.currentTime - fixtureAudio.duration * .5) < .25`));
      await click(`${vkDock} [aria-label="Следующий трек"]`);
      await waitFor('MediaSession next delegates and a track without art clears the previous cover', async () => await titleIs(1)
        && await guestRun(`window.fixtureAction === 'nexttrack'`) && !await guestCover()
        && await run(`document.querySelector('${vkDock} .playing-mini img')?.src.endsWith('/vk-music.svg')`));
      assert.equal(await vkCommand('favorite'), false);
      assert.equal(await vkCommand('shuffle'), false);
      assert.equal(await vkCommand('repeat'), false);
      assert.equal(await vkCommand('volume', '0.5'), false);
      await click(`${vkDock} [aria-label="Предыдущий трек"]`);
      await waitFor('MediaSession previous delegates without rendered VK buttons', async () => await titleIs(0) && await guestRun(`window.fixtureAction === 'previoustrack'`));
      await click(`${vkDock} .playing-mini`);
      await waitFor('the same signed-in guest is hidden but retained on Now Playing', async () => vkView() === nativeView
        && !nativeView.getVisible() && !guest.isAudioMuted() && await mirrored('.home-now[data-playback-source="vk"] .hero h2', 0)
        && await run(`document.querySelector('.home-now .hero-meta').textContent === ${JSON.stringify(vkFixtureArtist)}`));
      assert.equal(await run(`!navigator.mediaSession.metadata && [...document.querySelectorAll('audio')].every(audio => audio.paused)
        && !document.querySelector('.home-now :is(.favorite-toggle,.hero-index,.track-cover-button,.hero-karaoke)')`), true);
      const beforeBackground = await guestRun('fixtureAudio.currentTime');
      await click('.home-now .play-button');
      await waitFor('Now Playing resumes the actual hidden guest', () => guestRun(`!fixtureAudio.paused && fixtureAudio.currentTime > ${beforeBackground + .1}`));
      await click('.home-now button[aria-label="Развернуть текущий трек"]');
      await waitFor('fullscreen shows the VK track and supports only delegated controls', async () => await mirrored(`${vkStage} h1`, 0) && await run(`
        !document.querySelector('${vkStage} :is(.mode-button,.immersive-upcoming,.immersive-karaoke-toggle,.immersive-feedback)')
        && !!document.querySelector('${vkStage} .volume input:enabled')
        && document.querySelector('${vkStage} .play-button')?.getAttribute('aria-label') === 'Пауза'`));
      const mediaArt = await waitFor('restored VK track gets its current artwork', guestCover);
      await waitFor('VK cover also decodes in expanded player', () => coverAt(`${vkStage} .immersive-art img`, mediaArt));
      await fill(`${vkStage} .volume input`, '42');
      await waitFor('volume falls back to the single detached Audio element', () => guestRun(`Math.abs(fixtureAudio.volume - .42) < .01`));
      await click(`${vkStage} [aria-label="Выключить звук"]`);
      await waitFor('mute controls the VK audio only and updates the toggle', async () => await guestRun(`fixtureAudio.muted`)
        && await run(`!!document.querySelector('${vkStage} [aria-label="Включить звук"]')`));
      await click(`${vkStage} [aria-label="Включить звук"]`);
      await waitFor('unmute restores VK volume', () => guestRun(`!fixtureAudio.muted && Math.abs(fixtureAudio.volume - .42) < .01`));
      assert.equal(vkView(), nativeView);
      assert.equal(nativeView.getVisible(), false);
      await click(`${vkStage} .play-button`);
      await waitFor('fullscreen pause reaches the website', () => guestRun('fixtureAudio.paused && fixtureAction === "pause"'));
      await fill(`${vkStage} .timeline input`, '4');
      await waitFor('fullscreen seek uses the VK clock', () => guestRun('fixtureAction === "seekto" && !fixtureAudio.seeking && Math.abs(fixtureAudio.currentTime - 4) < .25'));
      await click(`${vkStage} [aria-label="Следующий трек"]`);
      await waitFor('fullscreen Next updates title and artist via the guest', async () => await mirrored(`${vkStage} h1`, 1) && await guestRun('fixtureAction === "nexttrack"'));
      await click(`${vkStage} [aria-label="Предыдущий трек"]`);
      await waitFor('fullscreen Previous restores the first track', () => mirrored(`${vkStage} h1`, 0));
      const beforeReturn = pageCount();
      await click(`${vkStage} [aria-label="Вернуться к сайту VK"]`);
      await waitFor('returning from fullscreen reveals the original tab without reloading', async () => !window.isFullScreen() && nativeView.getVisible() && await titleIs(0));
      assert.equal(pageCount(), beforeReturn);
      await guestRun(`navigator.mediaSession.setActionHandler('nexttrack', null)`);
      await waitFor('actions that VK unregisters disable again', () => run(`document.querySelector('${vkDock} [aria-label="Следующий трек"]').disabled`));
      assert.equal(await run(`document.querySelector('${vkDock} [aria-label="Следующий трек"]').disabled`), true);

      await click(`${vkDock} .playing-mini`);
      await sendWidgetChord();
      await waitFor('desktop widget retains the same VK playback', async () => await widgetOpen() && await mirrored('.desktop-widget .widget-copy strong', 0)
        && vkView() === nativeView && !nativeView.getVisible());
      await waitFor('the widget decodes the current VK artwork', async () => {
        const src = await guestCover();
        return src && await coverAt('.desktop-widget .widget-track img', src);
      });
      await click('.widget-window-buttons [data-widget-window="restore"]');
      await waitFor('restoring the widget retains the mirrored selection', async () => await widgetClosed() && await mirrored('.home-now[data-playback-source="vk"] .hero h2', 0));
      await click('.sleep-timer-open');
      await waitFor('VK sleep timer is available', () => run(`!!document.querySelector('.sleep-timer button')`));
      await click('.sleep-timer button:first-child');
      await waitFor('VK timer has a deadline', () => run(`document.querySelector('.sleep-timer button')?.textContent === 'Отменить таймер'`));
      await run(`void (window.originalClock = Date.now, Date.now = () => window.originalClock() + 6 * 60_000)`);
      try {
        powerMonitor.emit('resume');
        await waitFor('sleep timer cannot resume a paused VK track', async () => await guestRun('fixtureAudio.paused && fixtureAction === "pause"')
          && await run(`document.querySelector('.sleep-timer button')?.textContent === '5 мин'`));
      } finally { await run(`void (Date.now = window.originalClock, delete window.originalClock)`); }
      await closeSettings();
      await click('.home-now [aria-label="Вернуться к сайту VK"]');
      await waitFor('retained authorized VK catalogue and its seek bar reappear', async () => nativeView.getVisible() && await titleIs(0));

      const detachedUrl = 'https://vk.ru/audio?fixture=detached';
      await guestRun(`setTimeout(() => { location.href = '${detachedUrl}'; }, 0)`);
      await waitVk(detachedUrl);
      await waitFor('metadata alone does not invent unsupported controls', async () => await titleIs(0)
        && await run(`(() => { const p = window.vkFixtureStates.at(-1)?.state.track; return !p?.toggle && !p?.next && !p?.previous; })()`));
      await guestRun(`document.getElementById('fixture-start-song').click()`);
      await waitFor('detached audio decodes and supports the play/pause and timeline fallbacks', async () => await guestRun(`fixtureAudio.currentTime > .15`)
        && await run(`!!document.querySelector('${toggleVk}:enabled') && !!document.querySelector('${seekInput}:enabled')`));
      await waitPauseVk();
      await click(toggleVk);
      await waitFor('detached audio pauses without a handler or visible player controls', () => guestRun(`fixtureAudio.paused`));
      assert.equal(await vkCommand('seek', .75), true);
      await waitFor('detached audio position follows the bounded seek', () => guestRun(`!fixtureAudio.seeking && Math.abs(fixtureAudio.currentTime - fixtureAudio.duration * .75) < .25`));
      assert.deepEqual((await preferences()).queue, vkQueue);
      assert.deepEqual((await preferences()).recent, lumaRecent, 'VK history does not write Luma track IDs');
      const observed = await run(`JSON.stringify(window.vkFixtureStates)`);
      assert.doesNotMatch(observed, /vk-fixture-sign-in-only|signed-in|https:\/\/|fixture-password|fixtureVkAuthorized|luma-smoke-audio/);
      assert.doesNotMatch(JSON.stringify(await preferences()), new RegExp(vkFixturePrivate));
      assert.equal(await guestRun(`open('https://outside.invalid/') === null`), true);
      await guestRun(`setTimeout(() => { location.href = 'https://outside.invalid/'; }, 0);`);
      await delay(250);
      assert.equal(guest.getURL(), detachedUrl);
      await waitFor('a blocked external link leaves the authorized player visible and selected', async () => nativeView.getVisible()
        && await readyView() && await mirrored(`${vkDock} .playing-mini strong`, 0));
      assert.ok(vkRequests.every((value) => ['vk.ru', 'id.vk.ru'].includes(new URL(value).hostname)));
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      const vkBounds = window.getBounds();
      window.setSize(620, 520);
      await waitFor('narrow native view is contained in the visible clipped slot', async () => {
        if (!vkView()) return false;
        const { x, y, width, height } = nativeView.getBounds();
        return await shellIs('minimal') && await run(`(() => { const slot = document.querySelector('.vk-site-slot').getBoundingClientRect();
          const pane = document.querySelector('.main-pane').getBoundingClientRect();
          return innerWidth <= 640 && ${width} >= 168 && ${height} >= 80 && ${x} >= slot.left - 1 && ${y} >= Math.max(slot.top, pane.top) - 1
            && ${x + width} <= slot.right + 1 && ${y + height} <= Math.min(slot.bottom, pane.bottom) + 1;
        })()`);
      });
      window.setBounds(vkBounds);
      await waitFor('the detached track is still selected before minimizing', async () => nativeView.getVisible() && await mirrored(`${vkDock} .playing-mini strong`, 0));
      await click(toggleVk);
      await waitPauseVk();
      const beforeMinimize = await guestRun('fixtureAudio.currentTime');
      window.minimize();
      try {
        await waitFor('minimizing hides the selected VK guest without stopping its session', async () => window.isMinimized()
          && vkView() === nativeView && !nativeView.getVisible() && !guest.isAudioMuted()
          && await guestRun(`!fixtureAudio.paused && fixtureAudio.currentTime > ${beforeMinimize + .1}`));
      } catch (error) {
        const sameGuest = vkView() === nativeView;
        throw new Error(`VK minimize: window=${window.isMinimized()} guest=${sameGuest ? `visible=${nativeView.getVisible()}, muted=${guest.isAudioMuted()}` : 'closed or replaced'}`, { cause: error });
      }
      window.restore();
      await waitFor('restoring shows the existing VK guest', async () => nativeView.getVisible() && await titleIs(0));
      await click(`${vkDock} .playing-mini`);
      await click('.home-now [aria-label="Закрыть сайт VK и остановить воспроизведение"]');
      await waitFor('explicit stop disposes a hidden guest and clears the mirror', async () => !vkView() && await run(`!document.querySelector('${vkDock}')`));

      await click('[data-home-tab="vk"]');
      const backgroundView = await waitVk(VK_MUSIC_URL);
      await waitFor('authorized guest can play again after explicit stop', () => titleIs(0));
      await backgroundView.webContents.executeJavaScript(`document.querySelector('#fixture-toggle').click()`);
      await waitPauseVk();
      await click(`${vkDock} .playing-mini`);
      await waitFor('playing guest is hidden again', () => !backgroundView.getVisible());
      await click(`${vkDock} [aria-label="Следующий трек"]`);
      await waitFor('the hidden guest can also use the website button fallback', () => mirrored('.home-now[data-playback-source="vk"] .hero h2', 1));
      await backgroundView.webContents.executeJavaScript(`void setTimeout(() => history.pushState(null, '', ${JSON.stringify(profileUrl)}), 0)`);
      await waitFor('a hidden departure from VK Music ends the background session', async () => !vkView() && await run(`!document.querySelector('${vkDock}')`));
      assert.equal((await isolatedVk.cookies.get({ name: authCookie.name })).length, 1);

      const trackUrl = 'https://vk.ru/audio123_456';
      await click('[data-open-music-link]');
      await fill('.music-link-dialog input', trackUrl);
      await click('.music-link-dialog button[type="submit"]');
      const reopenAt = vkRequests.length;
      await click('.music-link-dialog .music-link-target .primary-button');
      await waitVk(trackUrl);
      await waitFor('minimal mode recognizes the unmarked full player and suppresses the compact header', async () => await titleIs(0)
        && await noLayoutChoice() && await run(`!document.querySelector('.vk-site-login, .vk-site-transport')`)
        && await vkView().webContents.executeJavaScript(`getComputedStyle(document.querySelector('#side_bar')).display === 'none'
          && getComputedStyle(document.querySelector('#top_nav')).opacity === '0'
          && getComputedStyle(document.querySelector('#fastchat-reforged')).display === 'none'
          && document.documentElement.clientWidth - document.querySelector('#content').getBoundingClientRect().width <= 33
          && document.querySelector('#fixture-inline').getBoundingClientRect().bottom <= document.querySelector('[role=tablist]').getBoundingClientRect().top
          && document.querySelector('#fixture-toggle').getBoundingClientRect().width > 0`));
      assert.equal(vkRequests[reopenAt], trackUrl);
      const lastView = vkView();
      const lastGuest = lastView.webContents;
      await lastGuest.executeJavaScript(`window.scrollTo(0, 850)`);
      await waitFor('compact transport returns when the full player scrolls offscreen', () => lastGuest.executeJavaScript(`scrollY > 400
        && getComputedStyle(document.querySelector('#top_nav')).opacity === '1'`));
      await lastGuest.executeJavaScript(`window.scrollTo(0, 0)`);
      await waitFor('only the full player is available at the top again', () => lastGuest.executeJavaScript(`scrollY === 0
        && getComputedStyle(document.querySelector('#top_nav')).opacity === '0'`));
      await lastGuest.executeJavaScript(`document.querySelector('#fixture-toggle').click()`);
      await waitFor('the signed-in legacy page plays before source handoff', async () => await lastGuest.executeJavaScript('document.querySelector("audio").currentTime > .12')
        && await mirrored(`${vkDock} .playing-mini strong`, 0));
      await click(`${vkDock} .playing-mini`);
      const mainFavorite = '.home-now [aria-label="Добавить в Мою музыку VK"]';
      await waitFor('Now Playing mirrors the matching catalogue row’s vkuserphoto cover and native controls', async () => {
        const src = await guestCover();
        return src && vkCoverRequests.includes(vkFixturePhoto) && await coverAt('.home-now .hero-featured-cover img', src)
          && await run(`!!document.querySelector('${mainFavorite}:enabled')`);
      });
      await waitFor('only the canonical VK link is saved', async () => (await preferences()).vkRecent[0]?.link === trackUrl);
      await run(`[...document.querySelectorAll('.home-page .hub-shelf-head button')].find(button => button.textContent.trim() === 'Вся история').click()`);
      await waitFor('history shows the VK item beside library history', () => run(`document.querySelector('.vk-history-section .vk-history-track strong')?.textContent === ${JSON.stringify(vkFixtureTracks[0])}`));
      await click('.vk-history-section .vk-history-track');
      const historyView = await waitVk(trackUrl);
      await waitFor('history opens the song on VK without adding to the queue', async () => historyView !== lastView && lastGuest.isDestroyed() && await readyView());
      assert.deepEqual((await preferences()).queue, vkQueue);
      const historyGuest = historyView.webContents;
      await historyGuest.executeJavaScript(`document.querySelector('#fixture-toggle').click()`);
      await waitPauseVk();
      await click(`${vkDock} .playing-mini`);
      await waitFor('the reopened track has its library control', () => run(`!!document.querySelector('${mainFavorite}:enabled')`));
      const beforeFavorite = (await preferences()).favorites;
      await click('.home-now [aria-label="Добавить в Мою музыку VK"]');
      await waitFor('VK library action updates only the guest player', async () => await historyGuest.executeJavaScript(`document.querySelector('#fixture-save').getAttribute('aria-label') === 'Удалить из моей музыки'`)
        && await run(`!!document.querySelector('.home-now [aria-label="Удалить из Моей музыки VK"][aria-pressed="true"]')`));
      assert.deepEqual((await preferences()).favorites, beforeFavorite);
      if (!await run(`!!document.querySelector('#play-queue')`)) await click('.player-bar .queue-toggle');
      await click('#play-queue .queue-current .queue-song');
      await waitFor('the Luma queue can take over from a playing VK guest', () => !vkView());
      await waitFor('return to Luma audio', () => run(`!document.querySelector('${onlineAudio}').paused`));
      assert.deepEqual((await preferences()).queue, vkQueue);
      await click('[data-home-tab="vk"]');
      const resettingView = await waitVk(VK_MUSIC_URL);
      await waitFor('VK ready for toolbar reset', readyView);
      const showMessage = dialog.showMessageBox;
      const reset = (id = 'window.vkFixtureStates.at(-1).id') => run(`window.luma.vkSite.reset(${id})`);
      try {
        assert.equal(await reset('0'), false, 'a stale view cannot reset the partition');
        dialog.showMessageBox = async (owner, options) => {
          assert.equal(owner, window);
          assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0);
          assert.equal(resettingView.getVisible(), false, 'the guest does not overlap the confirmation dialog');
          assert.equal(resettingView.webContents.isAudioMuted(), true);
          return { response: 0 };
        };
        assert.equal(await reset(), false);
        assert.equal(vkView(), resettingView);
        assert.equal(resettingView.getVisible(), true, 'cancelling leaves the same guest and authorization');
        assert.equal((await isolatedVk.cookies.get({ name: authCookie.name })).length, 1);
        dialog.showMessageBox = async () => ({ response: 1 });
        await click('.vk-site-bar [data-vk-reset]');
        const newView = await waitQr(VK_MUSIC_URL);
        assert.notEqual(newView, resettingView);
        assert.equal(await newView.webContents.executeJavaScript('document.adoptedStyleSheets.length'), 0, 'minimal styling is not applied to QR');
      } finally { dialog.showMessageBox = showMessage; }
      assert.equal((await legacyVk.cookies.get({ name: 'lumaFixture' })).length, 0);
      assert.equal((await isolatedVk.cookies.get({ name: 'lumaFixture' })).length, 0);
      assert.equal((await isolatedVk.cookies.get({ name: authCookie.name })).length, 0);
      assert.equal((await session.defaultSession.cookies.get({ name: 'lumaFixture' })).length, 1);
      assert.deepEqual(await oldVkData(), { bookmarks: legacyBookmarks, tracks: legacyTracks });
      fixtureNotice('VK website', 'Official-host fixture: sign-in, chrome, MP3, fullscreen and widget mirroring, supported controls, retained session, stop, source handoff and reset. No real account used.');
      await click('[data-home-tab="home"]');
      await run(`document.querySelector('${homeImport}').focus()`);
      await click(homeImport);
      await waitFor('Home shortcut opens the service picker', () => run(`!!document.querySelector('.playlist-import[open] [data-source="apple"]')`));
      await click('.playlist-import [data-source="openwhyd"]');
      await fill('.openwhyd-import-form input', openwhydExample);
      await click('.openwhyd-import-form button');
      await waitFor('Openwhyd presents ordered metadata and source links', () => run(`document.querySelectorAll('.playlist-import-preview li').length === 4
        && document.querySelector('.playlist-origin-link')?.href === 'https://www.youtube.com/watch?v=AVUR778jnmE'`));
      assert.ok(!(await run(`document.querySelector('.playlist-import-body').innerHTML.includes('example.invalid')`)));
      await click('.playlist-import-head button');
      await waitFor('closing the Home importer restores focus', () => run(`!document.querySelector('.playlist-import') && document.activeElement?.matches('${homeImport}')`));
      await click('[data-home-tab="mine"]');
      await waitFor('My Music keeps its local playlist manager', () => run(`!!document.querySelector('.playlist-import-actions button')`));
      assert.equal(await run(`!!document.querySelector('.hub-bookmarks, .vk-track-shelf')`), false);
      const loadFile = (selector, name, body) => run(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        const data = new DataTransfer();
        data.items.add(new File([${JSON.stringify(body)}], ${JSON.stringify(name)}));
        input.files = data.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      const importer = '.playlist-import[open]';
      const openImport = async () => {
        await run(`document.querySelector('.playlist-import-actions button:first-child').focus()`);
        await click('.playlist-import-actions button:first-child');
        await waitFor('playlist source picker', () => run(`!!document.querySelector('.playlist-import [data-source="spotify"]')`));
      };
      const playlistFile = `${importer} input[type="file"]`;
      const beforeImport = await preferences();
      await openImport();
      await waitFor('all six provider logos decode locally', () => run(`(() => {
        const dialog = document.querySelector('.playlist-import');
        const providers = ['spotify', 'apple', 'deezer', 'soundcloud', 'tidal', 'yandex'];
        return providers.every(id => {
          const image = dialog.querySelector('[data-source="' + id + '"] .playlist-source-mark img');
          return image?.naturalWidth > 0 && !image.alt && (image.src.startsWith('data:image/') || image.src.startsWith('luma://app/'));
        });
      })()`));
      await click(`${importer} [data-source="spotify"]`);
      const jsonPlaylist = JSON.stringify({ playlists: [{ name: 'Семейный список', items: [
        { track: { trackName: 'Ты здесь', artistName: 'Ария', albumName: 'Живой звук', trackUri: 'spotify:track:input-only' } },
        { track: { trackName: 'Ты здесь', artistName: 'Ария', albumName: 'Живой звук' } },
        { track: { trackName: 'Нет записи', artistName: 'Тест' } },
      ] }] });
      await loadFile(playlistFile, 'Playlist1.json', 'not JSON');
      await waitFor('playlist import validates malformed files', () => run(`!!document.querySelector('.playlist-import [role="alert"]')`));
      await loadFile(playlistFile, 'Playlist1.json', jsonPlaylist);
      await waitFor('playlist import previews one match, one duplicate and one missing track', () => run(`!!document.querySelector('.playlist-match[data-status="match"]')
        && !!document.querySelector('.playlist-match[data-status="duplicate"]') && !!document.querySelector('.playlist-match[data-status="unmatched"]')`));
      await click(`${importer} .playlist-import-preview li:first-child summary`);
      await select(`${importer} .playlist-import-preview li:first-child select`, 'skip');
      await waitFor('skipping the first match frees the later duplicate', () => run(`document.querySelector('.playlist-import-preview li:first-child .playlist-match')?.dataset.status === 'skipped'
        && document.querySelector('.playlist-import-preview li:nth-child(2) .playlist-match')?.dataset.status === 'match'`));
      await click(`${importer} .playlist-import-preview li:nth-child(3) summary`);
      await fill(`${importer} .playlist-import-preview li:nth-child(3) input`, 'Без обложки.mp3');
      const otherId = await waitFor('row search offers an explicit alternative from the library', () => run(`document.querySelector('.playlist-import-preview li:nth-child(3) select option[value^="id:"]')?.value`));
      await select(`${importer} .playlist-import-preview li:nth-child(3) select`, otherId);
      await waitFor('choosing an alternative marks a reviewed row', () => run(`document.querySelector('.playlist-import-preview li:nth-child(3) .playlist-match')?.dataset.status === 'chosen'`));
      assert.deepEqual((await preferences()).playlists, beforeImport.playlists);
      await click(`${importer} .playlist-import-head button`);
      await waitFor('cancel restores focus without saving', () => run(`!document.querySelector('.playlist-import') && document.activeElement?.matches('.playlist-import-actions button:first-child')`));
      assert.deepEqual((await preferences()).playlists, beforeImport.playlists);
      await openImport();
      await click(`${importer} [data-source="unison"]`);
      const backupTrack = { trackJson: JSON.stringify({ source: 'VK', sourceId: 'not-a-stream', title: indexedLocal.title,
        artists: indexedLocal.artist, album: indexedLocal.album, durationMs: Math.round(indexedLocal.duration * 1000), coverUrl: 'https://private.invalid/art' }) };
      await loadFile(playlistFile, 'backup.json', JSON.stringify({ app: 'Unison', version: 1, settings: { secret: 'not-imported' },
        stats: [{ trackJson: 'no-history' }], playlists: [{ name: 'Список из Unison', tracks: [backupTrack] }], favorites: [backupTrack] }));
      await waitFor('Unison backup previews its playlist against the existing library', () => run(`document.querySelector('.playlist-import-summary')?.textContent.includes('1 из 1')
        && !!document.querySelector('.playlist-match[data-status="match"]')`));
      await select(`${importer} .playlist-import-body > label > select`, '1');
      await waitFor('Unison favorites can be selected as a separate playlist', () => run(`document.querySelector('.playlist-import-body > label > input')?.value === 'Любимое Unison'`));
      assert.doesNotMatch(await run(`document.querySelector('.playlist-import-body').textContent`), /private\.invalid|not-a-stream|no-history|not-imported/);
      await click(`${importer} .playlist-import-head button`);
      await waitFor('closing Unison preview saves nothing', () => run(`!document.querySelector('.playlist-import')`));
      assert.deepEqual((await preferences()).playlists, beforeImport.playlists);
      assert.deepEqual((await preferences()).queue, beforeImport.queue);
      await openImport();
      await click(`${importer} [data-source="vk"]`);
      await waitFor('VK import is described as a file import, not an account connection', () => run(`document.querySelector('.playlist-import-body')?.textContent.includes('не подключается к аккаунту VK')`));
      await loadFile(playlistFile, 'Список VK.csv', `Название,Исполнитель,Альбом,Ссылка\nТы здесь,Ария,Живой звук,https://vk.ru/audio123_456`);
      await waitFor('VK CSV matches the local recording without opening its URL', () => run(`!!document.querySelector('.playlist-match[data-status="match"]')`));
      assert.ok(!(await run(`document.querySelector('.playlist-import-body').textContent.includes('vk.ru/audio')`)));
      await click(`${importer} .playlist-import-head button`);
      await waitFor('closing VK preview saves nothing', () => run(`!document.querySelector('.playlist-import')`));
      assert.deepEqual((await preferences()).playlists, beforeImport.playlists);
      await openImport();
      await click(`${importer} [data-source="m3u"]`);
      await loadFile(playlistFile, 'Очередь из файла.m3u', '#EXTM3U\nD:\\PrivateFolder\\Без обложки.mp3\ntracks/Ты здесь.mp3\nhttps://example.invalid/missing.mp3');
      await waitFor('M3U matches local basenames, reports skipped remote entry', () => run(`document.querySelectorAll('.playlist-match[data-status="match"]').length === 2
        && document.querySelector('.playlist-import-body').textContent.includes('Пропущено строк без подходящих данных: 1')`));
      const importedIds = await run(`window.luma.getTracks().then(tracks => ['Без обложки.mp3', 'Ты здесь.mp3'].map(name => tracks.find(track => track.fileName === name)?.id))`);
      assert.ok(importedIds.every(Boolean));
      assert.ok(!(await run(`document.querySelector('.playlist-import-body').textContent.includes('PrivateFolder')`)));
      await click(`${importer} .playlist-import-foot .primary-button`);
      await waitFor('explicit save creates an ordered local playlist', async () => (await preferences()).playlists[0]?.title === 'Очередь из файла');
      assert.deepEqual((await preferences()).playlists[0].trackIds, importedIds);
      assert.deepEqual((await preferences()).queue, beforeImport.queue);
      assert.deepEqual(await oldVkData(), { bookmarks: legacyBookmarks, tracks: legacyTracks });
      assert.equal(catalogCalls.length, homeSearchStart + 1, 'playlist preview and save are local');
      assert.equal(audiusCalls.length, homeAudiusStart + 1);

      await click('.hub-tile[aria-label="Очередь из файла"]');
      const shareFolder = join(profile, 'Обмен плейлистами');
      await mkdir(shareFolder);
      const sharedPath = join(shareFolder, 'Очередь из файла.json');
      const saveShare = dialog.showSaveDialog;
      try {
        dialog.showSaveDialog = async () => ({ canceled: true, filePath: sharedPath });
        assert.equal(await run(`window.luma.saveSharedPlaylist({ format: 'luma-playlist', version: 1, title: 'Отмена', tracks: [{ title: 'Тест' }] })`), false);
        assert.deepEqual(await readdir(shareFolder), [], 'cancelling Save As leaves the directory unchanged');
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: sharedPath });
        await run(`void [...document.querySelectorAll('.topic-detail button')].find(item => item.textContent === 'Поделиться списком').click()`);
        await waitFor('playlist export writes the bounded metadata file', async () => {
          const data = await readFile(sharedPath, 'utf8').catch(() => '');
          return data && JSON.parse(data).tracks.length === 2;
        });
        assert.deepEqual(await readdir(shareFolder), ['Очередь из файла.json'], 'export uses the exact approved filename');
        assert.ok(!(await readFile(sharedPath, 'utf8')).match(/fileName|PrivateFolder|audioUrl|artworkUrl|luma:\/\//));
      } finally { dialog.showSaveDialog = saveShare; }
      await run(`void [...document.querySelectorAll('.topic-detail button')].find(item => item.textContent === 'Добавить в «Любимое Luma»').click()`);
      await waitFor('explicit seeding affects just Luma favorites', async () => (await preferences()).favorites.filter((id) => importedIds.includes(id)).length === importedIds.length);
      await fill('.hub-search input', 'Живой звук');
      await waitFor('one recording row prefers the local file and exposes the verified online alternative', () => run(`!!document.querySelector('.online-results > li[data-source="file"] .recording-sources')
        && document.querySelectorAll('.online-results > li').length === 1 && !document.querySelector('.hub-track')`));
      await click('.recording-sources summary');
      assert.equal(await run(`!!document.querySelector('.recording-sources[open] li[data-source="jamendo"] .online-credit')`), true);
      await settings('Воспроизведение');
      await click('[aria-label="Резервный локальный файл"]');
      await closeSettings();
      await waitFor('the grouped row returns after settings', () => run(`!!document.querySelector('.recording-sources summary')`));
      await click('.recording-sources summary');
      await click('.recording-sources li[data-source="jamendo"] button:first-child');
      await waitFor('a failed alternate stream falls back only to the verified local ID', async () => (await preferences()).queue.currentId === indexedLocal.id
        && await run(`!document.querySelector('audio').paused && !document.querySelector('.online-results > li[data-source="jamendo"]')`));
      await settings('Воспроизведение');
      await click('[aria-label="Резервный локальный файл"]');
      await closeSettings();
      const copyText = clipboard.writeText;
      const hostedWindows = process.platform === 'win32' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.env.GITHUB_ACTIONS === 'true';
      const probe = 'Luma clipboard capability check';
      let realClipboard = false;
      try {
        if (hostedWindows) {
          clipboard.writeText(probe);
          for (let i = 0; i < 6 && !realClipboard; i++) {
            realClipboard = clipboard.readText() === probe;
            if (!realClipboard) await delay(75);
          }
          if (!realClipboard) console.log('::warning title=Windows clipboard::No readable system clipboard in this desktop session. The IPC route is tested with a fixture; manual Windows check still required.');
        }
        let copied = '';
        if (!realClipboard) clipboard.writeText = (text) => { copied = text; };
        const expected = `https://openverse.org/audio/${jamendoRecording.id}/`;
        await run(`window.luma.musicLinks.copy(${JSON.stringify(expected)})`);
        if (realClipboard) {
          await waitFor('canonical link in the system clipboard', () => readMusicLink(clipboard.readText())?.url === expected);
          fixtureNotice('Windows clipboard', 'Copied a canonical music link and read it back through the system clipboard.');
        } else assert.equal(readMusicLink(copied)?.url, expected);
      } finally { clipboard.writeText = copyText; if (hostedWindows) clipboard.clear(); }

      await click('[data-home-tab="home"]');
      await waitFor('For You genres', () => run(`!!document.querySelector('[aria-label="Жанры"] .hub-tile[aria-label="Джаз"]')`));
      await click('[aria-label="Жанры"] .hub-tile[aria-label="Джаз"]');
      await run(`[...document.querySelectorAll('.topic-detail button')].find(item => item.textContent === 'Найти в Jamendo').click()`);
      await waitFor('Jamendo recordings show up with attribution', () => run(`document.querySelector('.topic-detail .online-credit')?.textContent.includes('Jamendo')`));
      const prior = (await preferences()).queue;
      await run(`[...document.querySelectorAll('.topic-detail button')].find(item => item.textContent === 'Сохранить как плейлист').click()`);
      await waitFor('playlist includes Jamendo reference without downloading a track', async () => (await preferences()).playlists[0]?.trackIds.includes(`ov-${jamendoRecording.id}`));
      assert.deepEqual((await preferences()).queue, prior);
      await click('[data-home-tab="mine"]');
      await click('[aria-label="Мои плейлисты"] .hub-tile[aria-label="Джаз"]');
      await run(`[...document.querySelectorAll('.topic-detail button')].find(item => item.textContent === 'Слушать плейлист').click()`);
      await waitFor('playing a playlist replaces the queue with its ordered contents', async () => {
        const prefs = await preferences();
        return prefs.queue.order.join() === prefs.playlists[0].trackIds.join();
      });

      // Radio and its station directory were removed from Luma, so the directory,
      // saved stations, Radio Browser search and the VK-to-station handoff are gone.
      assert.equal(await run(`!!document.querySelector('.radio-shelves, .radio-search, .radio-browser-form, [data-radio-view], .station-grid, .station-tile')`), false,
        'no station directory, search or saved-station surface is reachable');
      assert.equal(await run(`[...document.querySelectorAll('.sidebar-shortcuts .nav-item')].some(item => item.textContent.includes('Радио'))`), false);
    } finally { shell.openExternal = openExternal; }
    await go('Поиск');
    await waitFor('MP3 catalog query', () => run(`!!document.querySelector('main input[type="search"]')`));
    await fill('main input[type="search"]', 'fixture-mp3');
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
      assert.deepEqual(lyricQueries.map(({ track_name }) => track_name), [synced.title, plain.title]);
      assert.ok(lyricQueries.every(({ duration }) => Math.abs(Number(duration) - 32) < .1));
      assert.equal(lyricSearchQueries.length, 0, 'a verified signature is enough, even for plain lyrics');
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

    // Caching is explicit. Check that playback does not fetch the remote MP3 again.
    const beforeCache = streamCalls.filter((url) => url === synced.url).length;
    await click(`button[aria-label="В кэш: ${synced.title}"]`);
    await waitFor('one licensed MP3 cached', async () => (await run(`window.luma.streamCache.info()`)).count === 1);
    assert.equal(streamCalls.filter((url) => url === synced.url).length, beforeCache + 1);
    await waitFor('cached track is bookmarked', async () => (await preferences()).onlineTracks.some(({ id }) => id === `ov-${synced.id}`));
    await click(`button[aria-label="Слушать онлайн: ${synced.title}"]`);
    await waitFor('cached stream decodes through the app protocol', () => run(`(() => {
      const audio = document.querySelector('${onlineAudio}');
      return audio.currentSrc.startsWith('luma://app/media/cache/') && audio.currentTime > .12;
    })()`));
    assert.equal(streamCalls.filter((url) => url === synced.url).length, beforeCache + 1, 'cached playback makes no request for the source audio');
    await click('.player-bar .play-button');
    await waitFor('cached stream is paused', () => run(`document.querySelector('${onlineAudio}').paused`));
    await click('.player-bar .karaoke-toggle');
    await waitFor('LRCLIB search available for the cached online track', () => run(`!!document.querySelector('.karaoke-lyrics .karaoke-empty-actions button')`));
    await delay(375); // A manual lookup may bypass the lyrics export's cache, not the request spacing.
    missLyricSignature = true;
    await click('.karaoke-lyrics .karaoke-empty-actions button');
    await waitFor('karaoke finds word timings through the v1 search fallback', () => run(`document.querySelector('.karaoke-lyrics header').textContent.includes('Синхронизация по словам')`));
    assert.deepEqual(lyricSearchQueries, [{ track_name: synced.title, artist_name: 'Исполнитель' }]);
    await run(`document.querySelector('${onlineAudio}').currentTime = .35;`);
    await waitFor('the first word is highlighted', () => run(`document.querySelector('.karaoke-lyrics [data-current-word]')?.textContent.trim() === 'Первый'`));
    await run(`document.querySelector('${onlineAudio}').currentTime = .9;`);
    await waitFor('seeking highlights the second word', () => run(`document.querySelector('.karaoke-lyrics [data-current-word]')?.textContent === 'куплет'`));
    await click('.karaoke-lyrics .lyrics-scroll p:nth-child(2) .lyric-line-seek');
    await waitFor('the ordinary timed line still seeks the same online deck', () => run(`document.querySelector('.karaoke-lyrics [aria-current="true"]')?.textContent === 'Второй'
      && !document.querySelector('.karaoke-lyrics [data-current-word]') && Math.abs(document.querySelector('${onlineAudio}').currentTime - 1.25) < .05`));
    assert.deepEqual(plainLyricQueries, [], 'Lyrics.ovh was not contacted automatically');
    await click('.karaoke-settings-toggle');
    await select('.karaoke-settings .lyrics-version select', 'lyricsovh');
    await waitFor('Lyrics.ovh only displays plain text, even when the response has timecodes', () => run(`document.querySelector('.karaoke-lyrics .lyrics-plain')?.textContent === ${JSON.stringify(untimedLyrics)}
      && document.querySelector('.karaoke-lyrics header').textContent.includes('Без синхронизации')
      && !document.querySelector('.karaoke-lyrics .lyrics-timed, .karaoke-settings .karaoke-follow')`));
    assert.deepEqual(plainLyricQueries, [['', 'v1', 'Исполнитель', synced.title]]);
    await select('.karaoke-settings .lyrics-version select', 'lrclib');
    await waitFor('the original timed version is still available without another search', () => run(`!!document.querySelector('.karaoke-lyrics .lyrics-timed .lyric-line-seek')`));
    assert.equal(lyricSearchQueries.length, 1);
    await click('.karaoke-settings-toggle');
    await click('.immersive-collapse');
    await waitFor('leave the online karaoke stage', async () => !window.isFullScreen() && await run(`!document.querySelector('.immersive-player')`));

    await settings('Внешний вид');
    await click('[aria-label="Автоматическая смена темы"]');
    await waitFor('automatic theme controls visible', () => run(`!!document.querySelector('[aria-label="Темы"] .select-row')`));
    await select('[aria-label="Темы"] label.select-row:first-of-type select', 'violet');
    await select('[aria-label="Темы"] label.select-row:last-of-type select', 'violet');
    await waitFor('automatic mode applies the scheduled choice', () => run(`document.querySelector('.app-shell').dataset.theme === 'violet'`));
    const palettes = new Set();
    for (const theme of ['ocean', 'amber', 'pine', 'violet', 'macos']) {
      await click(`[data-theme-choice="${theme}"]`);
      await waitFor(`${theme} is active, not overridden by schedule`, async () => !(await preferences()).appearance.autoTheme
        && await run(`document.querySelector('.app-shell').dataset.theme === ${JSON.stringify(theme)}`));
      palettes.add(await run(`getComputedStyle(document.querySelector('.setting-card')).background`));
    }
    assert.equal(palettes.size, 5);
    assert.equal(await run(`document.querySelector('.app-shell').dataset.layout === 'glass' && !document.querySelector('.sidebar')
      && !!document.querySelector('.glass-navigation') && getComputedStyle(document.querySelector('.app-shell')).colorScheme === 'light'`), true);
    assert.equal(await run(`document.querySelectorAll('.glass-dock-icon').length`), 6);
    assert.equal(await run(`!!document.querySelector('.glass-navigation .radio-dock, .title-bar .radio-title')`), false,
      'the glass dock and the title bar carry no Radio entry');
    await click('.glass-sound');
    await waitFor('the glass Dock opens the same EQ', () => run(`!!document.querySelector('.equalizer-dialog[open] .eq-response-path')`));
    await click('.equalizer-content .dialog-footer .primary-button');
    await click('.settings-back');
    await click('.settings-page [aria-label="Интеграции"]');
    await waitFor('MacOS widget preview shows the same chrome and transport', () => run(`!!document.querySelector('.widget-sample[data-widget-layout="macos"] .transport-controls')
      && document.querySelectorAll('.widget-sample [data-widget-window]').length === 3`));
    const macWidgetBounds = window.getBounds();
    // Keep the element in the renderer: Electron cannot clone a DOM node into the test process.
    await run(`void (window.macWidgetAudio = document.querySelector('audio'))`);
    const macWidget = '.widget-mode > .desktop-widget[data-widget-layout="macos"]';
    await click('[aria-label="Виджеты рабочего стола"] button');
    await waitFor('MacOS mini-player keeps the original deck', async () => window.isAlwaysOnTop()
      && await run(`!!document.querySelector('${macWidget}') && document.querySelector('audio') === window.macWidgetAudio`));
    assert.deepEqual(await run(`[...document.querySelectorAll('${macWidget} [data-widget-window]')].map(button => button.dataset.widgetWindow)`), ['close', 'minimize', 'restore']);
    assert.ok(await run(`(() => {
      const widget = document.querySelector('${macWidget}');
      const art = widget.querySelector('.widget-track .artwork').getBoundingClientRect();
      const transport = widget.querySelector('.transport-controls').getBoundingClientRect();
      const seek = widget.querySelector('.timeline, .live-timeline').getBoundingClientRect();
      return art.right < transport.left && transport.bottom <= seek.top && seek.bottom <= widget.getBoundingClientRect().bottom;
    })()`), 'cover, transport and progress fit in the compact window');
    await click(`${macWidget} [data-widget-window="restore"]`);
    await waitFor('green light restores the MacOS window and existing renderer', async () => !window.isAlwaysOnTop()
      && await run(`!document.querySelector('${macWidget}') && document.querySelector('audio') === window.macWidgetAudio`));
    assert.deepEqual(window.getBounds(), macWidgetBounds);
    await click('.settings-back');
    await click('.settings-page [aria-label="Внешний вид"]');
    await select('label:has(select option[value="en"]) select', 'en');
    await waitFor('English switches Luma controls, not track metadata', () => run(`document.documentElement.lang === 'en'
      && !!document.querySelector('[aria-label="Home"]') && document.querySelector('.settings-page h1')?.textContent === 'Appearance'`));
    await closeSettings();
    await waitFor('settings returns to the same page with search input intact', () => run(`document.querySelector('main input[type="search"]')?.value === 'fixture-mp3'`));
    await click('.title-settings');
    await waitFor('settings index reopens after using the back arrow', () => run(`!!document.querySelector('.settings-reset') && !!document.querySelector('.settings-page [aria-label="Appearance"]')`));
    await closeSettings();
    assert.equal(await run(`!!document.querySelector('.glass-navigation .radio-dock, .radio-shelves')`), false,
      'English chrome has no Radio destination left to open');
    const reloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    window.webContents.reload();
    await reloaded;
    await waitFor('English and MacOS survive a renderer restart', () => run(`document.documentElement.lang === 'en' && !!document.querySelector('[aria-label="Home"]') && document.querySelector('.app-shell').dataset.theme === 'macos'`));
    assert.equal((await preferences()).appearance.effect, 'mix-flow', 'the selected scene restores after a renderer restart');
    assert.deepEqual((await preferences()).equalizer, editedEq, 'parametric filters restore after a renderer restart');
    assert.deepEqual((await preferences()).stationIds, [], 'no station is saved without the removed Radio surface');
    assert.ok((await preferences()).playlists.some(({ title }) => title === 'Джаз'), 'playlist restores after a renderer restart');
    assert.ok((await preferences()).playlists.some(({ title, trackIds }) => title === 'Очередь из файла' && trackIds.length === 2));
    assert.deepEqual((await preferences()).karaokeStyle, { size: 47, weight: 750, spacing: 20, align: 'center' });
    await go('Home');
    await click('[data-home-tab="mine"]');
    await waitFor('English My Music still has local playlists, without the old VK shelves', () => run(`!!document.querySelector('[aria-label="My playlists"]')
      && !document.querySelector('.hub-bookmarks, .vk-track-shelf')`));
    assert.deepEqual(await oldVkData(), { bookmarks: legacyBookmarks, tracks: legacyTracks });
    await click('.title-settings');
    await waitFor('English settings index', () => run(`!!document.querySelector('.settings-page [aria-label="Appearance"]')`));
    await click('.settings-page [aria-label="Appearance"]');
    await select('label:has(select option[value="en"]) select', 'ru');
    await waitFor('Russian interface restored', () => run(`document.documentElement.lang === 'ru'`));
    await closeSettings();

    offlineFixture = true;
    await run(`Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));`);
    await go('Медиатека');
    await click('.collection-tabs button:last-child');
    await click(`button.card-play[aria-label="Воспроизвести ${synced.title}"]`);
    const cacheUrl = await waitFor('cached bookmark decodes offline after reload', () => run(`(() => {
      const audio = document.querySelector('${onlineAudio}');
      return audio.currentTime > .12 && audio.currentSrc.startsWith('luma://app/media/cache/') && audio.currentSrc;
    })()`));
    const partial = await run(`(async () => {
      const reply = await fetch(${JSON.stringify(cacheUrl)}, { headers: { Range: 'bytes=16-31' } });
      return { status: reply.status, range: reply.headers.get('Content-Range'), bytes: Array.from(new Uint8Array(await reply.arrayBuffer())) };
    })()`);
    assert.deepEqual(partial, { status: 206, range: `bytes 16-31/${sample.length}`, bytes: [...sample.subarray(16, 32)] });
    await run(`document.querySelector('${onlineAudio}').currentTime = 12`);
    await waitFor('offline seeking succeeds', () => run(`document.querySelector('${onlineAudio}').currentTime > 12.05`));
    await click('.player-bar .play-button');
    assert.equal(streamCalls.filter((url) => url === synced.url).length, beforeCache + 1);
    assert.deepEqual(await run('window.luma.streamCache.clear()'), { count: 0, bytes: 0 });
    assert.ok((await preferences()).onlineTracks.some(({ id }) => id === `ov-${synced.id}`), 'cache cleanup keeps bookmarks');
    offlineFixture = false;
    await run(`delete navigator.onLine; window.dispatchEvent(new Event('online'));`);
    fixtureNotice('Cache and localization', 'Applied all five themes; MacOS, EN and parametric EQ survived reload. Verified offline MP3, byte ranges, seek and cache cleanup.');

    assert.deepEqual(phishCalls, [], 'other search terms did not contact the concert archive');
    await go('Поиск');
    await waitFor('catalog search field', () => run(`!!document.querySelector('main input[type="search"]')`));
    await fill('main input[type="search"]', 'Phish Llama');
    const phishResult = '.online-results > li[data-source="phishin"]';
    await waitFor('Phish.in reports only the complete concert recording with its actual date', () => run(`document.querySelectorAll('${phishResult}').length === 1
      && document.querySelector('${phishResult}').textContent.includes('2015-08-14')`));
    assert.deepEqual(phishCalls, ['/api/v2/search/Llama', '/api/v2/tracks']);
    assert.equal(await run(`document.querySelectorAll('${phishResult} .online-result-actions button').length`), 2, 'only play and queue');
    await click(`${phishResult} .online-result-actions button:first-child`);
    await waitFor('concert archive plays on the normal audio deck', () => run(`(() => {
      const audio = document.querySelector('${onlineAudio}');
      return audio.currentSrc === ${JSON.stringify(phishTrack.mp3_url)} && audio.currentTime > .12 && !audio.paused;
    })()`));
    assert.equal(await run(`document.querySelector('.player-bar .karaoke-toggle')?.disabled`), true);
    assert.doesNotMatch(JSON.stringify(await preferences()), /phish-30344|phish\.in/, 'no archive playback references in the saved profile');
    await click('.player-bar .play-button');
    fixtureNotice('Phish.in', 'Complete concert result decodes on the streaming deck and stays session-only.');


  } finally {
    session.defaultSession.protocol.unhandle('https');
    audiusMediaSession.protocol.unhandle('https');
    isolatedVk.protocol.unhandle('https');
    await legacyVk.clearStorageData();
    await isolatedVk.clearStorageData();
  }
  fixtureNotice('Catalogs and playlists', 'Merged Home, partial catalog results and explicit VK search, playlist import, radio tuning in both directions, and preservation of legacy profile data verified.');
  console.log('Desktop smoke: monitor fullscreen; both widget layouts restore bounds and reuse audio; Apple/MusicBrainz/WASM; metered MP3; LRCLIB word sync and lyrics export; isolated legacy reset.');
  if (liveServices) {
    const audioDb = await run(`window.luma.recognition.searchAudioDb({ title: 'Yellow', artist: 'Coldplay' })`);
    assert.ok(audioDb.some(({ title, album, artworkUrl }) => title === 'Yellow' && album === 'Parachutes' && artworkUrl));
    const image = await run(`(async () => {
      const art = new Image();
      art.src = ${JSON.stringify(audioDb[0].artworkUrl)};
      await Promise.race([art.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Artwork timed out')), 10_000))]);
      return art.naturalWidth;
    })()`);
    assert.ok(image > 0, 'live TheAudioDB thumbnail decodes');
    console.log('::notice title=Live TheAudioDB::The free v1 API returned the recording metadata and a readable thumbnail.');
    const plainOvh = await run(`window.luma.lyrics.lookupPlain({ title: 'Yellow', artist: 'Coldplay' })`);
    assert.ok(plainOvh?.plain?.length > 40 && !plainOvh.synced && !plainOvh.wordLines, 'live Lyrics.ovh plain text');
    console.log('::notice title=Live Lyrics.ovh::The API returned plain lyrics, not a timed recording match.');
    const suggestions = await run(`window.luma.recognition.search('Madam Broshkina', 'ru-RU')`);
    assert.ok(suggestions.some(({ title }) => title === 'Мадам Брошкина'), 'live Apple Music transliteration lookup');
    console.log('::notice title=Live Apple Music::Cyrillic recording candidates returned for a transliterated title.');
    try {
      const recordings = await run(`window.luma.recognition.searchMusicBrainz({ title: 'Крошка моя', artist: 'Руки Вверх', duration: 250 })`);
      assert.ok(recordings.some(({ title, artist }) => title === 'Крошка моя' && /^руки вверх/iu.test(artist)));
      console.log('::notice title=Live MusicBrainz::The official endpoint returned recording metadata, not audio.');
    } catch {
      console.log('::warning title=Live MusicBrainz::No matching metadata from this network. The controlled checks passed.');
    }
    try {
      const text = await run(`window.luma.lyrics.lookup({ title: 'Yellow', artist: 'Coldplay', duration: 267 })`);
      assert.ok(text?.synced || text?.plain);
      console.log('::notice title=Live LRCLIB::The official endpoint returned text for a matching recording.');
    } catch {
      console.log('::warning title=Live LRCLIB::The endpoint did not return matching lyrics from this network. The controlled checks passed.');
    }

  }
  const journalFile = join(profile, APP_PROFILE_DIR, 'logs', 'diagnostics.json');
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
  // The glass shell has no sidebar; diagnostics is available from Menu in either layout.
  await go('Меню');
  await click('.menu-page [aria-label="Диагностика"]');
  await waitFor('diagnostics page', () => run(`document.querySelector('h1')?.textContent === 'Диагностика' && !!document.querySelector('.journal-entry.level-error')`));
  const reportFile = join(profile, 'Отчёт Luma.log');
  const saveDialog = dialog.showSaveDialog;
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: reportFile });
    assert.equal(await run('window.luma.diagnostics.saveReport()'), true);
  } finally { dialog.showSaveDialog = saveDialog; }
  const report = await readFile(reportFile, 'utf8');
  assert.ok(report.startsWith(`${APP_NAME} ${version} ·`));
  assert.match(report, /Система: .*Electron/s);
  assert.match(report, /audio\.error/u);
  assert.doesNotMatch(report, /private-test/u);
  assert.deepEqual((await run('window.luma.diagnostics.clear()')).entries, []);
  assert.deepEqual(JSON.parse(await readFile(journalFile, 'utf8')), []);
  assert.deepEqual(warnings, []);
  console.log('Desktop smoke: native diagnostics recorded, persisted, exported, and cleared.');
  console.log('Desktop smoke: Cyrillic and embedded/fallback artwork published from luma:// with production CSP.');
  if (liveRadio) {
    await session.defaultSession.clearCache();
    const results = await probeRadio(run, session.defaultSession.webRequest, STATIONS);
    const failed = results.filter(({ ok }) => !ok).map(({ id }) => id);
    assert.deepEqual(failed, [], 'Live radio sources that failed on the runner (see station report)');
  }
  if (liveCatalog) {
    await session.defaultSession.clearCache();
    // The DOM, current audio deck and catalog search cache contain fixtures. A network cache clear
    // alone does not force a fresh provider query or a new media resource for the same track ID.
    const fresh = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    window.webContents.reload();
    await fresh;
    await waitFor('fresh player for live catalogs', () => run(`!!document.querySelector('.app-shell') && document.documentElement.lang === 'ru'`));
    const observers = [session.defaultSession.webRequest, audiusMediaSession.webRequest];
    const network = [];
    // Network diagnostics are limited to statuses, MIME, and origins.
    const upstream = { urls: ['https://archive.org/*', 'https://*.archive.org/*', 'https://phish.in/*', 'https://api.audius.co/*', 'https://creatornode.audius.co/*', `${new URL(storageStream).origin}/*`] };
    const label = (url) => {
      const { hostname, pathname } = new URL(url);
      return `${hostname}${pathname.endsWith('/stream') ? '(resolve)' : pathname.startsWith('/blob/') || pathname.includes('/cidstream/') || hostname.endsWith('.r2.cloudflarestorage.com') ? '(media)' : '(query)'}`;
    };
    for (const webRequest of observers) {
      webRequest.onResponseStarted(upstream, ({ url, statusCode, responseHeaders }) => {
        const mime = Object.entries(responseHeaders ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0]?.split(';')[0];
        network.push(`${label(url)} ${statusCode}${mime ? ` ${mime}` : ''}`);
      });
      webRequest.onBeforeRedirect(upstream, ({ url, statusCode, redirectURL }) => network.push(`${label(url)} ${statusCode} -> ${new URL(redirectURL).origin}`));
      webRequest.onErrorOccurred(upstream, ({ url, error }) => network.push(`${label(url)} ${error}`));
    }
    await run(`document.addEventListener('securitypolicyviolation', event => {
      const url = URL.parse(event.blockedURI);
      if (url && event.violatedDirective === 'media-src') (window.catalogPolicyBlocks ??= []).push(url.origin);
    });`);
    const sources = [
      ['phishin', 'phishin', 'Phish Llama', 'phish.in'],
      ['audius', 'audius', 'jazz', 'app'],
      ['jamendo', 'openverse', 'jazz', 'storage.jamendo.com'], ['wikimedia_audio', 'openverse', 'Bach chaconne', 'upload.wikimedia.org'],
      ['netlabels', 'netlabels', 'Anatoly Nikulin', 'archive.org'], ['netlabels', 'southern_city', 'Газ', 'archive.org'],
    ];
    const report = [];
    try {
      for (const [source, target, query, host] of sources) {
        let ok = false, result;
        try {
          await go('Главная');
          await go('Поиск');
          await waitFor('live search field', () => run(`!!document.querySelector('main input[type="search"]')`));
          await fill('main input[type="search"]', query);
          const options = await waitFor(`${target}/${source} live results`, async () => {
            const outcome = await run(`(() => {
              const status = document.querySelector('[data-catalog="${target}"]');
              if (status?.dataset.state === 'error') return { error: status.textContent };
              if (!['done', 'partial'].includes(status?.dataset.state)) return null;
              return [...document.querySelectorAll('.online-results li[data-source="${source}"] .online-result-actions button:first-child')]
                .map((button) => ({ aria: button.getAttribute('aria-label'), title: button.closest('li').querySelector('.online-result-copy strong').textContent }));
            })()`);
            if (outcome?.error) throw new Error(outcome.error);
            return outcome;
          });
          const failures = [];
          for (const [index, { aria, title }] of options.slice(0, 3).entries()) {
            if (target === 'phishin') {
              await run(`document.querySelectorAll('.online-results > li[data-source="phishin"] .online-result-actions button:first-child')[${index}].click()`);
            } else await click(`.online-result-actions button[aria-label=${JSON.stringify(aria)}]`);
            const decoded = await waitFor(`${target}/${source} audio attempt`, () => run(`(() => {
              const media = document.querySelector('${onlineAudio}');
              const url = URL.parse(media.currentSrc || media.getAttribute('src') || '');
              if (!url || !(url.hostname === '${host}' || url.hostname.endsWith('.${host}'))
                || navigator.mediaSession.metadata?.title !== ${JSON.stringify(title)}) return null;
              if ('${source}' === 'audius' && !(url.protocol === 'luma:' && url.pathname.startsWith('/media/audius/'))) return null;
              if (media.error) return { code: media.error.code };
              if (media.currentTime > .15 && !media.paused && media.readyState >= 2) return { format: url.searchParams.get('format') ?? 'original' };
              return null;
            })()`)).catch(() => ({ code: 'timeout' }));
            if (decoded.format === (source === 'jamendo' ? 'mp31' : 'original')) {
              if (target === 'phishin') {
                await run(`document.querySelector('${onlineAudio}').currentTime = 75;`);
                await waitFor('Phish.in seeks beyond preview length', () => run(`(() => {
                  const media = document.querySelector('${onlineAudio}');
                  return media.duration > 80 && !media.seeking && media.currentTime > 75.15 && !media.paused;
                })()`));
                assert.ok(network.some((entry) => /^phish\.in\(media\) (?:200|206) audio\//.test(entry)), 'real archive audio response, not a fixture');
              }
              if (target === 'audius') {
                const seek = await run(`(async () => {
                  const url = document.querySelector('${onlineAudio}').currentSrc;
                  const response = await fetch(url, { headers: { Range: 'bytes=1024-1031' }, signal: AbortSignal.timeout(12_000) });
                  if (response.status !== 206 || !/^bytes 1024-1031\\/\\d+$/.test(response.headers.get('Content-Range') ?? '')) {
                    await response.body?.cancel(); return response.status;
                  }
                  return (await response.arrayBuffer()).byteLength === 8 ? '206' : 'invalid byte count';
                })()`).catch(() => 'request failed');
                if (seek !== '206') { failures.push(`${title}: range ${seek}`); continue; }
              }
              result = `decoded ${title} (${decoded.format}${target === 'audius' ? ', range 206' : target === 'phishin' ? ', seek past 75s' : ''})`;
              ok = true;
              break;
            }
            failures.push(`${title}: ${decoded.code ?? decoded.format}`);
          }
          if (!ok) throw new Error(failures.join(', ') || 'no matching results');
        } catch (error) { result = error instanceof Error ? error.message : String(error); }
        report.push({ source: target === 'openverse' ? source : target, ok, result });
      }
    } finally {
      for (const webRequest of observers) {
        webRequest.onErrorOccurred(null);
        webRequest.onBeforeRedirect(null);
        webRequest.onResponseStarted(null);
      }
    }
    const detail = report.map(({ source, result }) => `${source}: ${result}`).join(' | ');
    const policy = [...new Set(await run(`window.catalogPolicyBlocks ?? []`))];
    const trace = [...new Set(network)].slice(0, 24).join(' | ');
    console.log(`::notice title=Live catalogs::${detail.replace(/%/g, '%25').replace(/\r?\n/g, ' ')}`);
    assert.ok(report.every(({ ok }) => ok), `Live catalog playback: ${detail}. HTTP: ${trace}. Policy blocks: ${policy.join(', ') || 'none'}.`);
  }
}

void smoke().then(() => finish(0), fail);
process.on('exit', () => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still have cache files open. */ } });
function fail(error) {
  console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = (error instanceof Error ? error.message : String(error)).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    const line = error?.stack?.match(/desktop-smoke\.mjs:(\d+):\d+/)?.[1];
    console.log(`::error file=tests/desktop-smoke.mjs${line ? `,line=${line}` : ''},title=Electron smoke::${message}`);
  }
  finish(1);
}
function finish(code) {
  clearTimeout(timer);
  app.exit(code);
}
