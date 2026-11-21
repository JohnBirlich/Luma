// Opt-in live probe, in the real Electron page with its existing CSP. No media is written to disk.
import { appendFile } from 'node:fs/promises';

export async function probeRadio(run, webRequest, stations) {
  const targets = new Set(stations.flatMap(({ stream, logo }) => logo ? [stream, logo] : [stream]));
  const statuses = new Map();
  webRequest.onResponseStarted({ urls: ['https://*/*'] }, ({ url, statusCode }) => {
    if (targets.has(url)) statuses.set(url, statusCode);
  });
  const results = [];
  try {
    for (let i = 0; i < stations.length; i += 5) {
      const batch = stations.slice(i, i + 5);
      const checked = await run(`Promise.all(${JSON.stringify(batch)}.map(async ({ stream, logo }) => {
        const audio = new Audio(); audio.muted = true;
        const image = logo ? new Image() : null;
        let timeout;
        try {
          const deadline = new Promise(resolve => { timeout = setTimeout(() => resolve('timeout'), 9000); });
          const decode = new Promise(resolve => {
            audio.addEventListener('timeupdate', () => { if (audio.currentTime > .18) resolve('decoded'); });
            audio.addEventListener('error', () => resolve('media error ' + (audio.error?.code ?? 0)), { once: true });
            audio.src = stream;
            void audio.play().catch(error => resolve(error.name));
          });
          if (image) image.src = logo;
          const [media, artwork] = await Promise.all([Promise.race([decode, deadline]), image ? Promise.race([
            image.decode().then(() => image.naturalWidth, () => 0), deadline.then(() => 0),
          ]) : null]);
          return { media, artwork };
        } finally { clearTimeout(timeout); audio.removeAttribute('src'); audio.load(); image?.removeAttribute('src'); }
      }))`);
      for (const [j, { id, name, stream, logo }] of batch.entries()) {
        const { media, artwork } = checked[j];
        const row = { id, name, stream, status: statuses.get(stream) ?? null, media, artwork, ok: media === 'decoded' && (artwork === null || artwork > 0) };
        results.push(row);
        console.log(`${id}: ${media} (HTTP ${row.status ?? 'unknown'})${logo ? `, logo ${artwork}px` : ''}`);
        if (!row.ok && process.env.GITHUB_ACTIONS === 'true') console.log(`::warning title=Live radio::${id}: ${media}; HTTP ${row.status ?? 'unknown'}; logo ${artwork ?? 'not configured'}`);
      }
    }
  } finally { webRequest.onResponseStarted(null); }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const report = ['### Live radio on the Windows runner', '', `${results.filter(({ ok }) => ok).length}/${results.length} streams decoded with expected artwork.`, '',
      '| Station ID | HTTP | Media | Artwork |', '| --- | --- | --- | --- |', ...results.map(({ id, status, media, artwork }) =>
        `| ${id} | ${status ?? '–'} | ${media} | ${artwork === null ? '–' : `${artwork}px`} |`)];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, report.join('\n') + '\n');
  }
  return results;
}
