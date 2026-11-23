export const vkFixturePrivate = 'vk-fixture-sign-in-only';
export const vkFixtureAuth = `https://id.vk.ru/auth?state=${vkFixturePrivate}`;
export const vkFixtureTracks = ['Туманная гавань', 'Северный свет'];
export const vkFixtureArtist = 'VK · Тестовый исполнитель';

// Synthetic desktop shell with the same stable IDs and sizing as VK, without account data.
export function vkDesktopPage(content, { player = '', signedOut = false } = {}) {
  return `<!doctype html><meta charset="utf-8"><title>VK Music fixture</title>
    <style>
      body { margin: 0; background: #1e2230; color: white; font: 16px sans-serif; }
      button { min-height: 28px; } svg { height: 15px; width: 15px; }
      #layout_wrapper_root { --spa-layout-width: 950px; --spa-layout-sidebar-width: 164px; --spa-layout-header-height: 48px; width: 100%; }
      #page_header_cont { position: fixed; inset: 0 0 auto; height: 48px; background: #252831; z-index: 100; }
      #page_header { display: flex; gap: 10px; margin: 0; padding: 8px; list-style: none; }
      #page_layout { width: var(--spa-layout-width) !important; margin: 0 auto; }
      .fixture-layout-body { display: flex; align-items: flex-start; padding-top: var(--spa-layout-header-height); }
      #layout_sidebar { flex: none; width: var(--spa-layout-sidebar-width); padding-top: 8px; }
      #layout_sidebar ol { margin: 0; padding: 8px; list-style: none; }
      #layout_sidebar a { color: white; display: block; padding: 4px; }
      #page_body { width: calc(var(--spa-layout-width) - var(--spa-layout-sidebar-width)) !important; }
      #spa_layout_content { padding: 8px; }
    </style>
    <div id="layout_wrapper_root">
      <div id="page_header_cont"><div id="page_header_wrap"><ul id="page_header">
        <li>${signedOut ? '<a href="/join">Регистрация</a>' : '<input id="fixture-vk-search" aria-label="Поиск VK">'}</li>
        ${player ? `<li class="TopNavigation__player--test">${player}</li>` : ''}
      </ul></div></div>
      <div id="page_layout" style="padding: 0 16px"><div class="fixture-layout-body">
        <div id="layout_sidebar"><div class="LeftMenu__root--test"><nav><ol>
          <li id="l_pr"><a href="/id42">Профиль</a><button id="fixture-profile-more">Ещё</button></li>
          <li id="l_feed"><a href="/feed">Лента</a></li><li><a href="/audio">Музыка</a></li>
        </ol></nav><div id="ads_wrapper">Дополнительный блок меню</div></div></div>
        <div id="page_body" style="width: 911px"><main id="spa_layout_content">${content}</main></div>
      </div></div>
    </div>`;
}

export const vkPublicPage = vkDesktopPage('<h1>Публичный каталог до входа</h1>', { signedOut: true });
export const vkQrPage = `<!doctype html><meta charset="utf-8"><h1 id="fixture-qr">Вход ВКонтакте по QR-коду</h1>
  <a id="fixture-auth" href="${vkFixtureAuth}">Войти другим способом</a>`;
export const vkFixtureReturn = 'https://vk.ru/feed?fixture=signed-in';
export const vkSignInPage = `<!doctype html><meta charset="utf-8"><label>Тестовая форма входа <input id="fixture-password" type="password" value="${vkFixturePrivate}"></label>
  <a id="fixture-sign-in" href="${vkFixtureReturn}">Продолжить</a>`;

export function vkPlayerPage(audioPath) {
  const player = `<div id="top_audio_layer_place" data-testid="MusicPlayer">
      <button type="button" id="fixture-previous" aria-label="Предыдущая аудиозапись">⏮</button>
      <button type="button" id="fixture-toggle" aria-label="Воспроизвести">▶</button>
      <button type="button" id="fixture-next" aria-label="Следующая аудиозапись"><svg class="vkuiIcon--skip_next_24"></svg>⏭</button>
      <span class="AudioInfo__title--test"></span><span class="AudioInfo__artist--test"></span>
    </div>`;
  return vkDesktopPage(`<h1>VK Музыка</h1><button id="fixture-music-row">Запись в каталоге</button>
    <audio preload="none" src="${audioPath}"></audio>
    <script>
      const media = document.querySelector('audio');
      const toggle = document.querySelector('#fixture-toggle');
      let index = 0;
      const tracks = ${JSON.stringify(vkFixtureTracks)};
      function update() {
        const title = tracks[index];
        const artist = ${JSON.stringify(vkFixtureArtist)};
        document.querySelector('.AudioInfo__title--test').textContent = title;
        document.querySelector('.AudioInfo__artist--test').textContent = artist;
        // VK can expose browser media metadata, or only its own visible UI.
        navigator.mediaSession.metadata = index === 0 ? new MediaMetadata({ title, artist }) : null;
        navigator.mediaSession.playbackState = index === 0 ? (media.paused ? 'paused' : 'playing') : 'none';
        toggle.setAttribute('aria-label', media.paused ? 'Воспроизвести' : 'Пауза');
      }
      toggle.onclick = () => { if (media.paused) void media.play().catch(() => {}); else media.pause(); };
      document.querySelector('#fixture-next').onclick = () => { index = 1; update(); };
      document.querySelector('#fixture-previous').onclick = () => { index = 0; update(); };
      media.onplay = media.onpause = update;
      update();
    </script>`, { player });
}

// Native media-session controls only, or just a detached Audio (no global player DOM).
// Real MP3 bytes arrive through the isolated fixture protocol; no remote audio is used.
export function vkHeadlessPlayerPage(audioPath, handlers) {
  return vkDesktopPage(`<h1>Каталог VK</h1>
    <button id="fixture-start-song">Запустить запись</button>
    <script>
      const audio = window.fixtureAudio = new Audio(${JSON.stringify(audioPath)});
      audio.preload = 'metadata';
      const media = navigator.mediaSession;
      const tracks = ${JSON.stringify(vkFixtureTracks)};
      let index = 0;
      function select() { media.metadata = new MediaMetadata({ title: tracks[index], artist: ${JSON.stringify(vkFixtureArtist)} }); }
      function time() {
        media.playbackState = audio.paused ? 'paused' : 'playing';
        if (Number.isFinite(audio.duration)) media.setPositionState({ duration: audio.duration, position: audio.currentTime });
      }
      select();
      if (${handlers}) {
        media.setPositionState({ duration: 90, position: 1 });
        media.playbackState = 'paused';
        for (const event of ['loadedmetadata', 'playing', 'pause', 'seeked']) audio.addEventListener(event, time);
        media.setActionHandler('play', ({ action }) => { window.fixtureAction = action; void audio.play().catch(() => {}); });
        media.setActionHandler('pause', ({ action }) => { window.fixtureAction = action; audio.pause(); });
        media.setActionHandler('previoustrack', ({ action }) => { window.fixtureAction = action; index = 0; select(); time(); });
        media.setActionHandler('nexttrack', ({ action }) => { window.fixtureAction = action; index = 1; select(); time(); });
        media.setActionHandler('seekto', ({ action, seekTime }) => { window.fixtureAction = action; audio.currentTime = seekTime; });
      }
      document.querySelector('#fixture-start-song').onclick = () => void audio.play().catch(() => {});
    </script>`);
}
