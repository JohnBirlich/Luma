import { useText } from '../i18n/context';
import { memo } from 'react';
import { ListMusic, Play } from 'lucide-react';
import { formatTime, trackCount } from '../shared/media';
import type { Track } from '../shared/media';
import type { Repeat } from '../shared/queue';
import { Artwork } from './Artwork';

export const UpcomingTracks = memo(function UpcomingTracks({ tracks, repeat, autoNext, fullNumbers, play }: {
  tracks: Track[]; repeat: Repeat; autoNext: boolean; fullNumbers: boolean; play(id: string): void;
}) {
  const t = useText();
  const note = repeat === 'one' ? t("Сейчас включён повтор текущего трека.")
    : !autoNext ? t("Автопереход выключен. Можно выбрать трек вручную.")
      : repeat === 'all' && !tracks.length ? t("В очереди один трек. Он начнётся сначала.") : '';
  return <section className="immersive-upcoming" id="immersive-upcoming" aria-labelledby="immersive-upcoming-title" tabIndex={-1}>
    <header><div><p className="overline">{t("Очередь воспроизведения")}</p><h2 id="immersive-upcoming-title">{t("Далее")}</h2></div><span>{trackCount(tracks.length, fullNumbers, t.language)}</span></header>
    {note && <p className="upcoming-note">{note}</p>}
    {tracks.length ? <ol className="upcoming-list">
      {tracks.map((track, index) => <li key={track.id}>
        <button className="upcoming-track" type="button" onClick={(event) => {
          // The activated row leaves the upcoming list when it becomes the current track.
          event.currentTarget.closest('section')?.focus({ preventScroll: true });
          play(track.id);
        }} title={`${track.title} — ${track.artist}`} aria-label={t("Воспроизвести из очереди: {0}", track.title)}>
          <span className="upcoming-index"><span>{String(index + 1).padStart(2, '0')}</span><Play size={13} fill="currentColor" aria-hidden="true" /></span>
          <Artwork track={track} />
          <span className="upcoming-copy"><strong>{track.title}</strong><small>{track.artist}</small></span>
          <span className="upcoming-time">{formatTime(track.duration)}</span>
        </button>
      </li>)}
    </ol> : <div className="upcoming-empty"><ListMusic size={21} /><p>{t("Следующих треков нет")}</p><small>{t("Добавьте музыку в очередь из медиатеки.")}</small></div>}
  </section>;
});
