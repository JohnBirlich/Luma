import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVkCollection, readVkCollectionName } from '../src/shared/vk-site.js';
import { inspectVkCollection } from '../electron/vk-collection.js';

interface Node { text?: string; label?: string; rect: [number, number, number, number]; header?: boolean }

/** Runs the injected finder against a stand-in document; the script only knows these four globals. */
function run(kind: string, name: string | undefined, nodes: Node[]) {
  const elements = nodes.map(({ text = '', label, rect, header }) => ({
    innerText: text,
    getAttribute: (key: string) => (key === 'aria-label' ? label ?? null : null),
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3],
      bottom: rect[1] + rect[3], right: rect[0] + rect[2] }),
    scrollIntoView: () => {},
    closest: (selector: string) => (header && selector.includes('header') ? { header: true } : null),
  }));
  const style = { visibility: 'visible', display: 'block', opacity: '1' };
  const document = { querySelectorAll: () => elements };
  // tsx transpiles with esbuild's name-keeping helper; the shipped Electron build
  // compiles this file with tsc, which has no such helper, so it is stubbed here.
  const body = `const __name = (target) => target; return ${inspectVkCollection(kind, name)};`;
  return new Function('document', 'getComputedStyle', 'innerWidth', 'innerHeight', body)(
    document, () => style, 1280, 800) as false | { point: { x: number; y: number } };
}

test('VK collection reads only the entries Luma can start', () => {
  for (const kind of ['mix', 'for-you', 'new', 'recent', 'favorites', 'genre', 'mood']) assert.equal(readVkCollection(kind), kind);
  for (const kind of ['radio', 'MIX', 'genre ', '', null, 3, {}, 'https://vk.ru/audio']) assert.equal(readVkCollection(kind), undefined, String(kind));
});

test('VK collection names are short plain literals', () => {
  assert.equal(readVkCollectionName('  Джаз \n '), 'Джаз');
  assert.equal(readVkCollectionName('Для   сна'), 'Для сна');
  for (const name of ['', '   ', 'x'.repeat(65), null, 7, ['Джаз']]) assert.equal(readVkCollectionName(name), undefined, String(name));
});

test('VK collection points at the centre of the matching card', () => {
  const found = run('mix', undefined, [
    { text: 'Главная', rect: [0, 0, 120, 32], header: true },
    { text: 'Слушать VK Микс', rect: [100, 240, 300, 120] },
  ]);
  assert.deepEqual(found, { point: { x: 250, y: 300 } });
});

test('VK collection prefers a card over a same-named header control', () => {
  const found = run('for-you', undefined, [
    { text: 'Для вас', rect: [0, 0, 120, 32], header: true },
    { text: 'Для вас', rect: [40, 320, 140, 140] },
  ]);
  assert.deepEqual(found, { point: { x: 110, y: 390 } });
});

test('VK collection matches a genre by its literal name and ignores hidden cards', () => {
  const found = run('genre', 'Джаз', [
    { text: 'Джаз', rect: [20, 600, 140, 140] },
    { text: 'Рок', rect: [180, 200, 140, 140] },
  ]);
  assert.deepEqual(found, { point: { x: 90, y: 670 } });
  assert.equal(run('genre', 'Джаз', [{ text: 'Рок', rect: [180, 200, 140, 140] }]), false);
});

test('VK collection refuses an entry that is not on the loaded page', () => {
  assert.equal(run('favorites', undefined, [{ text: 'Мои треки', rect: [0, 100, 300, 40] }]), false);
  assert.equal(run('mood', 'Для сна', []), false);
});
