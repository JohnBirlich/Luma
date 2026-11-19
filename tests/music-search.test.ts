import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUSIC_SERVICES, serviceSearchUrl } from '../src/shared/music-search.js';
import { isVkMusicDestination } from '../src/shared/vk.js';

test('all service choices encode the same search as data, not as raw navigation', () => {
  const query = 'Мадам Брошкина & Бумбокс #1 / Live 😎';
  for (const [key, item] of Object.entries(MUSIC_SERVICES)) {
    const link = serviceSearchUrl(key, query);
    assert.ok(link);
    const url = new URL(link);
    assert.equal(url.origin, item.origin);
    assert.equal(url.hash, '');
    assert.equal('param' in item ? url.searchParams.get(item.param) : decodeURIComponent(url.pathname.slice(item.path.length)), query);
    assert.equal(isVkMusicDestination(link), key === 'vk');
  }
  assert.equal(serviceSearchUrl('vk', '    '), undefined);
  assert.equal(serviceSearchUrl('constructor', 'Song'), undefined);
  assert.equal(serviceSearchUrl('spotify', '../..'), undefined);
  assert.equal(serviceSearchUrl('vk', 'ф'.repeat(513)), undefined);
  assert.equal(isVkMusicDestination('https://vk.ru/audio?q=foo&next=https://example.com'), false);
});
