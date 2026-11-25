export const vkFixturePrivate = 'vk-fixture-sign-in-only';
export const vkFixtureAuth = `https://id.vk.ru/auth?state=${vkFixturePrivate}`;
export const vkFixtureTracks = ['Туманная гавань', 'Северный свет'];
export const vkFixtureArtist = 'VK · Тестовый исполнитель';
export const vkFixturePhoto = 'https://sun9-42.vkuserphoto.ru/impg/luma-fixture-now-playing.jpg?size=200x200&quality=95&sign=fixture&c_uniq_tag=fixture&type=album';
export const vkFixtureCovers = ['https://sun9-42.userapi.com/impg/luma-fixture-cover.webp?size=640x640&sign=fixture',
  'https://sun9-42.userapi.com/s/v1/luma-fixture-inline.webp'];

// Synthetic desktop shell with the same stable IDs and sizing as VK, without account data.
export function vkDesktopPage(content, { player = '', signedOut = false, legacy = false } = {}) {
  const header = `<div id="${legacy ? 'top_nav' : 'page_header_cont'}"><div id="page_header_wrap" style="margin-left: 4px"><ul id="page_header">
    <li><a href="/feed" id="fixture-vk-home">ВКонтакте</a></li>
    <li>${signedOut ? '<a href="/join">Регистрация</a>' : '<input id="fixture-vk-search" aria-label="Поиск VK">'}</li>
    ${player ? `<li${legacy ? '' : ' class="TopNavigation__player--test"'}>${player}</li>` : ''}
    <li><button id="fixture-vk-account">Аккаунт</button></li>
  </ul></div></div>`;
  // The account name Luma reads for the statistics screen; the link stays VK's own.
  const profile = '<a href="/id42"><span class="l_pr_row_name">Даниил Ефремов</span></a>';
  const sidebar = `<div id="${legacy ? 'side_bar' : 'layout_sidebar'}"><div class="LeftMenu__root--test"><nav><ol>
    <li id="l_pr">${legacy ? `<span>${profile}</span>` : profile}<button id="fixture-profile-more">Ещё</button></li>
    <li id="l_feed"><a href="/feed">Лента</a></li><li><a href="/audio">Музыка</a></li>
  </ol></nav><div id="ads_wrapper">Дополнительный блок меню</div></div></div>`;
  const body = `<div id="page_body" style="width: 911px"><main id="${legacy ? 'content' : 'spa_layout_content'}">${content}</main></div>`;
  const layout = `<div id="page_layout" style="padding: 0 16px"><div class="fixture-layout-body">
    ${legacy ? `<div>${sidebar}</div><div class="fixture-wrapped-content">${body}</div>` : `${sidebar}${body}`}
  </div></div>`;
  return `<!doctype html><meta charset="utf-8"><title>VK Music fixture</title>
    <style>
      :root { color-scheme: dark; --fixture-page: #1e2230; --fixture-panel: #252831; --fixture-text: white; }
      :root[data-fixture-theme="light"] { color-scheme: light; --fixture-page: #edeef0; --fixture-panel: white; --fixture-text: #181818; }
      body { margin: 0; background: var(--fixture-page); color: var(--fixture-text); font: 16px sans-serif; }
      button { min-height: 28px; } svg { height: 15px; width: 15px; }
      #layout_wrapper_root {
        --spa-layout-width: 950px; --spa-layout-sidebar-width: 164px; --spa-layout-header-height: 48px;
        --spa-layout-contnet-width: calc(var(--spa-layout-width) - var(--spa-layout-sidebar-width));
        --spa-layout-with-scrollbar-width: var(--spa-layout-with-scrollbar-width-by-js);
        width: var(--spa-layout-with-scrollbar-width);
      }
      :is(#page_header_cont, #top_nav) {
        position: fixed; inset: 0 0 auto; width: var(--spa-layout-with-scrollbar-width, 964px) !important;
        height: 48px; background: var(--fixture-panel); z-index: 100;
      }
      #page_header_wrap { width: var(--spa-layout-width, 950px) !important; height: inherit; }
      #page_header { display: flex; align-items: center; gap: 10px; height: inherit; margin: 0; padding: 0 8px; list-style: none; }
      #page_layout { width: var(--spa-layout-width, 950px) !important; margin: 0 auto; }
      .fixture-layout-body { display: flex; align-items: flex-start; padding-top: var(--spa-layout-header-height, 48px); }
      .fixture-legacy-wrap { width: 964px; max-width: 964px; margin: 0 auto; }
      :is(#layout_sidebar, #side_bar) { flex: none; width: var(--spa-layout-sidebar-width, 164px); padding-top: 8px; }
      :is(#layout_sidebar, #side_bar) ol { margin: 0; padding: 8px; list-style: none; }
      :is(#layout_sidebar, #side_bar) a { color: inherit; display: block; padding: 4px; }
      #page_body { width: var(--spa-layout-contnet-width, 750px) !important; }
      .FCPanel { position: fixed; right: 0; top: 58px; width: 64px; background: var(--fixture-panel); z-index: 101; }
      .fixture-vk-player { display: flex; align-items: center; min-width: 0; gap: 4px; }
      .fixture-vk-player .audio_page_player2_thumb { width: 34px; height: 34px; flex: none; background-size: cover; }
      .fixture-vk-player input[type=range] { width: min(70px, 10vw); }
      .fixture-vk-player :is(span, .AudioInfo__title--test) { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .fixture-vk-player img { flex: none; }
      .fixture-music-block { padding: 12px; margin-bottom: 12px; border-radius: 8px; background: var(--fixture-panel); }
      .fixture-music-block h2 { margin: 0 0 6px; font-size: 16px; }
      #fixture-music-search { display: block; width: 100%; box-sizing: border-box; margin: 8px 0; }
      .fixture-mix { padding: 20px 0; text-align: center; }
      .fixture-music-cards { display: flex; gap: 8px; overflow-x: auto; }
      .fixture-music-cards button { flex: 0 0 min(100%, 140px); }
    </style>
    ${legacy ? `${header}<div id="page_wrap" class="fixture-legacy-wrap">${layout}</div>`
      : `<div id="page_wrap"><div id="spa_root"><div id="layout_wrapper_root" style="--spa-layout-with-scrollbar-width-by-js: 964px">
        ${header}${layout}
      </div></div></div>`}
    <section id="fastchat-reforged"><div class="FCApp"><aside class="FCPanel">
      <button class="FCPanel__widthToggle" aria-label="Свернуть список чатов">«</button>
      <div class="FCPanel__list"><button id="fixture-chat">Тестовый чат</button></div>
    </aside></div></section>
    <section id="fastchat-reforged-modals"></section>`;
}

