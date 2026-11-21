// Run with Electron after `npm run build`. Uses a temporary profile, not the user's library.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, screen, session, shell } from 'electron';
import { APP_ORIGIN, DesktopLibrary } from '../dist-electron/electron/library.js';
import { RADIO_DIRECTORY, STATIONS, stationTracks } from '../dist-electron/src/shared/radio.js';
import { LEGACY_VK_SESSION, VK_MUSIC_URL } from '../dist-electron/src/shared/vk.js';
import { acoustic, madam, remix } from './fixtures/recognition.mjs';
import { parseByteRange } from '../dist-electron/electron/protocol.js';
import { commonsRecording, jamendoRecording } from './fixtures/openverse.mjs';
import { audiusRecording, creatorStream, storageStream } from './fixtures/public-catalogs.mjs';
import { parseFile } from 'music-metadata';
import { taggedMp3 } from './fixtures/mp3.mjs';
import { probeRadio } from './live-radio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
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
const timer = setTimeout(() => fail(new Error('Desktop smoke test did not finish')), liveRadio ? 410_000 : liveCatalog ? 400_000 : liveServices ? 260_000 : 170_000);
// The main process must register its custom protocol before the ready event.
const sample = await readFile(join(root, 'public/demo/afterimage.mp3'));
const cover = await readFile(join(root, 'public/artwork/afterimage.webp'));
const tagged = join(profile, 'Ты здесь.mp3');
const broken = join(profile, 'Без обложки.mp3');
await writeFile(join(profile, 'Ты здесь.lrc'), '[00:00.00] Локальная строка\n[00:01.25] Следующая строка');
await writeFile(join(profile, 'Ты здесь.lyrics.txt'), 'Простой текст локальной записи');
await writeFile(tagged, taggedMp3(sample, {
  title: 'Òû çäåñü', artist: 'Àðèÿ', album: 'Æèâîé çâóê', picture: { mime: 'image/webp', data: cover },
}));
await writeFile(broken, taggedMp3(sample, {
  title: "Ty Zdes'", picture: { mime: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
}));
try {
  const library = await DesktopLibrary.open(join(profile, 'Luma Player'));
  const { added } = await library.importPaths([tagged, broken]);
  assert.equal(added.length, 2);
  // An upgraded library has no format fields. Find the fixture by ID: realpath can expand Windows short names.
  const libraryFile = join(profile, 'Luma Player', 'library.json');
  const index = JSON.parse(await readFile(libraryFile, 'utf8'));
  const legacyEntry = index.find((entry) => entry.id === added[1]);
  assert.ok(legacyEntry?.format);
  delete legacyEntry.format;
  await writeFile(libraryFile, JSON.stringify(index));
} catch (error) { fail(error); }
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
    console.log(`::notice title=WASAPI Float probe::Driver result for stereo 48 kHz Float32 on the runner: ${mode}.`);
  }
  assert.equal(await run('window.luma.lastfm.status().then(({ enabled }) => enabled)'), false);
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
  await run(`(() => { document.querySelector('audio').currentTime = 1.5; })()`);
  await waitFor('seek updates the highlighted line', () => run(`document.querySelector('.lyrics-scroll [aria-current="true"]')?.textContent === 'Следующая строка'`));
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
  assert.equal(window.getTitle(), "Ty Zdes' — Luma Player");
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
  console.log(`::notice title=Native fullscreen::Electron fullscreen reached ${display.bounds.width}×${display.bounds.height} monitor bounds; button, Esc, and host exit passed.`);
  await click('.scene-open');
  await waitFor('scene dialog reopens', () => run(`!!document.querySelector('.scene-dialog[open]')`));
  for (const [label, effect] of [['Спектр', 'spectrum'], ['Столбцы', 'columns'], ['Ноты', 'notes']]) {
    await click(`.scene-choice[aria-label="${label}"]`);
    await waitFor(`${label} previews on a bounded canvas`, () => run(`(() => {
      const backdrop = document.querySelector('.scene-dialog-preview .scene-${effect}');
      const canvas = backdrop?.querySelector('canvas');
      return canvas && canvas.width * canvas.height > 0 && canvas.width * canvas.height <= 134400
        && (${JSON.stringify(effect)} === 'notes' || !backdrop.classList.contains('scene-moving'));
    })()`));
  }
  if (!await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) {
    await click('.scene-choice[aria-label="Волны"]');
    const clip = await waitFor('silent sea loop decodes from the app protocol', () => run(`(() => {
      const clip = document.querySelector('.scene-dialog-preview video');
      return clip?.currentTime > .04 ? [clip.videoWidth, clip.videoHeight, clip.muted, clip.loop] : null;
    })()`));
    assert.deepEqual(clip, [960, 412, true, true]);
    await click('.scene-choice[aria-label="Фейерверк"]');
    await waitFor('fireworks use one bounded canvas', () => run(`(() => {
      const canvas = document.querySelector('.scene-dialog-preview canvas');
      return canvas && canvas.width * canvas.height > 0 && canvas.width * canvas.height <= 368640;
    })()`));
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
    && await run(`!!document.querySelector('.scene-dialog-preview .scene-mix-flow .mix-flow-light') && !!document.querySelector('.immersive-stage > .scene-mix-flow')`));
  await click('.scene-dialog .primary-button');
  await click('.immersive-karaoke-toggle');
  await waitFor('karaoke uses the selected scene with only the foreground art', () => run(`!!document.querySelector('.karaoke-stage > .scene-mix-flow')
    && !!document.querySelector('.karaoke-track .artwork') && !document.querySelector('.karaoke-stage > .immersive-backdrop')`));
  await click('.immersive-collapse');
  await waitFor('fullscreen exits after switching modes', async () => !window.isFullScreen() && await run(`!document.querySelector('.immersive-player')`));
  assert.ok(await run(`(() => {
    const visual = (selector) => getComputedStyle(document.querySelector(selector + ' .mix-flow-light'));
    const player = visual('.hero'), banner = visual('.hub-hero');
    return player.backgroundImage !== 'none' && player.backgroundImage !== banner.backgroundImage
      && player.animationName === banner.animationName && !!document.querySelector('.hero .scene-mix-flow[data-cover-tone]')
      && player.getPropertyValue('--scene-tone').trim() === getComputedStyle(document.querySelector('.hero')).getPropertyValue('--hero-tone').trim();
  })()`), 'the mix effect shares animation with the banner, but uses the current cover tone');

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
  await run(`document.querySelector('.title-settings').click()`);
  await waitFor('settings page', () => run(`!!document.querySelector('.settings-page [aria-label="Обновления приложения"]')`));
  await run(`document.querySelector('.settings-page [aria-label="Обновления приложения"]').click()`);
  await waitFor('settings show package version', () => run(`document.querySelector('.settings-page .setting-card header')?.textContent.includes(${JSON.stringify(`Установлена версия ${version}.`)})`));
  await go('Меню');
  const vkEntry = '.sidebar-shortcuts [aria-label="Эквалайзер из боковой панели"] + a[aria-label="Зайти в VK"]';
  const externalOpens = [];
  const systemBrowser = shell.openExternal;
  shell.openExternal = async (url) => {
    externalOpens.push(url);
    if (externalOpens.length === 1) throw new Error('fixture browser unavailable');
  };
  try {
    await waitFor('VK sign-in in sidebar shortcuts directly below equalizer', () => run(`!!document.querySelector('${vkEntry}')`));
    assert.deepEqual(await run(`(() => {
      const link = document.querySelector('${vkEntry}');
      return [link.href, link.target, link.rel, link.closest('section').getAttribute('aria-label')];
    })()`), [VK_MUSIC_URL, '_blank', 'noopener noreferrer', 'Быстрый доступ']);
    assert.equal(await run(`!!document.querySelector('.menu-page [aria-label="Зайти в VK"]')`), false);
    assert.match(await run(`document.querySelector('${vkEntry}').getAttribute('aria-description')`), /в браузере, без синхронизации/);
    assert.deepEqual(externalOpens, [], 'rendering the row does not make a VK request');
    const appUrl = window.webContents.getURL();
    await click(vkEntry);
    await waitFor('browser launch failure is explained next to the link', () => run(`document.querySelector('${vkEntry} + [role="status"]').textContent.includes('Не удалось открыть VK')`));
    await click(vkEntry);
    await waitFor('VK handed to the browser on retry', () => externalOpens.length === 2);
    assert.deepEqual(externalOpens, [VK_MUSIC_URL, VK_MUSIC_URL]);
    assert.equal(window.webContents.getURL(), appUrl);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    assert.equal(await run(`window.testAudio === document.querySelector('audio') && window.testAudio.paused`), true);
    assert.ok(await run(`window.luma.diagnostics.snapshot().then(({entries}) => ['vk.browserFailed', 'vk.browserOpened'].every(name => entries.some(({event}) => event === name)))`));
  } finally { shell.openExternal = systemBrowser; }
  console.log('::notice title=VK handoff::The link opens only the official site in the system browser on request; failure and retry pass without a new Electron window.');
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
    console.log('::notice title=Widget shortcut::Focused Ctrl+Shift+R opens and restores Luma without reload; Esc restores it too.');
  } finally { window.webContents.off('did-start-navigation', watchReload); }
  assert.equal(await run(`!!document.querySelector('.settings-return')`), false);

  // Use the real Last.fm UI, IPC and isolated main-process client, never a real account.
  const fakeToken = 'token-'.repeat(5), fakeSession = 'session-'.repeat(4);
  const authPages = [];
  let apiStatus = 11;
  const originalOpen = shell.openExternal;
  const cacheSession = session.defaultSession;
  shell.openExternal = async (url) => { authPages.push(url); };
  cacheSession.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
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
  } finally {
    cacheSession.protocol.unhandle('https');
    shell.openExternal = originalOpen;
  }
  console.log('::notice title=Widget and Last.fm::Widget shortcut and restore; key setup UI, API error 11 and retry with a fixture verified.');
  await click('[aria-label="Сохранять текст с новым MP3"]');
  await waitFor('opt-in to MP3 lyric tagging', async () => (await preferences()).exportLyrics);
  await click('.settings-back');
  await click('.settings-page [aria-label="Воспроизведение"]');
  await waitFor('crossfade preference', () => run(`!!document.querySelector('[aria-label="Воспроизведение в Luma"] select')`));
  await select('[aria-label="Воспроизведение в Luma"] select', '4');
  await waitFor('crossfade preference saved', async () => (await preferences()).playback.crossfade === 4);


  const catalogCalls = [];
  const archiveCalls = [];
  const extraCatalogCalls = [];
  const archiveRelease = { metadata: { identifier: 'SCL108', mediatype: 'audio', collection: ['netlabels', 'southern-citys-lab'],
    licenseurl: 'https://creativecommons.org/licenses/by/4.0/', creator: 'Fixture label', title: 'Jazz release' },
    files: [{ name: 'Jazz archive.mp3', source: 'original', format: 'VBR MP3', title: 'Jazz archive', length: '32' }] };
  const streamCalls = [];
  const radioCalls = [];
  const recordStation = STATIONS.find(({ id }) => id === 'radio-record-record');
  const piStation = STATIONS.find(({ id }) => id === 'radio-ru-pi-fm');
  const radioFixtureUrls = new Set([recordStation.stream, piStation.stream]);
  const recordTrack = stationTracks.find(({ id }) => id === recordStation.id);
  const webStation = RADIO_DIRECTORY.find(({ id }) => id === 'radio-ru-mir-far-east');
  const stationSection = '[aria-labelledby="radio-stations"]';
  const savedStations = '[aria-labelledby="radio-added"]';
  const recordTile = `[data-station=${JSON.stringify(recordStation.id)}]`;
  const webTile = `[data-station=${JSON.stringify(webStation.id)}]`;
  const recordPlay = `${recordTile} .station-play`;
  const titleQueries = [];
  const fingerprints = [];
  const legacyVk = session.fromPartition(LEGACY_VK_SESSION);
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
  const economyUrl = jamendoRecording.url.replace('format=mp32', 'format=mp31');

  let offlineFixture = false;
  session.defaultSession.protocol.handle('https', async (request) => {
    if (offlineFixture) return new Response(null, { status: 503 });
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
      const rows = url.searchParams.get('q') === 'fixture-mp3' ? [synced, plain]
        : url.searchParams.get('source') === 'jamendo' ? [jamendoRecording] : [jamendoRecording, commonsRecording];
      return Response.json(url.pathname === '/v1/audio/' ? { results: rows } : [...rows, synced, plain].find((item) => url.pathname.endsWith(`/${item.id}/`)), { headers: fixtureHeaders });
    }
    if (url.origin === 'https://archive.org' && url.pathname === '/advancedsearch.php') {
      const query = url.searchParams.get('q');
      archiveCalls.push(query);
      // Give the two IPC searches time to overlap, and exercise a partial failure on Home.
      await delay(250);
      if (query.startsWith('collection:southern-citys-lab ') && query.includes('"Ты"')) return new Response(null, { status: 503 });
      return Response.json({ response: { docs: query.includes('"jazz"') ? [{ identifier: 'SCL108' }] : [] } });
    }
    if (url.origin === 'https://api.audius.co' && url.pathname === '/v1/tracks/search') {
      extraCatalogCalls.push(url);
      return Response.json({ data: url.searchParams.get('query') === 'jazz' ? [audiusRecording, { ...audiusRecording, id: '1233T', title: 'Restricted', is_stream_gated: true }] : [] });
    }
    if (url.origin === 'https://api.audius.co' && url.pathname === '/v1/tracks/DX0Xb/stream' && url.searchParams.get('no_redirect') === 'true') {
      return Response.json({ data: creatorStream });
    }
    if (url.href === creatorStream) return Response.redirect(storageStream, 307);
    if (url.href === 'https://archive.org/metadata/SCL108') return Response.json(archiveRelease);
    if (STATIONS.some(({ logo }) => logo === url.href)) return new Response(cover, { headers: { ...fixtureHeaders, 'Content-Type': 'image/webp' } });
    const radioFixture = radioFixtureUrls.has(url.href);
    if (radioFixture || [jamendoRecording.url, economyUrl, commonsRecording.url, synced.url, plain.url, storageStream].includes(url.href)) {
      // Exercise the production CSP and a real decoder without requiring network or a specific codec CDN.
      (radioFixture ? radioCalls : streamCalls).push(url.href);
      const range = request.headers.get('Range');
      const bytes = range && parseByteRange(range, sample.length);
      const body = bytes ? sample.subarray(bytes.start, bytes.end + 1) : sample;
      return new Response(body, { status: bytes ? 206 : 200, headers: {
        'Content-Type': 'audio/mpeg', 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes',
        ...(bytes && { 'Content-Range': `bytes ${bytes.start}-${bytes.end}/${sample.length}` }),
      } });
    }
    return new Response(null, { status: 404 });
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
      console.log(`::notice title=Float output in playback::${status}`);
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
    assert.deepEqual(extraCatalogCalls.map((url) => [url.origin, url.searchParams.get('query')]), [['https://api.audius.co', 'jazz']]);
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
    await waitFor('Audius stream decodes through the private protocol', () => streamReady(ephemeralUrl));
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
    await click(playOnline);
    await waitFor('back on Jamendo', () => streamReady(economyUrl));
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
      await go('Главная');
      await waitFor('merged Home keeps discovery and now-playing together', () => run(`!!document.querySelector('.home-page .hub-hero') && !!document.querySelector('.home-page .home-now')`));
      assert.equal(await run(`!!document.querySelector('nav [aria-label="Музыка"]')`), false);
      assert.equal(await run(`!!document.querySelector('iframe') || 'vk' in window.luma || 'openVkLink' in window.luma`), false);
      assert.ok(window.contentView.children.every((view) => view.webContents?.session !== legacyVk));
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      assert.equal(await run(`document.querySelector('${onlineAudio}').paused`), false, 'entering Home leaves online playback alone');
      assert.equal(opened.length, 0);
      await fill('.hub-search input', 'Ты здесь');
      await waitFor('native search finds a local track', () => run(`document.querySelector('.hub-track strong')?.textContent === 'Ты здесь'`));
      assert.equal(await run(`!!document.querySelector('.vk-track-matches')`), false);
      await waitFor('Home finds local and online matches despite a failed catalog', () => run(`document.querySelectorAll('.catalog-sources [data-state="done"]').length === 4
        && document.querySelector('[data-catalog="southern_city"]').dataset.state === 'error'
        && document.querySelectorAll('.online-results li').length === 2`));
      assert.equal(catalogCalls.length, 2);
      assert.equal(catalogCalls[1].searchParams.get('q'), 'Ты здесь');
      assert.deepEqual(extraCatalogCalls.slice(2).map((url) => url.searchParams.get('s') ?? url.searchParams.get('query')), ['Ты здесь', 'Ты здесь']);
      assert.equal(opened.length, 0, 'no browser tab from automatic searches');
      assert.equal(await run(`!!document.querySelector('.music-sites, .music-site-grid')`), false);
      for (const url of ['https://example.invalid/', VK_MUSIC_URL, 'https://vk.ru/audio?q=jazz', 'https://my.mail.ru/music', 'https://music.yandex.ru/']) {
        assert.equal(await run(`window.luma.openOnlineLink(${JSON.stringify(url)}).then(() => false, () => true)`), true);
      }
      assert.deepEqual(await run(`[...document.querySelectorAll('.hub-tabs button')].map(button => button.textContent)`),
        ['Для вас', 'Моя музыка', 'Радио', 'Обновления']);
      await click('[data-home-tab="home"]');
      await waitFor('genres, moods and former Browse collections are together, in order', () => run(`(() => {
        const headings = [...document.querySelectorAll('.home-page .hub-shelf-head h2')].map(h => h.textContent);
        const expected = ['Жанры', 'Настроения и занятия', 'Подборки Luma'];
        return expected.every((title, index) => headings.filter(h => h === title).length === 1 &&
          (index === 0 || headings.indexOf(title) > headings.indexOf(expected[index - 1]))) && !headings.includes('Жанры и настроения');
      })()`));
      const homeImport = '.hub-top-actions [data-playlist-import]';
      assert.deepEqual(await run(`[...document.querySelectorAll('.hub-top-actions button')].map(button => [button.textContent.trim(), button.getAttribute('aria-label')])`),
        [['', 'Добавить музыку'], ['', 'Импорт из сервисов'], ['', 'Миксы Luma']]);
      await run(`document.querySelector('${homeImport}').focus()`);
      await click(homeImport);
      await waitFor('Home shortcut opens the service picker', () => run(`!!document.querySelector('.playlist-import[open] [data-source="apple"]')`));
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
      await waitFor('all seven provider logos decode locally', () => run(`(() => {
        const dialog = document.querySelector('.playlist-import');
        const providers = ['spotify', 'apple', 'deezer', 'youtube', 'soundcloud', 'tidal', 'yandex'];
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
      assert.deepEqual((await preferences()).playlists, beforeImport.playlists);
      await click(`${importer} .playlist-import-head button`);
      await waitFor('cancel restores focus without saving', () => run(`!document.querySelector('.playlist-import') && document.activeElement?.matches('.playlist-import-actions button:first-child')`));
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
      assert.equal(catalogCalls.length, 2, 'playlist preview and save are local');
      assert.equal(extraCatalogCalls.length, 4);
      await run('window.luma.clearLegacyVkSession()');
      assert.equal((await legacyVk.cookies.get({ name: 'lumaFixture' })).length, 0);
      assert.equal((await session.defaultSession.cookies.get({ name: 'lumaFixture' })).length, 1);
      assert.deepEqual(await oldVkData(), { bookmarks: legacyBookmarks, tracks: legacyTracks });

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

      await click('[data-home-tab="radio"]');
      await waitFor('radio directory renders in exact order with Record artwork', () => run(`document.querySelectorAll('${stationSection} > .station-grid > .station-tile').length === ${RADIO_DIRECTORY.length}
        && document.querySelector('${stationSection} ${recordTile} .station-logo img')?.naturalWidth > 0`));
      assert.deepEqual(await run(`[...document.querySelectorAll('${stationSection} > .station-grid > .station-tile')].map(tile => tile.dataset.station)`), RADIO_DIRECTORY.map(({ id }) => id));
      assert.equal(radioCalls.length, 0);
      await fill('.radio-search input', 'МИР Дальний');
      await waitFor('radio search finds the exact regional feed as a browser listing', () => run(`document.querySelectorAll('${stationSection} .station-tile').length === 1
        && document.querySelector('${stationSection} ${webTile}[data-mode="browser"]:not(:has(.station-play))') !== null`));
      await click(`${stationSection} ${webTile} .station-link`);
      await waitFor('unresolved radio is handed to the exact external station page', () => opened.at(-1) === webStation.page);
      assert.equal(radioCalls.length, 0);
      await click('.radio-search button');
      await click(`${stationSection} ${recordTile} .station-add`);
      await waitFor('Record is saved without adding a second tile', () => run(`document.querySelector('${stationSection} ${recordTile} .station-add')?.getAttribute('aria-pressed') === 'true'`));
      assert.equal(await run(`document.querySelectorAll('.radio-shelves ${recordTile}').length`), 1);
      await click('[data-radio-view="saved"]');
      await waitFor('Saved shows only the bookmarked station', () => run(`document.querySelectorAll('.radio-shelves .station-tile').length === 1
        && !!document.querySelector('${savedStations} ${recordTile}')`));
      assert.equal(radioCalls.length, 0);
      assert.deepEqual((await preferences()).stationIds, [recordStation.id]);
      const beforeRadio = await preferences();
      const beforeRadioLyrics = lyricQueries.length;
      await click(`${savedStations} ${recordPlay}`);
      await waitFor('station decodes audio bytes and switches to live controls', () => run(`document.querySelector('${onlineAudio}').currentTime > .12
        && !!document.querySelector('.player-bar .live-timeline') && !document.querySelector('.player-bar .timeline')`));
      assert.ok(radioCalls.includes(recordStation.stream));
      assert.equal(await run(`navigator.mediaSession.metadata.title`), recordStation.name);
      const nextStation = '.player-bar [aria-label="Следующая станция"]';
      const previousStation = '.player-bar [aria-label="Предыдущая станция"]';
      const waitForStation = ({ name, stream }) => waitFor(`playing ${name}`, () => run(`(() => {
        const audio = document.querySelector('${onlineAudio}');
        return audio.src === ${JSON.stringify(stream)} && audio.currentTime > .12 && !audio.paused
          && !document.querySelector('.player-bar .timeline') && navigator.mediaSession.metadata?.title === ${JSON.stringify(name)};
      })()`));
      assert.equal(await run(`document.querySelectorAll('.player-bar .mode-button:disabled').length`), 2);
      assert.equal(await run(`document.querySelector('${nextStation}').disabled || document.querySelector('${previousStation}').disabled`), false);
      await click(nextStation);
      await waitForStation(piStation);
      assert.ok(radioCalls.includes(piStation.stream));
      await click(previousStation);
      await waitForStation(recordStation);
      await run(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));`);
      await waitForStation(piStation);
      await run(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));`);
      await waitForStation(recordStation);
      assert.deepEqual((await preferences()).queue.order, [...beforeRadio.queue.order, recordStation.id], 'tuning does not accumulate stations or reorder songs');
      assert.deepEqual((await preferences()).stationIds, [recordStation.id]);
      assert.deepEqual((await preferences()).onlineTracks, beforeRadio.onlineTracks);
      assert.ok(!(await preferences()).recent.includes(recordStation.id));
      assert.equal(lyricQueries.length, beforeRadioLyrics);
      assert.equal(await run(`window.luma.streamCache.save(${JSON.stringify(recordTrack)}).catch(() => false)`), false);
      assert.equal(await run(`window.luma.exportMp3(${JSON.stringify(recordTrack)}, true).then(({ saved }) => saved, () => false)`), false);
      await click('[data-home-tab="home"]');
      await waitFor('Home omits lyrics and disables karaoke for a station', () => run(`document.querySelector('.hero h2')?.textContent === ${JSON.stringify(recordStation.name)}
        && document.querySelector('.hero-karaoke')?.disabled && !document.querySelector('.home-page .lyrics-card')`));
      await click('.player-bar .play-button');
      await waitFor('stopping radio unloads the network source', () => run(`document.querySelector('${onlineAudio}').paused && !document.querySelector('${onlineAudio}').hasAttribute('src')`));
      await click('[data-home-tab="radio"]');
      await run(`Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline'));`);
      await click('[data-radio-view="saved"]');
      await waitFor('offline playback and tuning are unavailable without hiding saved stations', () => run(`document.querySelector('${savedStations} ${recordPlay}')?.disabled
        && document.querySelector('${nextStation}')?.disabled && document.querySelector('${previousStation}')?.disabled`));
      await run(`delete navigator.onLine; window.dispatchEvent(new Event('online'));`);
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
    assert.equal(await run(`document.querySelectorAll('.glass-dock-icon').length`), 7);
    assert.equal(await run(`document.querySelector('.glass-navigation .vk-dock')?.getAttribute('href')`), VK_MUSIC_URL);
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
    const reloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    window.webContents.reload();
    await reloaded;
    await waitFor('English and MacOS survive a renderer restart', () => run(`document.documentElement.lang === 'en' && !!document.querySelector('[aria-label="Home"]') && document.querySelector('.app-shell').dataset.theme === 'macos'`));
    assert.equal((await preferences()).appearance.effect, 'mix-flow', 'the selected scene restores after a renderer restart');
    assert.deepEqual((await preferences()).equalizer, editedEq, 'parametric filters restore after a renderer restart');
    assert.deepEqual((await preferences()).stationIds, [recordStation.id], 'saved radio restores after a renderer restart');
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
    console.log('::notice title=Cache and localization::Applied all five themes; MacOS, EN and parametric EQ survived reload. Verified offline MP3, byte ranges, seek and cache cleanup.');

  } finally {
    session.defaultSession.protocol.unhandle('https');
    await legacyVk.clearStorageData();
  }
  console.log('::notice title=Catalogs and playlists::Merged Home, parallel catalog search without site shortcuts, playlist import, radio tuning in both directions, and preservation of legacy profile data verified.');
  console.log('Desktop smoke: monitor fullscreen; both widget layouts restore bounds and reuse audio; Apple/WASM; metered MP3; lyrics export; isolated legacy reset.');
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

  }
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
  assert.ok(report.startsWith(`Luma Player ${version} ·`));
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
    const { webRequest } = session.defaultSession;
    const network = [];
    // Network diagnostics are limited to statuses, MIME, and origins.
    const upstream = { urls: ['https://api.audius.co/*', 'https://creatornode.audius.co/*', `${new URL(storageStream).origin}/*`] };
    const label = (url) => {
      const { hostname, pathname } = new URL(url);
      return `${hostname}${pathname.endsWith('/stream') ? '(resolve)' : pathname.includes('/cidstream/') || hostname.endsWith('.r2.cloudflarestorage.com') ? '(media)' : '(query)'}`;
    };
    webRequest.onResponseStarted(upstream, ({ url, statusCode, responseHeaders }) => {
      const mime = Object.entries(responseHeaders ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0]?.split(';')[0];
      network.push(`${label(url)} ${statusCode}${mime ? ` ${mime}` : ''}`);
    });
    webRequest.onBeforeRedirect(upstream, ({ url, statusCode, redirectURL }) => network.push(`${label(url)} ${statusCode} -> ${new URL(redirectURL).origin}`));
    webRequest.onErrorOccurred(upstream, ({ url, error }) => network.push(`${label(url)} ${error}`));
    await run(`document.addEventListener('securitypolicyviolation', event => {
      const url = URL.parse(event.blockedURI);
      if (url && event.violatedDirective === 'media-src') (window.catalogPolicyBlocks ??= []).push(url.origin);
    });`);
    const sources = [
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
              if (status?.dataset.state !== 'done') return null;
              return [...document.querySelectorAll('.online-results li[data-source="${source}"] .online-result-actions button:first-child')]
                .map((button) => ({ aria: button.getAttribute('aria-label'), title: button.closest('li').querySelector('.online-result-copy strong').textContent }));
            })()`);
            if (outcome?.error) throw new Error(outcome.error);
            return outcome;
          });
          const failures = [];
          for (const { aria, title } of options.slice(0, 3)) {
            await click(`.online-result-actions button[aria-label=${JSON.stringify(aria)}]`);
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
              result = `decoded ${title} (${decoded.format})`;
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
      webRequest.onErrorOccurred(null);
      webRequest.onBeforeRedirect(null);
      webRequest.onResponseStarted(null);
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
