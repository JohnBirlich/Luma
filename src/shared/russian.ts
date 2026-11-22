export const RUSSIAN_LOCALE = 'ru-RU';
const russianNumber = new Intl.NumberFormat(RUSSIAN_LOCALE, { maximumFractionDigits: 1 });
const cyrillicWord = /\p{Script=Cyrillic}{2,}/u;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const windows1251 = new TextDecoder('windows-1251');
const octets = Uint8Array.from({ length: 256 }, (_, index) => index);
const invert = (decoder: TextDecoder) => new Map([...decoder.decode(octets)].map((character, byte) => [character, byte]));
const latin = invert(new TextDecoder('windows-1252'));
const cyrillic = invert(windows1251);

export const formatRussianNumber = (value: number) => russianNumber.format(value);

/** Normalizes display text, without reinterpreting correctly entered Unicode. */
export function cleanTrackText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\p{Cc}+/gu, ' ').normalize('NFC').trim() : '';
}

function singleBytes(text: string, alphabet: ReadonlyMap<string, number>, allowLatin1 = false): Uint8Array | undefined {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    const byte = allowLatin1 && code <= 255 ? code : alphabet.get(text[index]);
    if (byte === undefined) return;
    bytes[index] = byte;
  }
  return bytes;
}

function utf8Cyrillic(bytes?: Uint8Array): string | undefined {
  if (!bytes) return;
  try {
    const value = utf8.decode(bytes);
    if (cyrillicWord.test(value)) return value;
  } catch { /* Not a complete UTF-8 sequence. */ }
}

/** Repair common MP3 tag mojibake only when there is evidence of Cyrillic. Don't transliterate names. */
export function readTrackTag(value?: string): string {
  if (!value) return '';
  const bytes = singleBytes(value, latin, true);
  // A valid, strict UTF-8 round trip is strong evidence, including UTF-8 misread as CP1251.
  const recovered = utf8Cyrillic(bytes ?? (/[РС]/u.test(value) ? singleBytes(value, cyrillic) : undefined));
  if (recovered) return cleanTrackText(recovered);

  // Old editors often mark CP1251 ID3v1/v2 strings as Latin-1. A run of encoded Russian letters
  // separates that case from legitimate short Latin accents in names such as Björk or Beyoncé.
  if (bytes) {
    const words = value.match(/[\p{L}\u00a8\u00b8]+/gu);
    const legacyWord = /^[\u00c0-\u00ff\u00a8\u00b8]{3,}$/u;
    const likelyRussian = words?.some((word) => {
      if (!legacyWord.test(word)) return false;
      const decoded = windows1251.decode(singleBytes(word, latin, true));
      return /^[а-яё]{3,}$/iu.test(decoded) && /[аеёиоуыэюя]/iu.test(decoded) && /[бвгджзйклмнпрстфхцчшщ]/iu.test(decoded);
    });
    if (likelyRussian) return cleanTrackText(windows1251.decode(bytes));
  }
  return cleanTrackText(value);
}

export function musicSearchKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase(RUSSIAN_LOCALE).replaceAll('ё', 'е').replace(/\s+/gu, ' ').trim();
}

/** Catalog credits sometimes omit a stylized final exclamation mark. Preserve internal punctuation. */
export function artistCreditKey(value: string) {
  return musicSearchKey(value).replace(/[!！]+$/u, '').trimEnd();
}
