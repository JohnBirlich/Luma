import { copyFile, mkdir } from 'node:fs/promises';

// Only the local cosmetic CSS is shared with the unpacked Chrome extension.
const output = new URL('../dist-electron/vk-extension/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(new URL('../vk-extension/styles.css', import.meta.url), new URL('styles.css', output));
