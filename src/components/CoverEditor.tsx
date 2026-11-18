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
      if (version === revision.current) setError(problem instanceof Error ? problem.message : 'Не удалось открыть изображение.');
    } finally {
      if (version === revision.current) setProcessing(false);
    }
  }

  async function apply(image?: Blob) {
    if (!ready) return;
    setSaving(true);
    setError('');
    try { await update(image); dismiss(); }
    catch { setError('Не удалось сохранить изменения. Попробуйте ещё раз.'); setSaving(false); }
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
          <div><p className="overline">Персонализация</p><h2 id="cover-dialog-title">{playlist ? 'Обложка плейлиста' : 'Обложка трека'}</h2></div>
          <button type="button" className="icon-button" disabled={saving} aria-label="Закрыть редактор обложки" title="Закрыть" onClick={dismiss}><X size={20} /></button>
        </header>
        <div className="cover-editor-body">
          <div className="cover-preview">
            <Artwork imageUrl={src} seed={target.key} />
            <span>{draft ? 'Предпросмотр' : currentUrl ? 'Своя обложка' : 'По умолчанию'}</span>
          </div>
          <div className="cover-editor-details">
            <h3 title={target.title}>{target.title}</h3>
            <p>{playlist ? 'Обложка видна в Luma. Сам виджет VK не изменится.' : 'Новая обложка появится в медиатеке, очереди и плеере. Аудиофайл не изменится.'}</p>
            <button type="button" className={`cover-picker${over ? ' cover-picker-active' : ''}`} onClick={() => input.current?.click()} disabled={saving}>
              <Upload size={19} /><span><strong>{processing ? 'Подготавливаем…' : 'Выбрать изображение'}</strong><small>или перетащите его сюда</small></span>
            </button>
            <small className="cover-format">JPG, PNG, WebP · до 20 МБ · квадратная обрезка</small>
            <input type="file" hidden ref={input} aria-label="Файл обложки" accept={COVER_ACCEPT} onChange={(event) => {
              void choose(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }} />
          </div>
        </div>
        {error && <p className="cover-error" role="alert">{error}</p>}
        <footer className="dialog-footer cover-footer">
          <button type="button" className="button ghost-button" onClick={() => void apply()} disabled={!currentUrl || !ready}><RotateCcw size={15} /> Вернуть исходную</button>
          <button type="button" className="button primary-button" onClick={() => void apply(draft?.image)} disabled={!draft || !ready}>{saving ? 'Сохраняем…' : 'Сохранить обложку'}</button>
        </footer>
      </div>
    </dialog>
  );
}
