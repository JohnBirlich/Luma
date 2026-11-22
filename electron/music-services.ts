import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SafeStorage } from 'electron';
import { createGeniusLookup } from '../src/shared/genius.js';
import { createJamendoSearch } from '../src/shared/jamendo.js';
import { readListeningEvent } from '../src/shared/lastfm.js';
import { createListenBrainzApi, listenBrainzUser } from '../src/shared/listenbrainz.js';
import { serviceCredential, serviceQuery } from '../src/shared/music-services.js';
import type { CredentialService, MusicServiceIssue, MusicServiceStatus } from '../src/shared/music-services.js';
import { catalogObject as object, catalogRetryDelay } from '../src/shared/online.js';
import type { OnlineTrack } from '../src/shared/online.js';
import { PublicHttpError } from '../src/shared/public-json.js';
import type { PublicApiFetch } from '../src/shared/public-json.js';

interface ListenBrainzAccount { token: string; user: string; enabled: boolean }
interface Credentials { jamendo?: string; genius?: string; listenbrainz?: ListenBrainzAccount }
const FILE_LIMIT = 8192;
class ServiceError extends Error {
  constructor(readonly issue: MusicServiceIssue) { super('Music service request failed'); }
}
function issueOf(error: unknown): MusicServiceIssue {
  if (error instanceof ServiceError) return error.issue;
  if (error instanceof PublicHttpError) {
    if ([400, 401, 403].includes(error.status)) return 'rejected';
    if (error.status === 429) return 'rate';
  }
  return 'offline';
}

/** Credentials and write consent live only in the main process. The bridge never returns them. */
export class DesktopMusicServices {
  private credentials: Credentials = {};
  private working = false;
  private issues: Partial<Record<CredentialService, MusicServiceIssue>> = {};
  private readonly genius;
  private readonly jamendo;
  private readonly listenbrainz;
  private listens = new AbortController();
  private jamendoRequest?: { id: number; controller: AbortController; result: Promise<OnlineTrack[]> };
  private optedInAt: number;
  private posting = false;
  private retryAt = 0;
  private seen = new Set<string>();
  onChange?: (service: CredentialService, status: MusicServiceStatus) => void;

  private constructor(private file: string, private storage: SafeStorage, fetcher: PublicApiFetch, version: string, private now: () => number) {
    this.genius = createGeniusLookup(fetcher);
    this.jamendo = createJamendoSearch(fetcher);
    this.listenbrainz = createListenBrainzApi(fetcher, version);
    this.optedInAt = Math.floor(this.now() / 1000);
  }

  static async open(file: string, storage: SafeStorage, fetcher: PublicApiFetch, version: string, now = Date.now) {
    const result = new DesktopMusicServices(file, storage, fetcher, version, now);
    if (!result.persistent()) return result;
    try {
      const handle = await open(file, 'r');
      try {
        const bytes = Buffer.alloc(FILE_LIMIT + 1);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (!bytesRead || bytesRead > FILE_LIMIT) return result;
        const row = object(JSON.parse(storage.decryptString(bytes.subarray(0, bytesRead))));
        result.credentials.jamendo = serviceCredential('jamendo', row.jamendo);
        result.credentials.genius = serviceCredential('genius', row.genius);
        const account = object(row.listenbrainz);
        const token = serviceCredential('listenbrainz', account.token);
        const user = listenBrainzUser({ valid: true, user_name: account.user });
        if (token && user) result.credentials.listenbrainz = { token, user, enabled: account.enabled === true };
      } finally { await handle.close(); }
    } catch { /* Missing or invalid encrypted profile; no plaintext fallback. */ }
    return result;
  }

  private persistent() { return this.storage.isEncryptionAvailable() && (process.platform !== 'linux' || this.storage.getSelectedStorageBackend() !== 'basic_text'); }
  status(service: CredentialService): MusicServiceStatus {
    const account = service === 'listenbrainz' ? this.credentials.listenbrainz : undefined;
    return { configured: !!this.credentials[service], persistent: this.persistent(), enabled: account?.enabled === true,
      user: account?.user, issue: this.issues[service] };
  }
  private changed(service: CredentialService) {
    const status = this.status(service);
    this.onChange?.(service, status);
    return status;
  }

