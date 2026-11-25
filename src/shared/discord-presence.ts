import { cleanTrackText } from './russian.js';

/** Luma's own public Discord application: presence needs no setup by the user. */
export const DISCORD_APP_ID = '1575080309114798080';
export const discordClientId = (value: unknown) => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value) ? value : '';
export interface DiscordPreferences { clientId: string; enabled: boolean }
export function readDiscordPreferences(value: unknown): DiscordPreferences {
  const row = value as Partial<DiscordPreferences> | undefined;
  const own = discordClientId(row?.clientId);
  // Luma ships with its own application ID, so presence works without setup. A profile
  // that still points at its own application keeps whatever it chose there.
  return { clientId: own || DISCORD_APP_ID, enabled: own ? row?.enabled === true : true };
}
export interface DiscordTrack { title: string; artist: string }
export function readDiscordTrack(value: unknown): DiscordTrack | null {
  const row = value as Partial<DiscordTrack> | undefined;
  const title = cleanTrackText(row?.title).slice(0, 120);
  const artist = cleanTrackText(row?.artist).slice(0, 120);
  return title && artist ? { title, artist } : null;
}
export type DiscordStatus = 'off' | 'waiting' | 'connected' | 'unsupported';
