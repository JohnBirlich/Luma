import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeLabSettings, proxyRules, readLabSettings, validProxyHost, validProxyPort, vkMusicUrlFor } from '../src/shared/labs.js';
import { readReleaseHistory } from '../src/shared/release-updates.js';
import { withVkDomain } from '../src/shared/vk-site.js';

test('lab settings fall back to the documented defaults and reject junk', () => {
  assert.deepEqual(readLabSettings(undefined), { vkDomain: 'vk.ru', unencryptedStorage: false, proxy: { enabled: false, host: '', port: '' } });
  assert.deepEqual(readLabSettings({ vkDomain: 'evil.example', unencryptedStorage: 'yes', proxy: { enabled: 1, host: 'http://127.0.0.1', port: '70000' } }),
    { vkDomain: 'vk.ru', unencryptedStorage: false, proxy: { enabled: false, host: '', port: '' } });
  assert.equal(readLabSettings({ vkDomain: 'vk.com' }).vkDomain, 'vk.com');
});

test('a patch only touches known fields and keeps the rest', () => {
  const stored = readLabSettings({ vkDomain: 'vk.com', proxy: { enabled: true, host: '127.0.0.1', port: '1080' } });
  const merged = mergeLabSettings(stored, { unencryptedStorage: true, proxy: { port: '8080' } });
  assert.equal(merged.vkDomain, 'vk.com');
  assert.equal(merged.unencryptedStorage, true);
  assert.deepEqual(merged.proxy, { enabled: true, host: '127.0.0.1', port: '8080' });
  assert.equal(mergeLabSettings(stored, { removed: true, proxy: 'nonsense' }).proxy.host, '127.0.0.1');
});

test('proxy rules require an enabled, valid host and port', () => {
  assert.equal(proxyRules({ enabled: false, host: '127.0.0.1', port: '1080' }), undefined);
  assert.equal(proxyRules({ enabled: true, host: '', port: '1080' }), undefined);
  assert.equal(proxyRules({ enabled: true, host: '127.0.0.1', port: '0' }), undefined);
  assert.equal(proxyRules({ enabled: true, host: 'proxy.example', port: '1080' }), 'http=proxy.example:1080;https=proxy.example:1080');
  assert.equal(validProxyHost('-bad.example'), false);
  assert.equal(validProxyHost('a'.repeat(64) + '.example'), false);
  assert.equal(validProxyPort('65535'), true);
  assert.equal(validProxyPort('65536'), false);
});

test('the VK domain switch rewrites a validated address and leaves the rest alone', () => {
  assert.equal(vkMusicUrlFor('vk.ru'), 'https://vk.ru/audio');
  assert.equal(withVkDomain('https://vk.ru/audio', 'vk.com'), 'https://vk.com/audio');
  assert.equal(withVkDomain('https://vk.com/audio?q=test', 'vk.ru'), 'https://vk.ru/audio?q=test');
  assert.equal(withVkDomain('https://login.vk.com/?act=login', 'vk.ru'), 'https://login.vk.ru/?act=login');
  assert.equal(withVkDomain('https://example.com/audio', 'vk.ru'), undefined);
  assert.equal(withVkDomain('javascript:alert(1)', 'vk.ru'), undefined);
});

test('release history keeps stable versions only, newest first, with bounded notes', () => {
  const rows = readReleaseHistory([
    { tag_name: 'v1.5.10', draft: false, prerelease: false, published_at: '2026-11-19T10:00:00Z', body: '## Что нового\n\n- Первое\n- Второе' },
    { tag_name: 'v1.5.9', draft: false, prerelease: false, published_at: '2026-11-12T10:00:00Z', body: 'x'.repeat(4000) },
    { tag_name: 'v2.0.0', draft: true, prerelease: false, published_at: '2026-12-01T10:00:00Z', body: 'draft' },
    { tag_name: 'v1.6.0-beta', draft: false, prerelease: true, published_at: '2026-12-01T10:00:00Z', body: 'beta' },
    { tag_name: 'nightly', draft: false, prerelease: false, published_at: '2026-12-01T10:00:00Z' },
  ]);
  assert.deepEqual(rows.map(({ version }) => version), ['1.5.10', '1.5.9']);
  assert.equal(rows[0].notes, 'Что нового - Первое - Второе');
  assert.equal(rows[1].notes.length, 700);
  assert.equal(rows[0].publishedAt, '2026-11-19T10:00:00Z');
  assert.deepEqual(readReleaseHistory({ items: [] }), []);
});
