export const vkFixturePrivate = 'vk-fixture-sign-in-only';
export const vkFixtureAuth = `https://id.vk.ru/auth?state=${vkFixturePrivate}`;
export const vkFixtureTracks = ['Туманная гавань', 'Северный свет'];
export const vkFixtureArtist = 'VK · Тестовый исполнитель';

export const vkSignInPage = `<!doctype html><meta charset="utf-8"><label>Тестовая форма входа <input id="fixture-password" type="password" value="${vkFixturePrivate}"></label>
  <a id="fixture-sign-in" href="https://vk.ru/audio?fixture=signed-in">Продолжить</a>`;

export function vkPlayerPage(audioPath) {
  return `<!doctype html><meta charset="utf-8"><title>VK Music fixture</title>
    <style>body{background:#1e2230;color:white;font:16px sans-serif;padding:12px}button{min-height:28px}svg{height:15px;width:15px}</style>
    <div id="top_audio_layer_place" data-testid="MusicPlayer">
      <button type="button" id="fixture-previous" aria-label="Предыдущая аудиозапись">⏮</button>
      <button type="button" id="fixture-toggle" aria-label="Воспроизвести">▶</button>
      <button type="button" id="fixture-next" aria-label="Следующая аудиозапись"><svg class="vkuiIcon--skip_next_24"></svg>⏭</button>
      <span class="AudioInfo__title--test"></span><span class="AudioInfo__artist--test"></span>
    </div>
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
    </script>`;
}
