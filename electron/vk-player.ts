import type { VkTransport } from '../src/shared/vk-site.js';

// Serialized into an isolated JS world. Only public MediaSession text and visible controls;
// no calls into VK's private player internals, account DOM, storage, or requests.
function visibleMusicPlayer(action: VkTransport | null) {
  if (window.top !== window || location.protocol !== 'https:' || location.port
    || !['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'].includes(location.hostname)
    || !/^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/.test(location.pathname)) return;
  const shown = (el: Element) => {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight
      && style.visibility === 'visible' && style.opacity !== '0' && !el.closest('[hidden], [inert], [aria-hidden="true"]');
  };
  const roots = [...document.querySelectorAll([
    '#top_audio_player', '#top_audio_layer_place', '[class*="TopNavigation__player--"]', '.audio_page_player', '.audio_page_player2',
    '[data-testid="audio-player"]', '[data-testid="music-player"]', '[data-testid="MusicPlayer"]',
  ].join(','))].filter(shown);
  const available = (el: Element): el is HTMLElement => el instanceof HTMLElement
    && !el.matches('a, input, button[type="submit"], :disabled, [aria-disabled="true"]') && !el.closest('form') && shown(el);
  const pauseLabel = /^(?:пауза|приостановить(?: воспроизведение)?|pause(?: playback)?)$/i;
  const playLabel = /^(?:воспроизвести(?: трек)?|продолжить|play(?: track)?|resume)$/i;
  const previousLabel = /^(?:предыдущ(?:ая аудиозапись|ий трек)|previous(?: track)?)$/i;
  const nextLabel = /^(?:следующ(?:ая аудиозапись|ий трек)|next(?: track)?)$/i;
  const pauseIcon = 'svg:is([class*="vkuiIcon--pause_"],[class*="vkuiIcon--pause_outline_"])';
  const playIcon = 'svg:is([class*="vkuiIcon--play_20"],[class*="vkuiIcon--play_24"],[class*="vkuiIcon--play_28"],[class*="vkuiIcon--play_outline_"])';
  const label = (node: Element | undefined) => node?.getAttribute('aria-label')?.trim() || node?.getAttribute('title')?.trim() || '';

  const pick = (selector: string, matches: (node: Element) => boolean, icon: string) => {
    for (const root of roots) {
      const known = [...root.querySelectorAll(selector)].find(available);
      if (known) return known;
      for (const el of root.querySelectorAll('button, [role="button"]')) {
        if (available(el) && (matches(el) || el.querySelector(icon))) return el;
      }
    }
  };
  const controls = {
    previous: pick('.top_audio_player_prev, .audio_page_player_prev, .audio_player_btn_prev', (node) => previousLabel.test(label(node)),
      'svg:is([class*="vkuiIcon--skip_previous_"],[class*="vkuiIcon--skip_back_"])'),
    toggle: pick('.top_audio_player_play, .audio_page_player_play, .audio_player_btn_play', (node) => playLabel.test(label(node)) || pauseLabel.test(label(node)),
      `${playIcon},${pauseIcon}`),
    next: pick('.top_audio_player_next, .audio_page_player_next, .audio_player_btn_next', (node) => nextLabel.test(label(node)),
      'svg:is([class*="vkuiIcon--skip_next_"],[class*="vkuiIcon--skip_forward_"])'),
  };
  if (action) {
    const control = controls[action];
    if (control) control.click();
    return !!control;
  }
  const text = (selector: string) => {
    for (const root of roots) {
      const el = [...root.querySelectorAll<HTMLElement>(selector)].find(shown);
      if (el?.innerText.trim()) return el.innerText.trim().slice(0, 256);
    }
    return '';
  };
  const media = navigator.mediaSession;
  let title = media?.metadata?.title?.slice(0, 256) || text([
    '.top_audio_player_title:not(.top_audio_player_title_out)', '.audio_page_player_title_song', '.audio_page_player_title',
    '.audio_player__title', '[class*="AudioInfo__title--"]', '[data-testid="audio-player-title"]', '[data-testid="MusicPlayer_Title"]',
  ].join(','));
  let artist = media?.metadata?.artist?.slice(0, 256) || text([
    '.top_audio_player_performer', '.audio_page_player_title_performer', '.audio_page_player_performer',
    '.audio_player__performer', '[class*="AudioInfo__artist--"]', '[data-testid="audio-player-artist"]', '[data-testid="MusicPlayer_Artist"]',
  ].join(','));
  if (!media?.metadata?.title && !artist) {
    const combined = /^(.+?)\s+[–—]\s+(.+)$/.exec(title);
    if (combined) [, artist, title] = combined;
  }
  const playing = media?.playbackState === 'playing' || (media?.playbackState !== 'paused' && (
    pauseLabel.test(label(controls.toggle)) || !!controls.toggle?.querySelector(pauseIcon)
    || roots.some((root) => root.matches('.top_audio_player_playing, .audio_page_player_playing, ._audio_page_player_playing')
      || !!root.querySelector('.audio_page_player_play.playing, .audio_player_btn_play.playing, .audio_player_btn_playing'))));
  return { title, artist, playing, previous: !!controls.previous, toggle: !!controls.toggle, next: !!controls.next };
}

export const inspectVkPlayer = (action: VkTransport | null = null) => `(${visibleMusicPlayer.toString()})(${JSON.stringify(action)})`;
