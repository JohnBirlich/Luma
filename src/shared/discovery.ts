import type { Track } from './media.js';
import { musicSearchKey } from './russian.js';

export interface DiscoveryCard { id: string; title: string; query: string; tags: readonly string[]; color: string; mark: string; detail?: string }
const genre = (id: string, title: string, query: string, color: string, mark: string, ...tags: string[]): DiscoveryCard =>
  ({ id, title, query, color, mark, tags: [title, query, ...tags] });
export const GENRES: readonly DiscoveryCard[] = [
  genre('pop', 'Поп', 'pop', 'rose', 'POP', 'поп музыка', 'synthpop', 'electropop'),
  genre('rock', 'Рок', 'rock', 'mango', 'ROCK', 'альтернатива', 'alternative rock', 'indie rock', 'punk'),
  genre('electronic', 'Электроника', 'electronic', 'blue', 'EL', 'electronica', 'edm', 'электронная', 'электронная музыка', 'idm'),
  genre('rap', 'Хип-хоп', 'hip hop', 'orchid', 'HH', 'rap', 'рэп', 'trap', 'трэп', 'hip-hop', 'rnb', 'r&b'),
  genre('indie', 'Инди', 'indie', 'lime', 'IND', 'indie pop', 'indie rock', 'dream pop', 'alternative'),
  genre('jazz', 'Джаз', 'jazz', 'aqua', 'JAZZ', 'smooth jazz', 'nu jazz', 'джаз фьюжн', 'swing', 'свинг'),
  genre('classical', 'Классика', 'classical', 'mango', 'CL', 'классическая музыка', 'baroque', 'piano', 'фортепиано', 'orchestral'),
  genre('ambient', 'Эмбиент', 'ambient', 'blue', 'AMB', 'эмбиент', 'chillout', 'downtempo', 'даунтемпо', 'drone'),
  genre('house', 'Хаус', 'house', 'aqua', 'HS', 'deep house', 'tech house', 'хаус'),
  genre('folk', 'Фолк', 'folk', 'lime', 'FLK', 'folk rock', 'фолк рок', 'народная', 'acoustic'),
  genre('metal', 'Метал', 'metal', 'rose', 'MTL', 'heavy metal', 'хэви метал', 'hard rock'),
  genre('synth', 'Синтвейв', 'synthwave', 'orchid', 'SYN', 'retrowave', 'ретровейв', 'synth pop'),
];
const tags = (...ids: string[]) => GENRES.filter(({ id }) => ids.includes(id)).flatMap(({ tags: aliases }) => aliases);
export const MOODS: readonly DiscoveryCard[] = [
  { id: 'calm', title: 'Спокойно', query: 'chillout', tags: tags('ambient', 'jazz'), color: 'orchid', mark: '≈' },
  { id: 'move', title: 'В движении', query: 'dance', tags: [...tags('house', 'rock', 'electronic'), 'dance', 'танцевальная'], color: 'mango', mark: '↗' },
  { id: 'focus', title: 'В фокусе', query: 'instrumental', tags: [...tags('ambient', 'classical'), 'instrumental', 'инструментальная', 'lofi', 'lo-fi'], color: 'blue', mark: '◉' },
  { id: 'night', title: 'Ночной ритм', query: 'synthwave', tags: tags('synth', 'rap', 'jazz'), color: 'rose', mark: '◐' },
  { id: 'coffee', title: 'Утро с кофе', query: 'acoustic', tags: tags('jazz', 'folk', 'indie'), color: 'mango', mark: '☕' },
  { id: 'travel', title: 'В дороге', query: 'indie rock', tags: tags('indie', 'rock', 'pop'), color: 'aqua', mark: '⇢' },
  { id: 'soft', title: 'Для сна', query: 'ambient', tags: tags('ambient'), color: 'lime', mark: '☾' },
  { id: 'pulse', title: 'На тренировку', query: 'electronic dance', tags: tags('rap', 'house', 'metal'), color: 'blue', mark: 'ϟ' },
];
export const EDITORIAL: readonly DiscoveryCard[] = [
  { id: 'city', title: 'Город после заката', query: 'synthwave', tags: tags('synth', 'electronic'), color: 'orchid', mark: '01', detail: 'Синтвейв и электронный ночной город' },
  { id: 'quiet', title: 'Тихая сторона', query: 'ambient piano', tags: tags('ambient', 'classical'), color: 'aqua', mark: '02', detail: 'Эмбиент и фортепиано' },
  { id: 'shift', title: 'Смена ритма', query: 'funk jazz', tags: [...tags('jazz', 'rap', 'house'), 'funk', 'фанк'], color: 'mango', mark: '03', detail: 'Джаз, фанк и биты' },
  { id: 'guitar', title: 'Гитары крупным планом', query: 'indie rock', tags: tags('rock', 'indie', 'folk'), color: 'rose', mark: '04', detail: 'От акустики до инди-рока' },
];
const tagKey = (text: string) => musicSearchKey(text).replace(/[-_\u2010-\u2015]/gu, ' ').replace(/\s+/g, ' ');

function matchAlias(genre: string, keys: readonly string[]) {
  const normalized = tagKey(genre);
  return keys.some((tag) => normalized === tag || (` ${normalized} `).includes(` ${tag} `));
}
export const hasGenre = (value: string, aliases: readonly string[]) => matchAlias(value, aliases.map(tagKey).filter(Boolean));

/** Use actual tags (not title guesses), allowing RU/EN aliases and compound genres. */
export function classifiedTracks(tracks: readonly Track[], aliases: readonly string[]) {
  const keys = [...new Set(aliases.map(tagKey).filter(Boolean))];
  return tracks.filter(({ genres }) => genres?.some((genre) => matchAlias(genre, keys)));
}

export function mergeDiscoveryTracks(local: readonly Track[], catalog: readonly Track[]) {
  const merged = new Map(local.map((track) => [track.id, track]));
  for (const track of catalog) if (!merged.has(track.id)) merged.set(track.id, track);
  return [...merged.values()];
}
