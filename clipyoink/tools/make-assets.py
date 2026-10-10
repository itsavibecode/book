#!/usr/bin/env python3
"""Generate the Clip Yoink site-kit images.

Everything here is drawn from scratch in the Poster direction: a heavy black
"Y" on a square orange tile (the header mark), plus the share card. Re-run
after a rename or a palette change:

    python tools/make-assets.py

Outputs (all next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png,
    og-card.png
favicon.svg and ../links/clipyoink.svg are hand-written SVG using the same
geometry as yglyph() below.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ORANGE = (255, 94, 58)    # --accent #ff5e3a
BLACK  = (0, 0, 0)        # --bg
CARD   = (13, 13, 15)     # --card #0d0d0f
LINE   = (32, 32, 36)     # --line #202024
WHITE  = (255, 255, 255)
TEXT   = (232, 230, 227)  # --text #e8e6e3
MUTED  = (139, 136, 132)  # --muted #8b8884

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BLACK = "C:/Windows/Fonts/seguibl.ttf"   # Segoe UI Black (900)
FONT_R = "C:/Windows/Fonts/segoeui.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def yglyph(d, x, y, s, color):
    """The Y mark on a 32-unit grid, placed at (x, y) with s px per unit.
    Same geometry as favicon.svg: arms (9,7)->(16,15)<-(23,7), stem to y=25.5."""
    w = 4.4 * s
    P = lambda px, py: (x + px * s, y + py * s)
    d.line([P(9, 7), P(16, 15)], fill=color, width=round(w))
    d.line([P(23, 7), P(16, 15)], fill=color, width=round(w))
    d.line([P(16, 14), P(16, 25.5)], fill=color, width=round(w))
    # fill the notch where the three strokes meet
    cx, cy = P(16, 15)
    h = w * 0.62
    d.polygon([(cx - h, cy - h * 0.6), (cx + h, cy - h * 0.6), (cx + w / 2, cy + h), (cx - w / 2, cy + h)], fill=color)


def icon(px):
    """Square app icon: orange tile, black Y. Square corners, like the header mark."""
    ss = 8
    n = px * ss
    im = Image.new("RGB", (n, n), ORANGE)
    d = ImageDraw.Draw(im)
    yglyph(d, 0, 0, n / 32, BLACK)
    return im.resize((px, px), Image.LANCZOS)


def og_card():
    w, h = 1200, 630
    ss = 2
    im = Image.new("RGB", (w * ss, h * ss), BLACK)
    d = ImageDraw.Draw(im)
    S = lambda v: int(v * ss)

    # poster card with the orange left rule, like .card in the page
    d.rectangle([S(56), S(56), S(w - 56), S(h - 56)], fill=CARD, outline=LINE, width=S(2))
    d.rectangle([S(56), S(56), S(56 + 10), S(h - 56)], fill=ORANGE)

    # header row: orange tile + wordmark + tagline
    tile = S(56)
    tx, ty = S(112), S(92)
    d.rectangle([tx, ty, tx + tile, ty + tile], fill=ORANGE)
    yglyph(d, tx, ty, tile / 32, BLACK)
    d.text((tx + tile + S(18), ty + tile / 2), "CLIP YOINK", font=font(FONT_BLACK, S(40)), fill=WHITE, anchor="lm")
    d.text((tx + tile + S(300), ty + tile / 2 + S(2)), "Kick clip downloader", font=font(FONT_R, S(28)), fill=MUTED, anchor="lm")

    # the headline
    big = font(FONT_BLACK, S(118))
    d.text((S(108), S(292)), "YOINK THAT", font=big, fill=WHITE, anchor="ls")
    d.text((S(108), S(408)), "CLIP.", font=big, fill=WHITE, anchor="ls")
    d.rectangle([S(112), S(432), S(112 + 150), S(432 + 10)], fill=ORANGE)

    d.text((S(112), S(488)), "Paste a Kick clip link, get the MP4. Nothing is uploaded.",
           font=font(FONT_R, S(30)), fill=TEXT, anchor="lm")
    d.text((S(112), S(536)), "bookhockeys.com/clipyoink",
           font=font(FONT_R, S(26)), fill=MUTED, anchor="lm")
    return im.resize((w, h), Image.LANCZOS)


def main():
    for px, fname in [(16, "favicon-16.png"), (32, "favicon-32.png"),
                      (192, "favicon-192.png"), (180, "apple-touch-icon.png")]:
        icon(px).save(os.path.join(HERE, fname), optimize=True)
        print("wrote", fname)
    og_card().save(os.path.join(HERE, "og-card.png"), optimize=True)
    print("wrote og-card.png")


if __name__ == "__main__":
    main()
