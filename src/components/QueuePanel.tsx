import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ListMusic, MoreHorizontal, X } from 'lucide-react';
import { formatCount } from '../shared/customization';
import { formatTime, trackCount } from '../shared/media';
import type { Track } from '../shared/media';
import { Artwork } from './Artwork';

const DROP_TYPE = 'application/x-luma-queue-id';

export function Signal({ playing }: { playing: boolean }) {
  return <span className={`signal${playing ? ' signal-playing' : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

interface QueuePanelProps {
  active: Track | null;
  upcoming: Track[];
  count: number;
  fullNumbers: boolean;
  duration: number;
  playing: boolean;
  close(): void;
  play(id: string): void;
  remove(id: string): void;
  move(from: string, to: string): void;
  goToLibrary(): void;
}

export function QueuePanel({ active, upcoming, count, fullNumbers, duration, playing, close, play, remove, move, goToLibrary }: QueuePanelProps) {
  const [drag, setDrag] = useState<string>();
  const [over, setOver] = useState<string>();
  const [menu, setMenu] = useState<string>();
  function clearDrag() { setDrag(undefined); setOver(undefined); }
  return (
    <aside className="queue-panel" id="play-queue" aria-label="Очередь воспроизведения">
      <header className="queue-header">
        <div>
          <p className="overline">Воспроизведение</p>
          <h2>Очередь</h2>
          <p>{trackCount(count, fullNumbers)} <span className="middle-dot">·</span> {formatTime(duration)}</p>
        </div>
        <button type="button" className="icon-button queue-close" onClick={close} aria-label="Закрыть очередь" title="Закрыть очередь"><X size={18} /></button>
      </header>
      <div className="queue-body">
        {active ? <>
          <p className="overline queue-section active-label"><span />{playing ? 'Сейчас играет' : 'Текущий трек'}</p>
          <div className="queue-current">
            <button type="button" className="queue-song" onClick={() => play(active.id)} aria-label={`${playing ? 'Приостановить' : 'Воспроизвести'} ${active.title}`}>
              <Artwork track={active} />
              <span className="queue-song-meta"><strong>{active.title}</strong><small>{active.artist}</small></span>
              <Signal playing={playing} />
            </button>
            <button type="button" className="icon-button current-remove" onClick={() => remove(active.id)} title="Убрать текущий трек из очереди" aria-label={`Убрать ${active.title} из очереди`}><X size={15} /></button>
          </div>
        </> : <div className="empty-queue"><ListMusic size={25} /><p>Очередь пока пуста</p><button className="text-button" type="button" onClick={goToLibrary}>К медиатеке</button></div>}
        {active && <div className="queue-next-heading"><p className="overline queue-section">Далее</p><span>{formatCount(upcoming.length, fullNumbers).padStart(2, '0')}</span></div>}
        {active && !upcoming.length && <p className="no-next">Следующих треков нет. Добавьте музыку из медиатеки.</p>}
        {upcoming.length > 0 && <ol className="queue-list">
          {upcoming.map((track, index) => (
            <li className={`queue-row${drag === track.id ? ' dragging' : ''}${over === track.id && drag !== track.id ? ' drop-target' : ''}`} key={track.id}
              onDragOver={(event) => {
                if (!drag || !event.dataTransfer.types.includes(DROP_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (over !== track.id) setOver(track.id);
              }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver((value) => value === track.id ? undefined : value); }}
              onDrop={(event) => {
                const id = event.dataTransfer.getData(DROP_TYPE);
                if (!drag || !id) return;
                event.preventDefault();
                move(id, track.id);
                clearDrag();
              }}>
              <span className="queue-grip" aria-hidden="true" title="Перетащите, чтобы изменить порядок" draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DROP_TYPE, track.id);
                  event.dataTransfer.effectAllowed = 'move';
                  const row = event.currentTarget.closest('li');
                  if (row) event.dataTransfer.setDragImage(row, 10, 20);
                  setMenu(undefined);
                  setDrag(track.id);
                }} onDragEnd={clearDrag}>
                <span>{String(index + 1).padStart(2, '0')}</span><GripVertical size={17} />
              </span>
              <button type="button" className="queue-song" onClick={() => play(track.id)} aria-label={`Воспроизвести ${track.title}`}>
                <Artwork track={track} />
                <span className="queue-song-meta"><strong>{track.title}</strong><small>{track.artist}</small></span>
                <span className="queue-duration">{formatTime(track.duration)}</span>
              </button>
              <button type="button" className="icon-button queue-options" aria-label={`Действия: ${track.title}`} aria-expanded={menu === track.id}
                title="Действия с треком" onClick={() => setMenu((id) => id === track.id ? undefined : track.id)}><MoreHorizontal size={16} /></button>
              {menu === track.id && <div className="queue-menu" role="group" aria-label={`Порядок: ${track.title}`}>
                <button type="button" className="icon-button" aria-label={`Поднять ${track.title}`} title="Выше" disabled={!index}
                  onClick={() => { move(track.id, upcoming[index - 1].id); setMenu(undefined); }}><ArrowUp size={15} /></button>
                <button type="button" className="icon-button" aria-label={`Опустить ${track.title}`} title="Ниже" disabled={index === upcoming.length - 1}
                  onClick={() => { move(track.id, upcoming[index + 1].id); setMenu(undefined); }}><ArrowDown size={15} /></button>
                <button type="button" className="icon-button" aria-label={`Убрать ${track.title} из очереди`} title="Убрать из очереди"
                  onClick={() => { remove(track.id); setMenu(undefined); }}><X size={15} /></button>
              </div>}
            </li>
          ))}
        </ol>}
      </div>
      <div className="queue-tip"><GripVertical size={15} /><span>Перетащите трек, чтобы изменить порядок</span></div>
    </aside>
  );
}
