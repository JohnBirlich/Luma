export type Repeat = 'off' | 'all' | 'one';

export interface QueueState {
  order: string[];
  currentId: string | null;
  repeat: Repeat;
  beforeShuffle: string[] | null;
}

export const emptyQueue: QueueState = { order: [], currentId: null, repeat: 'off', beforeShuffle: null };

export function startQueue(ids: string[], currentId: string | null = ids[0] ?? null, repeat: Repeat = 'off'): QueueState {
  const order = [...new Set(ids)];
  return { order, currentId: currentId && order.includes(currentId) ? currentId : order[0] ?? null, repeat, beforeShuffle: null };
}

export function appendToQueue(queue: QueueState, ids: string[]): QueueState {
  const newIds = [...new Set(ids)].filter((id) => !queue.order.includes(id));
  if (!newIds.length) return queue;
  return {
    ...queue,
    order: [...queue.order, ...newIds],
    currentId: queue.currentId ?? newIds[0],
    beforeShuffle: queue.beforeShuffle && [...queue.beforeShuffle, ...newIds],
  };
}

export function removeFromQueue(queue: QueueState, id: string): QueueState {
  const index = queue.order.indexOf(id);
  if (index < 0) return queue;
  const order = queue.order.filter((item) => item !== id);
  return {
    ...queue,
    order,
    currentId: queue.currentId === id ? order[index] ?? order[index - 1] ?? null : queue.currentId,
    beforeShuffle: order.length ? queue.beforeShuffle?.filter((item) => item !== id) ?? null : null,
  };
}

export function moveQueueItem(queue: QueueState, fromId: string, toId: string): QueueState {
  const from = queue.order.indexOf(fromId);
  const to = queue.order.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return queue;
  const order = [...queue.order];
  order.splice(from, 1);
  order.splice(to, 0, fromId);
  return { ...queue, order };
}

export function toggleShuffle(queue: QueueState, random = Math.random): QueueState {
  if (queue.beforeShuffle) return { ...queue, order: queue.beforeShuffle, beforeShuffle: null };
  if (!queue.order.length) return queue;
  const start = queue.currentId ? queue.order.indexOf(queue.currentId) + 1 : 0;
  const order = [...queue.order];
  for (let i = order.length - 1; i > start; i--) {
    const j = start + Math.floor(random() * (i - start + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...queue, order, beforeShuffle: queue.order };
}

export function adjacentId(queue: QueueState, step: -1 | 1, finished = false): string | null {
  if (!queue.order.length) return null;
  if (finished && queue.repeat === 'one') return queue.currentId;
  const index = queue.currentId ? queue.order.indexOf(queue.currentId) : -1;
  if (index < 0) return queue.order[0];
  const target = index + step;
  if (target >= 0 && target < queue.order.length) return queue.order[target];
  return queue.repeat === 'all' ? queue.order[(target + queue.order.length) % queue.order.length] : null;
}

/** Future tracks in playback order, including the next cycle when repeat-all is on. */
export function upcomingIds(queue: QueueState): string[] {
  const index = queue.currentId ? queue.order.indexOf(queue.currentId) : -1;
  return [
    ...queue.order.slice(index + 1),
    ...(queue.repeat === 'all' && index > 0 ? queue.order.slice(0, index) : []),
  ];
}

/** Keep a drag within the upcoming section, including across the repeat-all boundary. */
export function moveUpcoming(queue: QueueState, fromId: string, toId: string): QueueState {
  const upcoming = upcomingIds(queue);
  const from = upcoming.indexOf(fromId);
  const to = upcoming.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return queue;
  if (queue.repeat !== 'all' || !queue.currentId) return moveQueueItem(queue, fromId, toId);
  upcoming.splice(from, 1);
  upcoming.splice(to, 0, fromId);
  const currentIndex = queue.order.indexOf(queue.currentId);
  const remaining = queue.order.length - currentIndex - 1;
  return { ...queue, order: [...upcoming.slice(remaining), queue.currentId, ...upcoming.slice(0, remaining)] };
}

export function reconcileQueue(queue: QueueState, available: Set<string>): QueueState {
  const order = [...new Set(queue.order.filter((id) => available.has(id)))];
  const currentId = queue.currentId && order.includes(queue.currentId) ? queue.currentId : order[0] ?? null;
  const before = queue.beforeShuffle && [...new Set(queue.beforeShuffle.filter((id) => order.includes(id)))];
  return {
    order, currentId,
    repeat: queue.repeat,
    beforeShuffle: before && order.length ? [...before, ...order.filter((id) => !before.includes(id))] : null,
  };
}
