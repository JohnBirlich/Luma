import { useText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Upload, X } from 'lucide-react';
import { prepareCover } from '../data/cover-art';
import { COVER_ACCEPT } from '../shared/artwork';
import type { CoverTarget } from '../shared/artwork';
import { Artwork } from './Artwork';

interface CoverEditorProps {
  target: CoverTarget;
  currentUrl?: string;
  update(image?: Blob): Promise<void>;
  close(): void;
}

export function CoverEditor({ target, currentUrl, update, close }: CoverEditorProps) {
  const t = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const liveUrl = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState<{ image: Blob; url: string }>();
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const playlist = target.kind === 'playlist';
  const ready = !processing && !saving;
  const src = draft?.url ?? currentUrl ?? target.originalUrl;

  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      revision.current++;
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    };
  }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }

  async function choose(file?: File) {
    if (!file || saving) return;
    const version = ++revision.current;
    setProcessing(true);
    setError('');
    try {
      const image = await prepareCover(file);
      if (version !== revision.current) return;
      const url = URL.createObjectURL(image);
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
      liveUrl.current = url;
      setDraft({ image, url });
    } catch (problem) {
      if (version === revision.current) setError(problem instanceof Error ? problem.message : t("Не удалось открыть изображение."));
    } finally {
      if (version === revision.current) setProcessing(false);
    }
  }

  async function apply(image?: Blob) {
    if (!ready) return;
    setSaving(true);
    setError('');
    try { await update(image); dismiss(); }
    catch { setError(t("Не удалось сохранить изменения. Попробуйте ещё раз.")); setSaving(false); }
  }

  return (
    <dialog ref={dialog} className="cover-dialog" aria-labelledby="cover-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) dismiss(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !saving) dismiss(); }}
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.types.includes('Files')) setOver(true); }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onDragLeave={(event) => { event.stopPropagation(); if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); void choose(event.dataTransfer.files[0]); }}>
      <div className="cover-editor">
        <header className="dialog-header">
          <div className="dialog-mark"><ImagePlus size={22} /></div>
          <div><p className="overline">{t("Персонализация")}</p><h2 id="cover-dialog-title">{playlist ? t("Обложка плейлиста") : t("Обложка трека")}</h2></div>
          <button type="button" className="icon-button" disabled={saving} aria-label={t("Закрыть редактор обложки")} title={t("Закрыть")} onClick={dismiss}><X size={20} /></button>
        </header>
        <div className="cover-editor-body">
          <div className="cover-preview">
            <Artwork imageUrl={src} />
            <span>{draft ? t("Предпросмотр") : currentUrl ? t("Своя обложка") : target.originalUrl ? t("Автоматическая обложка") : t("Обложка Luma")}</span>
          </div>
          <div className="cover-editor-details">
            <h3 title={target.title}>{target.title}</h3>
            <p>{playlist ? t("Обложка видна только у закладки в Luma.") : t("Новая обложка появится в Luma и системном плеере. Аудиофайл не изменится.")}</p>
            <button type="button" className={`cover-picker${over ? ' cover-picker-active' : ''}`} onClick={() => input.current?.click()} disabled={saving}>
              <Upload size={19} /><span><strong>{processing ? t("Подготавливаем…") : t("Выбрать изображение")}</strong><small>{t("или перетащите его сюда")}</small></span>
            </button>
            <small className="cover-format">{t("JPG, PNG, WebP · до 20 МБ · квадратная обрезка")}</small>
            <input type="file" hidden ref={input} aria-label={t("Файл обложки")} accept={COVER_ACCEPT} onChange={(event) => {
              void choose(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }} />
          </div>
        </div>
        {error && <p className="cover-error" role="alert">{error}</p>}
        <footer className="dialog-footer cover-footer">
          <button type="button" className="button ghost-button" onClick={() => void apply()} disabled={!currentUrl || !ready}><RotateCcw size={15} />{" "}{t("Вернуть исходную")}</button>
          <button type="button" className="button primary-button" onClick={() => void apply(draft?.image)} disabled={!draft || !ready}>{saving ? t("Сохраняем…") : t("Сохранить обложку")}</button>
        </footer>
      </div>
    </dialog>
  );
}
