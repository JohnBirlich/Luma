import { archiveId, catalogLicense, catalogObject as object, readOnlineTrack } from './online.js';
import type { CommunitySource, OnlineTrack } from './online.js';
import { musicSearchKey } from './russian.js';
import { readLimitedBody } from './metadata-service.js';

const list = (value: unknown, max: number) => Array.isArray(value) ? value.slice(0, max) : [];
const str = (value: unknown) => typeof value === 'string' ? value : '';
const byName = (value: unknown) => Array.isArray(value) ? str(value[0]) : str(value);
const duration = (value: unknown) => /^\d{1,3}:\d{2}$/.test(str(value)) ? str(value).split(':').reduce((a, b) => a * 60 + Number(b), 0) : Number(value);

export function mixterResults(data: unknown): OnlineTrack[] {
  return list(data, 18).flatMap((value) => {
    const row = object(value), extra = object(row.upload_extra);
    const tags = str(row.upload_tags).split(',');
    if (extra.nsfw !== false || !tags.includes('remix')) return [];
    const license = catalogLicense(row.license_url);
    const file = list(row.files, 12).map(object).find((file) => file.file_order === 0 && file.file_is_remote === 0
      && object(file.file_format_info).mime_type === 'audio/mpeg' && object(file.file_extra).type !== 'samples');
    if (!license || !file) return [];
    const track = readOnlineTrack({ title: row.upload_name, artist: row.user_real_name || row.user_name,
      genres: str(extra.usertags).split(','), duration: duration(object(file.file_format_info).ps), audioUrl: file.download_url,
      online: { source: 'ccmixter', page: row.file_page_url, licenseUrl: license.url } });
    return track ? [track] : [];
  });
}

export function archiveTracks(item: string, data: unknown): OnlineTrack[] {
  const row = object(data), meta = object(row.metadata);
  const license = catalogLicense(meta.licenseurl);
  if (!archiveId(item) || meta.identifier !== item || meta.mediatype !== 'audio' || ![meta.collection].flat().includes('netlabels')
    || !license || row.is_dark || meta.access_restricted_item || meta.private) return [];
  return list(row.files, 240).map(object).flatMap((file) => {
    const name = str(file.name);
    if (file.source !== 'original' || !['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', '320Kbps MP3', '192Kbps MP3'].includes(str(file.format))
      || !file.title || file.private || !name || name.length > 200 || /[\\/:#?%\u0000-\u001f\u007f]/.test(name)) return [];
    const track = readOnlineTrack({ title: file.title, artist: file.artist || file.creator || byName(meta.creator),
      album: file.album || meta.title, genres: [file.genre, ...[meta.subject].flat().slice(0, 10)], duration: duration(file.length),
      audioUrl: `https://archive.org/download/${item}/${encodeURIComponent(name)}`,
      online: { source: 'netlabels', page: `https://archive.org/details/${item}`, licenseUrl: license.url } });
    return track ? [track] : [];
  }).slice(0, 28);
}

export function communitySearchUrl(query: string, source: CommunitySource) {
  if (source === 'ccmixter') {
    const url = new URL('https://ccmixter.org/api/query');
    url.search = new URLSearchParams({ f: 'json', limit: '14', tags: 'remix', search: query.trim().slice(0, 140) }).toString();
    return url;
  }
  // Treat user input as literal search words, not arbitrary advanced search syntax.
  const words = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 10).map((word) => `"${word.slice(0, 45)}"`);
  const term = words?.join(' AND ') || '"no-result"';
  const url = new URL('https://archive.org/advancedsearch.php');
  url.search = new URLSearchParams({ q: `collection:netlabels AND mediatype:audio AND licenseurl:* AND (${term})`, 'fl[]': 'identifier', rows: '4', output: 'json' }).toString();
  return url;
}

export async function searchCommunity(fetcher: (url: string, init?: RequestInit) => Promise<Response>, value: unknown, source: CommunitySource, signal: AbortSignal) {
  if (typeof value !== 'string' || value.length > 140 || !/[\p{L}\p{N}]/u.test(value) || value.trim().length < 2) return [];
  async function get(url: URL, limit: number) {
    const response = await fetcher(url.href, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => {});
      throw new Error('Каталог сейчас недоступен.');
    }
    return JSON.parse(new TextDecoder().decode(await readLimitedBody(response, limit, signal))) as unknown;
  }
  const results = await get(communitySearchUrl(value, source), 768 * 1024);
  if (source === 'ccmixter') {
    if (!Array.isArray(results)) throw new Error('Каталог вернул неожиданный ответ.');
    return mixterResults(results);
  }
  const response = object(object(results).response);
  if (!Array.isArray(response.docs)) throw new Error('Каталог вернул неожиданный ответ.');
  const items = [...new Set(list(response.docs, 4).map((row) => object(row).identifier).filter(archiveId))];
  const metadata = await Promise.allSettled(items.map(async (id) => archiveTracks(id, await get(new URL(`https://archive.org/metadata/${id}`), 2 * 1024 * 1024))));
  if (metadata.length && metadata.every((entry) => entry.status === 'rejected')) throw new Error('Каталог сейчас недоступен.');
  const scores = (track: OnlineTrack) => musicSearchKey(`${track.title} ${track.artist} ${track.album}`).includes(musicSearchKey(value)) ? 1 : 0;
  return metadata.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []).sort((a, b) => scores(b) - scores(a)).slice(0, 18);
}
