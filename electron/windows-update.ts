import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { readLimitedBody } from '../src/shared/metadata-service.js';
import { installerName, LATEST_RELEASE_API, newerStableVersion, readWindowsRelease, windowsArtifactName } from '../src/shared/release-updates.js';
import type { DownloadResult, InstallResult, UpdateDownloadState, UpdateMode, UpdateReport, WindowsRelease } from '../src/shared/release-updates.js';

const fetchOptions = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' } as const;
const UPDATE_RECHECK_MS = 5 * 60_000;
const RELEASE_ASSET_ORIGINS = new Set(['https://objects.githubusercontent.com', 'https://release-assets.githubusercontent.com']);

function releaseAssetRedirect(value: string | null) {
  if (!value || value.length > 8192) return;
  const url = URL.parse(value);
  if (url && RELEASE_ASSET_ORIGINS.has(url.origin) && !url.username && !url.password && !url.hash
    && /^\/github-production-release-asset(?:-[\da-f]+)?\/1463134723\/[\da-f-]{36}$/.test(url.pathname)) return url.href;
}

const exec = promisify(execFile);
export const WINDOWS_VERIFIER_EXE = 'LumaVerify.exe';

/** Uses only the packaged verifier path; missing, timed out or untrusted stays manual. */
export async function readTrustedWindowsSigner(helper: string, path: string): Promise<string | undefined> {
  if (process.platform !== 'win32' || !isAbsolute(helper) || !isAbsolute(path)) return;
  try {
    const { stdout, stderr } = await exec(helper, [path], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 });
    const hash = stdout.trim();
    if (!stderr && /^[a-f0-9]{64}$/.test(hash)) return hash;
  } catch { /* A verifier error does not authorize installation. */ }
}

export async function verifyWindowsSigner(helper: string, path: string, expected: string): Promise<boolean> {
  return /^[a-f0-9]{64}$/.test(expected) && await readTrustedWindowsSigner(helper, path) === expected;
}

async function downloadWindowsAsset(release: WindowsRelease, path: string, signal: AbortSignal, fetcher: typeof fetch,
  onBytes?: (bytes: number) => void, onVerifying?: () => void) {
  if (!release.digest) throw new Error('Release digest is missing');
  const response = await fetcher(release.asset, { ...fetchOptions, redirect: 'manual', signal });
  const url = response.status === 302 || response.status === 307 ? releaseAssetRedirect(response.headers.get('Location')) : undefined;
  let asset = response;
  if (url) {
    await response.body?.cancel().catch(() => {});
    asset = await fetcher(url, { ...fetchOptions, signal });
  }
  const size = asset.headers.get('Content-Length');
  if (asset.status !== 200 || !asset.body || (size !== null && Number(size) !== release.bytes)) {
    await asset.body?.cancel().catch(() => {});
    throw new Error('Unexpected release asset response');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const reader = asset.body.getReader();
  await pipeline(async function* () {
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > release.bytes) throw new Error('Release asset exceeds declared length');
        hash.update(chunk.value);
        yield chunk.value;
        onBytes?.(bytes);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal });
  onVerifying?.();
  if (bytes !== release.bytes || hash.digest('hex') !== release.digest) throw new Error('Release asset digest differs');
}

