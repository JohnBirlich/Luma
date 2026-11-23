import type { Repeat } from '../src/shared/queue.js';
import type { VkPlaybackAction } from '../src/shared/vk-site.js';

// Serialized into the guest's isolated world. Use only MediaSession and public,
// rendered controls of known player roots, not VK's internal objects or track URLs.
function visibleMusicPlayer(action: VkPlaybackAction | 'seek' | null, ratio: number | null) {
  if (window.top !== window || location.protocol !== 'https:' || location.port
    || !['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'].includes(location.hostname)
    || !/^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/.test(location.pathname)) return;
  const laidOut = (el: Element) => {
    const { width, height } = el.getBoundingClientRect();
    return width > 0 && height > 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]')
      && el.checkVisibility({ visibilityProperty: true });
  };
  const visible = (el: Element) => laidOut(el) && el.checkVisibility({ opacityProperty: true });
  const header = '#page_header_cont, #page_header, #top_nav';
  const top = '#top_audio_player, #top_audio_layer_place, [class*="TopNavigation__player--"]';
  const inline = '.audio_page_player2, .audio_page_player, #audio_page_player, [data-testid="audio-player"], [data-testid="music-player"], [data-testid="MusicPlayer"]';
  // Offscreen is not the same as hidden: e.g. a transport above a scrolled track list.
  // Luma's CSS-only header hiding is the one exception where opacity doesn't disqualify controls.
  const readable = (el: Element) => visible(el) || (laidOut(el)
    && !!el.closest(header) && getComputedStyle(el).getPropertyValue('interactivity') === 'inert');
  const inPage = [...document.querySelectorAll(inline)].filter(el => !el.closest(`${header}, ${top}`) && visible(el));
  const roots = [...inPage, ...[...document.querySelectorAll(`${top}, ${inline}`)].filter(el => !inPage.includes(el) && readable(el))];
  const actionable = (el: Element): el is HTMLElement => el instanceof HTMLElement
    && !el.matches('a, input, button[type="submit"], :disabled, [aria-disabled="true"]') && !el.closest('form') && readable(el);
  const label = (node?: Element) => (node?.getAttribute('aria-label') || node?.getAttribute('title') || '').trim();
  const pauseLabel = /^(?:пауза|приостановить(?: воспроизведение)?|pause(?: playback)?)$/i;
  const playLabel = /^(?:воспроизвести(?: трек| аудиозапись)?|продолжить|play(?: track)?|resume)$/i;
  const pauseIcon = 'svg:is([class*="vkuiIcon--pause_"],[class*="vkuiIcon--pause_outline_"])';
  const playIcon = 'svg:is([class*="vkuiIcon--play_20"],[class*="vkuiIcon--play_24"],[class*="vkuiIcon--play_28"],[class*="vkuiIcon--play_outline_"])';
  const toggleSelector = '.top_audio_player_play, .audio_page_player_play, .audio_page_player2_play, .audio_player_btn_play';
  const pick = (selector: string, pattern: RegExp, icon?: string, scope = roots) => {
    for (const root of scope) {
      const known = selector && [...root.querySelectorAll(selector)].find(actionable);
      if (known) return known;
      for (const el of root.querySelectorAll('button, [role="button"]')) {
        if (actionable(el) && (pattern.test(label(el)) || (icon && el.querySelector(icon)))) return el;
      }
    }
  };
  const pickToggle = (scope?: Element[]) => pick(toggleSelector, new RegExp(`${playLabel.source}|${pauseLabel.source}`, 'i'), `${playIcon},${pauseIcon}`, scope);
  // Some sign-in landings have the music URL, so check the public navigation only.
  const signedOut = [...document.querySelectorAll(
    ':is(header,#page_header,#top_nav) a:is([href="/join"],[href^="/join?"],[href="https://vk.ru/join"],[href="https://vk.com/join"])',
  )].some(laidOut);
  if (signedOut) {
    document.documentElement.removeAttribute('data-luma-vk-inline-player');
    return action ? false : { signedOut };
  }
  if (!action) document.documentElement.toggleAttribute('data-luma-vk-inline-player', !!pickToggle(inPage));

  const controls = {
    previous: pick('.top_audio_player_prev, .audio_page_player_prev, .audio_page_player2_prev, .audio_player_btn_prev',
      /^(?:предыдущ(?:ая аудиозапись|ий трек)|previous(?: track)?)$/i, 'svg:is([class*="vkuiIcon--skip_previous_"],[class*="vkuiIcon--skip_back_"])'),
    toggle: pickToggle(),
    next: pick('.top_audio_player_next, .audio_page_player_next, .audio_page_player2_next, .audio_player_btn_next',
      /^(?:следующ(?:ая аудиозапись|ий трек)|next(?: track)?)$/i, 'svg:is([class*="vkuiIcon--skip_next_"],[class*="vkuiIcon--skip_forward_"])'),
    shuffle: pick('.top_audio_player_shuffle, .audio_page_player_shuffle, .audio_page_player2_shuffle',
      /^(?:(?:включить |выключить )?(?:перемешивание|случайный порядок)|перемешать(?: треки| очередь)?|(?:enable |disable )?shuffle)$/i),
    repeat: pick('.top_audio_player_repeat, .audio_page_player_repeat, .audio_page_player2_repeat',
      /^(?:(?:(?:включить |выключить )?повтор|повторять)(?:(?:[: ]+)(?:всё|все|один трек|трек|очередь|выключен))?|repeat(?: (?:all|one|off))?)$/i),
    favorite: pick('', /^(?:(?:добавить|удалить) аудиозапись|добавить в (?:мою (?:музыку|коллекцию)|аудиозаписи)|удалить из (?:моей музыки|моей коллекции|аудиозаписей)|add to (?:my music|library)|remove from (?:my music|library))$/i),
    mute: pick('', /^(?:(?:выключить|включить) звук|mute|unmute)$/i),
  };
  const media = navigator.mediaSession;
  const playing = media?.playbackState === 'playing' || (media?.playbackState !== 'paused' && (
    pauseLabel.test(label(controls.toggle)) || !!controls.toggle?.querySelector(pauseIcon)
    || controls.toggle?.matches('.playing, .audio_player_btn_playing, .audio_page_player_playing') === true
    || roots.some(root => root.matches('.top_audio_player_playing, .audio_page_player_playing, ._audio_page_player_playing'))));
  const range = (pattern: RegExp, known: string) => {
    for (const root of roots) {
      for (const input of root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
        if (!input.disabled && !input.closest('form, [aria-disabled="true"]') && readable(input) && (input.matches(known) || pattern.test(label(input)))) {
          const min = input.min ? Number(input.min) : 0, max = input.max ? Number(input.max) : 100;
          if (Number.isFinite(min) && Number.isFinite(max) && max > min && Number.isFinite(input.valueAsNumber)) return { input, min, max };
        }
      }
    }
  };
  const volume = range(/^(?:громкость|volume)$/i, '[data-testid="audio-player-volume"], [data-testid="MusicPlayer_Volume"]');
  // Only a semantic range measured in seconds can serve as a DOM timeline. A
  // percent-based/custom progress bar is not evidence of a track duration.
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
    if (action === 'pause') {
      // A toggle is a pause only when we positively know which direction it will switch.
      if (playing && controls.toggle) { controls.toggle.click(); return true; }
      return media?.playbackState === 'paused' || playLabel.test(label(controls.toggle));
    }
    const control = controls[action];
    if (control) control.click();
    return !!control;
  }

  const active = (node: HTMLElement) => ['aria-pressed', 'aria-checked'].some(name => node.getAttribute(name) === 'true')
    || /^(?:on|active|true)$/i.test(node.getAttribute('data-state') ?? '')
    || [...node.classList].some(name => /^(?:active|on|enabled|(?:top_audio|audio_page)_player(?:2)?_(?:repeat|shuffle)_(?:on|active))$/.test(name));
  const repeatMode = (): Repeat | undefined => {
    const node = controls.repeat;
    if (!node) return;
    const mode = node.getAttribute('data-repeat');
    if (mode === 'all' || mode === 'one' || mode === 'off') return mode;
    const value = label(node);
    if (/(?:один трек|repeat one)$/i.test(value) || node.matches('.audio_page_player_repeat_one, .top_audio_player_repeat_one')) return 'one';
    if (/(?:выключить повтор|повтор[: ]+(?:всё|все|очередь)|repeat all)$/i.test(value) || active(node)) return 'all';
    return 'off';
  };
  const titleSelector = '.top_audio_player_title:not(.top_audio_player_title_out), .audio_page_player_title_song, .audio_page_player2_title, .audio_page_player_title, .audio_player__title, [class*="AudioInfo__title--"], [data-testid="audio-player-title"], [data-testid="MusicPlayer_Title"]';
  const artistSelector = '.top_audio_player_performer, .audio_page_player_title_performer, .audio_page_player2_performer, .audio_page_player_performer, .audio_player__performer, [class*="AudioInfo__artist--"], [data-testid="audio-player-artist"], [data-testid="MusicPlayer_Artist"]';
  const text = (root: Element, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].find(readable)?.innerText.trim().slice(0, 256) || '';
  const names = (root: Element) => {
    let title = text(root, titleSelector), artist = text(root, artistSelector);
    if (!artist) {
      const combined = /^(.+?)\s+[–—]\s+(.+)$/.exec(title);
      if (combined) [, artist, title] = combined;
    }
    return { title, artist };
  };
  const metadata = media?.metadata;
  // Use one source for the names. Never pair an old artist from another player with a new title.
  const picked = roots.map(root => ({ root, ...names(root) })).filter(source => !!source.title);
  const title = metadata?.title?.trim().slice(0, 256) || picked[0]?.title || '';
  const key = (s = '') => s.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  const same = picked.filter(source => key(source.title) === key(title) && (!metadata?.artist || !source.artist || key(source.artist) === key(metadata.artist)));
  const artist = metadata?.artist?.trim().slice(0, 256) || same[0]?.artist || '';
  const artwork: string[] = [];
  const push = (src: string) => { if (src.length <= 2_048 && /^https:\/\/sun\d/i.test(src) && !artwork.includes(src)) artwork.push(src); };
  if (title && metadata?.title) {
    const size = (sizes: string) => Math.max(0, ...[...sizes.slice(0, 120).matchAll(/\b(\d{1,4})x(\d{1,4})\b/g)].map((match) => Math.min(Number(match[1]), Number(match[2]))));
    const score = (sizes = '') => { const px = size(sizes); return px >= 640 && px <= 1400 ? 2200 - px : px < 640 ? px : -1; };
    for (const image of [...metadata.artwork.slice(0, 12)].sort((a, b) => score(b.sizes) - score(a.sizes))) {
      if (artwork.length < 3) push(image.src);
    }
  }
  // Only inspect marked cover art in the matching player or the explicitly playing row.
  // Generic img lookup can accidentally select an avatar or recommendation.
  const coverSelector = '.top_audio_player_cover, .audio_page_player_cover, .audio_page_player2_cover, .audio_page_player2_thumb, .audio_player__cover, .audio_row__cover, [class*="AudioInfo__cover--"], [data-testid="audio-player-cover"], [data-testid="MusicPlayer_Cover"]';
  const rows = [...document.querySelectorAll('._audio_row_playing, .audio_row_playing, [data-testid="audio-track"][data-playing="true"]')].filter(visible);
  const coverRoots = [...same.map(({ root }) => root), ...rows.filter(row => {
    const rowTitle = text(row, '.audio_row__title_inner, .audio_row__title, [data-testid="audio-track-title"]');
    const rowArtist = text(row, '.audio_row__performers, [data-testid="audio-track-artist"]');
    return title && key(rowTitle) === key(title) && (!rowArtist || !artist || key(rowArtist) === key(artist));
  })];
  for (const root of coverRoots) {
    for (const cover of root.querySelectorAll(coverSelector)) {
      if (!readable(cover)) continue;
      const img = cover instanceof HTMLImageElement ? cover : cover.querySelector('img');
      // currentSrc reflects VK's resolution choice; inline background images are common in the old player.
      if (img) push(img.currentSrc || img.src);
      const background = getComputedStyle(cover).backgroundImage;
      for (const match of background.matchAll(/url\(["']?(https:\/\/[^"'()\s]+)["']?\)/g)) push(match[1]);
      if (artwork.length >= 6) break;
    }
    if (artwork.length >= 6) break;
  }
  return { title, artist, playing, previous: !!controls.previous, toggle: !!controls.toggle, next: !!controls.next, timeline,
    shuffle: controls.shuffle && (active(controls.shuffle) || /^(?:выключить |disable )/i.test(label(controls.shuffle))), repeat: repeatMode(),
    favorite: controls.favorite && (active(controls.favorite) || /^(?:удалить|remove)\b|^удалить /i.test(label(controls.favorite))),
    volume: volume && (volume.input.valueAsNumber - volume.min) / (volume.max - volume.min), artwork: artwork.slice(0, 6) };
}

export const inspectVkPlayer = (action: VkPlaybackAction | 'seek' | null = null, ratio?: number) =>
  `(${visibleMusicPlayer.toString()})(...${JSON.stringify([action, ratio ?? null])})`;
