import { useState } from 'react';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import type { TrackDisplay } from '../shared/media';

interface ArtworkProps {
  track?: Pick<TrackDisplay, 'artworkUrl' | 'fallbackArtworkUrl' | 'artworkFit'> | null;
  imageUrl?: string;
  className?: string;
  lazy?: boolean;
  reveal?: boolean;
}

export function Artwork({ track, imageUrl, className = '', lazy, reveal }: ArtworkProps) {
  const sources = [imageUrl, track?.artworkUrl, track?.fallbackArtworkUrl];
  const [failure, setFailure] = useState<{ group: string; urls: string[] }>();
  const group = sources.join('\n');
  const failed = failure?.group === group ? failure.urls : [];
  const src = sources.find((url) => url && !failed.includes(url)) ?? DEFAULT_ARTWORK_URL;
  const fallback = src === DEFAULT_ARTWORK_URL;
  const contain = track?.artworkFit === 'contain' && src === track.artworkUrl;
  return (
    <div className={`artwork${contain ? ' artwork-logo' : ''}${fallback ? ' artwork-fallback' : ''} ${className}`} data-reveal={reveal || undefined} aria-hidden="true">
      <img key={src} src={src} alt="" draggable={false} loading={lazy ? 'lazy' : undefined} decoding="async"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (reveal) void image.decode().then(() => { image.dataset.loaded = ''; }, () => { image.dataset.loaded = ''; });
          else image.dataset.loaded = '';
        }}
        onError={() => { if (!fallback) setFailure({ group, urls: [...failed, src] }); }} />
    </div>
  );
}
