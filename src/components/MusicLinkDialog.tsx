import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Link2, Play, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { importOnlineTrack } from '../data/online';
import { readMusicLink } from '../shared/music-links';
import { readYouTubeId } from '../shared/youtube';
import type { OnlineTrack } from '../shared/online';
import { OnlineCredit } from './OnlineMusic';
import type { OnlineAction } from './OnlineMusic';

export function MusicLinkDialog({ initial = '', connected, disabled, close, choose, openYouTube }: {
  initial?: string; connected: boolean; disabled: boolean; close(): void; choose(track: OnlineTrack, action: OnlineAction): void;
  openYouTube(id: string): void;
}) {
  const t = useText(), id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController>(undefined);
  const [value, setValue] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [track, setTrack] = useState<OnlineTrack>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = readMusicLink(submitted);
  const videoId = link?.provider === 'youtube' ? readYouTubeId(link.url) : undefined;
  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { request.current?.abort(); node?.close(); };
  }, []);
  function change(text: string) {
    request.current?.abort();
    setBusy(false); setValue(text); setSubmitted(''); setTrack(undefined); setError('');
  }
  async function find() {
    if (link?.provider !== 'openverse' || busy || !connected) return;
    const active = request.current = new AbortController();
    setBusy(true); setError('');
    try {
      const result = await importOnlineTrack(link.url, active.signal);
      if (!active.signal.aborted) setTrack(result);
    } catch { if (!active.signal.aborted) setError('Не удалось загрузить запись по ссылке.'); }
    finally { if (!active.signal.aborted) setBusy(false); }
  }
  return <dialog className="music-link-dialog" ref={dialog} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="dialog-header">
      <div className="online-mark" aria-hidden="true"><Link2 size={19} /></div>
      <h2 id={id}>{t('Открыть музыкальную ссылку')}</h2>
      <button type="button" className="icon-button" aria-label={t('Закрыть')} onClick={close}><X size={19} /></button>
    </header>
    <form className="online-search-form" onSubmit={(event) => {
      event.preventDefault();
      setSubmitted(value); setError(readMusicLink(value) ? '' : 'Нужна ссылка на VK, Яндекс Музыку, Openverse или отдельную запись YouTube.');
    }}>
      <input type="text" inputMode="url" required maxLength={2048} value={value} onChange={(event) => change(event.currentTarget.value)} autoComplete="off"
        spellCheck={false} aria-label={t('Музыкальная ссылка')} placeholder="https://…" />
      <button type="submit" className="button outline-button" disabled={busy}>{t('Открыть')}</button>
    </form>
    {link && <section className="music-link-target" data-provider={link.provider}>
      <h3>{link.provider === 'vk' ? 'VK Music' : link.provider === 'yandex' ? t('Яндекс Музыка') : link.provider === 'youtube' ? 'YouTube' : 'Openverse'} · {t(link.kind === 'track' ? 'Трек' : 'Плейлист')}</h3>
      {videoId ? <>
        <p>{t('Запись откроется во встроенном плеере YouTube. Возможны реклама и ограничения встраивания.')}</p>
        <button type="button" className="button primary-button" disabled={!connected} onClick={() => { close(); openYouTube(videoId); }}>
          <Play size={16} aria-hidden="true" />{t('Загрузить в плеер')}</button>
      </> : link.provider === 'openverse' ? <>
        {track ? <><p><strong>{track.title}</strong> · {track.artist} <OnlineCredit track={track} /></p>
          <button type="button" className="button primary-button" disabled={disabled || !connected} onClick={() => { choose(track, 'play'); close(); }}><Play size={16} />{t('Слушать в Luma')}</button></>
          : <button type="button" className="button primary-button" disabled={!connected || busy} onClick={() => void find()}>{t(busy ? 'Проверяем…' : 'Загрузить карточку')}</button>}
      </> : <>
        <p>{t('Ссылка распознана. Для воспроизведения внутри Luma нужен подтверждённый доступ к каталогу этого сервиса.')}</p>
        <a className="button outline-button" href={link.url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
          if (!window.luma) return;
          event.preventDefault();
          void window.luma.musicLinks.openBrowser(link.url).catch(() => setError('Не удалось открыть ссылку.'));
        }}>{t('Открыть в браузере')} <ArrowUpRight size={15} /></a>
      </>}
    </section>}
    {error && <p className="online-message error" role="alert">{t(error)}</p>}
  </dialog>;
}
