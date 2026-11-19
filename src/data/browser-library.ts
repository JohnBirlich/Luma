import { audioMime, emptyImport, readGenres, trackInfo, usableArtwork } from '../shared/media';
import type { ImportResult, Track } from '../shared/media';
import type { LibrarySource } from './library';
import { recordDiagnostic } from './diagnostics';

import { readAudioFormat } from '../shared/audio-quality';
import { readLocalLyrics } from '../shared/lyrics';
import type { AudioFormat } from '../shared/audio-quality';

type Info = ReturnType<typeof trackInfo>;
interface StoredTrack extends Info {
  id: string;
  signature: string;
  addedAt: number;
  audio: Blob;
  artwork?: Blob;
  format?: AudioFormat;
  embeddedLyrics?: string;
  textVersion?: 1;
}
interface SessionEntry {
  record: StoredTrack;
  track: Track;
  persisted: boolean;
}

const STORE = 'tracks';
let entries: SessionEntry[] = [];
let load: Promise<void> | undefined;
let database: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('luma-local-library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Library database is blocked'));
    });
  }
  return database;
}

async function readRecords() {
  const connection = await db();
  return new Promise<StoredTrack[]>((resolve, reject) => {
    const request = connection.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredTrack[]);
    request.onerror = () => reject(request.error);
  });
}

async function writeRecord(write: (store: IDBObjectStore) => IDBRequest) {
  const connection = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    write(transaction.objectStore(STORE));
  });
}

function makeEntry(record: StoredTrack, persisted: boolean): SessionEntry {
  const { id, audio, artwork, title, artist, album, duration, textVersion, genres } = record;
  const info = textVersion === 1 ? { title, artist, album, duration, genres: readGenres(genres) } : trackInfo(title, record, duration);
  return {
    persisted, record,
    track: { id, ...info, format: readAudioFormat(record.format), embeddedLyrics: readLocalLyrics(record.embeddedLyrics)?.plain, audioUrl: URL.createObjectURL(audio), artworkUrl: artwork && URL.createObjectURL(artwork) },
  };
}

function ensureLoaded() {
  load ??= readRecords().then((records) => { entries = records.sort((a, b) => a.addedAt - b.addedAt).map((record) => makeEntry(record, true)); }).catch(() => {
    recordDiagnostic('library.storage');
    // Some embedded previews and private windows disallow IndexedDB. Import still works in memory.
  });
  return load;
}

const tracks = () => entries.map((entry) => entry.track);

async function add(files: File[]): Promise<ImportResult> {
  await ensureLoaded();
  const result = emptyImport([]);
  const known = new Set(entries.map(({ record }) => record.signature));
  for (const file of files) {
    const mime = audioMime(file.name);
    if (!mime || !file.size) {
      result.failures.push({ name: file.name, message: 'Формат не поддерживается или файл пуст.' });
      continue;
    }
    const signature = JSON.stringify([file.name, file.size, file.lastModified]);
    if (known.has(signature)) {
      result.duplicates++;
      continue;
    }
    const metadata = await import('music-metadata').then(({ parseBlob }) => parseBlob(file, { duration: true })).catch(() => undefined);
    const art = usableArtwork(metadata?.common.picture);
    const record: StoredTrack = {
      id: crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, '0')).join(''),
      signature, addedAt: Date.now(), textVersion: 1,
      ...trackInfo(file.name, metadata?.common, metadata?.format.duration),
      format: readAudioFormat(metadata?.format),
      embeddedLyrics: readLocalLyrics(metadata?.common.lyrics?.find(({ text }) => text)?.text)?.plain,
      audio: file.slice(0, file.size, mime),
      artwork: art ? new Blob([Uint8Array.from(art.image.data)], { type: art.mime }) : undefined,
    };
    const persisted = await writeRecord((store) => store.put(record)).then(() => true, () => false);
    entries.push(makeEntry(record, persisted));
    if (!persisted) result.temporary = true;
    known.add(signature);
    result.added.push(record.id);
  }
  result.tracks = tracks();
  return result;
}

export const browserLibrary: LibrarySource = {
  async list() { await ensureLoaded(); return tracks(); },
  add,
  async remove(id): Promise<Track[]> {
    await ensureLoaded();
    const entry = entries.find(({ record }) => record.id === id);
    if (!entry) return tracks();
    if (entry.persisted) await writeRecord((store) => store.delete(id));
    entries = entries.filter(({ record }) => record.id !== id);
    URL.revokeObjectURL(entry.track.audioUrl);
    if (entry.track.artworkUrl) URL.revokeObjectURL(entry.track.artworkUrl);
    return tracks();
  },
};
