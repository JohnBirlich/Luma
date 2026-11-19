import type { Track } from '../shared/media';

const root = import.meta.env.BASE_URL;

const cues = [
  ['afterimage', 'Afterimage', 'Arden Vale', 'Midnight Signals', 32, '#bf7447'],
  ['low-tide', 'Low Tide', 'Mira Cove', 'Saltwater Tapes', 28, '#599993'],
  ['violet-hour', 'Violet Hour', 'Arden Vale', 'Midnight Signals', 34, '#956eaa'],
  ['paper-satellites', 'Paper Satellites', 'Halden', 'In Soft Focus', 30, '#ca7852'],
  ['blue-meridian', 'Blue Meridian', 'North Relay', 'Polar Drift', 36, '#638ed3'],
] as const;

export const demoTracks: Track[] = cues.map(([slug, title, artist, album, duration, color]) => ({
  id: `demo-${slug}`, demo: true, title, artist, album, duration,
  audioUrl: `${root}demo/${slug}.mp3`, artworkUrl: `${root}artwork/${slug}.webp`, color,
  backdropUrl: slug === 'afterimage' ? `${root}artwork/afterimage-wide.webp` : undefined,
}));