export function launchInstaller(path: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(path, [], { cwd: dirname(path), detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

/** Scoped to this repo. Saving never runs code; launching still requires the pinned Windows signer. */
export class WindowsUpdates {
  private pending?: Promise<WindowsRelease>;
  private latest?: { release: WindowsRelease; expires: number };
  private checkingFailedUntil = 0;
  private installing = false;
  private stopped = new AbortController();
  private downloadAbort?: AbortController;
  private downloadTask?: Promise<DownloadResult>;
  private downloadState: UpdateDownloadState = { state: 'idle' };
  private savedDownload?: string;
  onDownloadState?: (state: UpdateDownloadState) => void;

  constructor(private installed: string, private mode: UpdateMode, private signer: string | undefined, private temp: string,
    private fetcher = globalThis.fetch, private verify: (path: string, signer: string) => Promise<boolean> = async () => false,
    private launch = launchInstaller, private currentExe = process.execPath) {}

  private get artifact() { return this.mode === 'portable' ? 'portable' : 'setup'; }

  async check(): Promise<UpdateReport> {
    try {
      const release = await this.find();
      const mode = this.mode === 'signed' && !release.digest ? 'manual' : this.mode;
      return newerStableVersion(release.version, this.installed)
        ? { state: 'available', mode, version: release.version, bytes: release.bytes, downloadable: mode !== 'development' && !!release.digest }
        : { state: 'current', mode };
    } catch { return { state: 'unavailable', mode: this.mode }; }
  }
  private find() {
    if (this.latest && this.latest.expires > Date.now()) return Promise.resolve(this.latest.release);
    if (this.pending) return this.pending;
    if (Date.now() < this.checkingFailedUntil) return Promise.reject(new Error('Release lookup temporarily unavailable'));
    this.pending = (async () => {
      const signal = AbortSignal.any([this.stopped.signal, AbortSignal.timeout(12_000)]);
      const response = await this.fetcher(LATEST_RELEASE_API, { ...fetchOptions, signal,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Luma-Player' } });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('Release lookup failed'); }
      const body = await readLimitedBody(response, 512 * 1024, signal);
      const release = readWindowsRelease(JSON.parse(new TextDecoder().decode(body)), this.artifact);
      if (!release) throw new Error('Invalid release');
      this.latest = { release, expires: Date.now() + UPDATE_RECHECK_MS };
      return release;
    })().catch((error: unknown) => { this.checkingFailedUntil = Date.now() + 20_000; throw error; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  getDownloadState(): UpdateDownloadState { return this.downloadState; }

  private publishDownload(state: UpdateDownloadState) {
    this.downloadState = state;
    this.onDownloadState?.(state);
  }

  async download(expected: unknown, downloads: string, canSave: () => boolean): Promise<DownloadResult> {
    if (this.mode === 'development' || this.installing || this.downloadAbort || this.stopped.signal.aborted || !isAbsolute(downloads)
      || typeof expected !== 'string' || !newerStableVersion(expected, this.installed) || !canSave()) return 'unavailable';
    const cancel = this.downloadAbort = new AbortController();
    const task = this.downloadTask = this.saveDownload(expected, downloads, cancel.signal, canSave).finally(() => {
      this.downloadAbort = undefined;
      this.downloadTask = undefined;
    });
    return task;
  }

  private async saveDownload(version: string, downloads: string, cancel: AbortSignal, canSave: () => boolean): Promise<DownloadResult> {
    const signal = AbortSignal.any([this.stopped.signal, cancel, AbortSignal.timeout(10 * 60_000)]);
    let directory: string | undefined, partial: string | undefined;
    let result: DownloadResult = 'failed';
    this.savedDownload = undefined;
    this.publishDownload({ state: 'preparing', version });
    try {
      const release = await this.find();
      signal.throwIfAborted();
      if (!release.digest || release.version !== version) return result = 'unavailable';
      if (!canSave()) return result = 'cancelled';
      // Use a fresh folder, not the running executable or any existing download. The
      // .exe name appears only after the stream was verified and marked as internet content.
      await mkdir(downloads, { recursive: true });
      directory = await mkdtemp(join(downloads, `Luma-${version}-`));
      const path = join(directory, windowsArtifactName(version, this.artifact));
      partial = `${path}.part`;
      signal.throwIfAborted();
      const progress = (received: number) => this.publishDownload({ state: 'downloading', version, received, bytes: release.bytes });
      progress(0);
      let last = performance.now();
      await downloadWindowsAsset(release, partial, signal, this.fetcher, (received) => {
        const now = performance.now();
        if (received === release.bytes || now - last >= 150) { last = now; progress(received); }
      }, () => this.publishDownload({ state: 'verifying', version }));
      signal.throwIfAborted();
      // Node fetch does not add Mark of the Web. Preserve Windows' normal reputation
      // checks for unsigned downloads; if the destination can't store it, fail closed.
      if (process.platform === 'win32') await writeFile(`${partial}:Zone.Identifier`, `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${release.asset}\r\n`);
      signal.throwIfAborted();
      if (!canSave()) return result = 'cancelled';
      await rename(partial, path);
      this.savedDownload = path;
      return result = 'saved';
    } catch {
      return result = (cancel.aborted || this.stopped.signal.aborted) ? 'cancelled' : 'failed';
    } finally {
      if (result !== 'saved' && directory) {
        if (partial) await rm(partial, { force: true, maxRetries: 2 }).catch(() => {});
        await rmdir(directory).catch(() => {}); // Don't remove unrelated files placed there meanwhile.
      }
      this.publishDownload({ state: result, version });
    }
  }

  cancelDownload() {
    if (!this.downloadAbort || this.downloadAbort.signal.aborted
      || (this.downloadState.state !== 'preparing' && this.downloadState.state !== 'downloading')) return false;
    this.downloadAbort.abort();
    return true;
  }

  async revealDownload(show: (path: string) => void) {
    const path = this.savedDownload;
    if (!path) return false;
    const item = await lstat(path).catch(() => undefined);
    if (path !== this.savedDownload) return false;
    if (!item?.isFile()) {
      this.savedDownload = undefined;
      this.publishDownload({ state: 'idle' });
      return false;
    }
    show(path);
    return true;
  }

  async install(expected: unknown, confirm: (release: WindowsRelease) => Promise<boolean>, canLaunch: () => boolean): Promise<InstallResult> {
    if (this.mode !== 'signed' || !this.signer || this.installing || this.downloadAbort || this.stopped.signal.aborted || typeof expected !== 'string' || !newerStableVersion(expected, this.installed)) return 'unavailable';
    this.installing = true;
    let directory: string | undefined;
    let started = false;
    try {
      const release = await this.find();
      if (!release.digest || release.version !== expected || !canLaunch()) return 'unavailable';
      if (!await confirm(release) || !canLaunch()) return 'cancelled';
      if (!await this.verify(this.currentExe, this.signer)) return 'signature';
      directory = await mkdtemp(join(this.temp, 'luma-update-'));
      const path = join(directory, installerName(release.version));
      const signal = AbortSignal.any([this.stopped.signal, AbortSignal.timeout(10 * 60_000)]);
      await downloadWindowsAsset(release, path, signal, this.fetcher);
      if (!await this.verify(path, this.signer)) return 'signature';
      if (signal.aborted || !canLaunch()) return 'cancelled';
      await this.launch(path);
      started = true;
      return 'started';
    } catch { return 'failed'; }
    finally {
      if (directory && !started) await rm(directory, { recursive: true, force: true }).catch(() => {});
      this.installing = false;
    }
  }
  stop() { this.stopped.abort(); return this.downloadTask; }
}
