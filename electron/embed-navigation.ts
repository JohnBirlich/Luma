import { isVkWidgetFrameUrl, VK_WIDGET_FRAME_NAME } from '../src/shared/vk.js';
import { isYouTubeEmbedUrl, YOUTUBE_FRAME_NAME } from '../src/shared/youtube.js';

interface EmbedFrame {
  name: string;
  url: string;
  parent: EmbedFrame | null;
}

/** The main page may attach either official player, but VK cannot embed other documents or open the full site. */
export function allowMusicEmbedFrame(main: EmbedFrame, { url, frame, initiator }: {
  url: string;
  frame: EmbedFrame | null;
  initiator?: EmbedFrame | null;
}) {
  const next = isYouTubeEmbedUrl(url) ? { name: YOUTUBE_FRAME_NAME, matches: isYouTubeEmbedUrl }
    : isVkWidgetFrameUrl(url) ? { name: VK_WIDGET_FRAME_NAME, matches: isVkWidgetFrameUrl } : undefined;
  if (!frame) return !!next && initiator === main;
  if (frame === main) return false;
  if (frame.parent === main) return !!next && (initiator === main || next.matches(frame.url)
    || (frame.name === next.name && (!frame.url || frame.url === 'about:blank')));
  let direct = frame.parent;
  while (direct?.parent && direct.parent !== main) direct = direct.parent;
  // YouTube may use nested web documents for its own UI and ads, not app/local pages.
  return direct?.parent === main && isYouTubeEmbedUrl(direct.url)
    && /^(?:https:\/\/|about:(?:blank|srcdoc)$)/i.test(url);
}
