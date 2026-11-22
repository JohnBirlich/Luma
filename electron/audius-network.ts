import { net } from 'electron';
import { Readable } from 'node:stream';
import type { AudiusFetch } from './audius-stream.js';

// net.fetch cannot inspect a manual redirect before it is cancelled. Only the
// media hop uses net.request and can follow a single, validated 307.
export const fetchAudius: AudiusFetch = (url, init, allowRedirect) => {
  if (!allowRedirect) return net.fetch(url, init);
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    signal?.throwIfAborted();
    const requestHeaders: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { requestHeaders[key] = value; });
    const request = net.request({ url, method: init.method, credentials: 'omit', cache: 'no-store',
      redirect: 'manual', referrerPolicy: 'no-referrer', headers: requestHeaders });
    let followed = false;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => { cleanup(); request.abort(); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    request.once('error', (error) => { cleanup(); reject(error); });
    request.on('redirect', (status, method, location) => {
      if (!followed && allowRedirect(status, method, location)) {
        followed = true;
        request.followRedirect();
      }
    });
    request.once('response', (incoming) => {
      const headers = new Headers();
      const status = incoming.statusCode;
      try {
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (typeof value === 'string' && /^(content-type|content-range|content-length|content-encoding|accept-ranges)$/i.test(name)) headers.set(name, value);
        }
        if (init.method === 'HEAD' || (status !== 200 && status !== 206)) {
          cleanup();
          request.abort();
          resolve(new Response(null, { status, headers }));
          return;
        }
        // Electron's IncomingMessage extends Readable at runtime; its declarations expose only events.
        const stream = incoming as unknown as Readable;
        stream.once('close', () => {
          cleanup();
          if (!stream.readableEnded) request.abort();
        });
        const body = Readable.toWeb(stream, { strategy: { highWaterMark: 64 * 1024, size: (chunk) => (chunk as Uint8Array).byteLength } });
        resolve(new Response(body as ReadableStream<Uint8Array>, { status, headers }));
      } catch (error) { cleanup(); request.abort(); reject(error); }
    });
    request.end();
  });
};
