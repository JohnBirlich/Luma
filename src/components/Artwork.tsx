import { useEffect, useState } from 'react';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import type { TrackDisplay } from '../shared/media';

interface ArtworkProps {
  track?: Pick<TrackDisplay, 'artworkUrl' | 'fallbackArtworkUrl' | 'artworkFit'> | null;
  imageUrl?: string;
  className?: string;
  lazy?: boolean;
  reveal?: boolean;
}

/** How long the previous cover stays under the new one while they cross-fade. */
const FADE_MS = 460;

export function Artwork({ track, imageUrl, className = '', lazy, reveal }: ArtworkProps) {
  const sources = [imageUrl, track?.artworkUrl, track?.fallbackArtworkUrl];
  const [failure, setFailure] = useState<{ group: string; urls: string[] }>();
  const group = sources.join('\n');
  const failed = failure?.group === group ? failure.urls : [];
  const src = sources.find((url) => url && !failed.includes(url)) ?? DEFAULT_ARTWORK_URL;
  // Covers change with the track, so the outgoing image is painted underneath the new
  // one for a moment: every switch becomes a fade instead of a hard cut.
  const [outgoing, setOutgoing] = useState<string>();
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (src === shown) return;
    setOutgoing(shown);
    setShown(src);
    const timer = window.setTimeout(() => setOutgoing(undefined), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [src, shown]);
  const fallback = src === DEFAULT_ARTWORK_URL;
  const contain = track?.artworkFit === 'contain' && src === track.artworkUrl;
  const load = (image: HTMLImageElement) => {
    if (reveal) void image.decode().then(() => { image.dataset.loaded = ''; }, () => { image.dataset.loaded = ''; });
    else image.dataset.loaded = '';
  };
  return (
    <div className={`artwork${contain ? ' artwork-logo' : ''}${fallback ? ' artwork-fallback' : ''} ${className}`} data-reveal={reveal || undefined} aria-hidden="true">
      <img className="artwork-in" key={src} src={src} alt="" draggable={false} loading={lazy ? 'lazy' : undefined} decoding="async"
        onLoad={(event) => load(event.currentTarget)}
        onError={() => { if (!fallback) setFailure({ group, urls: [...failed, src] }); }} />
      {outgoing && <img className="artwork-out" key={`out:${outgoing}`} src={outgoing} alt="" draggable={false} decoding="async" />}
    </div>
  );
}
