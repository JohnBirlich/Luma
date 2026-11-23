const palettes = [
  ['#101a38', '#234c8a', '#8bd7ff'], ['#17142e', '#594294', '#cfbbff'],
  ['#102c32', '#176559', '#9bf3cf'], ['#301625', '#973652', '#ffc9d1'],
  ['#2e2018', '#8b4b2a', '#ffe1a3'], ['#172737', '#366a81', '#b5e4ec'],
] as const;
const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const shorten = (value: string, length: number) => {
  const chars = Array.from(value);
  return chars.length > length ? chars.slice(0, length - 1).join('').trimEnd() + '…' : value;
};

/** Original Luma station art, not a broadcaster logo. No request, even for a new search result. */
export function radioStationCover(id: string, name: string) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const [base, glow, beam] = id === 'radio-ru-russkoe' ? ['#380e28', '#a92143', '#ffd4be'] : palettes[hash % palettes.length];
  const title = name.replace(/[\p{Cc}\p{Cf}\uD800-\uDFFF]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const [station, ...regions] = (title || 'Radio').split(/\s+[-–—]\s+/u);
  const region = shorten(regions.join(' · '), 23);
  const lines: string[] = [''];
  for (const word of shorten(station, 51).split(' ')) {
    const index = lines.length - 1;
    const line = lines[index] ? `${lines[index]} ${word}` : word;
    if (lines[index] && line.length > 16 && index < 2) lines.push(word);
    else lines[index] = line;
  }
  const length = Math.max(...lines.map((line) => Array.from(line).length));
  const size = Math.max(17, Math.min(53, Math.floor(500 / length)));
  const text = lines.map((line, index) => `<text x="28" y="${286 - (lines.length - 1 - index) * (size + 2)}">${escapeXml(line)}</text>`).join('');
  const frequency = 137 + hash % 87;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
    <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>
    <path fill="url(#g)" d="M0 0H360V360H0z"/>
    <g fill="none" stroke="${beam}" opacity=".27" stroke-width="2">
      <circle cx="302" cy="84" r="36"/><circle cx="302" cy="84" r="61"/><circle cx="302" cy="84" r="88"/>
      <path d="M-24 164C74 215 178 ${frequency} 245 110c48-37 99-50 138-42M-24 177C74 228 178 ${frequency + 13} 245 123c48-37 99-50 138-42"/>
    </g>
    <circle cx="302" cy="84" r="8" fill="${beam}"/>
    <path fill="${beam}" d="M28 148h4v-17h-4zm8-5h4v-27h-4zm8 0h4v-27h-4zm8 5h4v-17h-4z"/>
    <path fill="${base}" fill-opacity=".52" d="M0 174h360v186H0z"/>
    <g font-family="Arial,sans-serif">
      <text x="28" y="45" fill="${beam}" font-size="14" font-weight="700" letter-spacing="4">LUMA RADIO</text>
      <g fill="#fff7f0" font-size="${size}" font-weight="700">${text}</g>
      <path d="M28 308h304" stroke="${beam}" stroke-opacity=".48"/>
      <text x="28" y="333" fill="${beam}" font-size="16">${escapeXml(region || 'RADIO')}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
