import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVkHistory, rememberVkListen, vkHistoryDestination, VK_HISTORY_LIMIT } from '../src/shared/vk-history.js';
import { vkSiteEntry, readVkNowPlaying } from '../src/shared/vk-site.js';
import { decodePreferences, encodePreferences } from '../src/player/preferences.js';
import { startQueue } from '../src/shared/queue.js';

const sample = { title: 'Запись', artist: 'Артист' };
const noLink = { ...sample, link: 'https://vk.ru/away.php?target=https://other.invalid/track' };
const direct = { ...sample, link: 'https://vk.com/music/track/123_456?tracking=fixture#discard' };
const canonical = 'https://vk.ru/audio123_456';

test('VK history contains only titles, artists and validated official track links', () => {
  const [record] = readVkHistory([{ ...direct, password: 'private', artwork: 'luma://app/previous', stream: 'https://other.invalid/a.mp3' }]);
  assert.deepEqual(record, { ...sample, link: canonical });
  assert.equal(vkHistoryDestination(record), canonical);
  const [unverified] = readVkHistory([noLink]);
  assert.deepEqual(unverified, sample);
  const search = vkHistoryDestination(unverified)!;
  assert.ok(vkSiteEntry(search));
  assert.equal(new URL(search).searchParams.get('q'), 'Артист — Запись');
  assert.equal(readVkNowPlaying(direct)?.link, canonical);
  assert.equal(readVkNowPlaying(noLink)?.link, undefined);
  assert.deepEqual(readVkHistory([{ title: 'VK Музыка' }, { title: '\u202e\n', artist: 'a' }]), []);
});

test('VK history upgrades a search to an exact track URL, deduplicates replays and stays bounded', () => {
  const plays = rememberVkListen([], sample);
  const same = rememberVkListen(plays, sample);
  assert.equal(same, plays);
  const upgraded = rememberVkListen(plays, direct);
  assert.deepEqual(upgraded, [{ ...sample, link: canonical }]);
  assert.equal(rememberVkListen(upgraded, sample), upgraded);
  const older = rememberVkListen(upgraded, { title: 'Другая запись', artist: 'Артист' });
  assert.deepEqual(rememberVkListen(older, sample).map(({ title }) => title), ['Запись', 'Другая запись']);
  const many = Array.from({ length: VK_HISTORY_LIMIT + 5 }, (_, i) => ({ title: String(i), artist: 'Автор' }));
  assert.equal(readVkHistory(many).length, VK_HISTORY_LIMIT);
  assert.equal(many.reduce(rememberVkListen, [] as ReturnType<typeof readVkHistory>).length, VK_HISTORY_LIMIT);
});

test('VK history keeps same-named recordings distinct and truncates only the outgoing search', () => {
  const other = { ...sample, link: 'https://vk.ru/audio123_457' };
  const both = rememberVkListen(readVkHistory([direct]), other);
  assert.deepEqual(rememberVkListen(both, sample).flatMap(({ link }) => link ?? []), [other.link, canonical]);
  const long = { title: 'Название'.repeat(30), artist: 'Исполнитель '.repeat(30) };
  const destination = vkHistoryDestination(readVkHistory([long])[0])!;
  assert.ok(vkSiteEntry(destination));
  assert.match(new URL(destination).searchParams.get('q')!, /^Исполнитель.* — Название/);
});

test('VK history persists alongside existing history, never as an audio source or a queue item', () => {
  const prefs = decodePreferences(JSON.stringify({ recent: ['local-1'], vkRecent: [direct] }));
  const queue = startQueue(['local-1']);
  const stored = decodePreferences(encodePreferences(prefs, queue));
  assert.deepEqual(stored.queue, queue);
  assert.deepEqual(stored.recent, ['local-1']);
  assert.deepEqual(stored.vkRecent, [{ ...sample, link: canonical }]);
  assert.deepEqual(stored.onlineRefs, []);
});
