import { useEffect } from 'react';
import type { Track } from '../shared/media';

export function useMediaSession(
  track: Track | null,
  playing: boolean,
  elapsed: number,
  duration: number,
  actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>>,
) {
  const session = navigator.mediaSession;
  useEffect(() => {
    if (!session || typeof MediaMetadata === 'undefined') return;
    session.metadata = track ? new MediaMetadata({
      title: track.title, artist: track.artist, album: track.album,
      artwork: track.artworkUrl ? [{ src: new URL(track.artworkUrl, document.baseURI).href }] : [],
    }) : null;
    return () => { session.metadata = null; };
  }, [session, track]);

  useEffect(() => {
    if (!session) return;
    const handlers = Object.entries(actions) as [MediaSessionAction, MediaSessionActionHandler][];
    const register = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { session.setActionHandler(action, handler); } catch { /* Platform action not available. */ }
    };
    handlers.forEach(([action, handler]) => register(action, handler));
    return () => { handlers.forEach(([action]) => register(action, null)); };
  }, [session, actions]);

  useEffect(() => {
    if (!session) return;
    session.playbackState = track ? playing ? 'playing' : 'paused' : 'none';
    if (typeof session.setPositionState !== 'function') return;
    if (track && duration > 0) session.setPositionState({ duration, position: Math.min(elapsed, duration), playbackRate: 1 });
    else session.setPositionState();
  }, [session, track, playing, elapsed, duration]);
}
