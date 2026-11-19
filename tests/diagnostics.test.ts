import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendLog, diagnosticsReport, logEntry, MAX_LOG_ENTRIES, MAX_LOG_FILE_BYTES, readLog } from '../src/shared/diagnostics.js';
import type { LogEntry } from '../src/shared/diagnostics.js';

test('diagnostics accept only known events from the proper process and typed numeric metrics', () => {
  assert.equal(logEntry('desktop.start', {}, 'renderer'), undefined);
  assert.equal(logEntry('renderer.error', {}, 'main'), undefined);
  assert.equal(logEntry('constructor', {}, 'renderer'), undefined);
  assert.equal(logEntry('unknown', {}, 'renderer'), undefined);
  assert.deepEqual(logEntry('library.imported', {
    ms: 133.45, added: 4, duplicates: 'C:\\Users\\Someone\\private.mp3', failed: Infinity,
    stack: 'SECRET', url: 'https://vk.ru/?token=SECRET', code: 123,
  }, 'renderer', 124), { event: 'library.imported', at: 124, values: { ms: 133, added: 4 } });
  assert.deepEqual(logEntry('vk.failed', { code: -106 }, 'main', 123)?.values, { code: -106 });
});

test('local journal keeps only recent entries and tolerates damaged or stale records', () => {
  let entries: LogEntry[] = [];
  for (let at = 0; at < MAX_LOG_ENTRIES + 34; at++) entries = appendLog(entries, logEntry('renderer.start', {}, 'renderer', at)!);
  assert.equal(entries.length, MAX_LOG_ENTRIES);
  assert.equal(entries[0].at, 34);
  assert.deepEqual(readLog(JSON.stringify(entries)), entries);
  assert.deepEqual(readLog('['), []);
  assert.deepEqual(readLog(' '.repeat(MAX_LOG_FILE_BYTES + 1)), []);
  assert.deepEqual(readLog(JSON.stringify([{}, null, { event: 'desktop.start', at: 1e17 }, { event: 'network.online', at: 99, values: { url: 'secret' } }])), [
    { event: 'network.online', at: 99, values: {} },
  ]);
});

test('diagnostic report includes version, system and connection, without raw user payloads', () => {
  const entries = [logEntry('library.opened', { tracks: 42, ms: 120, location: '/secret.mp3' }, 'renderer', 0)!];
  const text = diagnosticsReport({ entries, storage: 'file', environment: { version: '0.6.0', mode: 'desktop', runtime: 'Electron 45', system: 'Windows 11', online: false } });
  assert.match(text, /Luma Player 0\.6\.0/);
  assert.match(text, /Система: Windows 11/);
  assert.match(text, /устройство вне сети/);
  assert.match(text, /1970-01-01T00:00:00\.000Z.*library\.opened.*Время: 120 мс.*Треков: 42/);
  assert.doesNotMatch(text, /secret/);
});
