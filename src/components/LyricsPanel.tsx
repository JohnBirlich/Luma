import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, FileUp, Music2 } from 'lucide-react';
import { useText } from '../i18n/context';
import type { TrackLyrics } from '../player/useTrackLyrics';
import type { KaraokeStyle } from '../shared/karaoke-style';
import { activeLyricLine } from '../shared/lyrics';
import type { LyricLine, LyricSource } from '../shared/lyrics';
import { KaraokeTextSettings } from './KaraokeTextSettings';

const SOURCE_NAMES = { auto: 'Авто', local: 'Из файла', attached: 'Открытый файл', lrclib: 'LRCLIB', edition: 'Викитека' } as const;

const TimedText = memo(function TimedText({ lines, elapsed, clock, follow, layout, seek }: {
  lines: LyricLine[]; elapsed: number; clock?: () => number; follow: boolean; layout?: KaraokeStyle; seek?(seconds: number): void;
}) {
  const t = useText();
  const scroll = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const [liveIndex, setLiveIndex] = useState(() => activeLyricLine(lines, elapsed));
  useLayoutEffect(() => {
    if (!clock) return;
    const update = () => { if (!document.hidden) setLiveIndex(activeLyricLine(lines, clock())); };
    update();
    // Follow the actual deck clock without rerendering the whole player between lines.
    const timer = window.setInterval(update, 64);
    return () => window.clearInterval(timer);
  }, [lines, clock]);
  const current = clock ? liveIndex : activeLyricLine(lines, elapsed);
  useLayoutEffect(() => {
    const pane = scroll.current, item = line.current;
    if (!pane || !follow) return;
    const center = () => {
      // Do not fight a user's text selection; the next line can resume following.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && pane.contains(selection.anchorNode)) return;
      pane.scrollTop = item ? pane.scrollTop + item.getBoundingClientRect().top - pane.getBoundingClientRect().top
        + item.offsetHeight / 2 - pane.clientHeight * .38 : 0;
    };
    center();
    window.addEventListener('resize', center);
    return () => window.removeEventListener('resize', center);
  }, [current, lines, follow, layout]);
  return <div className="lyrics-scroll lyrics-timed" ref={scroll} tabIndex={0} role="region" aria-label={t('Строки песни')}>
    {lines.map(({ time, text }, index) => <p key={`${time}-${index}`} ref={index === current ? line : undefined}
      aria-current={index === current ? 'true' : undefined} data-past={index < current || undefined}>
      {text && seek ? <button className="lyric-line-seek" type="button" title={t('Перейти к строке')} onClick={() => seek(time)}>{text}</button> : text || '\u00a0'}
    </p>)}
  </div>;
});

