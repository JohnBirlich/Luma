import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjacentId, appendToQueue, moveUpcoming, reconcileQueue, removeFromQueue, startQueue, toggleShuffle, upcomingIds } from '../src/shared/queue.js';

test('current track, history, and upcoming tracks follow queue order', () => {
  const queue = startQueue(['a', 'b', 'c', 'd'], 'b');
  assert.equal(adjacentId(queue, -1), 'a');
  assert.equal(adjacentId(queue, 1, true), 'c');
  assert.deepEqual(upcomingIds(queue), ['c', 'd']);
  assert.equal(adjacentId(startQueue(['a', 'b'], 'b'), 1, true), null);
});

test('repeat one is applied to natural end only, repeat all wraps both directions', () => {
  assert.equal(adjacentId(startQueue(['a', 'b'], 'a', 'one'), 1, true), 'a');
  assert.equal(adjacentId(startQueue(['a', 'b'], 'a', 'one'), 1), 'b');
  assert.equal(adjacentId(startQueue(['a', 'b'], 'b', 'all'), 1, true), 'a');
  assert.equal(adjacentId(startQueue(['a', 'b'], 'a', 'all'), -1), 'b');
});

test('upcoming can be reordered across the repeat-all boundary without moving current', () => {
  const queue = startQueue(['a', 'b', 'c', 'd'], 'c', 'all');
  assert.deepEqual(upcomingIds(queue), ['d', 'a', 'b']);
  const moved = moveUpcoming(queue, 'a', 'd');
  assert.deepEqual(upcomingIds(moved), ['a', 'd', 'b']);
  assert.equal(adjacentId(moved, 1), 'a');
  assert.equal(moved.currentId, 'c');
  assert.strictEqual(moveUpcoming(moved, 'c', 'a'), moved);
});

test('shuffling preserves played tracks and restores order with later imports and removals', () => {
  const queue = startQueue(['a', 'b', 'c', 'd', 'e'], 'b');
  const mixed = toggleShuffle(queue, () => 0);
  assert.deepEqual(mixed.order, ['a', 'b', 'd', 'e', 'c']);
  assert.equal(mixed.currentId, 'b');
  const changed = removeFromQueue(appendToQueue(mixed, ['a', 'f', 'f']), 'd');
  assert.deepEqual(toggleShuffle(changed).order, ['a', 'b', 'c', 'e', 'f']);
});

test('removing current chooses the next track or the last remaining track', () => {
  const queue = startQueue(['a', 'b', 'c'], 'b');
  assert.equal(removeFromQueue(queue, 'b').currentId, 'c');
  assert.equal(removeFromQueue({ ...queue, currentId: 'c' }, 'c').currentId, 'b');
  assert.equal(removeFromQueue(startQueue(['a']), 'a').currentId, null);
});

test('restored queues ignore deleted tracks and repair the shuffle snapshot', () => {
  const queued = { order: ['missing', 'a', 'b', 'a'], currentId: 'missing', repeat: 'one' as const, beforeShuffle: ['missing', 'b'] };
  assert.deepEqual(reconcileQueue(queued, new Set(['a', 'b'])), {
    order: ['a', 'b'], currentId: 'a', repeat: 'one', beforeShuffle: ['b', 'a'],
  });
});
