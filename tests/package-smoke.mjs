// Run with Electron so fs can read the packaged application manifest inside the ASAR.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const directory = join(root, 'release');
  const archive = join(directory, 'win-unpacked', 'resources', 'app.asar');
  assert.equal(JSON.parse(await readFile(join(archive, 'package.json'), 'utf8')).version, version, 'packaged manifest version');
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
