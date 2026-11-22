import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WindowsUpdates } from '../electron/windows-update.js';
import { installerName, LATEST_RELEASE_API, newerStableVersion, readWindowsRelease, RELEASE_REPO } from '../src/shared/release-updates.js';

const version = '0.20.0', installed = '0.19.0', signer = 'a'.repeat(64);
const name = installerName(version), asset = `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${name}`;
const storage = 'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1463134723/f644c51d-d353-4dc3-8b47-8310467fa712?some=signed-value';
const payload = Buffer.from('fake test executable, never launched');
const installer = { name, browser_download_url: asset, state: 'uploaded', size: payload.length, digest: `sha256:${createHash('sha256').update(payload).digest('hex')}` };
const release = { tag_name: `v${version}`, draft: false, prerelease: false, assets: [installer] };

test('stable releases and setup assets are compared numerically and scoped to the exact repository path', () => {
  assert.equal(newerStableVersion('1.10.0', '1.9.99'), true);
  assert.equal(newerStableVersion('1.1.0', '1.1.0-rc.2'), true);
  assert.equal(newerStableVersion('1.1.0', '1.1.0+git-hash'), false);
  assert.equal(newerStableVersion('1.0.0', '0.20.0'), true);
  assert.equal(newerStableVersion('1.0.0', '2.0.0'), false);
  assert.equal(newerStableVersion('1.0.0-rc.1', '0.19.0'), false);
  assert.equal(readWindowsRelease(release)?.asset, asset);
  assert.equal(readWindowsRelease({ ...release, draft: true }), undefined);
  assert.equal(readWindowsRelease({ ...release, prerelease: true }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, browser_download_url: 'https://example.net/setup.exe' }] }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, name: name.replace('Setup', 'Portable') }] }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, digest: 'sha256:truncated' }] })?.digest, undefined);
});

test('portable/manual/development mode detects a release but never verifies, downloads or launches code', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url) => {
    assert.equal(url, LATEST_RELEASE_API);
    requests++;
    return Response.json(release);
  };
  for (const mode of ['portable', 'manual', 'development'] as const) {
    const updates = new WindowsUpdates(installed, mode, signer, tmpdir(), fetcher, async () => assert.fail('Unexpected signature verification'));
    assert.deepEqual(await updates.check(), { state: 'available', mode, version, bytes: payload.length });
    assert.deepEqual(await updates.check(), { state: 'available', mode, version, bytes: payload.length });
    assert.equal(await updates.install(version, async () => assert.fail('Unexpected dialog'), () => true), 'unavailable');
  }
  assert.equal(requests, 3);
});

test('prepared update checks the request, bytes and both signatures before one explicit launch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-update-test-'));
  const requests: unknown[] = [], verified: string[] = [], launched: string[] = [];
  let variant: 'ok' | 'redirect' | 'digest' | 'signature' | 'current' = 'ok';
  const fetcher: typeof fetch = async (url, init) => {
    requests.push(url);
    assert.equal(init?.credentials, 'omit');
    if (url === LATEST_RELEASE_API) return Response.json(release);
    if (url === asset) {
      assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: variant === 'redirect' ? 'https://evil.invalid/installer.exe' : storage } });
    }
    assert.equal(url, storage);
    assert.equal(init?.redirect, 'error');
    return new Response(variant === 'digest' ? new Uint8Array(payload.length) : Uint8Array.from(payload), { headers: { 'Content-Length': String(payload.length) } });
  };
  const make = () => new WindowsUpdates(installed, 'signed', signer, dir, fetcher, async (path, expected) => {
    assert.equal(expected, signer);
    verified.push(path);
    return path === 'installed.exe' ? variant !== 'current' : variant !== 'signature';
  }, async (path) => {
    assert.deepEqual(await readFile(path), payload);
    launched.push(path);
  }, 'installed.exe');
  try {
    const ok = make();
    assert.equal(await ok.install(version, async () => false, () => true), 'cancelled');
    assert.deepEqual(requests, [LATEST_RELEASE_API]);
    assert.equal(await ok.install('1.0.0', async () => assert.fail('stale choice confirmed'), () => true), 'unavailable');
    for (const [fail, expected] of [['redirect', 'failed'], ['digest', 'failed'], ['signature', 'signature'], ['current', 'signature']] as const) {
      variant = fail;
      assert.equal(await make().install(version, async () => true, () => true), expected);
      assert.deepEqual(await readdir(dir), [], 'failed installers cleaned up');
    }
    assert.equal(launched.length, 0);
    variant = 'ok';
    const before = verified.length;
    assert.equal(await ok.install(version, async () => true, () => true), 'started');
    assert.equal(launched.length, 1);
    assert.deepEqual(verified.slice(before), ['installed.exe', launched[0]]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
