import { dialog, net } from 'electron';
import type { BrowserWindow } from 'electron';
import { open, rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseBuffer } from 'music-metadata';
import ID3 from 'node-id3';
import { decodeOpenverse, OPENVERSE_API, readOnlineTrack } from '../src/shared/online.js';
import { commonsMp3Export } from '../src/shared/online.js';
import type { OnlineTrack, Mp3ExportResult } from '../src/shared/online.js';
import { readLimitedBody } from '../src/shared/metadata-service.js';
import { readLyricsQuery } from '../src/shared/lyrics.js';
import type { Lyrics } from '../src/shared/lyrics.js';

const MAX_MP3 = 32 * 1024 * 1024;
const options = { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' } as const;

async function createFile(path: string, data: string | Uint8Array) {
  const file = await open(path, 'wx');
  try {
    try { await file.writeFile(data); } finally { await file.close(); }
  } catch (error) { await rm(path, { force: true }).catch(() => {}); throw error; }
}

async function getRecording(id: string, signal: AbortSignal) {
  const response = await net.fetch(`${OPENVERSE_API}${id.slice(3)}/?format=json`, { ...options, signal });
  if (!response.ok) { void response.body?.cancel().catch(() => {}); return; }
  return decodeOpenverse(JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 512 * 1024, signal))));
}

async function fetchMp3(track: OnlineTrack, signal: AbortSignal) {
  const response = await net.fetch(track.audioUrl, { ...options, signal });
  if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error('Источник не отдал файл.'); }
  const buffer = Buffer.from(await readLimitedBody(response, MAX_MP3, signal));
  const { format, common } = await parseBuffer(buffer, 'audio/mpeg', { duration: true });
  if (!format.codec?.endsWith(' Layer 3') || !format.duration) throw new Error('Источник не отдал MP3.');
  return { buffer, duration: format.duration, hasLyrics: Boolean(common.lyrics?.length) };
}

export function createOnlineExporter(lookup: (query: unknown, signal: AbortSignal) => Promise<Lyrics | null>) {
  let busy = false;
  return async (owner: BrowserWindow, value: unknown, wantsLyrics: unknown): Promise<Mp3ExportResult> => {
    const listed = readOnlineTrack(value);
    if (busy || !listed || !commonsMp3Export(listed)) throw new Error('Этот источник не поддерживает сохранение MP3.');
    busy = true;
    try {
      const title = listed.title.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').slice(0, 90).replace(/[. ]+$/, '') || 'Трек';
      const { canceled, filePath } = await dialog.showSaveDialog(owner, {
        title: 'Сохранить новый MP3', defaultPath: `${title}.mp3`, filters: [{ name: 'MP3', extensions: ['mp3'] }],
      });
      if (canceled || !filePath) return { saved: false };
      if (extname(filePath).toLowerCase() !== '.mp3') throw new Error('Выберите имя файла с расширением .mp3.');
      // Recheck the catalog, license and URL in the main process. A renderer cannot supply arbitrary download URLs.
      const signal = AbortSignal.timeout(30_000);
      const actual = await getRecording(listed.id, signal);
      if (!actual || actual.id !== listed.id || actual.audioUrl !== listed.audioUrl || !commonsMp3Export(actual)) throw new Error('Запись изменилась или больше не доступна для сохранения.');
      const { buffer, duration, hasLyrics } = await fetchMp3(actual, signal);
      const query = readLyricsQuery({ ...actual, album: actual.album === 'Wikimedia Commons' ? undefined : actual.album, duration });
      const lyrics = wantsLyrics === true && query?.duration ? await lookup(query, signal).catch(() => null) : null;
      let data: Uint8Array = buffer;
      let lyricsState: Mp3ExportResult['lyrics'] = wantsLyrics === true ? 'missing' : undefined;
      if (lyrics?.plain && !lyrics.synced) {
        if (hasLyrics) lyricsState = 'existing';
        else {
          try {
            const tagged = ID3.update({ unsynchronisedLyrics: { language: 'und', text: lyrics.plain } }, buffer);
            if (Buffer.isBuffer(tagged)) { data = tagged; lyricsState = 'embedded'; }
          } catch { /* Save the original recording if its tags cannot be safely updated. */ }
        }
      }
      // Only newly created files are written; imports and existing .lrc files are never modified.
      try { await createFile(filePath, data); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Файл уже существует. Выберите новое имя.');
        throw new Error('Не удалось записать MP3 в выбранную папку.');
      }
      const stem = filePath.slice(0, -4);
      const credit = await createFile(`${stem}.source.txt`, `${actual.title}\n${actual.artist}\n${actual.online.page}\n${actual.online.license}: ${actual.online.licenseUrl}\n${lyricsState === 'embedded' ? 'Добавлен тег текста песни (LRCLIB, для личного использования).\n' : ''}`).then(() => true, () => false);
      if (lyrics?.synced) {
        lyricsState = await createFile(`${stem}.lrc`, `${lyrics.synced}\n`).then(() => 'sidecar', (error: NodeJS.ErrnoException) => error.code === 'EEXIST' ? 'existing' : 'missing');
      }
      return { saved: true, lyrics: lyricsState, credit };
    } finally { busy = false; }
  };
}
