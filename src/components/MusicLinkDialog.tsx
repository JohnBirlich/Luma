import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Link2, Play, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { importOnlineTrack } from '../data/online';
import { readMusicLink } from '../shared/music-links';
import type { OnlineTrack } from '../shared/online';
import { OnlineCredit } from './OnlineMusic';
import type { OnlineAction } from './OnlineMusic';

export function MusicLinkDialog({ initial = '', connected, disabled, close, choose, openVk }: {
  initial?: string; connected: boolean; disabled: boolean; close(): void; choose(track: OnlineTrack, action: OnlineAction): void;
  openVk?(url: string): void;
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
      setSubmitted(value); setError(readMusicLink(value) ? '' : 'Нужна ссылка на VK, Яндекс Музыку или Openverse.');
    }}>
      <input type="text" inputMode="url" required maxLength={2048} value={value} onChange={(event) => change(event.currentTarget.value)} autoComplete="off"
        spellCheck={false} aria-label={t('Музыкальная ссылка')} placeholder="https://…" />
      <button type="submit" className="button outline-button" disabled={busy}>{t('Открыть')}</button>
    </form>
    {link && <section className="music-link-target" data-provider={link.provider}>
      <h3>{link.provider === 'vk' ? 'VK Music' : link.provider === 'yandex' ? t('Яндекс Музыка') : 'Openverse'} · {t(link.kind === 'track' ? 'Трек' : 'Плейлист')}</h3>
      {link.provider === 'openverse' ? <>
        {track ? <><p><strong>{track.title}</strong> · {track.artist} <OnlineCredit track={track} /></p>
          <button type="button" className="button primary-button" disabled={disabled || !connected} onClick={() => { choose(track, 'play'); close(); }}><Play size={16} />{t('Слушать в Luma')}</button></>
          : <button type="button" className="button primary-button" disabled={!connected || busy} onClick={() => void find()}>{t(busy ? 'Проверяем…' : 'Загрузить карточку')}</button>}
      </> : <>
        <p>{t(link.provider === 'vk' ? (openVk ? 'Ссылка откроется на официальном сайте VK. Ограничения VK сохраняются.' : 'Сайт VK внутри Luma доступен в приложении для Windows.') : 'Ссылка распознана. Для воспроизведения внутри Luma нужен подтверждённый доступ к каталогу этого сервиса.')}</p>
        {link.provider === 'vk' && openVk && <button type="button" className="button primary-button" disabled={!connected} onClick={() => { close(); openVk(link.url); }}>
          <Play size={16} aria-hidden="true" />{t('Открыть в VK')}</button>}
        {link.provider !== 'vk' && <a className="button outline-button" href={link.url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
          if (!window.luma) return;
          event.preventDefault();
          void window.luma.musicLinks.openBrowser(link.url).catch(() => setError('Не удалось открыть ссылку.'));
        }}>{t('Открыть в браузере')} <ArrowUpRight size={15} /></a>}
      </>}
    </section>}
    {error && <p className="online-message error" role="alert">{t(error)}</p>}
  </dialog>;
}
