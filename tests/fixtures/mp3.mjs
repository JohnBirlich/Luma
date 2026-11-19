/** Build test-only ID3v2.3 fields without touching the MP3 audio frames. */
export function taggedMp3(sample, { title, artist, album, picture }) {
  const oldSize = sample[0] === 0x49 && sample[1] === 0x44 && sample[2] === 0x33
    ? 10 + sample.subarray(6, 10).reduce((size, byte) => (size << 7) + byte, 0) : 0;
  const frame = (kind, payload) => {
    const header = Buffer.alloc(10);
    header.write(kind);
    header.writeUInt32BE(payload.length, 4);
    return Buffer.concat([header, payload]);
  };
  const frames = Object.entries({ TIT2: title, TPE1: artist, TALB: album }).flatMap(([kind, text]) =>
    text ? [frame(kind, Buffer.from(`\0${text}\0`, 'latin1'))] : []);
  if (picture) frames.push(frame('APIC', Buffer.concat([Buffer.from(`\0${picture.mime}\0\x03\0`, 'latin1'), picture.data])));
  const tags = Buffer.concat(frames);
  const size = [21, 14, 7, 0].map((shift) => (tags.length >> shift) & 127);
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, ...size]), tags, sample.subarray(oldSize)]);
}
