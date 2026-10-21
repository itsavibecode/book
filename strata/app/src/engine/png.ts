// Minimal lossless PNG codec on top of fflate. Canvas encoding premultiplies alpha and would
// change semi-transparent pixels, so layers and masks are encoded here to round-trip exactly.
// Writes 8-bit RGBA (colour type 6) or 8-bit greyscale (colour type 0), non-interlaced.
// Reads 8-bit grey, grey+alpha, RGB and RGBA, non-interlaced (everything Strata writes).
import { unzlibSync, zlibSync } from 'fflate';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function encodePng(pixels: Uint8Array | Uint8ClampedArray, w: number, h: number, channels: 1 | 4, level: number = 6): Uint8Array {
  const stride = w * channels;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    const s = y * stride;
    // Paeth for every row after the first: a solid single choice that suits both photos and flat art.
    raw[o] = y === 0 ? 1 : 4;
    for (let i = 0; i < stride; i++) {
      const x = pixels[s + i];
      const a = i >= channels ? pixels[s + i - channels] : 0;
      if (y === 0) {
        raw[o + 1 + i] = (x - a) & 0xff;
      } else {
        const b = pixels[s - stride + i];
        const c = i >= channels ? pixels[s - stride + i - channels] : 0;
        raw[o + 1 + i] = (x - paeth(a, b, c)) & 0xff;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 0;
  const idat = zlibSync(raw, { level: level as 6 });
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export interface DecodedPng { w: number; h: number; channels: 1 | 4; data: Uint8Array }

/** Decodes to RGBA (channels 4) or, for greyscale without alpha, to one byte per pixel. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('This is not a PNG file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    const t = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') {
      w = dv.getUint32(off + 8);
      h = dv.getUint32(off + 12);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (t === 'IDAT') {
      idat.push(data);
    } else if (t === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error('Unsupported PNG layout');
  const srcCh = type === 0 ? 1 : type === 2 ? 3 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (!srcCh) throw new Error('Unsupported PNG colour type');
  const total = idat.reduce((n, p) => n + p.length, 0);
  const z = new Uint8Array(total);
  let zo = 0;
  for (const p of idat) { z.set(p, zo); zo += p.length; }
  const raw = unzlibSync(z);
  const stride = w * srcCh;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const ro = y * (stride + 1) + 1;
    const o = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[ro + i];
      const a = i >= srcCh ? px[o + i - srcCh] : 0;
      const b = y > 0 ? px[o - stride + i] : 0;
      const c = y > 0 && i >= srcCh ? px[o - stride + i - srcCh] : 0;
      let v: number;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error('Corrupt PNG data');
      }
      px[o + i] = v & 0xff;
    }
  }
  if (srcCh === 1) return { w, h, channels: 1, data: px };
  if (srcCh === 4) return { w, h, channels: 4, data: px };
  const out = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += srcCh) {
    const k = i * 4;
    if (srcCh === 3) { out[k] = px[j]; out[k + 1] = px[j + 1]; out[k + 2] = px[j + 2]; out[k + 3] = 255; }
    else { out[k] = out[k + 1] = out[k + 2] = px[j]; out[k + 3] = px[j + 1]; }
  }
  return { w, h, channels: 4, data: out };
}

export function pngBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

export async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}
