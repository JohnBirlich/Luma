import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import { parseFile } from 'music-metadata';
import { readLocalLyrics } from '../src/shared/lyrics.js';
import { audioMime, emptyImport, readGenres, trackInfo, usableArtwork } from '../src/shared/media.js';
import { readAudioFormat } from '../src/shared/audio-quality.js';
import type { AudioFormat } from '../src/shared/audio-quality.js';
import type { ImportResult, Track } from '../src/shared/media.js';

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const COVER_EXTENSIONS = new Set(['jpg', 'png', 'webp', 'gif', 'avif']);
export const APP_ORIGIN = 'luma://app';

interface Entry extends ReturnType<typeof trackInfo> {
  id: string;
  path: string;
  coverExtension?: string;
  format?: AudioFormat;
  textVersion?: 1;
}

function isLocalPath(path: string): boolean {
  return isAbsolute(path) && (process.platform !== 'win32' || /^[a-z]:[\\/]/i.test(path));
}

function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<Entry>;
  return typeof entry.id === 'string' && UUID.test(entry.id)
    && typeof entry.path === 'string' && isLocalPath(entry.path) && !!audioMime(entry.path)
    && typeof entry.title === 'string' && typeof entry.artist === 'string' && typeof entry.album === 'string'
    && typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration >= 0
    && (entry.coverExtension === undefined || COVER_EXTENSIONS.has(entry.coverExtension));
}

const pathKey = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;

export class DesktopLibrary {
  private entries: Entry[];
  private mutations: Promise<unknown> = Promise.resolve();

  private constructor(private directory: string, entries: Entry[]) {
    this.entries = entries;
  }

  static async open(directory: string) {
    await mkdir(join(directory, 'covers'), { recursive: true });
    const index = join(directory, 'library.json');
    try {
      const data: unknown = JSON.parse(await readFile(index, 'utf8'));
      if (!Array.isArray(data)) throw new SyntaxError('Invalid library index');
      return new DesktopLibrary(directory, data.filter(isEntry));
    } catch (error) {
      if (error instanceof SyntaxError) {
        await rename(index, `${index}.invalid-${Date.now()}`);
      } else if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return new DesktopLibrary(directory, []);
    }
  }

  list(): Track[] {
    return this.entries.map(({ id, path, title, artist, album, duration, coverExtension, textVersion, genres, format }) => {
      const tags = { title, artist, album };
      const tagsGenres = readGenres(genres);
      // Old profiles are repaired for display without rewriting their metadata or changing track IDs.
      const info = textVersion === 1 ? { ...tags, duration, ...(tagsGenres && { genres: tagsGenres }) } : trackInfo(basename(path), tags, duration);
      return {
        id, ...info, format: readAudioFormat(format), audioUrl: `${APP_ORIGIN}/media/audio/${id}`,
        artworkUrl: coverExtension ? `${APP_ORIGIN}/media/cover/${id}` : undefined,
      };
    });
  }

  mediaPath(id: string, kind: 'audio' | 'cover'): string | undefined {
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) return undefined;
    return kind === 'audio' ? entry.path : this.coverPath(entry);
  }

  async audioFormat(id: unknown): Promise<AudioFormat | null> {
    const entry = typeof id === 'string' && UUID.test(id) ? this.entries.find((track) => track.id === id) : undefined;
    if (!entry) return null;
    const existing = readAudioFormat(entry.format);
    if (existing) return existing;
    const tags = await parseFile(entry.path, { skipCovers: true }).catch(() => undefined);
    return readAudioFormat(tags?.format) ?? null;
  }

  async lyrics(id: unknown) {
    const entry = typeof id === 'string' && UUID.test(id) ? this.entries.find((track) => track.id === id) : undefined;
    if (!entry) return null;
    const sidecar = `${entry.path.slice(0, -extname(entry.path).length)}.lrc`;
    const info = await lstat(sidecar).catch(() => undefined);
    if (info?.isFile() && info.size <= 128 * 1024) {
      const synced = readLocalLyrics(undefined, await readFile(sidecar, 'utf8').catch(() => undefined));
      if (synced) return synced;
    }
    if (extname(entry.path).toLowerCase() !== '.mp3') return null;
    const tags = await parseFile(entry.path, { skipCovers: true }).catch(() => undefined);
    return readLocalLyrics(tags?.common.lyrics?.find(({ text }) => text)?.text);
  }

  importPaths(paths: string[]): Promise<ImportResult> {
    return this.serialize(async () => {
      const result = emptyImport([]);
      const known = new Set(this.entries.map((item) => pathKey(item.path)));
      const additions: Entry[] = [];
      for (const input of paths) {
        const name = basename(input);
        if (!isLocalPath(input) || !audioMime(name)) {
          result.failures.push({ name, message: 'Неподдерживаемый тип локального аудиофайла.' });
          continue;
        }
        let path: string;
        try {
          path = await realpath(input);
          if (!isLocalPath(path) || !audioMime(path)) throw new Error('Not a local audio path');
          const info = await stat(path);
          if (!info.isFile() || !info.size) throw new Error('Not a non-empty file');
        } catch {
          result.failures.push({ name, message: 'Файл не найден или недоступен.' });
          continue;
        }
        if (known.has(pathKey(path))) {
          result.duplicates++;
          continue;
        }
        // An untagged file (or one the tag parser cannot read) can still be playable.
        const metadata = await parseFile(path, { duration: true }).catch(() => undefined);
        const entry: Entry = {
          id: randomUUID(), path, textVersion: 1, format: readAudioFormat(metadata?.format),
          ...trackInfo(name, metadata?.common, metadata?.format.duration),
        };
        const artwork = usableArtwork(metadata?.common.picture);
        if (artwork) {
          entry.coverExtension = artwork.extension;
          try {
            await writeFile(this.coverPath(entry)!, artwork.image.data);
          } catch {
            delete entry.coverExtension;
          }
        }
        additions.push(entry);
        known.add(pathKey(path));
      }
      if (additions.length) {
        try {
          await this.save([...this.entries, ...additions]);
        } catch (error) {
          await Promise.all(additions.map((entry) => this.deleteCover(entry)));
          throw error;
        }
      }
      result.tracks = this.list();
      result.added = additions.map(({ id }) => id);
      return result;
    });
  }

  remove(id: string): Promise<Track[]> {
    return this.serialize(async () => {
      const entry = this.entries.find((item) => item.id === id);
      if (entry) {
        await this.save(this.entries.filter((item) => item.id !== id));
        await this.deleteCover(entry);
      }
      return this.list();
    });
  }

  private coverPath(entry: Entry) {
    return entry.coverExtension && join(this.directory, 'covers', `${entry.id}.${entry.coverExtension}`);
  }

  private async deleteCover(entry: Entry) {
    const cover = this.coverPath(entry);
    if (cover) await rm(cover, { force: true }).catch(() => undefined);
  }

  private serialize<T>(task: () => Promise<T>) {
    const operation = this.mutations.then(task);
    this.mutations = operation.catch(() => undefined);
    return operation;
  }

  private async save(entries: Entry[]) {
    const path = join(this.directory, 'library.json');
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(entries, null, 2), 'utf8');
    await rename(temporary, path);
    this.entries = entries;
  }
}
