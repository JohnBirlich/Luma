import assert from 'node:assert/strict';
import { test } from 'node:test';
import { textFor } from '../src/i18n/text';
import { english } from '../src/i18n/en';
import { trackCount } from '../src/shared/media';
import { diagnosticSystem, diagnosticsReport, displayValues, logEntry } from '../src/shared/diagnostics';
import { decodePreferences, encodePreferences } from '../src/player/preferences';
import { startQueue } from '../src/shared/queue';

test('interface language persists separately from the data locale and keeps title interpolation intact', () => {
  const profile = decodePreferences('{"uiLanguage":"en","appearance":{"dataLanguage":"de-DE"}}');
  const restored = decodePreferences(encodePreferences(profile, startQueue([])));
  assert.equal(restored.uiLanguage, 'en');
  assert.equal(restored.appearance.dataLanguage, 'de-DE');
  assert.equal(decodePreferences('{"uiLanguage":"constructor"}').uiLanguage, 'ru');
  assert.equal(textFor('en')('Воспроизвести из очереди: {0}', 'Очи чёрные'), 'Play from queue: Очи чёрные');
  assert.equal(textFor('ru')('Воспроизвести из очереди: {0}', 'Очи чёрные'), 'Воспроизвести из очереди: Очи чёрные');
  assert.equal(trackCount(1, true, 'en'), '1 track');
  assert.equal(trackCount(2340, false, 'en'), '2.3K tracks');
});

test('translated strings do not lose substitutions', () => {
  const slots = (part: string) => [...part.matchAll(/\{\d+\}/g)].map(([value]) => value).sort();
  for (const [message, translation] of Object.entries(english)) {
    assert.ok(translation.trim());
    assert.deepEqual(slots(translation), slots(message), message);
  }
});

test('English diagnostic values and reports translate labels without changing events', () => {
  const t = textFor('en');
  assert.equal(diagnosticSystem('Windows 11 24H2 · сборка 26100', t), 'Windows 11 24H2 · build 26100');
  const event = logEntry('audio.ready', { ms: 127 }, 'renderer', 0)!;
  assert.deepEqual(displayValues(event, t), ['Time: 127 ms']);
  const report = diagnosticsReport({ entries: [event], storage: 'file', environment: {
    version: '0.11.0', mode: 'desktop', system: 'Windows · сборка неизвестна', runtime: 'Electron 45', online: true,
  } }, t);
  assert.match(report, /Network: device online/);
  assert.match(report, /\(audio\.ready\).*Time: 127 ms/);
  assert.doesNotMatch(report, /[А-Яа-яЁё]/u);
});
