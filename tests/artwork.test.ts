import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverMime, playlistCoverKey, trackCoverKey, withCover } from '../src/shared/artwork.js';
import type { Track } from '../src/shared/media.js';

test('cover selection recognizes supported raster images by content', () => {
  assert.equal(coverMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(coverMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(coverMime(Uint8Array.from(Buffer.from('RIFF....WEBP'))), 'image/webp');
  assert.equal(coverMime(Uint8Array.from(Buffer.from('<svg></svg>'))), undefined);
  assert.equal(coverMime(Uint8Array.from(Buffer.from('RIFF....WAVE'))), undefined);
});

test('track artwork overrides leave audio and original metadata untouched', () => {
  const track: Track = {
    id: 'example', title: 'Example', album: 'Example album', artist: 'Artist', duration: 21, audioUrl: 'luma://app/media/audio/example',
    artworkUrl: 'original.webp', backdropUrl: 'wide.webp', color: '#aabbcc',
  };
  const changed = withCover(track, 'blob:cover');
  assert.equal(changed.audioUrl, track.audioUrl);
  assert.equal(changed.id, track.id);
  assert.equal(changed.artworkUrl, 'blob:cover');
  assert.equal(changed.backdropUrl, undefined);
  assert.equal(changed.color, undefined);
  assert.equal(withCover(track).artworkUrl, 'original.webp');
  assert.equal(track.backdropUrl, 'wide.webp');
  assert.notEqual(trackCoverKey('123_4'), playlistCoverKey('123_4'));
});
