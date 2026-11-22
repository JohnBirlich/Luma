import { cleanTrackText } from './russian.js';

export const discordClientId = (value: unknown) => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value) ? value : '';
export interface DiscordPreferences { clientId: string; enabled: boolean }
export function readDiscordPreferences(value: unknown): DiscordPreferences {
  const row = value as Partial<DiscordPreferences> | undefined;
  const clientId = discordClientId(row?.clientId);
  return { clientId, enabled: !!clientId && row?.enabled === true };
}
export interface DiscordTrack { title: string; artist: string }
export function readDiscordTrack(value: unknown): DiscordTrack | null {
  const row = value as Partial<DiscordTrack> | undefined;
  const title = cleanTrackText(row?.title).slice(0, 120);
  const artist = cleanTrackText(row?.artist).slice(0, 120);
  return title && artist ? { title, artist } : null;
}
export type DiscordStatus = 'off' | 'waiting' | 'connected' | 'unsupported';
