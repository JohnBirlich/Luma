import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { WindowsUpdates } from '../electron/windows-update.js';
import { installerName, LATEST_RELEASE_API, newerStableVersion, portableName, readWindowsRelease, RELEASE_REPO } from '../src/shared/release-updates.js';
import type { UpdateDownloadState } from '../src/shared/release-updates.js';

const version = '0.20.0', installed = '0.19.0', signer = 'a'.repeat(64);
const name = installerName(version), asset = `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${name}`;
const storage = 'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1463134723/f644c51d-d353-4dc3-8b47-8310467fa712?some=signed-value';
const payload = Buffer.from('fake test executable, never launched');
const installer = { name, browser_download_url: asset, state: 'uploaded', size: payload.length, digest: `sha256:${createHash('sha256').update(payload).digest('hex')}` };
const portablePayload = Buffer.from('fake portable payload. Do not execute test fixtures.');
const portableFile = { ...installer, name: portableName(version), size: portablePayload.length,
  browser_download_url: asset.replace(name, portableName(version)), digest: `sha256:${createHash('sha256').update(portablePayload).digest('hex')}` };
const release = { tag_name: `v${version}`, draft: false, prerelease: false, assets: [installer, portableFile] };
const releaseFor = (url: string) => new Response(null, { status: 302, headers: { Location: url } });

test('stable releases and setup assets are compared numerically and scoped to the exact repository path', () => {
  assert.equal(newerStableVersion('1.10.0', '1.9.99'), true);
  assert.equal(newerStableVersion('1.1.0', '1.1.0-rc.2'), true);
  assert.equal(newerStableVersion('1.1.0', '1.1.0+git-hash'), false);
  assert.equal(newerStableVersion('1.0.0', '0.20.0'), true);
  assert.equal(newerStableVersion('1.0.0', '2.0.0'), false);
  assert.equal(newerStableVersion('1.0.0-rc.1', '0.19.0'), false);
  assert.equal(LATEST_RELEASE_API, 'https://api.github.com/repos/JohnBirlich/Luma/releases/latest');
  assert.equal(readWindowsRelease(release)?.asset, `https://github.com/JohnBirlich/Luma/releases/download/v${version}/${name}`);
  assert.equal(readWindowsRelease(release, 'portable')?.asset, portableFile.browser_download_url);
  const legacyAsset = asset.replace('/JohnBirlich/Luma/', '/JohnBirlich/VKX-Modded/');
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, browser_download_url: legacyAsset }] }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [installer] }, 'portable'), undefined, 'Portable never falls back to Setup');
  assert.equal(readWindowsRelease({ ...release, assets: [portableFile, portableFile] }, 'portable'), undefined, 'ambiguous assets are rejected');
  assert.equal(readWindowsRelease({ ...release, draft: true }), undefined);
  assert.equal(readWindowsRelease({ ...release, prerelease: true }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, browser_download_url: 'https://example.net/setup.exe' }] }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, name: name.replace('Setup', 'Portable') }] }), undefined);
  assert.equal(readWindowsRelease({ ...release, assets: [{ ...installer, digest: 'sha256:truncated' }] })?.digest, undefined);
});

