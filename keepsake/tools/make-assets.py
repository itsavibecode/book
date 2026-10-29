#!/usr/bin/env python3
"""Generate the Keepsake site-kit images.

Drawn from scratch in the B Paper direction (PLAN 4.4): the frame motif. The
icon is an ink frame on paper with a K inside it; the share card is the
framed wordmark over a numbered film strip, the same strip the page uses for
carousels. Re-run after a rename or a palette change:

    python tools/make-assets.py

Outputs (all next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, favicon-512.png,
    apple-touch-icon.png, og-card.png
favicon.svg is hand-written SVG using the same geometry as kmark() below.
"""
import os
from PIL import Image, ImageDraw, ImageFont

PAPER = (246, 243, 238)   # --bg #f6f3ee
PLATE = (255, 255, 255)   # --plate
PLATE_BD = (207, 199, 186)  # --plate-bd #cfc7ba
MEDIA = (226, 220, 207)   # --media / --strip #e2dccf
INK = (28, 27, 25)        # --text #1c1b19
MUTED = (91, 85, 76)      # --muted #5b554c
GREEN = (31, 122, 58)     # --accent #1f7a3a

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"   # Segoe UI Bold
FONT_R = "C:/Windows/Fonts/segoeui.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def kmark(d, x, y, s, inset):
    """The icon on a 32-unit grid at (x, y), s px per unit. `inset` is the
    frame's distance from the tile edge in units (4 for favicons, 7 for the
    large icons so the frame sits inside the maskable safe zone).
    Same geometry as favicon.svg."""
    P = lambda px, py: (x + px * s, y + py * s)
    lo, hi = inset, 32 - inset
    w = 2.5 * s
    d.rectangle([P(lo, lo), P(hi, hi)], outline=INK, width=max(1, round(w)))
    k = (hi - lo) / 24  # the K scales with the frame
    cx = lambda u: lo + u * k
    st = 2.7 * s * k
    d.line([P(cx(8), cx(5.5)), P(cx(8), cx(18.5))], fill=INK, width=round(st))
    d.line([P(cx(16.5), cx(5.5)), P(cx(8.6), cx(12.6))], fill=INK, width=round(st))
    d.line([P(cx(10.8), cx(10.8)), P(cx(17), cx(18.5))], fill=INK, width=round(st))


def icon(px, inset):
    ss = 8
    n = px * ss
    im = Image.new("RGB", (n, n), PAPER)
    d = ImageDraw.Draw(im)
    kmark(d, 0, 0, n / 32, inset)
    return im.resize((px, px), Image.LANCZOS)


def sprockets(d, x0, x1, y, S):
    """A row of 5x5 holes every 11 px, like the page's repeating gradient."""
    x = x0
    while x + S(5) <= x1:
        d.rectangle([x, y, x + S(5), y + S(5)], fill=PAPER)
        x += S(11)


def og_card():
    w, h = 1200, 630
    ss = 2
    im = Image.new("RGB", (w * ss, h * ss), PAPER)
    d = ImageDraw.Draw(im)
    S = lambda v: int(round(v * ss))

    # framed wordmark, as in the page header
    wm = font(FONT_B, S(34))
    tw = d.textlength("Keepsake", font=wm)
    d.rectangle([S(72), S(64), S(72) + tw + S(40), S(64 + 62)], fill=PLATE, outline=PLATE_BD, width=S(2))
    d.text((S(92), S(64 + 31)), "Keepsake", font=wm, fill=INK, anchor="lm")

    big = font(FONT_B, S(60))
    d.text((S(72), S(222)), "Save the post at the size", font=big, fill=INK, anchor="ls")
    d.text((S(72), S(296)), "Instagram stores it.", font=big, fill=INK, anchor="ls")
    d.text((S(74), S(346)), "Photos, reels and carousels, uncropped, with sound.",
           font=font(FONT_R, S(28)), fill=MUTED, anchor="ls")

    # the numbered film strip
    top, bottom = S(392), S(566)
    d.rectangle([S(72), top, S(w - 72), bottom], fill=MEDIA, outline=INK, width=S(2))
    sprockets(d, S(82), S(w - 82), top + S(7), S)
    sprockets(d, S(82), S(w - 82), bottom - S(12), S)
    shapes = [(4, 5), (1, 1), (9, 16), (4, 5), (3, 2)]
    fw, gap = 184, 22
    x = 72 + (w - 144 - (fw * 5 + gap * 4)) / 2
    for i, (aw, ah) in enumerate(shapes):
        fx0, fy0 = S(x), top + S(24)
        fx1, fy1 = S(x + fw), top + S(24 + 104)
        d.rectangle([fx0, fy0, fx1, fy1], fill=PLATE)
        # an uncropped print of the item's own shape inside the frame
        bh = 88
        bw = min(fw - 16, bh * aw / ah)
        bh = bw * ah / aw
        cx, cy = x + fw / 2, top / ss + 24 + 52
        d.rectangle([S(cx - bw / 2), S(cy - bh / 2), S(cx + bw / 2), S(cy + bh / 2)], fill=MEDIA)
        if i == 2:
            d.rectangle([fx0 - S(5), fy0 - S(5), fx1 + S(5), fy1 + S(5)], outline=GREEN, width=S(3))
        d.text((S(x + fw / 2), top + S(24 + 104 + 18)), str(i + 1), font=font(FONT_R, S(20)), fill=INK, anchor="mm")
        x += fw + gap

    d.text((S(72), S(604)), "bookhockeys.com/keepsake", font=font(FONT_R, S(24)), fill=MUTED, anchor="ls")
    return im.resize((w, h), Image.LANCZOS)


def main():
    for px, inset, fname in [(16, 3, "favicon-16.png"), (32, 3, "favicon-32.png"),
                             (180, 5, "apple-touch-icon.png"),
                             (192, 7, "favicon-192.png"), (512, 7, "favicon-512.png")]:
        icon(px, inset).save(os.path.join(HERE, fname), optimize=True)
        print("wrote", fname)
    og_card().save(os.path.join(HERE, "og-card.png"), optimize=True)
    print("wrote og-card.png")


if __name__ == "__main__":
    main()
