// Run with Electron after `npm run build`. Uses a temporary profile, not the user's library.
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, session } from 'electron';
import { APP_ORIGIN, DesktopLibrary } from '../dist-electron/electron/library.js';
import { VK_MUSIC_URL } from '../dist-electron/src/shared/vk.js';
import { VK_SESSION } from '../dist-electron/electron/vk-window.js';
import { taggedMp3 } from './fixtures/mp3.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const archive = join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
if (existsSync(archive)) {
  assert.equal(JSON.parse(await readFile(join(archive, 'package.json'), 'utf8')).version, version, 'packaged manifest version');
  for (const target of ['Setup', 'Portable']) assert.ok(existsSync(join(root, 'release', `Luma-Player-${target}-${version}-x64.exe`)));
}
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

const timer = setTimeout(() => fail(new Error('Desktop smoke test did not finish')), 80_000);
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
  await waitFor('spinning record', () => run(`!!document.querySelector('.hero .record-rotating')`));
  await run(`window.testAudio = document.querySelector('audio'); document.querySelector('.hero-fullscreen').click()`);
  await waitFor('expanded player', () => run(`document.querySelector('.immersive-player[open] h1')?.textContent === "Ty Zdes'"`));
  assert.equal(await run(`window.testAudio === document.querySelector('audio') && !window.testAudio.paused`), true);
  await run(`document.querySelector('.immersive-collapse').click()`);
  await waitFor('player collapsed', () => run(`!document.querySelector('.immersive-player') && !document.fullscreenElement`));
  await go('Меню');
  await waitFor('about action', () => run(`!!document.querySelector('[aria-label="О приложении"]')`));
  await run(`document.querySelector('[aria-label="О приложении"]').click()`);
  await waitFor('About has package version', () => run(`document.querySelector('.about-build strong')?.textContent === ${JSON.stringify(`Версия ${version}`)}`));

  const vkSession = session.fromPartition(VK_SESSION);
  session.defaultSession.protocol.handle('https', () => new Response('<!doctype html><title>Mock VK widget</title>', { headers: { 'Content-Type': 'text/html' } }));
  const authOrigin = 'https://id.vk.ru';
  vkSession.protocol.handle('https', (request) => {
    if (request.url === VK_MUSIC_URL) return new Response(null, { status: 302, headers: { Location: `${authOrigin}/luma-smoke` } });
    return new Response('<!doctype html><title>Stub sign-in</title><p>Official sign-in fixture</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  try {
    await go('VK Музыка');
    await waitFor('VK account entry', () => run(`!!document.querySelector('button.vk-account-open')`));
    await run(`document.querySelector('button.vk-account-open').click()`);
    const account = await waitFor('official sign-in in separate window', () => BrowserWindow.getAllWindows().find((item) => item !== window && item.webContents.getURL() === `${authOrigin}/luma-smoke`));
    await waitFor('VK test page loaded', () => account.webContents.executeJavaScript(`document.body?.textContent.includes('Official sign-in fixture')`));
    assert.equal(account.webContents.session, vkSession);
    assert.notEqual(account.webContents.session, window.webContents.session);
    assert.deepEqual(await account.webContents.executeJavaScript(`[typeof window.luma, typeof require]`), ['undefined', 'undefined']);
    assert.equal(account.getTitle(), 'VK Музыка — id.vk.ru');
    account.destroy();
    await go('Главная');
  } finally {
    vkSession.protocol.unhandle('https');
    session.defaultSession.protocol.unhandle('https');
  }
  console.log('Desktop smoke: consistent package/About version, immersive vinyl and an isolated VK sign-in window.');
  const journalFile = join(profile, 'Luma Player', 'logs', 'diagnostics.json');
  const snapshot = await waitFor('desktop and renderer startup events', async () => {
    const data = await run('window.luma.diagnostics.snapshot()');
    const names = data.entries.map(({ event }) => event);
    return ['desktop.start', 'desktop.ready', 'renderer.start', 'library.opened', 'audio.ready'].every((name) => names.includes(name)) ? data : undefined;
  });
  assert.match(snapshot.environment.runtime, /Electron .*Chromium/);
  assert.equal(snapshot.environment.version, version);
  assert.equal(snapshot.storage, 'file');
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