test('only checks release metadata until asked to save, and only signed Setup can install', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url) => {
    assert.equal(url, LATEST_RELEASE_API);
    requests++;
    return Response.json(release);
  };
  for (const mode of ['portable', 'manual', 'development'] as const) {
    const updates = new WindowsUpdates(installed, mode, signer, tmpdir(), fetcher, async () => assert.fail('Unexpected signature verification'));
    const expected = { state: 'available', mode, version, bytes: mode === 'portable' ? portablePayload.length : payload.length, downloadable: mode !== 'development' };
    assert.deepEqual(await updates.check(), expected);
    assert.deepEqual(await updates.check(), expected);
    assert.deepEqual(updates.getDownloadState(), { state: 'idle' });
    if (mode === 'development') assert.equal(await updates.download(version, tmpdir(), () => true), 'unavailable');
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

test('explicit Portable/Setup download streams the right asset and saves only verified bytes without launching or replacing anything', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-download-test-'));
  const downloads = join(dir, 'Загрузки');
  const original = join(dir, portableName(installed));
  await writeFile(original, 'leave this portable untouched');
  try {
    for (const mode of ['portable', 'manual'] as const) {
      const kind = mode === 'portable' ? portableFile : installer;
      const bytes = mode === 'portable' ? portablePayload : payload;
      const requests: unknown[] = [], states: UpdateDownloadState[] = [];
      const fetcher: typeof fetch = async (url, init) => {
        requests.push(url);
        assert.equal(init?.credentials, 'omit');
        if (url === LATEST_RELEASE_API) return Response.json(release);
        if (url === kind.browser_download_url) {
          assert.equal(init?.redirect, 'manual');
          return releaseFor(storage);
        }
        assert.equal(url, storage);
        assert.equal(init?.redirect, 'error');
        return new Response(new ReadableStream({ start(stream) {
          stream.enqueue(Uint8Array.from(bytes.subarray(0, 10)));
          stream.enqueue(Uint8Array.from(bytes.subarray(10)));
          stream.close();
        } }), { headers: { 'Content-Length': String(bytes.length) } });
      };
      const updates = new WindowsUpdates(installed, mode, undefined, dir, fetcher,
        async () => assert.fail('Saving must not attempt installation'), async () => assert.fail('Downloads are not executable actions'), original);
      updates.onDownloadState = (state) => states.push(state);
      assert.equal(await updates.revealDownload(() => assert.fail('Nothing saved yet')), false);
      for (const invalid of [installed, '0.13.0', `${version}-beta.2`, kind.browser_download_url, { version }]) {
        assert.equal(await updates.download(invalid, downloads, () => true), 'unavailable');
      }
      assert.equal(await updates.download(version, downloads, () => false), 'unavailable');
      assert.deepEqual(requests, []);
      assert.equal(await updates.download(version, downloads, () => true), 'saved');
      assert.deepEqual(requests, [LATEST_RELEASE_API, kind.browser_download_url, storage]);
      assert.deepEqual(states[0], { state: 'preparing', version });
      assert.deepEqual(states[1], { state: 'downloading', version, received: 0, bytes: bytes.length });
      assert.deepEqual(states.slice(-3), [
        { state: 'downloading', version, received: bytes.length, bytes: bytes.length }, { state: 'verifying', version }, { state: 'saved', version },
      ]);
      assert.deepEqual(updates.getDownloadState(), states.at(-1));
      let saved = '';
      assert.equal(await updates.revealDownload((path) => { saved = path; }), true);
      assert.equal(dirname(dirname(saved)), downloads);
      assert.equal(basename(saved), kind.name);
      assert.deepEqual(await readdir(dirname(saved)), [kind.name], 'no incomplete download');
      assert.deepEqual(await readFile(saved), bytes);
      if (process.platform === 'win32') {
        const zone = await readFile(`${saved}:Zone.Identifier`, 'utf8');
        assert.equal(zone, `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${kind.browser_download_url}\r\n`);
      }
      await rm(saved);
      assert.equal(await updates.revealDownload(() => assert.fail('The file was moved')), false);
      assert.deepEqual(updates.getDownloadState(), { state: 'idle' });
      assert.equal(await readFile(original, 'utf8'), 'leave this portable untouched');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects stale releases, missing hashes, foreign redirects, bad sizes and bad checksums without exposing an exe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-download-reject-'));
  try {
    for (const fault of ['stale', 'missing', 'redirect', 'repo', 'digest', 'length', 'truncated', 'oversize', 'offline', 'owner'] as const) {
      const selected = fault === 'missing' ? { ...portableFile, digest: undefined } : portableFile;
      const checkOnly = fault === 'stale' || fault === 'missing';
      let open = true;
      const fetcher: typeof fetch = async (url) => {
        if (url === LATEST_RELEASE_API) return Response.json({ ...release, assets: [selected] });
        assert.ok(!checkOnly, 'do not fetch an asset that cannot be saved');
        if (url === portableFile.browser_download_url) {
          if (fault === 'offline') throw new Error('network disconnected');
          if (fault === 'redirect') return releaseFor('https://unexpected.invalid/file.exe');
          if (fault === 'repo') return releaseFor(storage.replace('1463134723', '1463134724'));
          return releaseFor(storage);
        }
        assert.equal(url, storage);
        assert.notEqual(fault, 'redirect'); assert.notEqual(fault, 'repo');
        return new Response(fault === 'digest' ? new Uint8Array(portablePayload.length) : fault === 'truncated'
          ? Uint8Array.from(portablePayload.subarray(1)) : fault === 'oversize' ? new Uint8Array(portablePayload.length + 1) : Uint8Array.from(portablePayload),
        { headers: fault === 'length' ? { 'Content-Length': String(portablePayload.length - 1) } : undefined });
      };
      const updates = new WindowsUpdates(installed, 'portable', undefined, dir, fetcher);
      if (fault === 'missing') assert.deepEqual(await updates.check(), { state: 'available', mode: 'portable', version, bytes: portablePayload.length, downloadable: false });
      if (fault === 'owner') updates.onDownloadState = (state) => { if (state.state === 'verifying') open = false; };
      const target = fault === 'stale' ? '0.21.0' : version;
      const expected = checkOnly ? 'unavailable' : fault === 'owner' ? 'cancelled' : 'failed';
      assert.equal(await updates.download(target, dir, () => open), expected, fault);
      assert.deepEqual(updates.getDownloadState(), { state: expected, version: target });
      assert.equal(await updates.revealDownload(() => assert.fail('Unexpected executable')), false);
      assert.deepEqual(await readdir(dir), [], fault);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('single download across panels; cancelling or quitting aborts the stream and cleans partial files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'luma-download-cancel-'));
  try {
    for (const stop of [false, true]) {
      const fetching = Promise.withResolvers<void>();
      const fetcher: typeof fetch = async (url, init) => {
        if (url === LATEST_RELEASE_API) return Response.json(release);
        assert.equal(url, portableFile.browser_download_url);
        const signal = init?.signal;
        assert.ok(signal);
        return new Response(new ReadableStream({ start(reader) {
          signal.addEventListener('abort', () => reader.error(signal.reason), { once: true });
          reader.enqueue(Uint8Array.from(portablePayload.subarray(0, 3)));
          fetching.resolve();
        } }));
      };
      const updates = new WindowsUpdates(installed, 'portable', undefined, dir, fetcher);
      const saving = updates.download(version, dir, () => true);
      await fetching.promise;
      assert.equal(updates.getDownloadState().state, 'downloading');
      assert.equal(await updates.download(version, dir, () => true), 'unavailable');
      if (stop) assert.equal(await updates.stop(), 'cancelled');
      else assert.equal(updates.cancelDownload(), true);
      assert.equal(await saving, 'cancelled');
      assert.equal(updates.cancelDownload(), false);
      assert.deepEqual(await readdir(dir), []);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
