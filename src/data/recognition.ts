import { createMetadataService, readLimitedBody } from '../shared/metadata-service';
import { FINGERPRINT_SECONDS, isFingerprint, MAX_AUDIO_SECONDS, MIN_AUDIO_SECONDS, rankAppleCandidates } from '../shared/recognition';
import type { Track } from '../shared/media';
import { musicSearchKey } from '../shared/russian';

const webCatalog = createMetadataService();
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export async function lookupByTitle(track: Track, query: string, artist: string, locale: string, signal: AbortSignal) {
  const candidates = await (window.luma
    ? window.luma.recognition.search(query, locale)
    : webCatalog.search(query, locale, signal));
  signal.throwIfAborted();
  return rankAppleCandidates(candidates, query, artist, track.duration);
}

export async function lookupByMusicBrainz(track: Track, title: string, artist: string, album: string, signal: AbortSignal) {
  const bridge = window.luma?.recognition;
  if (!bridge) throw new Error('Поиск в MusicBrainz доступен в настольной Luma.');
  const isrc = musicSearchKey(title) === musicSearchKey(track.title) ? track.isrc : undefined;
  const candidates = await bridge.searchMusicBrainz({ title, artist, album, isrc, duration: track.duration });
  signal.throwIfAborted();
  return candidates;
}

export async function lookupByAudioDb(title: string, artist: string, signal: AbortSignal) {
  const candidates = await window.luma?.recognition.searchAudioDb({ title, artist }) ?? [];
  signal.throwIfAborted();
  return candidates;
}

export function canFingerprint(track: Track) {
  return !track.demo && !track.online && track.duration >= MIN_AUDIO_SECONDS && track.duration <= MAX_AUDIO_SECONDS
    && (track.audioUrl.startsWith('blob:') || track.audioUrl.startsWith('luma://app/media/audio/'));
}

function runFingerprint(channels: Float32Array<ArrayBuffer>[], sampleRate: number, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fingerprint.worker.ts', import.meta.url), { type: 'module' });
    function finish(error: unknown, compressed?: string) {
      worker.terminate();
      signal.removeEventListener('abort', abort);
      if (compressed) resolve(compressed);
      else reject(error);
    }
    function abort() { finish(signal.reason); }
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => finish(new Error('Не удалось вычислить отпечаток.'), typeof data === 'string' ? data : undefined);
    worker.onerror = () => finish(new Error('Распознавание звука недоступно в этом окружении.'));
    worker.postMessage({ channels, sampleRate }, channels.map(({ buffer }) => buffer));
  });
}

export async function lookupBySound(track: Track, signal: AbortSignal) {
  const bridge = window.luma?.recognition;
  if (!bridge || !canFingerprint(track)) throw new Error('Этот файл нельзя распознать по звуку. Попробуйте поиск по названию.');
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const response = await fetch(track.audioUrl, { signal: deadline, credentials: 'omit' });
  if (!response.ok) throw new Error('Не удалось прочитать локальный файл.');
  const bytes = await readLimitedBody(response, MAX_AUDIO_BYTES, deadline);
  // Decode off the playback graph at Chromaprint's target rate. Only the first two minutes are analyzed.
  const context = new OfflineAudioContext(1, 1, 11025);
  const audio = await context.decodeAudioData(bytes);
  deadline.throwIfAborted();
  const duration = Math.round(audio.duration);
  if (duration < MIN_AUDIO_SECONDS || duration > MAX_AUDIO_SECONDS) throw new Error('Длительность файла вне диапазона распознавания.');
  const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, index) =>
    audio.getChannelData(index).slice(0, FINGERPRINT_SECONDS * audio.sampleRate));
  const compressed = await runFingerprint(channels, audio.sampleRate, deadline);
  const fingerprint = { compressed, duration };
  if (!isFingerprint(fingerprint)) throw new Error('В файле слишком мало данных для распознавания.');
  // The IPC request contains only compact fingerprint data, never audio bytes, a filename, or tags.
  const result = await bridge.identify(fingerprint);
  deadline.throwIfAborted();
  return result;
}
