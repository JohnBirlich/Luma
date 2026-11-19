import { screen } from 'electron';
import type { BrowserWindow, Rectangle } from 'electron';

export const MAIN_MINIMUM = [620, 520] as const;
const WIDGET_SIZE = [446, 186] as const;

/** Reuse the existing renderer/audio engine so opening the widget doesn't restart playback. */
export function widgetController(owner: BrowserWindow) {
  let previous: { bounds: Rectangle; maximized: boolean; onTop: boolean } | undefined;
  return (enabled: boolean) => {
    if (enabled && !previous) {
      if (owner.isFullScreen()) return false;
      const bounds = owner.getNormalBounds();
      const maximized = owner.isMaximized();
      previous = { bounds, maximized, onTop: owner.isAlwaysOnTop() };
      const { workArea } = screen.getDisplayMatching(owner.getBounds());
      if (maximized) owner.unmaximize();
      owner.setMinimumSize(...WIDGET_SIZE);
      owner.setMaximizable(false);
      owner.setResizable(false);
      owner.setAlwaysOnTop(true, 'floating');
      const [width, height] = WIDGET_SIZE;
      owner.setBounds({ x: Math.max(workArea.x, workArea.x + workArea.width - width - 18), y: Math.max(workArea.y, workArea.y + workArea.height - height - 18), width, height });
    } else if (!enabled && previous) {
      const { bounds, maximized, onTop } = previous;
      previous = undefined;
      owner.setMinimumSize(...MAIN_MINIMUM);
      owner.setMaximizable(true);
      owner.setResizable(true);
      owner.setAlwaysOnTop(onTop);
      owner.setBounds(bounds);
      if (maximized) owner.maximize();
    }
    return Boolean(previous);
  };
}
