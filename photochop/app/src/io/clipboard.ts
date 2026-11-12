// System clipboard writes (0.2.0).
import { encodePng, pngBlob } from '@/engine/png';

/**
 * Writes an image to the system clipboard as PNG (straight alpha, PhotoChop's own encoder).
 * Resolves false when the API is missing or the browser refuses (permissions, no user gesture,
 * unfocused page). Encoding happens before the first await so the write stays inside the gesture.
 */
export async function copyImageToClipboard(image: ImageData): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') return false;
    if (typeof ClipboardItem === 'undefined') return false;
    if (!(image.width > 0 && image.height > 0)) return false;
    const blob = pngBlob(encodePng(image.data, image.width, image.height, 4, 3));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