export const vkPublicPage = vkDesktopPage('<h1>Публичный каталог до входа</h1>', { signedOut: true });
export const vkQrPage = `<!doctype html><meta charset="utf-8"><h1 id="fixture-qr">Вход ВКонтакте по QR-коду</h1>
  <a id="fixture-auth" href="${vkFixtureAuth}">Войти другим способом</a>`;
export const vkFixtureReturn = 'https://vk.ru/feed?fixture=signed-in';
export const vkSignInPage = `<!doctype html><meta charset="utf-8"><label>Тестовая форма входа <input id="fixture-password" type="password" value="${vkFixturePrivate}"></label>
  <a id="fixture-sign-in" href="${vkFixtureReturn}">Продолжить</a>`;

export function vkPlayerPage(audioPath, { inline = false, legacy = false, unmarked = false } = {}) {
  const player = `<div ${inline ? `class="fixture-vk-player${unmarked ? '' : ' audio_page_player2'}" id="fixture-inline"` : `class="fixture-vk-player" id="${legacy ? 'top_audio_player' : 'top_audio_layer_place'}"`}>
      <button type="button" id="fixture-previous" aria-label="Предыдущая аудиозапись">⏮</button>
      <button type="button" id="fixture-toggle" aria-label="Воспроизвести">▶</button>
      <button type="button" id="fixture-next" aria-label="Следующая аудиозапись"><svg class="vkuiIcon--skip_next_24"></svg>⏭</button>
      ${unmarked ? '<img id="fixture-thumb" width="34" height="34" alt="">' : '<span class="audio_page_player2_thumb"></span>'}
      ${unmarked ? `<a class="AudioInfo__title--test" href="/audio123_456?tracking=fixture-private"></a>` : '<span class="AudioInfo__title--test"></span>'}<span class="AudioInfo__artist--test"></span>
      <button type="button" id="fixture-shuffle" ${unmarked ? 'aria-pressed="false"><svg class="vkuiIcon--shuffle_20"></svg>' : 'aria-label="Перемешивание" aria-pressed="false">⇄'}</button>
      <button type="button" id="fixture-repeat" ${unmarked ? 'data-repeat="off"><svg class="vkuiIcon--repeat_20"></svg>' : 'aria-label="Повтор" data-repeat="off">↻'}</button>
      <button type="button" id="fixture-save" aria-label="Добавить в мою музыку">＋</button>
      <button type="button" id="fixture-like" ${unmarked ? 'aria-pressed="false"><svg class="vkuiIcon--like_outline_20"></svg>' : 'aria-label="Нравится" aria-pressed="false">♡'}</button>
      <button type="button" id="fixture-dislike" ${unmarked ? 'aria-pressed="false"><svg class="vkuiIcon--dislike_outline_20"></svg>' : 'aria-label="Не нравится" aria-pressed="false">✕'}</button>
      <input type="range" id="fixture-volume" aria-label="Громкость" min="0" max="100" value="100">
      <button type="button" id="fixture-mute" aria-label="Выключить звук">◉</button>
    </div>`;
  const row = `<div class="AudioCellCompositeRowsLayout__root" id="fixture-track-row">
    <button aria-label="Воспроизвести" type="button"><svg class="vkuiIcon--play_20"></svg></button>
    <img width="34" height="34" alt="" src="${vkFixturePhoto.replaceAll('&', '&amp;')}">
    <a href="/audio123_456">${vkFixtureTracks[0]}</a><a href="/artist/fixture">${vkFixtureArtist}</a>
  </div>`;
  return vkDesktopPage(`${inline ? player : ''}
    <section class="fixture-music-block" aria-label="VK Музыка">
      <div role="tablist" aria-label="Разделы VK Музыки">
        <button role="tab" aria-selected="true">Главная</button><button role="tab" aria-selected="false">Обзор</button>
      </div>
      <input id="fixture-music-search" type="search" aria-label="Поиск музыки" placeholder="Поиск музыки">
      <div class="fixture-mix"><button id="fixture-mix">Слушать VK Микс</button></div>
    </section>
    <section class="fixture-music-block"><h2>Мои треки</h2><button id="fixture-music-row">Запись в каталоге</button>${unmarked ? row : ''}</section>
    <section class="fixture-music-block"><h2>Собрано алгоритмами</h2>
      <div class="fixture-music-cards"><button id="fixture-recommendation">Для вас</button><button>Открытия</button><button>Новинки</button></div>
    </section>
    <section class="fixture-music-block"><h2>Жанры</h2><div class="fixture-music-cards"><button id="fixture-genre">Джаз</button></div></section>
    <div style="height:1400px" aria-hidden="true"></div>
    <audio preload="none" src="${audioPath}"></audio>
    <script>
      const media = document.querySelector('audio');
      const toggle = document.querySelector('#fixture-toggle');
      let index = 0;
      const tracks = ${JSON.stringify(vkFixtureTracks)}, covers = ${JSON.stringify(vkFixtureCovers)};
      function update() {
        const title = tracks[index];
        const artist = ${JSON.stringify(vkFixtureArtist)};
        document.querySelector('.AudioInfo__title--test').textContent = title;
        document.querySelector('.AudioInfo__artist--test').textContent = artist;
        // VK can expose browser media metadata, or only its own visible UI.
        const thumb = document.querySelector('#fixture-thumb');
        if (thumb) {
          if (index) thumb.src = covers[1];
          else thumb.removeAttribute('src');
          document.querySelector('.AudioInfo__title--test').href = (index ? '/audio123_457' : '/audio123_456') + '?tracking=fixture-private';
        } else document.querySelector('.audio_page_player2_thumb').style.backgroundImage = index === 1 ? 'url("' + covers[1] + '")' : 'none';
        navigator.mediaSession.metadata = index === 0 && !thumb ? new MediaMetadata({ title, artist, artwork: [
          { src: 'https://sun9-42.userapi.com/impg/luma-small.webp', sizes: '96x96' },
          { src: covers[0], sizes: '640x640', type: 'image/webp' },
        ] }) : null;
        navigator.mediaSession.playbackState = index === 0 ? (media.paused ? 'paused' : 'playing') : 'none';
        toggle.setAttribute('aria-label', media.paused ? 'Воспроизвести' : 'Пауза');
      }
      toggle.onclick = () => { if (media.paused) void media.play().catch(() => {}); else media.pause(); };
      const duplicate = document.querySelector('#fixture-dup-toggle');
      if (duplicate) duplicate.onclick = toggle.onclick;
      const shuffle = document.querySelector('#fixture-shuffle'), repeat = document.querySelector('#fixture-repeat');
      const save = document.querySelector('#fixture-save'), volume = document.querySelector('#fixture-volume'), mute = document.querySelector('#fixture-mute');
      const like = document.querySelector('#fixture-like'), dislike = document.querySelector('#fixture-dislike');
      // VK's feedback pair keeps one element and swaps a filled icon for outlined ones.
      const feedback = (button, kind) => {
        button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
        const on = button.getAttribute('aria-pressed') === 'true', svg = button.querySelector('svg');
        if (svg) svg.setAttribute('class', 'vkuiIcon--' + kind + (on ? '_20' : '_outline_20'));
      };
      like.onclick = () => feedback(like, 'like');
      // The built-in build ignores anything that is not real input, which is what the
      // trusted fallback exists for.
      dislike.onclick = (event) => { if (event.isTrusted) feedback(dislike, 'dislike'); };
      shuffle.onclick = () => shuffle.setAttribute('aria-pressed', String(shuffle.getAttribute('aria-pressed') !== 'true'));
      repeat.onclick = () => repeat.dataset.repeat = ({ off: 'all', all: 'one', one: 'off' })[repeat.dataset.repeat];
      save.onclick = () => save.setAttribute('aria-label', save.getAttribute('aria-label').startsWith('Добавить') ? 'Удалить из моей музыки' : 'Добавить в мою музыку');
      volume.oninput = () => { media.muted = false; media.volume = volume.valueAsNumber / 100; mute.setAttribute('aria-label', 'Выключить звук'); };
      mute.onclick = () => { media.muted = !media.muted; volume.value = media.muted ? 0 : media.volume * 100; mute.setAttribute('aria-label', media.muted ? 'Включить звук' : 'Выключить звук'); };
      document.querySelector('#fixture-next').onclick = () => { index = 1; update(); };
      document.querySelector('#fixture-previous').onclick = () => { index = 0; update(); };
      document.querySelector('#fixture-music-row').onclick = document.querySelector('#fixture-mix').onclick = toggle.onclick;
      media.onplay = media.onpause = update;
      update();
    </script>`, { legacy, player: inline ? '<div id="top_audio_player"><button id="fixture-dup-toggle" aria-label="Воспроизвести">▶</button></div>' : player });
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
      function select() { media.metadata = new MediaMetadata({ title: tracks[index], artist: ${JSON.stringify(vkFixtureArtist)},
        artwork: index === 0 ? [{ src: ${JSON.stringify(vkFixtureCovers[0])}, sizes: '640x640' }] : [] }); }
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
