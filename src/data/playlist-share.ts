import { buildSharedPlaylist } from '../shared/playlist-share';
import type { Track } from '../shared/media';

export async function saveSharedPlaylist(title: string, tracks: readonly Track[]) {
  const share = buildSharedPlaylist(title, tracks);
  if (!share) throw new Error('Nothing to share');
  if (window.luma) return window.luma.saveSharedPlaylist(share);
  const url = URL.createObjectURL(new Blob([JSON.stringify(share, null, 2)], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.download = 'luma-playlist.luma.json'; link.href = url; link.click();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return true;
}
