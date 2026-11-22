import { useText } from '../i18n/context';
import { Heart, ThumbsDown } from 'lucide-react';
import type { Track } from '../shared/media';
import { sessionCatalogId } from '../shared/online';

export function FavoriteButton({ track, selected, toggle, immersive }: {
  track: Track; selected: boolean; toggle(id: string): void; immersive?: boolean;
}) {
  const t = useText();
  if (sessionCatalogId(track.id)) return null;
  const label = selected ? t("Убрать из избранного") : t("В избранное");
  return <button type="button" className={`icon-button like-button ${immersive ? 'immersive-favorite' : 'favorite-toggle'}`}
    aria-pressed={selected} aria-label={immersive ? label : `${label}: ${track.title}`} title={label} onClick={({ currentTarget }) => {
      toggle(track.id);
      const heart = currentTarget.querySelector('svg');
      const sparks = currentTarget.querySelector('.like-sparks');
      for (const element of [heart, sparks]) element?.getAnimations().forEach((animation) => animation.cancel());
      if (selected || document.hidden || currentTarget.closest('.motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      heart?.animate([{ transform: 'scale(.88)' }, { transform: 'scale(1.23)', offset: .38 }, { transform: 'scale(1)' }],
        { duration: 300, easing: 'cubic-bezier(.15,.8,.4,1)' });
      sparks?.animate([{ transform: 'scale(.44)', opacity: 0 }, { opacity: .85, offset: .26 }, { transform: 'scale(1.22)', opacity: 0 }],
        { duration: 350, easing: 'ease-out' });
    }}>
    <Heart size={immersive ? 23 : 16} fill={selected ? 'currentColor' : 'none'} />
    <span className="like-sparks" aria-hidden="true" />
  </button>;
}

export function DislikeButton({ track, selected, toggle, immersive }: {
  track: Track; selected: boolean; toggle(id: string): void; immersive?: boolean;
}) {
  const t = useText();
  if (sessionCatalogId(track.id)) return null;
  const label = selected ? t("Вернуть в рекомендации") : t("Не рекомендовать");
  return <button type="button" className={`icon-button dislike-toggle${immersive ? ' immersive-favorite' : ''}`}
    aria-pressed={selected} aria-label={immersive ? label : `${label}: ${track.title}`} title={label} onClick={() => toggle(track.id)}>
    <ThumbsDown size={immersive ? 21 : 16} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>;
}
