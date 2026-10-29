"""Draw the Fortress Watch site kit: favicon PNGs, favicon.ico, apple-touch-icon
and the 1200x630 og-card.png. Needs Pillow. Run by hand when the motif or the
status line changes:  python tools/make-kit.py

The motif is the FACT rubber stamp: an ink block, rotated a few degrees, with
paper-coloured lettering. Small icons carry only the F (the full word is not
legible under about 100 px); 180 px and up carry FACT.

Fonts: Barlow Condensed Bold (the page's headline face) when it is installed,
otherwise Arial Narrow Bold, otherwise Pillow's default. The script prints
which one it used.
"""
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PAPER = (244, 239, 230)
INK = (26, 24, 20)
RED = (179, 38, 30)
AMBER = (201, 138, 18)
MUTED = (91, 85, 75)

FONT_CANDIDATES = [
    Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts/BarlowCondensed-Bold.otf',
    Path('C:/Windows/Fonts/BarlowCondensed-Bold.otf'),
    Path('/usr/share/fonts/truetype/barlow/BarlowCondensed-Bold.ttf'),
    Path('C:/Windows/Fonts/ARIALNB.TTF'),
]


def pick_font():
    for p in FONT_CANDIDATES:
        if p.is_file():
            return p
    return None


FONT_PATH = pick_font()


def font(size):
    if FONT_PATH:
        return ImageFont.truetype(str(FONT_PATH), size)
    return ImageFont.load_default(size=size)


def stamp_image(text, size_px, fg, bg, border=None, pad=(0.45, 0.22), strike=False, bw=4):
    """A stamp label as an RGBA image, unrotated."""
    f = font(size_px)
    l, t, r, b = f.getbbox(text)
    w, h = r - l, b - t
    px, py = int(size_px * pad[0]), int(size_px * pad[1]) + bw
    im = Image.new('RGBA', (w + 2 * px + 2 * bw, h + 2 * py + 2 * bw), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rectangle([0, 0, im.width - 1, im.height - 1], fill=bg)
    d.rectangle([0, 0, im.width - 1, im.height - 1], outline=border or bg, width=bw)
    d.text((px + bw - l, py + bw - t), text, font=f, fill=fg)
    if strike:
        y = py + bw + h // 2
        d.rectangle([px + bw - 4, y - 2, im.width - px - bw + 4, y + 2], fill=fg)
    return im


def paste_rotated(base, im, xy, deg):
    rot = im.rotate(deg, resample=Image.BICUBIC, expand=True)
    base.alpha_composite(rot, (int(xy[0]), int(xy[1])))
    return rot.size


def icon(size, word):
    """Square icon: paper ground, ink stamp rotated -6 degrees."""
    s = size * 4  # draw large, downsample for clean edges
    base = Image.new('RGBA', (s, s), PAPER + (255,))
    block = Image.new('RGBA', (int(s * 0.74), int(s * 0.74)), INK + (255,))
    d = ImageDraw.Draw(block)
    bw = block.width
    if word == 'F':
        # Geometric F so it does not depend on a font at 16 px.
        x0, y0 = int(bw * 0.30), int(bw * 0.20)
        stem, height = int(bw * 0.17), int(bw * 0.60)
        d.rectangle([x0, y0, x0 + stem, y0 + height], fill=PAPER)
        d.rectangle([x0, y0, x0 + int(bw * 0.44), y0 + stem], fill=PAPER)
        d.rectangle([x0, y0 + int(bw * 0.25), x0 + int(bw * 0.34), y0 + int(bw * 0.25) + int(stem * 0.9)], fill=PAPER)
    else:
        inset = int(bw * 0.07)
        d.rectangle([inset, inset, bw - inset, bw - inset], outline=PAPER, width=max(2, int(bw * 0.025)))
        f = font(int(bw * 0.42))
        l, t, r, b = f.getbbox(word)
        d.text(((bw - (r - l)) / 2 - l, (bw - (b - t)) / 2 - t), word, font=f, fill=PAPER)
    rot = block.rotate(6, resample=Image.BICUBIC, expand=True)
    base.alpha_composite(rot, ((s - rot.width) // 2, (s - rot.height) // 2))
    return base.resize((size, size), Image.LANCZOS).convert('RGB')


def wrap_px(text, f, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if f.getlength(trial) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def og_card(confirmed, not_true):
    W, H, M = 1200, 630, 64
    im = Image.new('RGBA', (W, H), PAPER + (255,))
    d = ImageDraw.Draw(im)
    d.text((M, 40), 'FORTRESS WATCH', font=font(40), fill=INK)
    d.text((W - M, 52), 'bookhockeys.com/fortress', font=font(30), fill=MUTED, anchor='ra')
    f = font(66)
    y = 118
    for lead, body, color in (('CONFIRMED:', confirmed, INK), ('NOT TRUE:', not_true, RED)):
        lines = wrap_px(lead + ' ' + body, f, W - 2 * M)
        for line in lines:
            d.text((M, y), line, font=f, fill=color)
            y += 68
        y += 18
    y = max(y + 6, H - M - 100)
    # Hazard stripe, exactly once, under the status line (same as the page).
    stripe = Image.new('RGBA', (W - 2 * M, 12), INK + (255,))
    sd = ImageDraw.Draw(stripe)
    for x in range(-24, stripe.width + 24, 32):
        sd.polygon([(x, 12), (x + 12, 0), (x + 28, 0), (x + 16, 12)], fill=AMBER)
    im.alpha_composite(stripe, (M, y))
    y += 40
    x = M
    for text, fg, bg, border, strike, deg in (
        ('FACT', PAPER, INK, None, False, 1.5),
        ('CONFIRMED', PAPER, (59, 56, 52), None, False, -1),
        ('REPORTED', INK, None, INK, False, 1),
        ('RUMOR', INK, AMBER, None, False, -1.5),
        ('DEBUNKED', PAPER, RED, None, True, 1.5),
    ):
        st = stamp_image(text, 40, fg, bg, border, strike=strike)
        w, _ = paste_rotated(im, st, (x, y), deg)
        x += w + 22
    return im.convert('RGB')


def main():
    print('font:', FONT_PATH or "Pillow default (no Barlow Condensed or Arial Narrow found)")
    for size, name, word in ((16, 'favicon-16.png', 'F'), (32, 'favicon-32.png', 'F'),
                             (180, 'apple-touch-icon.png', 'FACT'), (192, 'favicon-192.png', 'FACT'),
                             (512, 'favicon-512.png', 'FACT')):
        icon(size, word).save(ROOT / name, optimize=True)
        print('wrote', name)
    icon(256, 'F').save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('wrote favicon.ico')
    meta = {}
    try:
        meta = json.loads((ROOT / 'data' / 'meta.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        pass
    og_card(meta.get('statusConfirmed', 'the Pentagon has ordered its bases to stop depending on the civilian grid.'),
            meta.get('statusNotTrue', 'the UK told people to stock 30 days. The official figure is 3 days.')
            ).save(ROOT / 'og-card.png', optimize=True)
    print('wrote og-card.png')


if __name__ == '__main__':
    main()
