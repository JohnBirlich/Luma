// Run with Electron so fs can read the packaged application manifest inside the ASAR.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { readTrustedWindowsSigner, verifyWindowsSigner, WINDOWS_VERIFIER_EXE } from '../dist-electron/electron/windows-update.js';
import { MUSIC_LINK_SCHEME } from '../dist-electron/src/shared/music-links.js';
import { installerName, portableName, readSignerSha256 } from '../dist-electron/src/shared/release-updates.js';
import { APP_NAME, APP_USER_MODEL_ID } from '../dist-electron/src/shared/app-info.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const directory = join(root, 'release');
  const archive = join(directory, 'win-unpacked', 'resources', 'app.asar');
  const manifest = JSON.parse(await readFile(join(archive, 'package.json'), 'utf8'));
  assert.equal(manifest.version, version, 'packaged manifest version');
  assert.ok((await stat(join(archive, 'dist-electron', 'electron', 'vk-media-preload.cjs'))).isFile(), 'sandboxed VK preload is packaged');
  const assetDir = join(archive, 'dist', 'assets');
  const assets = await readdir(assetDir);
  for (const expected of [/^fingerprint\.worker-.*\.js$/, /^rusty_chromaprint_wasm_bg-.*\.wasm$/, /^ocean-.*\.webm$/, /^liquid-wallpaper-.*\.webp$/, /^HomePage-.*\.js$/, /^float\.worklet-.*\.js$/]) {
    const name = assets.find((file) => expected.test(file));
    assert.ok(name && (await stat(join(assetDir, name))).size > 0, `packaged asset ${expected}`);
  }
  const config = await readFile(join(root, 'electron-builder.yml'), 'utf8');
  assert.ok(config.split(/\r?\n/).includes(`appId: ${APP_USER_MODEL_ID}`), 'runtime and installer app IDs agree');
  assert.ok(config.split(/\r?\n/).includes(`productName: ${APP_NAME}`), 'runtime and installer product names agree');
  assert.ok(config.split(/\r?\n/).includes(`executableName: ${APP_USER_MODEL_ID.slice(0, -4)}`), 'media source identifies the running executable');
  assert.match(config, /guid: 05d31eca-e044-513b-8c10-678775f8445d/, 'the installer updates 0.13 in place');
  const associations = await readFile(join(root, 'Assets', 'installer.nsh'), 'utf8');
  assert.ok(config.includes('include: Assets/installer.nsh') && associations.includes(`Software\\Classes\\${MUSIC_LINK_SCHEME}\\shell\\open\\command`));
  assert.ok(associations.includes('${APP_EXECUTABLE_FILENAME}" -- "%1"'));
  if (process.platform === 'win32') {
    assert.ok((await stat(join(directory, 'win-unpacked', 'resources', 'audio', 'LumaFloat.exe'))).isFile());
    const metadata = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '(Get-Item -LiteralPath $env:LUMA_TEST_EXE).VersionInfo | Select-Object ProductName,FileDescription | ConvertTo-Json -Compress'], {
      env: { ...process.env, LUMA_TEST_EXE: join(directory, 'win-unpacked', APP_USER_MODEL_ID) }, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    });
    assert.deepEqual(JSON.parse(metadata), { ProductName: APP_NAME, FileDescription: APP_NAME });
    const helper = join(directory, 'win-unpacked', WINDOWS_VERIFIER_EXE);
    assert.ok((await stat(helper)).isFile(), 'native signer verifier in the package');
    const usage = spawnSync(helper, [], { windowsHide: true, timeout: 10_000 });
    assert.ifError(usage.error);
    assert.equal(usage.status, 2, 'native signer verifier starts and rejects a missing argument');
    assert.equal(await readTrustedWindowsSigner(helper, join(root, 'package.json')), undefined, 'an unsigned file is rejected');
    if (manifest.lumaWindowsSignerSha256 !== undefined) {
      const signer = readSignerSha256(manifest.lumaWindowsSignerSha256);
      assert.ok(signer, 'packaged signing pin must be SHA-256');
      assert.equal(await verifyWindowsSigner(helper, helper, signer), true, 'the verifier is also signed in a signed package');
      assert.equal(await verifyWindowsSigner(helper, join(directory, 'win-unpacked', APP_USER_MODEL_ID), signer), true, 'signed application matches pin');
      assert.equal(await verifyWindowsSigner(helper, join(directory, installerName(version)), signer), true, 'signed setup matches pin');
    } else {
      const files = [process.env.npm_node_execpath, process.execPath].filter(Boolean);
      const pins = await Promise.all(files.map((file) => readTrustedWindowsSigner(helper, file)));
      const index = pins.findIndex(Boolean);
      if (index < 0) {
        console.log('::warning title=Authenticode fixture::No trusted Node or Electron signature could be verified on this runner. No signed Luma release is being tested.');
      } else {
        const otherPin = (pins[index][0] === '0' ? '1' : '0').repeat(64);
        assert.equal(await verifyWindowsSigner(helper, files[index], otherPin), false, 'a valid signature with a different pin is rejected');
        console.log('::notice title=Native Authenticode::A signed runtime was accepted, and the same file with an incorrect pin was rejected.');
      }
    }
  }
  for (const file of [installerName(version), portableName(version)]) {
    const info = await stat(join(directory, file));
    assert.ok(info.isFile() && info.size > 0);
  }
  console.log(`Package smoke: ASAR manifest, installer and portable agree on ${version}.`);
  app.exit(0);
} catch (error) {
  console.log(`::error title=Package smoke failed::${String(error?.message ?? error).replace(/[%\r\n]/g, ' ').slice(0, 1000)}`);
  console.error(error);
  app.exit(1);
}
