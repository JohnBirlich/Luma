import { VK_WIDGET_URL } from './vk.js';
import type { VkPlaylist } from './vk.js';
import { YOUTUBE_EMBED_SOURCE } from './youtube.js';

export const MUSIC_EMBED_FRAME_SOURCES = `${YOUTUBE_EMBED_SOURCE} ${VK_WIDGET_URL}`;

/** Transient player selection, not a library item or an audio queue entry. */
export type MusicEmbed = { kind: 'youtube'; videoId: string } | { kind: 'vk'; playlist: VkPlaylist };
