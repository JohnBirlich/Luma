import { useState } from 'react';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import type { TrackDisplay } from '../shared/media';

interface ArtworkProps {
  track?: Pick<TrackDisplay, 'artworkUrl' | 'fallbackArtworkUrl'> | null;
  imageUrl?: string;
  className?: string;
  lazy?: boolean;
}

export function Artwork({ track, imageUrl, className = '', lazy }: ArtworkProps) {
  const sources = [imageUrl, track?.artworkUrl, track?.fallbackArtworkUrl];
  const [failure, setFailure] = useState<{ group: string; urls: string[] }>();
  const group = sources.join('\n');
  const failed = failure?.group === group ? failure.urls : [];
  const src = sources.find((url) => url && !failed.includes(url)) ?? DEFAULT_ARTWORK_URL;
  const fallback = src === DEFAULT_ARTWORK_URL;
  return (
    <div className={`artwork${fallback ? ' artwork-fallback' : ''} ${className}`} aria-hidden="true">
      <img key={src} src={src} alt="" draggable={false} loading={lazy ? 'lazy' : undefined} decoding="async"
        onError={() => { if (!fallback) setFailure({ group, urls: [...failed, src] }); }} />
    </div>
  );
}
