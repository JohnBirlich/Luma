import type { DesktopBridge, ImportResult, Track } from '../shared/media';
import { browserLibrary } from './browser-library';

declare global {
  interface Window { luma?: DesktopBridge }
}

/** A track source can be replaced or combined without changing playback or queue code. */
export interface LibrarySource {
  list(): Promise<Track[]>;
  add(files: File[]): Promise<ImportResult>;
  choose?(): Promise<ImportResult>;
  remove(id: string): Promise<Track[]>;
}

const bridge = window.luma;
export const localLibrary: LibrarySource = bridge ? {
  list: bridge.getTracks,
  choose: bridge.chooseTracks,
  add: bridge.importDroppedFiles,
  remove: bridge.removeTrack,
} : browserLibrary;
