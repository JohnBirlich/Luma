import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SafeStorage } from 'electron';
import { LASTFM_GUIDE, readListeningEvent } from '../src/shared/lastfm.js';
import type { LastFmIssue, LastFmStatus } from '../src/shared/lastfm.js';
import { readLimitedBody } from '../src/shared/metadata-service.js';

const API = 'https://ws.audioscrobbler.com/2.0/';
const isKey = (value: string): boolean => /^[\da-f]{32}$/i.test(value);
const isToken = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_-]{16,128}$/i.test(value);
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
interface Config { apiKey: string; secret: string }
interface SessionState { user: string; key: string; enabled: boolean }

export function lastFmConfig(apiKey: unknown, secret: unknown): Config | undefined {
  if (typeof apiKey !== 'string' || typeof secret !== 'string' || apiKey.length > 128 || secret.length > 128) return;
  const cleanKey = apiKey.trim(), cleanSecret = secret.trim();
  if (isKey(cleanKey) && isKey(cleanSecret)) return { apiKey: cleanKey, secret: cleanSecret };
}

export function signedLastFm(params: Record<string, string>, secret: string) {
  const entries = Object.entries(params).filter(([name]) => !['format', 'callback', 'api_sig'].includes(name)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const signature = createHash('md5').update(entries.map(([name, value]) => name + value).join('') + secret, 'utf8').digest('hex');
  return new URLSearchParams([...entries, ['api_sig', signature], ['format', 'json']]);
}

const API_ISSUES: Readonly<Partial<Record<number, LastFmIssue>>> = {
  9: 'expired', 10: 'key', 11: 'service', 13: 'signature', 14: 'authorize', 15: 'tokenExpired', 16: 'service', 26: 'suspended', 29: 'rate',
};
class ServiceError extends Error {
  constructor(readonly issue: LastFmIssue, readonly apiCode?: number) { super('Last.fm request failed'); }
}
function apiFailure(code: number) { return new ServiceError(API_ISSUES[code] ?? 'rejected', code); }

export class DesktopLastFm {
  private local?: Config;
  private account?: SessionState;
  private token?: { value: string; until: number };
  private failure?: ServiceError;
  private startedAt = 0;
  private working = false;
  private requests = new AbortController();
  private recent = new Set<string>();
  private pending = 0;
  private throttle = 0;
  onChange?: (status: LastFmStatus) => void;

  private constructor(private environment: Config | undefined, private fetcher: Fetch, private file: string, private storage: SafeStorage) {}

  static async open(environment: Config | undefined, fetcher: Fetch, file: string, storage: SafeStorage) {
    const result = new DesktopLastFm(environment, fetcher, file, storage);
    if (result.persistent()) {
      try {
        const bytes = await readFile(file);
        if (bytes.length > 8192) return result;
        const row = object(JSON.parse(storage.decryptString(bytes)));
        const credentials = object(row.credentials);
        result.local = lastFmConfig(credentials.apiKey, credentials.secret);
        if (result.config && row.apiKey === result.config.apiKey && typeof row.user === 'string' && row.user.length > 0 && row.user.length <= 80 && isToken(row.key)) {
          result.account = { user: row.user, key: row.key, enabled: row.enabled === true };
        }
      } catch { /* No usable encrypted credentials/session. */ }
    }
    return result;
  }
  private get config() { return this.local ?? this.environment; }
  private persistent() { return this.storage.isEncryptionAvailable() && (process.platform !== 'linux' || this.storage.getSelectedStorageBackend() !== 'basic_text'); }
  status(): LastFmStatus {
    return { configured: !!this.config, persistent: this.persistent(), user: this.account?.user, enabled: this.account?.enabled === true,
      configuration: this.local ? 'local' : this.environment ? 'environment' : undefined,
      waiting: this.token && this.token.until > Date.now() || undefined, issue: this.failure?.issue, apiCode: this.failure?.apiCode };
  }
  private changed() { const status = this.status(); this.onChange?.(status); return status; }
  private async save(local: Config | undefined, account: SessionState | undefined) {
    if (!this.persistent()) return;
    const tmp = `${this.file}.tmp`;
    try {
      if (!local && !account) { await rm(this.file, { force: true }); return; }
      const payload = this.storage.encryptString(JSON.stringify({ credentials: local, ...(account && { ...account, apiKey: (local ?? this.environment)?.apiKey }) }));
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(tmp, payload, { mode: 0o600 });
      await rename(tmp, this.file);
    } catch { throw new ServiceError('storage'); }
    finally { await rm(tmp, { force: true }).catch(() => {}); }
  }
  private async execute(action: () => Promise<void>) {
    if (this.working) return this.status();
    this.working = true;
    this.failure = undefined;
    try { await action(); }
    catch (error) { this.failure = error instanceof ServiceError ? error : new ServiceError('offline'); }
    finally { this.working = false; }
    return this.changed();
  }
  configure(apiKey: unknown, secret: unknown) {
    return this.execute(async () => {
      const local = lastFmConfig(apiKey, secret);
      if (!local) throw new ServiceError('credentials');
      const same = this.config?.apiKey === local.apiKey && this.config.secret === local.secret;
      // Stop an old account before persisting new credentials; no work from that session may survive the change.
      if (!same) this.clearConnection();
      await this.save(local, this.account);
      this.local = local;
    });
  }
  forgetCredentials() {
    return this.execute(async () => {
      this.clearConnection();
      await this.save(undefined, undefined);
      this.local = undefined;
    });
  }
  private async request(method: string, fields: Record<string, string>, post = false, parent = this.requests.signal) {
    const config = this.config;
    if (!config) throw new ServiceError('credentials');
    const signal = AbortSignal.any([parent, AbortSignal.timeout(9500)]);
    const form = signedLastFm({ api_key: config.apiKey, method, ...fields }, config.secret);
    const response = await this.fetcher(post ? API : `${API}?${form}`, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      ...(post && { method: 'POST', body: form }), headers: { Accept: 'application/json' } });
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 64 * 1024, signal))); }
    catch {
      signal.throwIfAborted();
      throw new ServiceError(response.status >= 500 ? 'service' : response.status === 429 ? 'rate' : 'rejected');
    }
    const body = object(payload);
    if (typeof body.error === 'number' && Number.isSafeInteger(body.error) && body.error > 0 && body.error <= 999) throw apiFailure(body.error);
    if (!response.ok) throw new ServiceError(response.status >= 500 ? 'service' : response.status === 429 ? 'rate' : 'rejected');
    return body;
  }
  begin(open: (url: string) => Promise<void>) {
    return this.execute(async () => {
      const launch = async (url: string) => {
        try { await open(url); } catch { throw new ServiceError('browser'); }
      };
      if (!this.config) return launch(LASTFM_GUIDE);
      if (this.account) return;
      this.token = undefined;
      const result = await this.request('auth.getToken', {});
      if (!isToken(result.token)) throw new ServiceError('rejected');
      const url = new URL('https://www.last.fm/api/auth/');
      url.search = new URLSearchParams({ api_key: this.config.apiKey, token: result.token }).toString();
      await launch(url.href);
      this.token = { value: result.token, until: Date.now() + 60 * 60_000 };
    });
  }
  finish() {
    return this.execute(async () => {
      if (!this.token || this.token.until <= Date.now()) { this.token = undefined; throw new ServiceError('tokenExpired'); }
      let result: Record<string, unknown>;
      try { result = await this.request('auth.getSession', { token: this.token.value }); }
      catch (error) {
        // An unconfirmed token (14) remains usable. Invalid or expired tokens must be renewed.
        if (error instanceof ServiceError && (error.apiCode === 4 || error.apiCode === 15)) {
          this.token = undefined;
          throw new ServiceError('tokenExpired', error.apiCode);
        }
        throw error;
      }
      const session = object(result.session);
      this.token = undefined;
      if (!isToken(session.key) || typeof session.name !== 'string' || !session.name || session.name.length > 80) throw new ServiceError('rejected');
      this.account = { user: session.name, key: session.key, enabled: false };
      await this.save(this.local, this.account);
    });
  }
  enable(enabled: boolean) {
    return this.execute(async () => {
      if (!this.account) return;
      this.resetRequests();
      this.account = { ...this.account, enabled };
      this.startedAt = Math.floor(Date.now() / 1000);
      await this.save(this.local, this.account);
    });
  }
  private resetRequests() {
    this.requests.abort();
    this.requests = new AbortController();
    this.recent.clear();
    this.throttle = 0;
  }
  private clearConnection() {
    this.resetRequests();
    this.account = undefined;
    this.token = undefined;
  }
  disconnect() {
    return this.execute(async () => {
      this.clearConnection();
      await this.save(this.local, undefined);
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
      this.failure = event.kind === 'scrobble' && accepted !== 1 && accepted !== '1' ? new ServiceError('ignored') : undefined;
    } catch (error) {
      if (signal.aborted || this.account !== account) return;
      const failure = error instanceof ServiceError ? error : new ServiceError('offline');
      if (failure.issue === 'expired') {
        await this.execute(async () => {
          this.clearConnection();
          await this.save(this.local, undefined);
          throw failure;
        });
        return;
      }
      if (failure.issue === 'rate' || failure.issue === 'service') this.throttle = Date.now() + 60_000;
      this.failure = failure;
    } finally { this.pending--; if (!signal.aborted) this.changed(); }
  }
}
