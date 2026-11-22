import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowUpRight, Link2, Play, X, Youtube } from 'lucide-react';
import { youTubeRecordings } from '../data/youtube';
import { useText } from '../i18n/context';
import { useEmbedViewport } from '../player/useEmbedViewport';
import { formatTime } from '../shared/media';
import { GOOGLE_PRIVACY, readYouTubeId, YOUTUBE_FRAME_NAME, YOUTUBE_TERMS, youTubeEmbedUrl, youTubeWatchUrl } from '../shared/youtube';
import './youtube.css';

interface Props {
  videoId?: string;
  connected: boolean;
  available: boolean;
  open(id: string): void;
  close(): void;
}

const invalidLink = 'Вставьте ссылку на отдельную запись YouTube или YouTube Music.';

export function YouTubePanel({ videoId, connected, available, open, close }: Props) {
  const t = useText(), id = useId();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [browserError, setBrowserError] = useState(false);
  const recording = youTubeRecordings.find(({ id }) => id === videoId);
  const source = videoId && youTubeEmbedUrl(videoId, t.language);
  const active = !!source && available;
  const watch = active && videoId ? youTubeWatchUrl(videoId) : undefined;
  const watchLabel = recording ? `${recording.artist} — ${recording.title}` : t('Запись по ссылке');

  const viewport = useEmbedViewport(active ? source : undefined, close);

  function select(recordingId: string) {
    setLinkError(false);
    setBrowserError(false);
    if (videoId === recordingId && active) viewport.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    else open(recordingId);
  }

  function followInBrowser(event: MouseEvent<HTMLAnchorElement>, url: string, policy = false) {
    if (!window.luma) return;
    event.preventDefault();
    setBrowserError(false);
    const request = policy ? window.luma.openOnlineLink(url) : window.luma.musicLinks.openBrowser(url);
    void request.catch(() => setBrowserError(true));
  }

  return <section className="youtube-room" aria-labelledby={`${id}-title`}>
    <header className="youtube-room-head">
      <div className="youtube-room-title">
        <span className="youtube-mark" aria-hidden="true"><Youtube size={23} /></span>
        <div><p className="overline">YouTube</p><h2 id={`${id}-title`}>{t('Полные записи')}</h2></div>
      </div>
      <span className="youtube-free">{t('Без подписки')}</span>
    </header>
    <div className="youtube-grid">
      <section className="hub-shelf youtube-card" aria-label={t('Встроенный плеер YouTube')}>
        <header className="youtube-player-head">
          <div><h3>{active ? recording?.title ?? t('Запись по ссылке') : t('Плеер YouTube')}</h3>
            <p>{active && recording ? `${recording.artist} · YouTube` : t('В окне Luma · Отдельно от аудиоочереди')}</p></div>
          {active && <button type="button" className="icon-button youtube-stop" onClick={() => { close(); viewport.current?.focus({ preventScroll: true }); }} aria-label={t('Закрыть плеер YouTube')} title={t('Закрыть плеер YouTube')}><X size={17} /></button>}
        </header>
        <div className="youtube-viewport" ref={viewport} tabIndex={-1} role="group" aria-label={t('Плеер YouTube')}>
          {active ? <iframe key={videoId} name={YOUTUBE_FRAME_NAME} title={`YouTube — ${watchLabel}`} src={source}
            referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen" allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" /> :
            <div className="youtube-poster">
              <span className="youtube-poster-glyph" aria-hidden="true"><Play size={23} fill="currentColor" /></span>
              <strong>{t(connected ? 'Выберите, что послушать' : 'Нет подключения к интернету')}</strong>
              <p>{t(connected ? 'Здесь откроется плеер YouTube. Выберите запись из списка или вставьте свою ссылку.' : 'Для воспроизведения YouTube нужна сеть.')}</p>
            </div>}
        </div>
        {watch && <footer className="youtube-player-foot">
          <p className="hub-note">{t('Нажмите ▶ в плеере. Если запись недоступна здесь, откройте её на YouTube.')}</p>
          <a className="youtube-link" href={watch} target="_blank" rel="noopener noreferrer" onClick={(event) => followInBrowser(event, watch)}>
            {t('Открыть на YouTube')} <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>}
      </section>
      <section className="hub-shelf youtube-card youtube-catalog" aria-labelledby={`${id}-tracks`}>
        <div className="youtube-catalog-heading"><h3 id={`${id}-tracks`}>{t('Официальные аудиоверсии')}</h3><p className="hub-note">{t('Записи от артистов и лейблов')}</p></div>
        <ol className="youtube-tracks">
          {youTubeRecordings.map((track) => <li key={track.id}>
            <button type="button" data-youtube-id={track.id} disabled={!available} aria-current={active && videoId === track.id ? 'true' : undefined}
              onClick={() => select(track.id)}>
              <span className="youtube-row-icon" aria-hidden="true"><Play size={13} fill="currentColor" /></span>
              <span className="youtube-row-copy"><strong>{track.title}</strong><small>{track.artist}</small></span>
              <time dateTime={`PT${track.duration}S`}>{formatTime(track.duration)}</time>
            </button>
          </li>)}
        </ol>
        <form className="youtube-form" onSubmit={(event) => {
          event.preventDefault();
          if (!available) return;
          const next = readYouTubeId(link);
          if (next) { setLink(''); select(next); }
          else setLinkError(true);
        }}>
          <label htmlFor={`${id}-link`}>{t('Своя ссылка YouTube')}</label>
          <div className="youtube-form-fields">
            <input id={`${id}-link`} type="text" inputMode="url" maxLength={2048} required placeholder="https://youtu.be/…" value={link}
              aria-invalid={linkError || undefined} aria-describedby={linkError ? `${id}-error` : undefined}
              spellCheck={false} autoComplete="off" onChange={(event) => { setLink(event.currentTarget.value); setLinkError(false); }} />
            <button type="submit" className="button outline-button" disabled={!available}><Link2 size={15} aria-hidden="true" />{t('Загрузить в плеер')}</button>
          </div>
          {linkError && <p id={`${id}-error`} className="youtube-error" role="alert">{t(invalidLink)}</p>}
        </form>
      </section>
    </div>
    <footer className="youtube-policy">
      <p className="hub-note">{t('Плеер подключается к YouTube только после выбора записи. Возможны реклама и ограничения встраивания.')}</p>
      <a className="youtube-link" href={YOUTUBE_TERMS} target="_blank" rel="noopener noreferrer" onClick={(event) => followInBrowser(event, YOUTUBE_TERMS, true)}>{t('Условия YouTube')}</a>
      <a className="youtube-link" href={GOOGLE_PRIVACY} target="_blank" rel="noopener noreferrer" onClick={(event) => followInBrowser(event, GOOGLE_PRIVACY, true)}>{t('Конфиденциальность Google')}</a>
      {browserError && <p className="youtube-error" role="alert">{t('Не удалось открыть ссылку.')}</p>}
    </footer>
  </section>;
}
