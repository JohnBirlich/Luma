import { memo } from 'react';
import type { TrackDisplay } from '../shared/media';
import { useVisualMotion } from '../player/useVisualMotion';
import { Artwork } from './Artwork';

export const VinylRecord = memo(function VinylRecord({ track, animate, className = '', reveal }: { track: TrackDisplay | null; animate: boolean; className?: string; reveal?: boolean }) {
  const rotating = useVisualMotion(animate);
  return <div className={`vinyl-record ${className}`} aria-hidden="true">
    <div className={`record-platter${rotating ? ' record-rotating' : ''}`}>
      <Artwork track={track} className="record-label" reveal={reveal} />
    </div>
  </div>;
});
