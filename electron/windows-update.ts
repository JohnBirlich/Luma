import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { readLimitedBody } from '../src/shared/metadata-service.js';
import { installerName, LATEST_RELEASE_API, newerStableVersion, readWindowsRelease } from '../src/shared/release-updates.js';
import type { InstallResult, UpdateMode, UpdateReport, WindowsRelease } from '../src/shared/release-updates.js';

const fetchOptions = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' } as const;
const UPDATE_RECHECK_MS = 5 * 60_000;
const RELEASE_ASSET_ORIGINS = new Set(['https://objects.githubusercontent.com', 'https://release-assets.githubusercontent.com']);

function releaseAssetRedirect(value: string | null) {
  if (!value || value.length > 8192) return;
  const url = URL.parse(value);
  if (url && RELEASE_ASSET_ORIGINS.has(url.origin) && !url.username && !url.password && !url.hash
    && /^\/github-production-release-asset(?:-[\da-f]+)?\/1463134723\/[\da-f-]{36}$/.test(url.pathname)) return url.href;
}

const checkSignature = promisify(execFile);
const verifyScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$info = Microsoft.PowerShell.Security\u005cGet-AuthenticodeSignature -LiteralPath $env:LUMA_SIGNATURE_FILE
if ($info.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or -not $info.SignerCertificate) { exit 1 }
[Convert]::ToBase64String($info.SignerCertificate.RawData)
`;
const encodedVerify = Buffer.from(verifyScript, 'utf16le').toString('base64');

export async function verifyWindowsSigner(path: string, signer: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    // No shell or user-controlled command text; a missing verifier fails closed.
    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout, stderr } = await checkSignature(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedVerify], {
      env: { ...process.env, PSModulePath: join(dirname(powershell), 'Modules'), LUMA_SIGNATURE_FILE: path }, windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024,
    });
    const cert = stdout.trim();
    return !stderr && /^[A-Za-z0-9+/]+={0,2}$/.test(cert) && createHash('sha256').update(Buffer.from(cert, 'base64')).digest('hex') === signer;
  } catch { return false; }
}

async function downloadWindowsInstaller(release: WindowsRelease, path: string, signal: AbortSignal, fetcher: typeof fetch) {
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
    throw new Error('Unexpected installer response');
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
        if (bytes > release.bytes) throw new Error('Installer exceeds declared length');
        hash.update(chunk.value);
        yield chunk.value;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal });
  if (bytes !== release.bytes || hash.digest('hex') !== release.digest) throw new Error('Installer digest differs');
}

export function launchInstaller(path: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(path, [], { cwd: dirname(path), detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

/** Explicitly user-initiated downloads, scoped to one repo and a pinned Windows signing certificate. */
export class WindowsUpdates {
  private pending?: Promise<WindowsRelease>;
  private latest?: { release: WindowsRelease; expires: number };
  private checkingFailedUntil = 0;
  private installing = false;
  private stopped = new AbortController();

  constructor(private installed: string, private mode: UpdateMode, private signer: string | undefined, private temp: string,
    private fetcher = globalThis.fetch, private verify = verifyWindowsSigner, private launch = launchInstaller, private currentExe = process.execPath) {}

  async check(): Promise<UpdateReport> {
    try {
      const release = await this.find();
      const mode = this.mode === 'signed' && !release.digest ? 'manual' : this.mode;
      return newerStableVersion(release.version, this.installed) ? { state: 'available', mode, version: release.version, bytes: release.bytes } : { state: 'current', mode };
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
      const release = readWindowsRelease(JSON.parse(new TextDecoder().decode(body)));
      if (!release) throw new Error('Invalid release');
      this.latest = { release, expires: Date.now() + UPDATE_RECHECK_MS };
      return release;
    })().catch((error: unknown) => { this.checkingFailedUntil = Date.now() + 20_000; throw error; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async install(expected: unknown, confirm: (release: WindowsRelease) => Promise<boolean>, canLaunch: () => boolean): Promise<InstallResult> {
    if (this.mode !== 'signed' || !this.signer || this.installing || typeof expected !== 'string' || !newerStableVersion(expected, this.installed)) return 'unavailable';
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
      await downloadWindowsInstaller(release, path, signal, this.fetcher);
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
  stop() { this.stopped.abort(); }
}
