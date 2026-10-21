// The one place the name and version live. Everything that displays either reads from here
// (title, meta app-version, About, status bar, README is updated by hand at release).
export const APP_NAME = 'Strata';
export const APP_VERSION = '0.1.0';
export const APP_BASE = '/strata/';
export const APP_URL = 'https://bookhockeys.com/strata/';
export const APP_TAGLINE = 'Layers, masks and live effects. Nothing leaves your device.';

// Layout breakpoint for the compact (bottom dock + sheet) layout. Also used when the primary
// pointer is coarse (touch), regardless of width.
export const COMPACT_MAX_WIDTH = 820;

// Autosave debounce after the last command, in milliseconds.
export const AUTOSAVE_DEBOUNCE_MS = 500;

// Raster tile edge in pixels. Tiles are RGBA8, so one tile is 256 KB.
export const TILE_SIZE = 256;
