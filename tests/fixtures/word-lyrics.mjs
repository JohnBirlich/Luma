// Synthetic lyrics in LRCLIB's public v1 response shape. No lyrics from the real recording.
export function wordLyrics(trackName, artistName, duration) {
  return {
    trackName, artistName, duration, hasWordSync: true, instrumental: false,
    plainLyrics: 'Первый куплет\nВторой',
    syncedLyrics: '[00:00.25] Первый куплет\n[00:01.25] Второй',
    lyricsfile: `version: '1.0'
metadata:
  title: ${JSON.stringify(trackName)}
  artist: ${JSON.stringify(artistName)}
  duration_ms: ${Math.round(duration * 1000)}
lines:
- text: 'Первый куплет'
  start_ms: 250
  end_ms: 1200
  words:
  - text: 'Первый '
    start_ms: 250
    end_ms: 550
  - text: 'куплет'
    start_ms: 600
    end_ms: 1200
- text: 'Второй'
  start_ms: 1250
  end_ms: 2400
`,
  };
}