  private async save(next: Credentials) {
    if (!this.persistent()) return;
    const temp = `${this.file}.tmp`;
    try {
      if (!next.jamendo && !next.genius && !next.listenbrainz) { await rm(this.file, { force: true }); return; }
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temp, this.storage.encryptString(JSON.stringify(next)), { mode: 0o600 });
      await rename(temp, this.file);
    } catch { throw new ServiceError('storage'); }
    finally { await rm(temp, { force: true }).catch(() => {}); }
  }
  private async change(service: CredentialService, run: () => Promise<void>) {
    if (this.working) return { ...this.status(service), issue: 'busy' as const };
    this.working = true;
    delete this.issues[service];
    try { await run(); }
    catch (error) { this.issues[service] = issueOf(error); }
    finally { this.working = false; }
    return this.changed(service);
  }
  private stopSubmissions() {
    this.listens.abort();
    this.listens = new AbortController();
  }
  configure(service: CredentialService, value: unknown) {
    return this.change(service, async () => {
      const token = serviceCredential(service, value);
      if (!token) throw new ServiceError('credentials');
      if (service === 'listenbrainz') {
        const user = await this.listenbrainz.validate(token, AbortSignal.timeout(8000));
        if (!user) throw new ServiceError('rejected');
        // Connecting a token never authorizes writing, even when reconnecting the same account.
        this.stopSubmissions();
        this.seen.clear();
        const prior = this.credentials.listenbrainz;
        if (prior) this.credentials = { ...this.credentials, listenbrainz: { ...prior, enabled: false } };
        const next = { ...this.credentials, listenbrainz: { token, user, enabled: false } };
        await this.save(next);
        this.credentials = next;
      } else {
        const next = { ...this.credentials, [service]: token };
        await this.save(next);
        this.credentials = next;
        if (service === 'jamendo') this.jamendoRequest?.controller.abort();
      }
    });
  }
  remove(service: CredentialService) {
    return this.change(service, async () => {
      if (service === 'listenbrainz') {
        this.stopSubmissions();
        this.seen.clear();
        const account = this.credentials.listenbrainz;
        if (account) this.credentials = { ...this.credentials, listenbrainz: { ...account, enabled: false } };
      }
      const next = { ...this.credentials };
      delete next[service];
      await this.save(next);
      this.credentials = next;
      if (service === 'jamendo') this.jamendoRequest?.controller.abort();
    });
  }
  enableListens(enabled: boolean) {
    return this.change('listenbrainz', async () => {
      const account = this.credentials.listenbrainz;
      if (!account) throw new ServiceError('credentials');
      const next = { ...this.credentials, listenbrainz: { ...account, enabled } };
      if (!enabled) { this.stopSubmissions(); this.credentials = next; }
      await this.save(next);
      this.credentials = next;
      if (enabled) this.optedInAt = Math.ceil(this.now() / 1000);
    });
  }

  async searchJamendo(id: unknown, query: unknown) {
    if (!this.credentials.jamendo || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !serviceQuery(query)) return [];
    const previous = this.jamendoRequest;
    previous?.controller.abort();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    const result = (async () => {
      if (previous) await previous.result.catch(() => {});
      signal.throwIfAborted();
      return this.jamendo(query, this.credentials.jamendo, signal);
    })();
    this.jamendoRequest = { id, controller, result };
    try { return await result; }
    finally { if (this.jamendoRequest?.controller === controller) this.jamendoRequest = undefined; }
  }
  cancelJamendo(id: unknown) { if (this.jamendoRequest?.id === id) this.jamendoRequest?.controller.abort(); }
  searchGenius(query: unknown) { return this.genius.search(query, this.credentials.genius, AbortSignal.timeout(9000)); }
  geniusAnnotations(id: unknown) { return this.genius.annotations(id, this.credentials.genius, AbortSignal.timeout(9000)); }

  async recordLocal(id: string, value: unknown) {
    const account = this.credentials.listenbrainz, now = this.now();
    if (!account?.enabled || this.working || this.posting || now < this.retryAt || this.issues.listenbrainz === 'rejected') return;
    const event = readListeningEvent(value, Math.floor(now / 1000));
    if (event?.kind !== 'scrobble' || event.started < this.optedInAt) return;
    const key = `${event.started}:${id}`;
    if (this.seen.has(key)) return;
    if (this.seen.size >= 128) this.seen.delete(this.seen.values().next().value!);
    this.seen.add(key);
    const parent = this.listens.signal;
    this.posting = true;
    try {
      if (!await this.listenbrainz.submit(account.token, event, parent)) throw new ServiceError('rejected');
      if (!parent.aborted) delete this.issues.listenbrainz;
    } catch (error) {
      if (parent.aborted) return;
      const issue = issueOf(error);
      this.issues.listenbrainz = issue;
      if (issue === 'rate') this.retryAt = this.now() + catalogRetryDelay(null);
    } finally {
      this.posting = false;
      if (!parent.aborted) this.changed('listenbrainz');
    }
  }
}
