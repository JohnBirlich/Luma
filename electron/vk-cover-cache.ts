import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { coverMime } from '../src/shared/artwork.js';
import type { CoverMime } from '../src/shared/artwork.js';
import { MAX_VK_ARTWORK_BYTES } from './vk-artwork.js';
import type { VkArtwork } from './vk-artwork.js';

/** Opaque, URL-free handle for one VK cover image. */
export const VK_COVER_KEY = /^[a-f0-9]{32}$/;
export const MAX_VK_COVERS = 120;

const TYPES: Readonly<Record<CoverMime, string>> = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg' };
const EXTENSIONS: Readonly<Record<string, CoverMime>> = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };

export function vkCoverKey(url: string) {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

/**
 * A small on-disk copy of VK covers seen in the player. History rows keep only
 * the key, so the renderer never receives a VK URL and a cover still decodes
 * after a restart. Files are bounded by count, size and a content check.
 */
export class VkCoverCache {
  private ready?: Promise<void>;
  private pruning?: Promise<void>;
  private writes = 0;
  private readonly root: () => string;

  constructor(root: () => string, private readonly limit = MAX_VK_COVERS) { this.root = root; }

  private open() {
    return this.ready ??= mkdir(this.root(), { recursive: true }).then(() => {}, () => {});
  }

  async get(key: string): Promise<VkArtwork | undefined> {
    if (!VK_COVER_KEY.test(key)) return;
    await this.open();
    for (const [extension, mime] of Object.entries(EXTENSIONS)) {
      const bytes = await readFile(join(this.root(), key + extension)).catch(() => null);
      if (!bytes || !bytes.byteLength || bytes.byteLength > MAX_VK_ARTWORK_BYTES || coverMime(bytes) !== mime) continue;
      return { bytes: new Uint8Array(bytes), mime };
    }
  }

  async put(key: string, image: VkArtwork) {
    if (!VK_COVER_KEY.test(key) || image.bytes.byteLength > MAX_VK_ARTWORK_BYTES || coverMime(image.bytes) !== image.mime) return;
    await this.open();
    const path = join(this.root(), key + TYPES[image.mime]);
    // A scanner or the indexer can hold a fresh file for a moment on Windows.
    await writeFile(path, image.bytes).catch(() => writeFile(path, image.bytes).catch(() => {}));
    // A sweep is cheap but not free; every few writes is often enough to bound the folder.
    if (++this.writes >= 32) { this.writes = 0; void this.prune(); }
  }

  /** Keep the newest covers; a queued sweep always sees the finished writes before it. */
  prune(): Promise<void> {
    const next = (this.pruning ?? Promise.resolve()).catch(() => {}).then(() => this.sweep());
    this.pruning = next;
    void next.finally(() => { if (this.pruning === next) this.pruning = undefined; });
    return next;
  }

  private async sweep() {
    try {
      const names = (await readdir(this.root())).filter((name) => /^[a-f0-9]{32}\.(?:webp|png|jpg)$/.test(name));
      if (names.length <= this.limit) return;
      const sized = await Promise.all(names.map(async (name) => ({ name, at: (await stat(join(this.root(), name)).catch(() => null))?.mtimeMs ?? 0 })));
      sized.sort((a, b) => b.at - a.at);
      await Promise.all(sized.slice(this.limit).map(({ name }) => unlink(join(this.root(), name)).catch(() => {})));
    } catch { /* a read-only cache only means the branded fallback stays */ }
  }
}
