import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileUp, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useText } from '../i18n/context';
import type { TrackLyrics } from '../player/useTrackLyrics';
import { defaultKaraokeStyle, KARAOKE_RANGES } from '../shared/karaoke-style';
import type { KaraokeStyle } from '../shared/karaoke-style';

const rangeLabels = { size: 'Размер текста', weight: 'Толщина текста', spacing: 'Интервал между строками' } as const;

export function KaraokeTextSettings({ style, change, state, versions, follow, setFollow, hasTiming, openFile, removeAttachment }: {
  style: KaraokeStyle; change(style: KaraokeStyle): void; state: TrackLyrics; versions: ReactNode;
  follow: boolean; setFollow(value: boolean): void; hasTiming: boolean; openFile(): void; removeAttachment(): void;
}) {
  const t = useText();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const [invalid, setInvalid] = useState(false);
  useLayoutEffect(() => { if (editing) textarea.current?.focus(); }, [editing]);

  return <>
    <button type="button" ref={anchor} className="icon-button karaoke-settings-toggle" popoverTarget={id}
      aria-label={t('Настройки текста')} title={t('Настройки текста')}><SlidersHorizontal size={18} /></button>
    <div popover="auto" ref={panel} id={id} className="karaoke-settings" role="region" aria-label={t('Настройки текста')}>
      <p className="overline">{t('Настройки текста')}</p>
      {Object.entries(KARAOKE_RANGES).map(([name, [min, max, step]]) => {
        const key = name as keyof typeof KARAOKE_RANGES;
        return <label className="karaoke-range" key={key}>
          <span>{t(rangeLabels[key])}<output>{style[key]}{key !== 'weight' && ' px'}</output></span>
          <input type="range" aria-label={t(rangeLabels[key])} min={min} max={max} step={step} value={style[key]}
            onChange={(event) => change({ ...style, [key]: event.currentTarget.valueAsNumber })} />
        </label>;
      })}
      <div className="karaoke-align" role="group" aria-label={t('Выравнивание текста')}>
        {(['left', 'center'] as const).map((align) => <button type="button" key={align} aria-pressed={style.align === align}
          onClick={() => change({ ...style, align })}>{t(align === 'left' ? 'Слева' : 'По центру')}</button>)}
      </div>
      {hasTiming && <label className="karaoke-follow"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />{t('Следить за строкой')}</label>}
      <div className="karaoke-sources">
        {state.error && <small role="status">{t(state.choice === 'lyricsovh' ? 'Lyrics.ovh не ответил. Попробуйте позже.' : 'LRCLIB не ответил. Попробуйте позже.')}</small>}
        {versions}
        {state.canSearchOnline && <button className="text-button" type="button" disabled={state.busy || state.offline} onClick={state.searchOnline}>
          <Search size={15} />{t(state.busy ? 'Ищем…' : 'Искать заново в LRCLIB')}
        </button>}
        <button className="text-button" type="button" onClick={openFile}><FileUp size={15} />{t('Открыть .lrc / .txt')}</button>
        <button className="text-button" type="button" aria-expanded={editing} onClick={() => { setEditing(!editing); setInvalid(false); }}>{t('Добавить свой текст…')}</button>
        {editing && <form className="karaoke-custom" onSubmit={(event) => {
          event.preventDefault();
          if (!state.attachText(custom)) { setInvalid(true); return; }
          setEditing(false); setCustom(''); setInvalid(false);
          panel.current?.hidePopover(); anchor.current?.focus();
        }}>
          <label>{t('Текст для текущего трека')}<textarea ref={textarea} rows={4} maxLength={64_000} value={custom}
            onChange={(event) => { setCustom(event.currentTarget.value); setInvalid(false); }} /></label>
          <small>{t('Можно вставить обычный текст или LRC с метками времени.')}</small>
          {invalid && <p role="alert">{t('Введите непустой текст объёмом до 128 КБ.')}</p>}
          <button className="button primary-button" type="submit" disabled={!custom.trim()}>{t('Применить текст')}</button>
        </form>}
        {state.attached && <button className="text-button" type="button" onClick={removeAttachment}>{t(state.attachment === 'text' ? 'Убрать свой текст' : 'Убрать текст из файла')}</button>}
        <button className="text-button karaoke-reset" type="button" onClick={() => change(defaultKaraokeStyle)}><RotateCcw size={14} />{t('Сбросить оформление текста')}</button>
      </div>
    </div>
  </>;
}
