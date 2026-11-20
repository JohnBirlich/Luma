import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AlignLeft, FileUp, Music2 } from 'lucide-react';
import { useText } from '../i18n/context';
import type { TrackLyrics } from '../player/useTrackLyrics';
import { activeLyricLine } from '../shared/lyrics';
import type { LyricLine, LyricSource } from '../shared/lyrics';

const SOURCE_NAMES = { auto: 'Авто', local: 'Из файла', attached: 'Открытый файл', lrclib: 'LRCLIB', edition: 'Викитека' } as const;

const TimedText = memo(function TimedText({ lines, elapsed, clock, follow }: {
  lines: LyricLine[]; elapsed: number; clock?: () => number; follow: boolean;
}) {
  const t = useText();
  const scroll = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const [liveIndex, setLiveIndex] = useState(() => activeLyricLine(lines, elapsed));
  useEffect(() => {
    if (!clock) return;
    const update = () => { if (!document.hidden) setLiveIndex(activeLyricLine(lines, clock())); };
    update();
    // Use the actual active deck clock. Only the highlighted index changes, never the whole player.
    const timer = window.setInterval(update, 64);
    return () => window.clearInterval(timer);
  }, [lines, clock]);
  const current = clock ? liveIndex : activeLyricLine(lines, elapsed);
  useLayoutEffect(() => {
    const pane = scroll.current, item = line.current;
    if (!pane || !follow) return;
    // Do not fight a user's text selection; the next line can resume following.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && pane.contains(selection.anchorNode)) return;
    pane.scrollTop = item ? item.offsetTop - pane.clientHeight * .36 + item.offsetHeight / 2 : 0;
  }, [current, lines, follow]);
  return <div className="lyrics-scroll lyrics-timed" ref={scroll} tabIndex={0} role="region" aria-label={t('Строки песни')}>
    {lines.map(({ time, text }, index) => <p key={`${time}-${index}`} ref={index === current ? line : undefined}
      aria-current={index === current ? 'true' : undefined} data-past={index < current || undefined}>{text || '\u00a0'}</p>)}
  </div>;
});

export function LyricsPanel({ state, elapsed, clock, karaoke = false, demo = false }: {
  state: TrackLyrics; elapsed: number; clock?: () => number; karaoke?: boolean; demo?: boolean;
}) {
  const t = useText();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [follow, setFollow] = useState(true);
  const { lyrics, lines, source, edition, choice, busy, error, missing, offline, canSearch, loadingLocal } = state;
  const showEdition = source === 'edition' && edition;
  const sources = [
    'auto', ...(state.local ? ['local'] : []), ...(state.attached ? ['attached'] : []),
    ...(!demo ? ['lrclib'] : []), ...(edition ? ['edition'] : []),
  ] as LyricSource[];
  const description = showEdition ? t('Викитека · {0}', showEdition.author) : source ? t(SOURCE_NAMES[source]) : t('Источник не выбран');
  const timing = lines.length ? t('С метками времени') : lyrics?.plain ? t('Без синхронизации') : '';
  return <section className={`lyrics-card${karaoke ? ' karaoke-lyrics' : ''}`} aria-labelledby={id} aria-busy={busy || loadingLocal}>
    <header><AlignLeft size={19} /><div><h2 id={id}>{t('Текст песни')}</h2><p>{description}{timing && ` · ${timing}`}</p></div>
      {canSearch && (!lyrics || error) && <button className="button outline-button" type="button" disabled={busy || offline} onClick={state.search}>
        {busy ? t('Ищем…') : error || missing ? t('Повторить') : t('Найти текст')}
      </button>}
    </header>
    {lines.length > 0 ? <TimedText lines={lines} elapsed={elapsed} clock={clock} follow={follow} />
      : lyrics?.plain ? <div className="lyrics-scroll lyrics-plain" tabIndex={0} role="region" aria-label={t('Текст песни')}>{lyrics.plain}</div>
      : <div className="lyrics-empty">
        <Music2 size={24} aria-hidden="true" />
        <p role="status">{lyrics?.instrumental ? t('Инструментальная запись') : busy || loadingLocal ? t('Загружаем текст…') : error ? t('LRCLIB не ответил. Попробуйте позже.')
          : missing ? t('Для этой записи текст не найден.') : offline && canSearch ? t('Для поиска нужна сеть.') : demo ? t('У этого демотрека нет текста.') : t('Текст песни пока не найден.')}</p>
        {!lyrics?.instrumental && !busy && !loadingLocal && <small>{t(canSearch && !error && !missing && !offline
          ? 'Поиск отправит название, исполнителя и, если известны, альбом и длительность.'
          : 'Чтобы добавить синхронизацию, откройте .lrc для этой записи.')}</small>}
      </div>}
    <div className="lyrics-sources">
      <label>{t('Источник текста')}<select value={choice} onChange={(event) => state.select(event.currentTarget.value as LyricSource)}>
        {sources.map((item) => <option key={item} value={item}>{t(SOURCE_NAMES[item])}</option>)}
      </select></label>
      <input hidden type="file" ref={input} accept=".lrc,.txt" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) void state.attach(file);
        event.currentTarget.value = '';
      }} />
      <button className="text-button" type="button" onClick={() => input.current?.click()}><FileUp size={14} />{t('Открыть .lrc / .txt')}</button>
      {state.attached && <button className="text-button" type="button" onClick={state.clear}>{t('Убрать текст из файла')}</button>}
      {showEdition && <a className="text-button" href={showEdition.page} target="_blank" rel="noopener noreferrer" onClick={(event) => {
        if (window.luma) { event.preventDefault(); void window.luma.lyrics.openEdition(showEdition.page).catch(() => {}); }
      }}>{t('Источник издания')}</a>}
      {karaoke && lines.length > 0 && <label className="lyrics-follow"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />{t('Следить за строкой')}</label>}
    </div>
    {state.attachError && <p className="lyrics-status" role="status">{t('Нужен непустой файл UTF-8 .lrc или .txt до 128 КБ.')}</p>}
    {showEdition && <p className="lyrics-status">{t('Общественное достояние. Текст издания может отличаться от исполнения.')}</p>}
  </section>;
}
