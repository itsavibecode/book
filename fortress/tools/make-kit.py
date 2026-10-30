"""Draw the Fortress Watch site kit: favicon PNGs, favicon.ico, apple-touch-icon,
the 1200x630 og-card.png and the 1200x630 og-kit.png. Needs Pillow. Run by hand
when the motif, the status line or the kit changes:
    python tools/make-kit.py            everything
    python tools/make-kit.py og-kit     only og-kit.png

og-kit.png draws the pictograms from kit-icons.svg with a small renderer below
(path M L H V Z, line, polyline, polygon, rect, circle; square caps), so the
share card and the page use the same drawings.

The motif is the FACT rubber stamp: an ink block, rotated a few degrees, with
paper-coloured lettering. Small icons carry only the F (the full word is not
legible under about 100 px); 180 px and up carry FACT.

Fonts: Barlow Condensed Bold (the page's headline face) when it is installed,
otherwise Arial Narrow Bold, otherwise Pillow's default. The script prints
which one it used.
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
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


SVG_NS = '{http://www.w3.org/2000/svg}'
LAY = [('water', -2), ('food', 1), ('radio', -1), ('flashlight', 2),
       ('batteries', 0.5), ('first-aid', -1.5), ('power-bank', 1.5), ('cash', -0.5)]


def load_symbols():
    root = ET.parse(ROOT / 'kit-icons.svg').getroot()
    return {sym.get('id')[3:]: sym for sym in root.iter(SVG_NS + 'symbol')}


def path_subpaths(d):
    """M L H V Z only, absolute. Returns [(points, closed)]."""
    toks = re.findall(r'[MLHVZ]|-?\d*\.?\d+', d)
    subs, pts, cmd, i = [], [], None, 0
    x = y = 0.0
    while i < len(toks):
        t = toks[i]
        if t in 'MLHVZ':
            cmd = t
            i += 1
            if t == 'Z':
                subs.append((pts, True))
                pts = []
            continue
        if cmd == 'M':
            if pts:
                subs.append((pts, False))
            x, y = float(toks[i]), float(toks[i + 1]); i += 2
            pts = [(x, y)]
            cmd = 'L'
        elif cmd == 'L':
            x, y = float(toks[i]), float(toks[i + 1]); i += 2
            pts.append((x, y))
        elif cmd == 'H':
            x = float(t); i += 1
            pts.append((x, y))
        elif cmd == 'V':
            y = float(t); i += 1
            pts.append((x, y))
        else:
            i += 1
    if pts:
        subs.append((pts, False))
    return subs


def draw_symbol(sym, size, color):
    """Render one <symbol> to an RGBA tile of size x size (drawn at 4x, then reduced)."""
    S = size * 4
    k = S / 24.0
    sw = 2 * k
    tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    col = color + (255,)

    def seg(p, q):
        (x1, y1), (x2, y2) = p, q
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5 or 1.0
        ux, uy = dx / n * sw / 2, dy / n * sw / 2
        px, py = -uy, ux
        a = (x1 - ux, y1 - uy); b = (x2 + ux, y2 + uy)
        d.polygon([(a[0] + px, a[1] + py), (b[0] + px, b[1] + py), (b[0] - px, b[1] - py), (a[0] - px, a[1] - py)], fill=col)

    def stroke_pts(pts, closed):
        pts = [(px * k, py * k) for px, py in pts]
        for i in range(len(pts) - 1):
            seg(pts[i], pts[i + 1])
        if closed and len(pts) > 2:
            seg(pts[-1], pts[0])

    for el in sym:
        tag = el.tag.replace(SVG_NS, '')
        filled = el.get('fill') == 'currentColor'
        stroked = el.get('stroke') != 'none'
        if tag == 'rect':
            x, y, w, h = (float(el.get(a)) for a in ('x', 'y', 'width', 'height'))
            pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
            if filled:
                d.rectangle([x * k, y * k, (x + w) * k, (y + h) * k], fill=col)
            if stroked:
                stroke_pts(pts, True)
        elif tag == 'circle':
            cx, cy, r = (float(el.get(a)) for a in ('cx', 'cy', 'r'))
            if filled:
                d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=col)
            if stroked:
                ro = r + 1
                d.ellipse([(cx - ro) * k, (cy - ro) * k, (cx + ro) * k, (cy + ro) * k], outline=col, width=int(round(sw)))
        elif tag == 'line':
            stroke_pts([(float(el.get('x1')), float(el.get('y1'))), (float(el.get('x2')), float(el.get('y2')))], False)
        elif tag in ('polyline', 'polygon'):
            nums = [float(v) for v in re.findall(r'-?\d*\.?\d+', el.get('points'))]
            pts = list(zip(nums[0::2], nums[1::2]))
            if filled:
                d.polygon([(px * k, py * k) for px, py in pts], fill=col)
            if stroked:
                stroke_pts(pts, tag == 'polygon')
        elif tag == 'path':
            for pts, closed in path_subpaths(el.get('d')):
                if filled and len(pts) > 2:
                    d.polygon([(px * k, py * k) for px, py in pts], fill=col)
                if stroked:
                    stroke_pts(pts, closed)
    return tile.resize((size, size), Image.LANCZOS)


def serif(size):
    for p in (Path('C:/Windows/Fonts/georgia.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')):
        if p.is_file():
            return ImageFont.truetype(str(p), size)
    return font(size)


def og_kit():
    """1200x630 poster band: headline, stamp, count and the eight flat-lay pictograms."""
    W, H, M = 1200, 630, 64
    im = Image.new('RGBA', (W, H), INK + (255,))
    d = ImageDraw.Draw(im)
    kit = {}
    try:
        kit = json.loads((ROOT / 'data' / 'kit.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        pass
    items = [k for k in kit.get('items', []) if isinstance(k, dict) and k.get('name')]
    core = sum(1 for k in items if k.get('priority') != 'recommended')
    rec = len(items) - core
    left_w = 560
    size = 132
    while size > 60 and max(font(size).getlength(t) for t in ('BLACKOUT', 'STARTER KIT')) > left_w:
        size -= 2
    f = font(size)
    y = 56
    for line in ('BLACKOUT', 'STARTER KIT'):
        d.text((M, y), line, font=f, fill=PAPER)
        y += int(size * 0.9)
    y += 40
    lede = serif(30)
    for line in wrap_px('Every item is on the Ready.gov or UK Be Ready list. Nothing else.', lede, left_w):
        d.text((M, y), line, font=lede, fill=PAPER)
        y += 40
    y += 24
    st = stamp_image('OFFICIAL LISTS ONLY', 34, PAPER, None, PAPER)
    w, h = paste_rotated(im, st, (M, y), 2)
    if items:
        d.text((M, y + h + 18), '%d core items, %d recommended' % (core, rec), font=font(30), fill=PAPER, anchor='lt')
    d.text((M, H - 44), 'bookhockeys.com/fortress/kit.html', font=font(26), fill=(176, 168, 152), anchor='ls')

    # Paper card with a 1 px frame offset behind it, as on the page.
    cx0, cy0, cx1, cy1 = 664, 120, 1126, 480
    d.rectangle([cx0 + 12, cy0 + 12, cx1 + 12, cy1 + 12], outline=PAPER, width=1)
    d.rectangle([cx0, cy0, cx1, cy1], fill=PAPER)
    d.rectangle([cx0 + 9, cy0 + 9, cx1 - 9, cy1 - 9], outline=INK, width=1)
    syms = load_symbols()
    cell_w = (cx1 - cx0 - 40) / 4
    cell_h = (cy1 - cy0 - 40) / 2
    isz = 104
    for i, (sid, deg) in enumerate(LAY):
        if sid not in syms:
            continue
        tile = draw_symbol(syms[sid], isz, INK).rotate(-deg, resample=Image.BICUBIC, expand=True)
        col, row = i % 4, i // 4
        x = cx0 + 20 + col * cell_w + (cell_w - tile.width) / 2
        y2 = cy0 + 20 + row * cell_h + (cell_h - tile.height) / 2
        im.alpha_composite(tile, (int(x), int(y2)))
    return im.convert('RGB')


def main():
    if sys.argv[1:] == ['og-kit']:
        print('font:', FONT_PATH or 'Pillow default')
        og_kit().save(ROOT / 'og-kit.png', optimize=True)
        print('wrote og-kit.png')
        return
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
    og_kit().save(ROOT / 'og-kit.png', optimize=True)
    print('wrote og-kit.png')


if __name__ == '__main__':
    main()
