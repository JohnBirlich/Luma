import { parseDocument, visit } from 'yaml';
import type { LyricLine, TimedWord } from './lyrics.js';
import { artistCreditKey, cleanTrackText, musicSearchKey } from './russian.js';

const MAX_LYRICSFILE = 256 * 1024;
const MAX_LINES = 600;
const MAX_WORDS_PER_LINE = 80;
const MAX_NODE_DEPTH = 12;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const stamp = (value: unknown, min: number, max: number): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= min && value <= max;
// Keep the separators carried in the word segments; they are needed to reconstruct the line.
const lineText = (value: unknown) => typeof value === 'string' && value.length <= 1000 ? value.replace(/\p{Cc}/gu, ' ') : undefined;

function readWords(value: unknown, text: string, start: number, end: number): TimedWord[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > MAX_WORDS_PER_LINE) return;
  const words: TimedWord[] = [];
  let previous = start;
  for (const item of value) {
    const { text: raw, start_ms, end_ms } = record(item);
    const segment = lineText(raw);
    if (!segment?.trim() || !stamp(start_ms, previous, end) || (end_ms != null && !stamp(end_ms, start_ms, end))) return;
    words.push({ text: segment, time: start_ms / 1000, end: typeof end_ms === 'number' ? end_ms / 1000 : undefined });
    previous = start_ms;
  }
  // If the segments do not describe this line, keep the line timing without altering its text.
  return words.map((word) => word.text).join('').normalize('NFC') === text.normalize('NFC') ? words : undefined;
}

/** LRCLIB's Lyricsfile v1.0 draft. Fall back to the separate LRC if the format is not supported. */
export function readWordTimedLyrics(value: unknown, recording: { title: string; artist: string; duration: number }): LyricLine[] | undefined {
  if (typeof value !== 'string' || !value || value.length > MAX_LYRICSFILE) return;
  try {
    const doc = parseDocument(value, { schema: 'core', stringKeys: true, resolveKnownTags: false, merge: false, prettyErrors: false });
    if (doc.errors.length || doc.warnings.length) return;
    visit(doc, (_key, _node, parents) => {
      if (parents.length > MAX_NODE_DEPTH) throw new Error('Unsupported Lyricsfile depth');
    });
    const { version, metadata, lines } = record(doc.toJS({ maxAliasCount: 0 }));
    if (version !== '1.0' || !Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return;
    const { title, artist, duration_ms, offset_ms, instrumental } = record(metadata);
    const duration = recording.duration * 1000;
    if (instrumental === true || (offset_ms != null && offset_ms !== 0) // The draft does not define nonzero offsets yet.
      || musicSearchKey(cleanTrackText(title)) !== musicSearchKey(recording.title)
      || artistCreditKey(cleanTrackText(artist)) !== artistCreditKey(recording.artist)
      || (duration_ms != null && !stamp(duration_ms, Math.max(1, duration - 2000), duration + 2000))) return;
    const limit = duration + 2000;
    const timed: LyricLine[] = [];
    let hasWords = false;
    for (const item of lines) {
      const { text: raw, start_ms, end_ms, words: segments } = record(item);
      const text = lineText(raw);
      if (text === undefined || !stamp(start_ms, 0, limit) || (end_ms != null && !stamp(end_ms, start_ms, limit))) return;
      const end = typeof end_ms === 'number' ? end_ms : undefined;
      const words = readWords(segments, text, start_ms, end ?? limit);
      if (words) hasWords = true;
      timed.push({ text, time: start_ms / 1000, end: end === undefined ? undefined : end / 1000, words });
    }
    return hasWords ? timed.sort((a, b) => a.time - b.time) : undefined;
  } catch { return undefined; }
}
