// Run with Electron so fs can read the packaged application manifest inside the ASAR.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { APP_NAME, APP_USER_MODEL_ID } from '../dist-electron/src/shared/app-info.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const directory = join(root, 'release');
  const archive = join(directory, 'win-unpacked', 'resources', 'app.asar');
  assert.equal(JSON.parse(await readFile(join(archive, 'package.json'), 'utf8')).version, version, 'packaged manifest version');
  const assetDir = join(archive, 'dist', 'assets');
  const assets = await readdir(assetDir);
  for (const expected of [/^fingerprint\.worker-.*\.js$/, /^rusty_chromaprint_wasm_bg-.*\.wasm$/, /^ocean-.*\.webm$/]) {
    const name = assets.find((file) => expected.test(file));
    assert.ok(name && (await stat(join(assetDir, name))).size > 0, `packaged asset ${expected}`);
  }
  const config = await readFile(join(root, 'electron-builder.yml'), 'utf8');
  assert.ok(config.split(/\r?\n/).includes(`appId: ${APP_USER_MODEL_ID}`), 'runtime and installer app IDs agree');
  assert.ok(config.split(/\r?\n/).includes(`productName: ${APP_NAME}`), 'runtime and installer product names agree');
  if (process.platform === 'win32') {
    const metadata = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '(Get-Item -LiteralPath $env:LUMA_TEST_EXE).VersionInfo | Select-Object ProductName,FileDescription | ConvertTo-Json -Compress'], {
      env: { ...process.env, LUMA_TEST_EXE: join(directory, 'win-unpacked', `${APP_NAME}.exe`) }, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    });
    assert.deepEqual(JSON.parse(metadata), { ProductName: APP_NAME, FileDescription: APP_NAME });
  }
  for (const target of ['Setup', 'Portable']) {
    const info = await stat(join(directory, `Luma-Player-${target}-${version}-x64.exe`));
    assert.ok(info.isFile() && info.size > 0);
  }
  console.log(`Package smoke: ASAR manifest, installer and portable agree on ${version}.`);
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}
