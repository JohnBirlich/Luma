import type { Repeat } from '../src/shared/queue.js';
import { VK_ARTWORK_HOST } from '../src/shared/vk-site.js';
import type { VkPlaybackAction } from '../src/shared/vk-site.js';

// Serialized into the guest's isolated world. Observe only rendered music controls
// and the standard Media Session. Never inspect VK internals, media URLs or login data.
function visibleMusicPlayer(action: VkPlaybackAction | 'seek' | null, ratio: number | null, artworkHost: string, gesture: 'click' | 'pointer' = 'click') {
  if (window.top !== window || location.protocol !== 'https:' || location.port
    || !['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'].includes(location.hostname)
    || !/^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/.test(location.pathname)) return;
  const header = '#page_header_cont, #page_header, #top_nav';
  const top = '#top_audio_player, #top_audio_layer_place, [class*="TopNavigation__player"]';
  const inline = '.audio_page_player2, .audio_page_player, #audio_page_player, [data-testid="audio-player"], [data-testid="music-player"], [data-testid="MusicPlayer"], [class*="AudioPagePlayer__root"], [class*="AudioPlayer__root"], [class*="MusicPlayer__root"]';
  const titleSelector = '.top_audio_player_title:not(.top_audio_player_title_out), .audio_page_player_title_song, .audio_page_player2_title, .audio_page_player_title, .audio_player__title, [class*="AudioInfo__title"], [class*="Player__title"], [data-testid="audio-player-title"], [data-testid="MusicPlayer_Title"]';
  const artistSelector = '.top_audio_player_performer, .audio_page_player_title_performer, .audio_page_player2_performer, .audio_page_player_performer, .audio_player__performer, [class*="AudioInfo__artist"], [class*="Player__artist"], [class*="Player__subtitle"], [data-testid="audio-player-artist"], [data-testid="MusicPlayer_Artist"]';
  const coverSelector = '.top_audio_player_cover, .audio_page_player_cover, .audio_page_player2_cover, .audio_page_player2_thumb, .audio_player__cover, .audio_row__cover, [class*="AudioInfo__cover"], [class*="Player__cover"], [class*="Player__artwork"], [data-testid="audio-player-cover"], [data-testid="MusicPlayer_Cover"]';
  const inlineMarker = 'data-luma-vk-inline-player', compactMarker = 'data-luma-vk-compact-player';
  const modernRow = '#page_body [class*="AudioCellCompositeRowsLayout__root"]';
  const trackRow = `._audio_row, .audio_row, [data-testid="audio-track"], ${modernRow}`;
  const laidOut = (el: Element) => {
    const { width, height } = el.getBoundingClientRect();
    return width > 0 && height > 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]')
      && el.checkVisibility({ visibilityProperty: true });
  };
  const visible = (el: Element) => laidOut(el) && el.checkVisibility({ opacityProperty: true });
  // The compact header is kept measurable and inert when hidden by Luma.
  const readable = (el: Element) => visible(el) || (laidOut(el)
    && !!el.closest(header) && getComputedStyle(el).getPropertyValue('interactivity') === 'inert');
  const actionable = (el: Element): el is HTMLElement => el instanceof HTMLElement
    && !el.matches('a, input, button[type="submit"], :disabled, .disabled') && !el.closest(`form, [aria-disabled="true"], ${trackRow}`) && readable(el);
  const signedOut = [...document.querySelectorAll(
    ':is(header,#page_header,#top_nav) a:is([href="/join"],[href^="/join?"],[href="https://vk.ru/join"],[href="https://vk.com/join"])',
  )].some(laidOut);
  if (signedOut) {
    document.documentElement.removeAttribute(inlineMarker);
    document.documentElement.removeAttribute(compactMarker);
    return action ? false : { signedOut };
  }

  const label = (node?: Element) => (node?.getAttribute('aria-label') || node?.getAttribute('title') || node?.getAttribute('data-tooltip') || '').trim();
  const pauseLabel = /^(?:пауза|приостановить(?: воспроизведение)?|pause(?: playback)?)$/i;
  const playLabel = /^(?:воспроизвести(?: трек| аудиозапись)?|продолжить|play(?: track)?|resume)$/i;
  const pauseIcon = 'svg:is([class*="vkuiIcon--pause_"],[class*="vkuiIcon--pause_outline_"])';
  const playIcon = 'svg:is([class*="vkuiIcon--play_20"],[class*="vkuiIcon--play_24"],[class*="vkuiIcon--play_28"],[class*="vkuiIcon--play_outline_"])';
  const toggle = ['.top_audio_player_play, .audio_page_player_play, .audio_page_player2_play, .audio_player_btn_play',
    new RegExp(`${playLabel.source}|${pauseLabel.source}`, 'i'), `${playIcon},${pauseIcon}`] as const;
  const previous = ['.top_audio_player_prev, .audio_page_player_prev, .audio_page_player2_prev, .audio_player_btn_prev',
    /^(?:предыдущ(?:ая аудиозапись|ий трек)|previous(?: track)?)$/i, 'svg:is([class*="vkuiIcon--skip_previous_"],[class*="vkuiIcon--skip_back_"])'] as const;
  const next = ['.top_audio_player_next, .audio_page_player_next, .audio_page_player2_next, .audio_player_btn_next',
    /^(?:следующ(?:ая аудиозапись|ий трек)|next(?: track)?)$/i, 'svg:is([class*="vkuiIcon--skip_next_"],[class*="vkuiIcon--skip_forward_"])'] as const;
  const buttons = 'button, [role="button"]';
  const pick = (scope: readonly Element[], selector: string, pattern: RegExp, icon?: string, onScreen = false) => {
    const usable = (el: Element): el is HTMLElement => actionable(el) && (!onScreen || visible(el));
    for (const root of scope) {
      const known = selector && [...root.querySelectorAll(selector)].find(usable);
      if (known) return known;
      for (const el of root.querySelectorAll(buttons)) {
        if (usable(el) && (pattern.test(label(el)) || !!(icon && el.querySelector(icon)))) return el;
      }
    }
  };
  // Mode switches are offered by the rendered player; the retained compact bar can
  // still be inert behind Luma, so an on-screen control always wins.
  const mode = (selector: string, pattern: RegExp, icon: string) =>
    pick(roots, selector, pattern, icon, true) ?? pick(roots, selector, pattern, icon);

  const inPage = [...document.querySelectorAll(inline)]
    .filter(el => !el.closest(`${header}, ${top}`) && visible(el) && pick([el], ...toggle))
    .slice(0, 12);
  // VK's current shell can render a full-width player under an unlabelled wrapper.
  // Recognize it by adjacent transport controls *and* a distinct now-playing area,
  // not by finding play buttons on ordinary catalogue rows.
  if (!inPage.some(root => pick([root], ...toggle) && pick([root], ...next))) {
    const previousNodes = new Set<Element>(document.querySelectorAll(previous[0]));
    for (const icon of document.querySelectorAll(previous[2])) {
      const button = icon.closest(buttons);
      if (button) previousNodes.add(button);
    }
    for (const button of document.querySelectorAll('button[aria-label], [role="button"][aria-label], button[title]')) {
      if (previous[1].test(label(button))) previousNodes.add(button);
    }
    for (const button of [...previousNodes].slice(0, 16)) {
      if (!actionable(button) || button.closest(`${header}, ${top}`)) continue;
      for (let root = button.parentElement, depth = 0; root && depth < 8; root = root.parentElement, depth++) {
        if (root.matches('html, body, main, #page_layout, #page_body, #spa_layout_content')) break;
        const rect = root.getBoundingClientRect();
        if (rect.height > 300) break;
        if (rect.width < 140 || !visible(root) || !pick([root], ...toggle) || !pick([root], ...next)) continue;
        const identity = root.querySelector(`${titleSelector}, ${artistSelector}, ${coverSelector}`);
        const timeline = root.querySelector('input[type="range"], [role="slider"], [role="progressbar"]');
        if ((!identity || identity.closest(trackRow)) && (!timeline || timeline.closest(trackRow)
          || !root.querySelector('img, [style*="background-image"]'))) continue;
        if (!inPage.includes(root)) inPage.unshift(root);
        break;
      }
    }
  }
  const compact = [...document.querySelectorAll(top)].filter(readable).slice(0, 8);
  const roots = [...inPage, ...compact];
  const primary = inPage[0];
  if (!action) {
    // Test the actual play control, not merely a wrapper of positive size. Count
    // the compact bar's flow height when shown, so hiding it cannot move the
    // full player out of view and make the two headers alternate while scrolling.
    const button = primary && pick([primary], ...toggle);
    const compactButton = pick(compact, ...toggle);
    const outerHeader = compactButton?.closest('#page_header_cont, #top_nav') ?? compactButton?.closest('#page_header');
    const compactStyle = outerHeader && getComputedStyle(outerHeader);
    const rect = button?.getBoundingClientRect();
    let fixed = false;
    for (let node: Element | null | undefined = button; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') { fixed = true; break; }
    }
    const stickyShift = outerHeader && compactStyle?.position === 'sticky' && !fixed
      && primary && (outerHeader.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING)
      ? outerHeader.getBoundingClientRect().height + (Number.parseFloat(compactStyle.marginBottom) || 0) + (Number.parseFloat(compactStyle.marginTop) || 0) : 0;
    const x = rect && rect.left + rect.width / 2, y = rect && rect.top + rect.height / 2 - stickyShift;
    document.documentElement.toggleAttribute(compactMarker, !!compactButton);
    document.documentElement.toggleAttribute(inlineMarker, !!(rect && x !== undefined && y !== undefined
      && x > 0 && x < innerWidth && y > 0 && y < innerHeight));
  }
  const transport = { previous: pick(roots, ...previous), toggle: pick(roots, ...toggle), next: pick(roots, ...next) };
  // VK can render the mode switches in a toolbar beside the transport row. Grow
  // the scanned region around the play button, never past the page or a tall
  // catalogue block, so those siblings are reachable without guessing at markup.
  for (let node = transport.toggle?.parentElement, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
    if (node.matches('html, body, main, #page_layout, #page_body, #spa_layout_content')) break;
    if (node.getBoundingClientRect().height > 260) break;
    if (!roots.includes(node)) roots.push(node);
  }
  const controls = {
    ...transport,
    shuffle: mode('.top_audio_player_shuffle, .audio_page_player_shuffle, .audio_page_player2_shuffle',
      /^(?:(?:включить |выключить )?(?:перемешивание|случайный порядок|случайное воспроизведение)|перемешать(?: треки| очередь)?|в случайном порядке|(?:enable |disable )?shuffle)$/i,
      'svg:is([class*="vkuiIcon--shuffle_"],[class*="vkuiIcon--shuffle_outline_"])'),
    repeat: mode('.top_audio_player_repeat, .audio_page_player_repeat, .audio_page_player2_repeat',
      /^(?:(?:(?:включить |выключить )?повтор|повторять)(?:(?:[: ]+)(?:всё|все|один трек|трек|очередь|плейлист|выключен))?|repeat(?: (?:all|one|off))?)$/i,
      'svg:is([class*="vkuiIcon--repeat_"],[class*="vkuiIcon--repeat_one_"])'),
    favorite: pick(roots, '.audio_page_player2_add, [data-testid="audio-player-library"]',
      /^(?:(?:добавить|удалить) аудиозапись|добавить в (?:мою (?:музыку|коллекцию)|аудиозаписи)|удалить из (?:моей музыки|моей коллекции|аудиозаписей)|add to (?:my music|library)|remove from (?:my music|library))$/i),
    mute: pick(roots, '', /^(?:(?:выключить|включить) звук|mute|unmute)$/i),
  };
  const media = navigator.mediaSession;
  const playing = media?.playbackState === 'playing' || (media?.playbackState !== 'paused' && (
    pauseLabel.test(label(controls.toggle)) || !!controls.toggle?.querySelector(pauseIcon)
    || controls.toggle?.matches('.playing, .audio_player_btn_playing, .audio_page_player_playing') === true
    || roots.some(root => root.matches('.top_audio_player_playing, .audio_page_player_playing, ._audio_page_player_playing'))));
  const range = (pattern: RegExp, known: string) => {
    for (const root of roots) {
      for (const input of root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
        if (!input.matches(':disabled') && !input.closest('form, [aria-disabled="true"]') && readable(input) && (input.matches(known) || pattern.test(label(input)))) {
          const min = input.min ? Number(input.min) : 0, max = input.max ? Number(input.max) : 100;
          if (Number.isFinite(min) && Number.isFinite(max) && max > min && Number.isFinite(input.valueAsNumber)) return { input, min, max };
        }
      }
    }
  };
  const volume = range(/^(?:громкость|volume)$/i, '[data-testid="audio-player-volume"], [data-testid="MusicPlayer_Volume"]');
  const seek = range(/^(?:позиция воспроизведения \(сек\.?\)|playback position \(seconds\))$/i, 'input[data-unit="seconds"][data-testid="audio-player-progress"]');
  const timeline = seek && seek.min === 0 && seek.max <= 86_400 ? { position: seek.input.valueAsNumber, duration: seek.max, seek: true } : undefined;
  if (action) {
    if (action === 'volume' || action === 'seek') {
      const slider = action === 'volume' ? volume : timeline && seek;
      if (!slider || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return false;
      slider.input.valueAsNumber = slider.min + ratio * (slider.max - slider.min);
      slider.input.dispatchEvent(new Event('input', { bubbles: true }));
      slider.input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // Some VK builds attach React handlers to pointer events only, so a plain
    // click() can be swallowed. The caller retries with a full gesture.
    const press = (control: HTMLElement) => {
      if (gesture === 'pointer') {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
          const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent;
          control.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: 1 }));
        }
      }
      control.click();
    };
    if (action === 'pause') {
      if (playing && controls.toggle) { press(controls.toggle); return true; }
      return media?.playbackState === 'paused' || playLabel.test(label(controls.toggle));
    }
    const control = controls[action];
    if (!control) return false;
    press(control);
    return true;
  }

  const active = (node: HTMLElement) => ['aria-pressed', 'aria-checked'].some(name => node.getAttribute(name) === 'true')
    || /^(?:on|active|true)$/i.test(node.getAttribute('data-state') ?? '')
    || [...node.classList].some(name => /^(?:active|on|enabled|(?:top_audio|audio_page)_player(?:2)?_(?:repeat|shuffle|add)_(?:on|active))$|__[a-z]+--(?:on|active)(?:--|$)/i.test(name));
  const repeatMode = (): Repeat | undefined => {
    const node = controls.repeat;
    if (!node) return;
    const mode = node.getAttribute('data-repeat');
    if (mode === 'all' || mode === 'one' || mode === 'off') return mode;
    const value = label(node);
    if (/(?:один трек|повторять трек|repeat one)$/i.test(value) || node.matches('.audio_page_player_repeat_one, .top_audio_player_repeat_one')
      || node.querySelector('svg[class*="vkuiIcon--repeat_one_"]')) return 'one';
    return /(?:выключить повтор|повтор[: ]+(?:всё|все|очередь)|repeat all)$/i.test(value) || active(node) ? 'all' : 'off';
  };
  const text = (root: Element, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].find(readable)?.innerText.trim().slice(0, 256) || '';
  const key = (s = '') => s.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  const recording = (a: HTMLAnchorElement) => {
    if (!['https://vk.ru', 'https://vk.com'].includes(a.origin) || a.username || a.password) return;
    const id = /^\/(?:audio|music\/track\/)(-?[1-9]\d{0,14}_[1-9]\d{0,14})\/?$/.exec(a.pathname)?.[1];
    return id && `https://vk.ru/audio${id}`;
  };
  const trackAnchors = (root: Element) => [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a => recording(a));
  const directLink = (root: Element) => {
    const hrefs = new Set(trackAnchors(root).filter(readable).map(recording));
    return hrefs.size === 1 ? [...hrefs][0] : undefined;
  };
  const names = (root: Element) => {
    let title = text(root, titleSelector), artist = text(root, artistSelector);
    // Only accept the text of a direct track link as an unlabelled player title.
    if (!title) title = trackAnchors(root).find(readable)?.innerText.trim().slice(0, 256) ?? '';
    if (!artist) {
      const combined = /^(.+?)\s+[–—]\s+(.+)$/.exec(title);
      if (combined) [, artist, title] = combined;
    }
    return { root, title, artist };
  };
  const metadata = media?.metadata;
  const picked = roots.map(names).filter(source => !!source.title);
  const primaryNames = picked.find(source => source.root === primary && source.artist);
  const title = primaryNames?.title || metadata?.title?.trim().slice(0, 256) || picked[0]?.title || '';
  const artist = primaryNames?.artist || metadata?.artist?.trim().slice(0, 256) || picked.find(source => key(source.title) === key(title))?.artist || '';
  const matches = (source: { title: string; artist: string }) => title && key(source.title) === key(title)
    && (!artist || !source.artist || key(source.artist) === key(artist));
  const rows = [...document.querySelectorAll('._audio_row_playing, .audio_row_playing, [data-testid="audio-track"][data-playing="true"]')].filter(visible).slice(0, 6);
  const relevant = [...picked.filter(matches).map(({ root }) => root), ...rows.filter(row => matches({
    title: text(row, '.audio_row__title_inner, .audio_row__title, [data-testid="audio-track-title"]'),
    artist: text(row, '.audio_row__performers, [data-testid="audio-track-artist"]'),
  }))];
  const playerLink = relevant.map(directLink).find(Boolean);
  // A newer VK catalogue can have the only rendered copy of the active cover.
  // Look at bounded, identifiable music rows, and require either a matching
  // track link or one unambiguous match for the current title and artist.
  const rendered = [];
  if (title && (artist || playerLink)) {
    const wantedTitle = key(title), wantedArtist = key(artist);
    for (const row of [...document.querySelectorAll(modernRow)].slice(0, 180)) {
      const anchors = trackAnchors(row);
      if (anchors.length !== 1 || key(anchors[0].textContent ?? '') !== wantedTitle) continue;
      const href = recording(anchors[0]);
      if (playerLink ? href !== playerLink : key([...row.querySelectorAll('a[href^="/artist/"]')].map(a => a.textContent?.trim()).filter(Boolean).join(', ')) !== wantedArtist) continue;
      if (!visible(row) || !visible(anchors[0])) continue;
      const image = [...row.querySelectorAll('img')].find(visible);
      if (image) rendered.push({ href, image, active: !!row.querySelector(`${pauseIcon}, [aria-label="Пауза"], [aria-label="Pause"]`) });
    }
  }
  const playingRows = rendered.filter(row => row.active);
  const matching = playingRows.length ? playingRows : rendered;
  const row = matching[0] && matching.every(other => other.href === matching[0].href) ? matching[0] : undefined;
  const link = playerLink ?? row?.href;
  const artwork: string[] = [];
  const host = new RegExp(artworkHost);
  const isCdn = (src: string) => {
    const url = src.length <= 2_048 && URL.parse(src);
    return !!url && url.protocol === 'https:' && !url.username && !url.password && !url.port && host.test(url.hostname);
  };
  const push = (src: string) => { if (artwork.length < 8 && isCdn(src) && !artwork.includes(src)) artwork.push(src); };
  if (metadata && matches(metadata)) {
    const score = (sizes = '') => {
      const px = Math.max(0, ...[...sizes.slice(0, 120).matchAll(/\b(\d{1,4})x(\d{1,4})\b/g)].map((match) => Math.min(Number(match[1]), Number(match[2]))));
      return px >= 640 && px <= 1400 ? 2200 - px : px < 640 ? px : -1;
    };
    for (const image of [...metadata.artwork.slice(0, 12)].sort((a, b) => score(b.sizes) - score(a.sizes))) {
      if (artwork.length < 2) push(image.src);
    }
  }
  const sources = (cover: Element) => {
    const img = cover instanceof HTMLImageElement ? cover : cover.querySelector('img');
    const background = getComputedStyle(cover).backgroundImage;
    return [...(img && readable(img) ? [img.currentSrc || img.src] : []),
      ...Array.from(background.matchAll(/url\(["']?(https:\/\/[^"'()\s]+)["']?\)/g), match => match[1])].filter(isCdn);
  };
  for (const root of relevant) {
    for (const cover of [...root.querySelectorAll(coverSelector)].filter(readable).slice(0, 8)) sources(cover).forEach(push);
  }
  // An unmarked thumbnail is usable only in the recognized full transport, and
  // only if it is unambiguous. Never scan the catalogue for arbitrary covers.
  if (primary && (!picked.some(({ root }) => root === primary) || relevant.includes(primary)) && title) {
    const images = [...primary.querySelectorAll('img, [style*="background-image"]')].filter(el => visible(el) && !el.closest('[class*="Avatar"], [class*="avatar"]')).slice(0, 12);
    const covers = new Set(images.flatMap(sources));
    if (covers.size === 1) [...covers].forEach(push);
  }
  if (row) sources(row.image).forEach(push);
  return { title, artist, link, playing, previous: !!controls.previous, toggle: !!controls.toggle, next: !!controls.next, timeline,
    shuffle: controls.shuffle && (active(controls.shuffle) || /^(?:выключить |disable )/i.test(label(controls.shuffle))), repeat: repeatMode(),
    favorite: controls.favorite && (active(controls.favorite) || /^(?:удалить|remove) /i.test(label(controls.favorite)) || !!controls.favorite.querySelector('svg[class*="vkuiIcon--done_"]')),
    volume: volume && (volume.input.valueAsNumber - volume.min) / (volume.max - volume.min), canMute: !!controls.mute, artwork };
}

export const inspectVkPlayer = (action: VkPlaybackAction | 'seek' | null = null, ratio?: number, gesture: 'click' | 'pointer' = 'click') =>
  `(${visibleMusicPlayer.toString()})(...${JSON.stringify([action, ratio ?? null, VK_ARTWORK_HOST.source, gesture])})`;
