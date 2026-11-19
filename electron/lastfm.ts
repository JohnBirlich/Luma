import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SafeStorage } from 'electron';
import { LASTFM_GUIDE, readListeningEvent } from '../src/shared/lastfm.js';
import type { LastFmStatus } from '../src/shared/lastfm.js';
import { readLimitedBody } from '../src/shared/metadata-service.js';

const API = 'https://ws.audioscrobbler.com/2.0/';
const isKey = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{32}$/i.test(value);
const isToken = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_-]{16,128}$/i.test(value);
const object = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
interface Config { apiKey: string; secret: string }
interface SessionState { user: string; key: string; enabled: boolean }

export function lastFmConfig(apiKey: unknown, secret: unknown): Config | undefined {
  return isKey(apiKey) && isKey(secret) ? { apiKey, secret } : undefined;
}

export function signedLastFm(params: Record<string, string>, secret: string) {
  const entries = Object.entries(params).filter(([name]) => !['format', 'callback', 'api_sig'].includes(name)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const signature = createHash('md5').update(entries.map(([name, value]) => name + value).join('') + secret, 'utf8').digest('hex');
  return new URLSearchParams([...entries, ['api_sig', signature], ['format', 'json']]);
}

class ServiceError extends Error { constructor(readonly code: number) { super('Last.fm request failed'); } }

export class DesktopLastFm {
  private account?: SessionState;
  private token?: { value: string; until: number };
  private issue?: LastFmStatus['issue'];
  private startedAt = 0;
  private working = false;
  private requests = new AbortController();
  private recent = new Set<string>();
  private pending = 0;
  private throttle = 0;
  onChange?: (status: LastFmStatus) => void;

  private constructor(private config: Config | undefined, private fetcher: Fetch, private file: string, private storage: SafeStorage) {}

  static async open(config: Config | undefined, fetcher: Fetch, file: string, storage: SafeStorage) {
    const result = new DesktopLastFm(config, fetcher, file, storage);
    if (config && result.persistent()) {
      try {
        const bytes = await readFile(file);
        if (bytes.length > 8192) return result;
        const row = object(JSON.parse(storage.decryptString(bytes)));
        if (row.apiKey === config.apiKey && typeof row.user === 'string' && row.user.length > 0 && row.user.length <= 80 && isToken(row.key)) {
          result.account = { user: row.user, key: row.key, enabled: row.enabled === true };
        }
      } catch { /* No usable session. */ }
    }
    return result;
  }
  private persistent() { return this.storage.isEncryptionAvailable() && (process.platform !== 'linux' || this.storage.getSelectedStorageBackend() !== 'basic_text'); }
  status(): LastFmStatus {
    return { configured: !!this.config, persistent: this.persistent(), user: this.account?.user, enabled: this.account?.enabled === true,
      waiting: this.token && this.token.until > Date.now() || undefined, issue: this.issue };
  }
  private changed() { const status = this.status(); this.onChange?.(status); return status; }
  private async save() {
    if (!this.persistent() || !this.account || !this.config) return;
    const payload = this.storage.encryptString(JSON.stringify({ ...this.account, apiKey: this.config.apiKey }));
    const tmp = `${this.file}.tmp`;
    await mkdir(dirname(this.file), { recursive: true });
    try { await writeFile(tmp, payload, { mode: 0o600 }); await rename(tmp, this.file); }
    finally { await rm(tmp, { force: true }).catch(() => {}); }
  }
  private async execute(action: () => Promise<void>) {
    if (this.working) return this.status();
    this.working = true;
    this.issue = undefined;
    try { await action(); }
    catch (error) { this.issue = error instanceof ServiceError ? error.code === 14 ? 'authorize' : 'rejected' : 'offline'; }
    finally { this.working = false; }
    return this.changed();
  }
  private async request(method: string, fields: Record<string, string>, post = false, parent = this.requests.signal) {
    const config = this.config;
    if (!config) throw new ServiceError(10);
    const signal = AbortSignal.any([parent, AbortSignal.timeout(9500)]);
    const form = signedLastFm({ api_key: config.apiKey, method, ...fields }, config.secret);
    const response = await this.fetcher(post ? API : `${API}?${form}`, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      ...(post && { method: 'POST', body: form }), headers: { Accept: 'application/json' } });
    const body = object(JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 64 * 1024, signal))));
    if (typeof body.error === 'number') throw new ServiceError(body.error);
    if (!response.ok) throw new ServiceError(0);
    return body;
  }
  begin(open: (url: string) => Promise<void>) {
    return this.execute(async () => {
      if (!this.config) return open(LASTFM_GUIDE);
      if (this.account) return;
      const result = await this.request('auth.getToken', {});
      if (!isToken(result.token)) throw new ServiceError(0);
      const url = new URL('https://www.last.fm/api/auth/');
      url.search = new URLSearchParams({ api_key: this.config.apiKey, token: result.token }).toString();
      await open(url.href);
      this.token = { value: result.token, until: Date.now() + 60 * 60_000 };
    });
  }
  finish() {
    return this.execute(async () => {
      if (!this.token || this.token.until <= Date.now()) { this.token = undefined; throw new ServiceError(14); }
      const result = await this.request('auth.getSession', { token: this.token.value });
      const session = object(result.session);
      this.token = undefined;
      if (!isToken(session.key) || typeof session.name !== 'string' || !session.name || session.name.length > 80) throw new ServiceError(0);
      this.account = { user: session.name, key: session.key, enabled: false };
      await this.save();
    });
  }
  enable(enabled: boolean) {
    return this.execute(async () => {
      if (!this.account) return;
      this.resetRequests();
      this.account = { ...this.account, enabled };
      this.startedAt = Math.floor(Date.now() / 1000);
      await this.save();
    });
  }
  private resetRequests() {
    this.requests.abort();
    this.requests = new AbortController();
    this.recent.clear();
    this.throttle = 0;
  }
  disconnect() {
    return this.execute(async () => {
      this.resetRequests();
      this.account = undefined;
      this.token = undefined;
      await rm(this.file, { force: true });
    });
  }
  async record(value: unknown) {
    const account = this.account;
    if (!account?.enabled || !this.config || this.pending >= 4 || this.throttle > Date.now()) return;
    const event = readListeningEvent(value, Math.floor(Date.now() / 1000));
    if (!event || event.started < this.startedAt) return;
    const key = JSON.stringify([event.kind, event.started, event.artist, event.title]);
    if (this.recent.has(key)) return;
    this.recent.add(key);
    if (this.recent.size > 128) this.recent.delete(this.recent.values().next().value!);
    const fields = { sk: account.key, artist: event.artist, track: event.title, ...(event.album && { album: event.album }),
      ...(event.duration > 0 && { duration: String(event.duration) }), ...(event.kind === 'scrobble' && { timestamp: String(event.started) }) };
    const signal = this.requests.signal;
    this.pending++;
    try {
      const result = await this.request(event.kind === 'now' ? 'track.updateNowPlaying' : 'track.scrobble', fields, true, signal);
      if (this.account !== account) return;
      const accepted = object(object(result.scrobbles)['@attr']).accepted;
      if (event.kind === 'scrobble' && accepted !== 1 && accepted !== '1') this.issue = 'rejected';
      else this.issue = undefined;
    } catch (error) {
      if (signal.aborted || this.account !== account) return;
      const code = error instanceof ServiceError ? error.code : 0;
      if (code === 9) {
        await this.disconnect();
        this.issue = 'expired';
      } else {
        if (code === 29) this.throttle = Date.now() + 60_000;
        this.issue = code && code !== 29 ? 'rejected' : 'offline';
      }
    } finally { this.pending--; if (!signal.aborted || this.issue === 'expired') this.changed(); }
  }
}
