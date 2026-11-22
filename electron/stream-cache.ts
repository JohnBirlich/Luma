import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseBuffer } from 'music-metadata';
import { MAX_CACHED_TRACK, MAX_STREAM_CACHE, CACHE_LIFETIME_DAYS } from '../src/shared/stream-cache.js';
import { commonsMp3Export, decodeOpenverse, OPENVERSE_API, readOnlineTrack } from '../src/shared/online.js';
import { readLimitedBody } from '../src/shared/metadata-service.js';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const filePattern = /^([a-f0-9]{64})\.mp3$/;
const keyFor = (url: string) => createHash('sha256').update(url).digest('hex');
const age = CACHE_LIFETIME_DAYS * 86400_000;

export class StreamCache {
  private files = new Map<string, { bytes: number; stored: number }>();
  private running?: { cancel: AbortController; finished: Promise<void> };
  private clearing = false;
  private constructor(private root: string, private fetcher: Fetcher, private maxBytes: number) {}

  static async open(root: string, fetcher: Fetcher, maxBytes = MAX_STREAM_CACHE) {
    const cache = new StreamCache(root, fetcher, maxBytes);
    for (const name of await readdir(root).catch(() => [])) {
      if (name === 'incomplete') { await rm(join(root, name), { force: true }).catch(() => {}); continue; }
      const key = filePattern.exec(name)?.[1];
      if (!key) continue;
      const info = await lstat(join(root, name)).catch(() => undefined);
      if (info?.isFile() && info.size > 0 && info.size <= MAX_CACHED_TRACK) cache.files.set(key, { bytes: info.size, stored: info.mtimeMs });
      else await rm(join(root, name), { force: true }).catch(() => {});
    }
    await cache.prune(0).catch(() => {});
    return cache;
  }
  private path(key: string) { return join(this.root, `${key}.mp3`); }
  private async remove(key: string) {
    await rm(this.path(key), { force: true });
    this.files.delete(key);
  }
  private async prune(incoming: number) {
    let bytes = [...this.files.values()].reduce((sum, item) => sum + item.bytes, 0);
    for (const [key, item] of [...this.files.entries()].sort((a, b) => a[1].stored - b[1].stored)) {
      if (bytes + incoming <= this.maxBytes && Date.now() - item.stored < age) break;
      await this.remove(key);
      bytes -= item.bytes;
    }
  }
  mediaPath(key: string) {
    const info = this.files.get(key);
    return info && Date.now() - info.stored < age ? this.path(key) : undefined;
  }
  // Only return existing immutable cache slots; this never triggers a request.
  async url(value: unknown) {
    const track = readOnlineTrack(value);
    if (!track || !commonsMp3Export(track) || this.clearing) return null;
    const key = keyFor(track.audioUrl), path = this.mediaPath(key);
    return path && (await lstat(path).catch(() => undefined))?.isFile() ? `luma://app/media/cache/${key}` : null;
  }
  info() {
    const entries = [...this.files.values()];
    return { count: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0) };
  }
  async clear() {
    if (this.clearing) return this.info();
    this.clearing = true;
    try {
      this.running?.cancel.abort();
      await this.running?.finished;
      const results = await Promise.allSettled([...this.files.keys()].map((key) => this.remove(key)));
      if (results.some((result) => result.status === 'rejected')) throw new Error('Some cache files are in use');
      return this.info();
    } finally { this.clearing = false; }
  }
  async save(value: unknown) {
    const track = readOnlineTrack(value);
    if (!track || !commonsMp3Export(track) || this.clearing || this.running) return false;
    const cancel = new AbortController();
    let finish!: () => void;
    this.running = { cancel, finished: new Promise<void>((resolve) => { finish = resolve; }) };
    const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(30_000)]);
    const tmp = join(this.root, 'incomplete');
    const init = { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' } as const;
    try {
      if (await this.url(track)) return true;
      // Resolve again in main. A forged URL or a license copied from another recording is not permission.
      const response = await this.fetcher(`${OPENVERSE_API}${track.id.slice(3)}/?format=json`, init);
      if (!response.ok) { void response.body?.cancel().catch(() => {}); return false; }
      const resolved = decodeOpenverse(JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 512 * 1024, signal))));
      if (!resolved || resolved.id !== track.id || resolved.audioUrl !== track.audioUrl || !commonsMp3Export(resolved)) return false;
      const audio = await this.fetcher(resolved.audioUrl, init);
      if (audio.status !== 200 || /(?:^|,|\s)(?:no-store|private)\b/i.test(audio.headers.get('Cache-Control') ?? '')) {
        void audio.body?.cancel().catch(() => {}); return false;
      }
      const buffer = Buffer.from(await readLimitedBody(audio, Math.min(MAX_CACHED_TRACK, this.maxBytes), signal));
      const { format } = await parseBuffer(buffer, 'audio/mpeg', { duration: true, skipCovers: true });
      if (!format.codec?.endsWith(' Layer 3') || !format.duration) return false;
      signal.throwIfAborted();
      await this.prune(buffer.byteLength);
      await mkdir(this.root, { recursive: true });
      await writeFile(tmp, buffer, { flag: 'wx', signal });
      signal.throwIfAborted();
      const key = keyFor(resolved.audioUrl);
      await rename(tmp, this.path(key));
      this.files.set(key, { stored: Date.now(), bytes: buffer.byteLength });
      return true;
    } catch { return false; }
    finally {
      await rm(tmp, { force: true }).catch(() => {});
      this.running = undefined;
      finish();
    }
  }
}
