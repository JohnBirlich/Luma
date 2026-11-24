/**
 * Finds the catalogue entry the user asked Luma to start — VK's own mix, «Для
 * вас», «Новинки», «Недавнее», «Избранное», or a genre / mood by name — and
 * returns its centre so the host can replay a real mouse press there.
 *
 * The function is serialized into the guest's isolated world, so it must stay
 * self-contained: no imports, no closures, no access to Luma's code.
 */
function findCollection(kind: string, name: string | null) {
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/gu, ' ').trim();
  const onScreen = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 14 || rect.height < 14 || rect.bottom < 0 || rect.top > innerHeight * 1.8) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > .1;
  };
  const patterns: Record<string, RegExp> = {
    mix: /(?:^|\s)(?:слушать\s+)?(?:vk\s*)?микс(?:\s|$)|моя волна|плейлист дня/i,
    'for-you': /^(?:для вас|для тебя|рекомендации)$/i,
    new: /^(?:новинки|новое|премьеры|новинки недели)$/i,
    recent: /недавн|вы слушали/i,
    favorites: /избранн|мне нравит|понравивш/i,
  };
  const wanted = clean(name).toLocaleLowerCase();
  const candidates: { element: HTMLElement; score: number; area: number }[] = [];
  const selector = 'button, a, [role="button"], [role="link"], [role="tab"], [data-testid], [class*="Card"], [class*="card"], [class*="Playlist"], [class*="playlist"]';
  for (const element of [...document.querySelectorAll<HTMLElement>(selector)]) {
    if (candidates.length > 4000) break;
    if (!onScreen(element)) continue;
    const labelled = clean(element.getAttribute('aria-label') || element.getAttribute('title'));
    const text = labelled || clean(element.innerText);
    if (!text || text.length > 160) continue;
    const pattern = wanted ? undefined : patterns[kind];
    const hit = wanted ? text.toLocaleLowerCase().includes(wanted) : !!pattern?.test(text);
    if (!hit) continue;
    let score = 2;
    if (labelled) score += 1;                                  // a labelled control is rarely a wrapper
    if (!element.closest('header, [class*="Header"], #page_header_cont')) score += 1;
    const rect = element.getBoundingClientRect();
    candidates.push({ element, score, area: rect.width * rect.height });
  }
  if (!candidates.length) return false;
  // Best match first; among equals the innermost card, which is the one that starts playback.
  candidates.sort((a, b) => b.score - a.score || a.area - b.area);
  const target = candidates[0].element;
  target.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = target.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2), y = Math.round(rect.top + rect.height / 2);
  return x > 0 && y > 0 && x < innerWidth && y < innerHeight ? { point: { x, y } } : false;
}

export const inspectVkCollection = (kind: string, name?: string) =>
  `(${findCollection.toString()})(...${JSON.stringify([kind, name ?? null])})`;
