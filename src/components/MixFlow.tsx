import { useId } from 'react';

// Ribbons cross the entire viewport, including their drift margin. No conic
// gradient seam or clipped, rotated ellipse edge can enter the visible frame.
export function MixFlow() {
  const id = useId();
  const warm = `${id}-warm`, cool = `${id}-cool`, sheen = `${id}-sheen`;
  return <svg className="mix-flow-ribbons" viewBox="0 0 1200 600" preserveAspectRatio="none" focusable="false">
    <defs>
      <linearGradient id={warm} gradientUnits="userSpaceOnUse" x1="0" y1="580" x2="1080" y2="298">
        <stop stopColor="var(--mix-rose)" stopOpacity="0" />
        <stop offset=".34" stopColor="var(--mix-rose)" stopOpacity=".48" />
        <stop offset=".65" stopColor="var(--mix-lilac)" stopOpacity=".7" />
        <stop offset="1" stopColor="var(--mix-blue)" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={cool} gradientUnits="userSpaceOnUse" x1="242" y1="645" x2="1230" y2="100">
        <stop stopColor="var(--mix-blue)" stopOpacity="0" />
        <stop offset=".49" stopColor="var(--mix-blue)" stopOpacity=".6" />
        <stop offset=".81" stopColor="var(--mix-aqua)" stopOpacity=".77" />
        <stop offset="1" stopColor="var(--mix-aqua)" stopOpacity=".13" />
      </linearGradient>
      <linearGradient id={sheen} gradientUnits="userSpaceOnUse" x1="240" y1="550" x2="1150" y2="180">
        <stop stopColor="var(--mix-lilac)" stopOpacity="0" />
        <stop offset=".47" stopColor="var(--mix-lilac)" stopOpacity=".48" />
        <stop offset=".75" stopColor="var(--mix-aqua)" stopOpacity=".72" />
        <stop offset="1" stopColor="var(--mix-aqua)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path fill={`url(#${warm})`} d="M-180 555 C136 350 337 364 583 308 S941 44 1380 83 C1048 100 974 262 718 396 S210 420 -180 666 Z" />
    <path fill={`url(#${cool})`} d="M-180 642 C176 621 449 557 690 437 S1113 125 1380 133 V363 C1164 215 1053 331 792 454 S225 658 -180 741 Z" />
    <path fill={`url(#${sheen})`} d="M-180 642 C176 621 449 557 690 437 S1113 125 1380 133 C1118 145 948 323 702 446 S174 625 -180 644 Z" />
  </svg>;
}
