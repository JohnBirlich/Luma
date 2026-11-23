import { useEffect } from 'react';
import { APP_NAME } from '../shared/app-info';
import { mediaArtwork } from './mediaArtwork';
import type { Track } from '../shared/media';

export function useMediaSession(
  track: Track | null,
  playing: boolean,
  elapsed: number,
  duration: number,
  actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>>,
  publishTrack = true,
  titleOverride?: string,
) {
  const session = navigator.mediaSession;
  const { id, title, artist, album, artworkUrl, fallbackArtworkUrl } = track ?? {};
  useEffect(() => {
    const displayed = titleOverride || title;
    document.title = publishTrack && displayed ? `${displayed} — ${APP_NAME}` : APP_NAME;
  }, [publishTrack, title, titleOverride]);
  useEffect(() => {
    if (!session || typeof MediaMetadata === 'undefined') return;
    if (!publishTrack || !id) { session.metadata = null; return; }
    const metadata = new MediaMetadata({ title, artist, album });
    session.metadata = metadata;
    let cancelled = false;
    // Chromium drops artwork with a custom URL scheme when publishing Media Session metadata.
    void mediaArtwork(artworkUrl, fallbackArtworkUrl).then((image) => {
      if (!cancelled && image) metadata.artwork = [image];
    });
    return () => { cancelled = true; };
  }, [session, id, title, artist, album, artworkUrl, fallbackArtworkUrl, publishTrack]);

  useEffect(() => () => { if (session) session.metadata = null; }, [session]);

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
