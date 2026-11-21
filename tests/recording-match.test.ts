import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '../src/shared/media.js';
import { trackInfo } from '../src/shared/media.js';
import { bundleRecordings, readIsrc, recordingEvidence, verifiedLocalReplacement } from '../src/shared/recording-match.js';
import { replaceCurrent, startQueue } from '../src/shared/queue.js';
import { readSearchHistory, rememberSearch } from '../src/shared/search-history.js';
import { sleepDeadline, sleepSecondsLeft } from '../src/shared/sleep-timer.js';

const online = { source: 'jamendo', page: 'https://www.jamendo.com/track/42', license: 'CC BY 4.0', licenseUrl: '' } as const;
const local: Track = { id: 'file', title: 'Первый снег', artist: 'Артём', album: 'Зима', duration: 202, isrc: 'USABC1200001', audioUrl: 'blob:file' };
const remote: Track = { ...local, id: 'remote-1', audioUrl: 'https://example.net/track.mp3', artist: 'Артем', online };

test('ISRC tags agree despite standard formatting; reject conflicting and incomplete IDs', () => {
  assert.equal(readIsrc(['us-abc-12-00001', 'USABC1200001']), 'USABC1200001');
  assert.equal(readIsrc(['us-abc-12-00001', 'USABC1200002']), undefined);
  assert.equal(readIsrc('USABC12'), undefined);
  assert.equal(trackInfo('file.flac', { isrc: [local.isrc!] }).isrc, local.isrc);
});

test('group actual matches with local first; do not merge alternate versions or unknown tags', () => {
  const remoteWithoutIsrc = { ...remote, isrc: undefined };
  assert.equal(recordingEvidence(remoteWithoutIsrc, local), 'choice');
  assert.equal(recordingEvidence(remote, local), 'verified');
  assert.equal(recordingEvidence(remote, { ...local, title: `${local.title} (Live)` }), undefined);
  assert.equal(recordingEvidence(remote, { ...local, album: 'В концертном зале' }), undefined);
  assert.equal(recordingEvidence(remote, { ...local, duration: 248 }), undefined);
  assert.equal(recordingEvidence(remote, { ...local, isrc: 'USABC1200002' }), undefined);
  assert.equal(recordingEvidence(remote, { ...local, isrc: undefined, album: 'Без альбома' }), undefined);
  const remix = { ...remote, id: 'remix', title: `${remote.title} (Remix)` };
  const { bundles, bundledIds } = bundleRecordings([remote, remix], [local, { ...local, id: 'file-demo', demo: true }]);
  assert.deepEqual(bundles, [[local, remote], [remix]]);
  assert.deepEqual([...bundledIds], [remote.id, remix.id, local.id]);
});

test('do not chain weak duration matches or fall back without a single verified local copy', () => {
  const a = { ...remote, isrc: undefined }, b = { ...a, id: 'b', duration: 204 }, c = { ...a, id: 'c', duration: 206 };
  assert.deepEqual(bundleRecordings([a, b, c], []).bundles, [[a, b], [c]]);
  assert.equal(verifiedLocalReplacement(remote, [local]), local);
  assert.equal(verifiedLocalReplacement(remote, [local, { ...local, id: 'other-file' }]), undefined);
  assert.equal(verifiedLocalReplacement(a, [local]), undefined);
  assert.equal(verifiedLocalReplacement(local, [remote]), undefined);
  const queue = { ...startQueue(['first', remote.id, 'next', local.id], remote.id), beforeShuffle: ['first', remote.id, local.id, 'next'] };
  const next = replaceCurrent(queue, remote.id, local.id);
  assert.deepEqual(next.order, ['first', local.id, 'next']);
  assert.deepEqual(next.beforeShuffle, next.order);
  assert.equal(next.currentId, local.id);
  assert.equal(replaceCurrent(queue, 'stale', local.id), queue);
});

test('history keeps bounded normalized queries and ignores links', () => {
  assert.deepEqual(readSearchHistory(['  Артём  ', 'артем', 123, 'https://vk.ru/audio', '   ']), ['Артём']);
  const many = Array.from({ length: 20 }, (_, i) => `Track ${i}`);
  const updated = rememberSearch(readSearchHistory(many), 'TracK 3');
  assert.equal(updated.length, 12);
  assert.equal(updated[0], 'TracK 3');
  assert.ok(!updated.includes('Track 3'));
});

test('wall clock sleep countdown does not extend after suspend', () => {
  const deadline = sleepDeadline(5, 200_000);
  assert.equal(sleepSecondsLeft(deadline, 200_000), 300);
  assert.equal(sleepSecondsLeft(deadline, deadline - 500), 1);
  assert.equal(sleepSecondsLeft(deadline, deadline + 60_000), 0);
});
