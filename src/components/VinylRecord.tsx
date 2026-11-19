import { memo } from 'react';
import type { Track } from '../shared/media';
import { useVisualMotion } from '../player/useVisualMotion';
import { Artwork } from './Artwork';

export const VinylRecord = memo(function VinylRecord({ track, animate, className = '' }: { track: Track | null; animate: boolean; className?: string }) {
  const rotating = useVisualMotion(animate);
  return <div className={`vinyl-record ${className}`} aria-hidden="true">
    <div className={`record-platter${rotating ? ' record-rotating' : ''}`}>
      <Artwork track={track} className="record-label" />
    </div>
  </div>;
});
