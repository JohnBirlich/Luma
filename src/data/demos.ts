import type { Track } from '../shared/media';

const root = import.meta.env.BASE_URL;

const cues = [
  ['afterimage', 'Отблеск', 'Арден Вейл', 'Полуночные сигналы', 32, '#bf7447', 'Эмбиент'],
  ['low-tide', 'Отлив', 'Мира Коув', 'Записи у моря', 28, '#599993', 'Эмбиент'],
  ['violet-hour', 'Фиолетовый час', 'Арден Вейл', 'Полуночные сигналы', 34, '#956eaa', 'Электроника'],
  ['paper-satellites', 'Бумажные спутники', 'Халден', 'Мягкий фокус', 30, '#ca7852', 'Даунтемпо'],
  ['blue-meridian', 'Синий меридиан', 'Северный сигнал', 'Полярный дрейф', 36, '#638ed3', 'Электроника'],
  ['night-garage', 'Ночной гараж', 'Luma Sessions', 'Демо · Жанры', 33.1, '#e15738', 'Рок'],
  ['blue-cafe', 'Синее кафе', 'Luma Sessions', 'Демо · Жанры', 33.8, '#3cb5ab', 'Джаз'],
  ['district-beat', 'Бит квартала', 'Luma Sessions', 'Демо · Жанры', 33.5, '#d26fd3', 'Хип-хоп'],
  ['glass-waltz', 'Стеклянный вальс', 'Luma Sessions', 'Демо · Жанры', 32.9, '#e0b667', 'Классика'],
  ['signal-loop', 'Сигнальный контур', 'Luma Sessions', 'Демо · Жанры', 34.3, '#5c97f0', 'Синтвейв'],
] as const;

export const demoTracks: Track[] = cues.map(([slug, title, artist, album, duration, color, genre]) => ({
  id: `demo-${slug}`, demo: true, title, artist, album, duration, genres: [genre],
  audioUrl: `${root}demo/${slug}.mp3`, artworkUrl: `${root}artwork/${slug}.webp`, color,
  backdropUrl: slug === 'afterimage' ? `${root}artwork/afterimage-wide.webp` : undefined,
}));
