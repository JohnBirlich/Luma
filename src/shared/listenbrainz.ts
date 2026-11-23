import { APP_NAME } from './app-info.js';
import { catalogObject as object } from './online.js';
import type { ListeningEvent } from './lastfm.js';
import { serviceCredential } from './music-services.js';
import { createPublicJsonRequest } from './public-json.js';
import type { PublicApiFetch } from './public-json.js';
import { cleanTrackText } from './russian.js';

const API = 'https://api.listenbrainz.org/1/';

export function listenBrainzUser(data: unknown) {
  const { valid, user_name } = object(data);
  return valid === true && typeof user_name === 'string' && user_name.length <= 120 ? cleanTrackText(user_name) || undefined : undefined;
}

export function listenBrainzPayload(listen: ListeningEvent, version: string) {
  return { listen_type: 'single', payload: [{ listened_at: listen.started, track_metadata: {
    artist_name: listen.artist, track_name: listen.title, ...(listen.album && { release_name: listen.album }),
    additional_info: { duration_ms: Math.round(listen.duration * 1000), media_player: APP_NAME,
      submission_client: APP_NAME, submission_client_version: version },
  } }] };
}

export function createListenBrainzApi(fetcher: PublicApiFetch, version: string) {
  // Validation and submission share the provider's one-request-per-second policy.
  const request = createPublicJsonRequest(fetcher, { spacing: 1000, limit: 32 * 1024 });
  function headers(value: unknown) {
    const token = serviceCredential('listenbrainz', value);
    if (!token) throw new TypeError('Invalid ListenBrainz credential');
    return { Authorization: `Token ${token}`, 'User-Agent': `Luma-Player/${version} (https://github.com/JohnBirlich/Luma)` };
  }
  return {
    async validate(token: unknown, signal: AbortSignal) {
      return listenBrainzUser(await request(new URL('validate-token', API), signal, { headers: headers(token) }));
    },
    async submit(token: unknown, event: ListeningEvent, signal: AbortSignal) {
      const result = await request(new URL('submit-listens', API), signal, { method: 'POST',
        headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(listenBrainzPayload(event, version)) });
      return object(result).status === 'ok';
    },
  };
}
