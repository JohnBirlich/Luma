export const MAX_STREAM_CACHE = 128 * 1024 * 1024;
export const MAX_CACHED_TRACK = 32 * 1024 * 1024;
export const CACHE_LIFETIME_DAYS = 14;
export interface StreamCacheInfo { bytes: number; count: number }
