import { useText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import { Pencil, RotateCcw, X } from 'lucide-react';
import { TRACK_DETAIL_LIMIT } from '../data/track-details';
import type { TrackDetails } from '../data/track-details';
import { cleanTrackText } from '../shared/russian';
import type { Track } from '../shared/media';
import { MetadataLookup } from './MetadataLookup';

interface Props {
  track: Track;
  edited: boolean;
  locale: string;
  save(value?: TrackDetails): void;
  close(): void;
}

const fields = [['title', 'Название'], ['artist', 'Исполнитель'], ['album', 'Альбом']] as const;

export function TrackDetailsEditor({ track, edited, locale, save, close }: Props) {
  const t = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<TrackDetails>(() => ({
    title: track.title.slice(0, TRACK_DETAIL_LIMIT),
    artist: track.artist.slice(0, TRACK_DETAIL_LIMIT),
    album: track.album.slice(0, TRACK_DETAIL_LIMIT),
  }));
  const [genres, setGenres] = useState(() => track.genres?.join(', ').slice(0, TRACK_DETAIL_LIMIT) ?? '');
  useEffect(() => { dialog.current?.showModal(); title.current?.focus(); }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }
  function apply(value?: TrackDetails) {
    save(value);
    dismiss();
  }
  return (
    <dialog ref={dialog} className="cover-dialog track-details-dialog" aria-labelledby="track-details-title" aria-describedby="track-details-hint"
      onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <form className="cover-editor" onSubmit={(event) => { event.preventDefault(); if (cleanTrackText(draft.title)) apply({ ...draft, genres: genres.split(',') }); }}>
        <header className="dialog-header">
          <div className="dialog-mark"><Pencil size={20} /></div>
          <div><p className="overline">{t("Медиатека")}</p><h2 id="track-details-title">{t("Данные трека")}</h2></div>
          <button type="button" className="icon-button" aria-label={t("Закрыть редактор данных трека")} title={t("Закрыть")} onClick={dismiss}><X size={20} /></button>
        </header>
        <p className="track-details-hint" id="track-details-hint">{t("Изменения видны в Luma и системном плеере. Исходный файл не изменится.")}</p>
        <div className="track-details-fields">
          {fields.map(([field, label]) => <label key={field}>{t(label)}
            <input ref={field === 'title' ? title : undefined} type="text" autoComplete="off" spellCheck={false}
              maxLength={TRACK_DETAIL_LIMIT} required={field === 'title'} value={draft[field]}
              onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })} />
          </label>)}
          <label>{t("Жанры")}<input type="text" value={genres} placeholder={t("Через запятую")} maxLength={TRACK_DETAIL_LIMIT}
            onChange={(event) => setGenres(event.currentTarget.value)} /></label>
        </div>
        <MetadataLookup track={track} locale={locale} artistHint={draft.artist} albumHint={draft.album} select={(candidate, titleOnly) => setDraft((draft) => ({
          ...draft, title: candidate.title,
          ...(!titleOnly && { artist: candidate.artist, album: candidate.album ?? draft.album }),
        }))} />
        <footer className="dialog-footer cover-footer">
          <button type="button" className="button ghost-button" onClick={() => apply()} disabled={!edited}><RotateCcw size={15} />{" "}{t("Вернуть исходные")}</button>
          <button type="submit" className="button primary-button" disabled={!cleanTrackText(draft.title)}>{t("Сохранить")}</button>
        </footer>
      </form>
    </dialog>
  );
}
