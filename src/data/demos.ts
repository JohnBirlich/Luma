import type { Track } from '../shared/media';

const root = import.meta.env.BASE_URL;

const cues = [
  ['afterimage', 'Отблеск', 'Арден Вейл', 'Полуночные сигналы', 32, '#bf7447'],
  ['low-tide', 'Отлив', 'Мира Коув', 'Записи у моря', 28, '#599993'],
  ['violet-hour', 'Фиолетовый час', 'Арден Вейл', 'Полуночные сигналы', 34, '#956eaa'],
  ['paper-satellites', 'Бумажные спутники', 'Халден', 'Мягкий фокус', 30, '#ca7852'],
  ['blue-meridian', 'Синий меридиан', 'Северный сигнал', 'Полярный дрейф', 36, '#638ed3'],
] as const;

export const demoTracks: Track[] = cues.map(([slug, title, artist, album, duration, color]) => ({
  id: `demo-${slug}`, demo: true, title, artist, album, duration,
  audioUrl: `${root}demo/${slug}.mp3`, artworkUrl: `${root}artwork/${slug}.webp`, color,
  backdropUrl: slug === 'afterimage' ? `${root}artwork/afterimage-wide.webp` : undefined,
}));
