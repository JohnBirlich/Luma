import { cleanTrackText } from './russian.js';

export const MUSIC_SERVICE_GUIDES = {
  jamendo: 'https://devportal.jamendo.com/signup',
  genius: 'https://genius.com/api-clients',
  listenbrainz: 'https://listenbrainz.org/settings/',
} as const;
export const LISTENBRAINZ_ABOUT = 'https://listenbrainz.org/about/';
export type CredentialService = keyof typeof MUSIC_SERVICE_GUIDES;
export type MusicServiceIssue = 'credentials' | 'rejected' | 'offline' | 'storage' | 'rate' | 'busy';
export interface MusicServiceStatus {
  configured: boolean;
  persistent: boolean;
  enabled: boolean;
  user?: string;
  issue?: MusicServiceIssue;
}

export const isCredentialService = (value: unknown): value is CredentialService =>
  typeof value === 'string' && Object.hasOwn(MUSIC_SERVICE_GUIDES, value);

export function serviceCredential(service: CredentialService, value: unknown) {
  if (typeof value !== 'string' || value.length > 300) return;
  const token = value.trim();
  const allowed = service === 'jamendo' ? /^[A-Za-z0-9_-]{4,64}$/
    : service === 'listenbrainz' ? /^[A-Za-z0-9_-]{16,128}$/ : /^[A-Za-z0-9._~-]{16,256}$/;
  return allowed.test(token) ? token : undefined;
}

/** A bounded, literal music query. Never interpreted as an API URL or search expression. */
export function serviceQuery(value: unknown, limit = 140) {
  if (typeof value !== 'string' || value.length > limit) return;
  const clean = cleanTrackText(value).replace(/\s+/gu, ' ').trim();
  return clean.length >= 2 && /[\p{L}\p{N}]/u.test(clean) ? clean : undefined;
}
