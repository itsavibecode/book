// One 20 px line icon set drawn for PhotoChop: 24-unit viewBox, 1.75 px stroke, round caps and
// joins, no fills except where a shape needs a solid half (mask).
import type { JSX } from 'preact';

export type IconName =
  | 'move' | 'select' | 'selectEllipse' | 'lasso' | 'magic' | 'crop' | 'brush' | 'eraser' | 'fill' | 'retouch'
  | 'text' | 'shape' | 'shapeEllipse' | 'pen' | 'hand' | 'zoom' | 'eyedropper'
  | 'eye' | 'eyeOff' | 'lock' | 'unlock' | 'plus' | 'minus' | 'folder' | 'folderOpen' | 'mask' | 'trash' | 'undo' | 'redo'
  | 'search' | 'close' | 'chevronDown' | 'chevronRight' | 'drag' | 'check' | 'swap' | 'export' | 'menu' | 'settings'
  | 'info' | 'grid' | 'reset' | 'image' | 'file' | 'layers' | 'more'
  | 'alignLeft' | 'alignHCenter' | 'alignRight' | 'alignTop' | 'alignVMiddle' | 'alignBottom'
  | 'textLeft' | 'textCenter' | 'textRight' | 'italic' | 'sun' | 'moon' | 'network';

const P: Record<IconName, JSX.Element> = {
  move: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  select: <rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2.6" />,
  selectEllipse: <ellipse cx="12" cy="12" rx="8.5" ry="7" stroke-dasharray="3 2.6" />,
  lasso: <><path d="M5 10c0-3 3.5-5 7.5-5S20 7 20 10s-3.5 5-7.5 5c-1 0-2 0-3-.3" /><path d="M9.5 14.7C7.5 15.7 7.5 18.5 8.5 21" /></>,
  magic: <><path d="m14 5 5 5L9 20l-5-5z" /><path d="M5 3v2M3 5h2M19 15v2M18 16h2" /></>,
  crop: <><path d="M6 2v16h16" /><path d="M2 6h16v16" /></>,
  brush: <><path d="M20 4c-4 1-9 6-11 10l3 3c4-2 9-7 10-11z" /><path d="M9 14c-3 0-4 2-4 5 3 0 5-1 5-4" /></>,
  eraser: <><path d="m14 4 6 6-9 9H7l-4-4z" /><path d="M11 19h10M9 8l7 7" /></>,
  fill: <><path d="m7 3 10 10-7 7-7-7z" /><path d="M3.5 13h13" /><path d="M19.5 15c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z" /></>,
  retouch: <><path d="M9 3h6v6l-3 3-3-3z" /><circle cx="12" cy="17" r="4" /></>,
  text: <path d="M5 5h14M12 5v15M9 20h6" />,
  shape: <><rect x="3" y="3" width="10" height="10" rx="1.5" /><circle cx="16" cy="16" r="5" /></>,
  shapeEllipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  pen: <><path d="m12 19 7-7-6-6-7 7z" /><path d="m5 19 3-3" /><circle cx="17.5" cy="6.5" r="1.5" /></>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1c-3 0-4-2-6-5l-1-2a1.5 1.5 0 0 1 2.6-1.5L8 13" />,
  zoom: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8M8 10.5h5M10.5 8v5" /></>,
  eyedropper: <><path d="m14 6 4 4" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L17 9l-2-2z" /><path d="M15 8 6 17l-1 3 3-1 9-9" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  folder: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  folderOpen: <><path d="M3 18V7a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" /><path d="M3 18l3-7h15l-3 7z" /></>,
  mask: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><circle cx="12" cy="12" r="5" /><path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  drag: <><circle cx="9" cy="6" r=".9" /><circle cx="15" cy="6" r=".9" /><circle cx="9" cy="12" r=".9" /><circle cx="15" cy="12" r=".9" /><circle cx="9" cy="18" r=".9" /><circle cx="15" cy="18" r=".9" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  swap: <><path d="M7 4 4 7l3 3" /><path d="M4 7h11a3 3 0 0 1 3 3v1" /><path d="m17 20 3-3-3-3" /><path d="M20 17H9a3 3 0 0 1-3-3v-1" /></>,
  export: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  grid: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" /></>,
  reset: <><rect x="3" y="3" width="10" height="10" rx="1.5" /><rect x="11" y="11" width="10" height="10" rx="1.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-9 9" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  alignLeft: <><path d="M4 3v18" /><rect x="7" y="6" width="12" height="4" rx="1" /><rect x="7" y="14" width="8" height="4" rx="1" /></>,
  alignHCenter: <><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="7" y="14" width="10" height="4" rx="1" /></>,
  alignRight: <><path d="M20 3v18" /><rect x="5" y="6" width="12" height="4" rx="1" /><rect x="9" y="14" width="8" height="4" rx="1" /></>,
  alignTop: <><path d="M3 4h18" /><rect x="6" y="7" width="4" height="12" rx="1" /><rect x="14" y="7" width="4" height="8" rx="1" /></>,
  alignVMiddle: <><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="7" width="4" height="10" rx="1" /></>,
  alignBottom: <><path d="M3 20h18" /><rect x="6" y="5" width="4" height="12" rx="1" /><rect x="14" y="9" width="4" height="8" rx="1" /></>,
  textLeft: <path d="M4 6h16M4 12h10M4 18h14" />,
  textCenter: <path d="M4 6h16M7 12h10M5 18h14" />,
  textRight: <path d="M4 6h16M10 12h10M6 18h14" />,
  italic: <path d="M14 4h5M5 20h5M15 4 9 20" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  network: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
};

export function Icon({ name, size = 20, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={cls ? `icon ${cls}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
    >
      {P[name]}
    </svg>
  );
}

/** Icon for a tool id or group id. */
export function toolIcon(id: string): IconName {
  const map: Record<string, IconName> = {
    move: 'move', select: 'select', selectRect: 'select', selectEllipse: 'selectEllipse', lasso: 'lasso', magic: 'magic', crop: 'crop',
    brush: 'brush', eraser: 'eraser', fill: 'fill', retouch: 'retouch', text: 'text', shape: 'shape', shapeRect: 'shape',
    shapeEllipse: 'shapeEllipse', pen: 'pen', view: 'hand', hand: 'hand', zoom: 'zoom', eyedropper: 'eyedropper',
  };
  return map[id] ?? 'more';
}
