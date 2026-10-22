// Document presets shared by the start screen and the New document sheet.
export interface Template { name: string; w: number; h: number; note?: string }

export const TEMPLATES: Template[] = [
  { name: 'Poster', w: 720, h: 450, note: 'Quick landscape canvas' },
  { name: 'HD', w: 1920, h: 1080, note: 'Full HD screen or video frame' },
  { name: '4K', w: 3840, h: 2160, note: 'Ultra HD' },
  { name: 'Square', w: 1080, h: 1080, note: 'Instagram post' },
  { name: 'Instagram story', w: 1080, h: 1920, note: 'Stories and reels' },
  { name: 'Portrait', w: 1080, h: 1350, note: 'Instagram portrait post' },
  { name: 'A4 300 dpi', w: 2480, h: 3508, note: 'Print at A4' },
  { name: 'Letter 300 dpi', w: 2550, h: 3300, note: 'Print at US Letter' },
  { name: 'OG card', w: 1200, h: 630, note: 'Link preview image' },
  { name: 'Twitter header', w: 1500, h: 500, note: 'Profile banner' },
  { name: 'YouTube thumbnail', w: 1280, h: 720, note: 'Video thumbnail' },
];

export const MAX_DOC_SIDE = 16384;
