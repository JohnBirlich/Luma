import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSystem, windowsSystem } from '../src/shared/system.js';

test('Windows diagnostics separate product, release, and kernel build', () => {
  assert.equal(windowsSystem('10.0.26100', 'Client', '24H2'), 'Windows 11 24H2 · сборка 26100');
  assert.equal(windowsSystem('10.0.19045.999', 'Client', '22H2'), 'Windows 10 22H2 · сборка 19045');
  assert.equal(windowsSystem('10.0.26100', 'Server Core', '24H2'), 'Windows Server 24H2 · сборка 26100');
  assert.equal(windowsSystem('10.0.22000', 'Client', 'test junk'), 'Windows 11 · сборка 22000');
  assert.equal(windowsSystem('indeterminate'), 'Windows · сборка неизвестна');
});

test('browser does not guess the release from Windows NT 10.0 or iPadOS from Mac on touch', () => {
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0';
  assert.equal(browserSystem(windows), 'Windows · выпуск не определён');
  assert.equal(browserSystem(windows, 'Windows', '15.0.0'), 'Windows 11 или новее');
  assert.equal(browserSystem(windows, 'Windows', '10.0.0'), 'Windows 10');
  assert.equal(browserSystem(windows, 'Windows', '0.0.0'), 'Windows · выпуск не определён');
  assert.equal(browserSystem('(Macintosh; Intel Mac OS X 10_15_7)', undefined, undefined, 5), 'iOS / iPadOS');
  assert.equal(browserSystem('(X11; CrOS x86_64 15801.0.0)'), 'ChromeOS');
  assert.equal(browserSystem('(Linux; Android 14)'), 'Android');
  assert.equal(browserSystem('(X11; Linux x86_64)'), 'Linux');
});
