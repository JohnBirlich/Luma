import { useState } from 'react';
import { DEFAULT_ARTWORK_URL } from '../data/artwork';
import type { Track } from '../shared/media';

interface ArtworkProps {
  track?: Track | null;
  imageUrl?: string;
  className?: string;
}

export function Artwork({ track, imageUrl, className = '' }: ArtworkProps) {
  const [failed, setFailed] = useState<string>();
  const original = imageUrl ?? track?.artworkUrl;
  const fallback = !original || original === failed;
  const src = fallback ? DEFAULT_ARTWORK_URL : original;
  return (
    <div className={`artwork${fallback ? ' artwork-fallback' : ''} ${className}`} aria-hidden="true">
      <img key={src} src={src} alt="" draggable={false} onError={() => { if (!fallback) setFailed(original); }} />
    </div>
  );
}