export function LyricsPanel({ state, elapsed, clock, seek, karaoke, demo = false }: {
  state: TrackLyrics; elapsed: number; clock?: () => number; seek?(seconds: number): void; karaoke?: { style: KaraokeStyle; change(style: KaraokeStyle): void; tools: HTMLElement | null }; demo?: boolean;
}) {
  const t = useText();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [follow, setFollow] = useState(true);
  const { lyrics, lines, source, edition, choice, busy, error, missing, offline, canSearch, loadingLocal } = state;
  const showEdition = source === 'edition' && edition;
  const sources: LyricSource[] = ['auto'];
  if (state.local) sources.push('local');
  if (state.attached) sources.push('attached');
  if (state.canSearchOnline) sources.push('lrclib');
  if (edition) sources.push('edition');
  const nameOf = (item: LyricSource) => t(item === 'attached' && state.attachment === 'text' ? 'Свой текст' : SOURCE_NAMES[item]);
  const description = showEdition ? t('Викитека · {0}', showEdition.author) : source ? nameOf(source) : t('Источник не выбран');
  const timing = lines.length ? t('С метками времени') : lyrics?.plain ? t('Без синхронизации') : '';
  const versions = <label className="lyrics-version">{t(karaoke ? 'Версия текста' : 'Источник текста')}<select value={choice} onChange={(event) => state.select(event.currentTarget.value as LyricSource)}>
    {sources.map((item) => <option key={item} value={item}>{nameOf(item)}</option>)}
  </select></label>;
  const search = canSearch && (!lyrics || error) && <button className="button outline-button" type="button" disabled={busy || offline} onClick={state.search}>
    {busy ? t('Ищем…') : error || missing ? t('Повторить') : t('Найти текст')}
  </button>;
  const editionLink = showEdition && <a className="text-button" href={showEdition.page} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (window.luma) { event.preventDefault(); void window.luma.lyrics.openEdition(showEdition.page).catch(() => {}); }
  }}>{t('Источник издания')}</a>;
  const openFile = () => input.current?.click();
  return <section className={`lyrics-card${karaoke ? ' karaoke-lyrics' : ''}`} aria-labelledby={id} aria-busy={busy || loadingLocal}
    style={karaoke && { '--karaoke-size': `${karaoke.style.size}px`, '--karaoke-weight': karaoke.style.weight,
      '--karaoke-spacing': `${karaoke.style.spacing}px`, '--karaoke-align': karaoke.style.align } as CSSProperties}>
    <header><AlignLeft size={19} aria-hidden="true" /><div><h2 id={id}>{t('Текст песни')}</h2><p>{description}{timing && ` · ${timing}`}</p></div>
      {!karaoke && search}
    </header>
    {karaoke?.tools && createPortal(<KaraokeTextSettings style={karaoke.style} change={karaoke.change} state={state} versions={versions}
      hasTiming={lines.length > 0} follow={follow} setFollow={setFollow} openFile={openFile} removeAttachment={state.clear} />, karaoke.tools)}
    {lines.length > 0 ? <TimedText lines={lines} elapsed={elapsed} clock={clock} follow={follow} layout={karaoke?.style} seek={seek} />
      : lyrics?.plain ? <div className="lyrics-scroll lyrics-plain" tabIndex={0} role="region" aria-label={t('Текст песни')}>{lyrics.plain}</div>
      : <div className="lyrics-empty">
        <Music2 size={24} aria-hidden="true" />
        <p role="status">{lyrics?.instrumental ? t('Инструментальная запись') : busy || loadingLocal ? t('Загружаем текст…') : error ? t('LRCLIB не ответил. Попробуйте позже.')
          : missing ? t('Для этой записи текст не найден.') : offline && canSearch ? t('Для поиска нужна сеть.') : demo ? t('У этого демотрека нет текста.') : t('Текст песни пока не найден.')}</p>
        {!lyrics?.instrumental && !busy && !loadingLocal && <small>{t(canSearch && !error && !missing && !offline
          ? 'Поиск отправит название, исполнителя и, если известны, альбом и длительность.'
          : 'Чтобы добавить синхронизацию, откройте .lrc для этой записи.')}</small>}
        {karaoke && !lyrics?.instrumental && <div className="karaoke-empty-actions">{search}<button className="button outline-button" type="button" onClick={openFile}>
          <FileUp size={15} />{t('Открыть .lrc / .txt')}
        </button></div>}
      </div>}
    <input hidden type="file" ref={input} accept=".lrc,.txt" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void state.attach(file);
      event.currentTarget.value = '';
    }} />
    {!karaoke && <div className="lyrics-sources">
      {versions}
      <button className="text-button" type="button" onClick={openFile}><FileUp size={14} />{t('Открыть .lrc / .txt')}</button>
      {state.attached && <button className="text-button" type="button" onClick={state.clear}>{t(state.attachment === 'text' ? 'Убрать свой текст' : 'Убрать текст из файла')}</button>}
      {editionLink}
    </div>}
    {state.attachError && <p className="lyrics-status" role="status">{t('Нужен непустой файл UTF-8 .lrc или .txt до 128 КБ.')}</p>}
    {showEdition && <p className="lyrics-status">{t('Общественное достояние. Текст издания может отличаться от исполнения.')} {karaoke && editionLink}</p>}
  </section>;
}
