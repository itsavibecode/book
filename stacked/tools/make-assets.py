#!/usr/bin/env python3
"""Generate the Stacked site-kit images (design C "Neon Splat").

Drawn from scratch: three 16:9 tiles cascading like a stacked deck, neon
green on near-black, with a magenta live dot on the front tile. Re-run after
a rename or a palette change:

    python tools/make-assets.py

Outputs (next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png,
    og-card.png
favicon.svg is hand-written and mirrors icon() below.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

NAME    = "STACKED"
BG      = (5, 5, 6)
PANEL   = (12, 12, 16)
BORDER  = (27, 27, 34)
NEON    = (57, 255, 20)
MAGENTA = (255, 47, 214)
TEXT    = (240, 240, 240)
MUTED   = (138, 138, 150)
TILE_A  = (16, 26, 18)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BLACK = "C:/Windows/Fonts/seguibl.ttf"
FONT_B     = "C:/Windows/Fonts/segoeuib.ttf"
FONT_R     = "C:/Windows/Fonts/segoeui.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def mix(c, a):
    """Neon at opacity a over the background, as a solid colour."""
    return tuple(int(round(c[i] * a + BG[i] * (1 - a))) for i in range(3))


def icon(px):
    """Square app icon. Same geometry as favicon.svg (32-unit grid)."""
    ss = 8
    n = px * ss
    u = n / 32.0
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=5 * u, fill=BG)
    sw = max(1, int(2 * u))
    # back, middle (outlines, fading), front (filled)
    d.rounded_rectangle([4 * u, 4 * u, 21 * u, 14 * u], radius=1.5 * u,
                        outline=mix(NEON, .45), width=sw)
    d.rounded_rectangle([7.5 * u, 10 * u, 24.5 * u, 20 * u], radius=1.5 * u,
                        fill=BG, outline=mix(NEON, .75), width=sw)
    d.rounded_rectangle([11 * u, 17 * u, 28 * u, 27 * u], radius=1.5 * u, fill=NEON)
    d.ellipse([13 * u, 19 * u, 16.4 * u, 22.4 * u], fill=MAGENTA)
    return im.resize((px, px), Image.LANCZOS)


def spaced(d, xy, text, fnt, fill, tracking):
    """Draw text letter by letter with extra tracking; returns end x."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill, anchor="ls")
        x += d.textlength(ch, font=fnt) + tracking
    return x


def og_card():
    w, h = 1200, 630
    im = Image.new("RGBA", (w, h), BG + (255,))
    d = ImageDraw.Draw(im)

    # right: a 2x2 wall of tiles, one audible (neon border), LIVE pills
    gx, gy, tw, th, gap = 640, 150, 250, 141, 14
    for i in range(4):
        cx = gx + (i % 2) * (tw + gap)
        cy = gy + (i // 2) * (th + gap)
        d.rounded_rectangle([cx, cy, cx + tw, cy + th], radius=6, fill=TILE_A,
                            outline=NEON if i == 0 else BORDER, width=3 if i == 0 else 2)
        d.rounded_rectangle([cx + 12, cy + 12, cx + 62, cy + 32], radius=4, fill=MAGENTA)
        d.text((cx + 37, cy + 22), "LIVE", font=font(FONT_B, 14), fill=(26, 4, 22), anchor="mm")
        d.ellipse([cx + 70, cy + 13, cx + 88, cy + 31], fill=NEON if i % 2 == 0 else MAGENTA)
        d.rounded_rectangle([cx + 96, cy + 17, cx + 96 + 70 - i * 8, cy + 27], radius=5,
                            fill=(60, 60, 70))
        # play glyph
        px_, py_ = cx + tw / 2, cy + th / 2 + 8
        d.polygon([(px_ - 12, py_ - 16), (px_ - 12, py_ + 16), (px_ + 16, py_)],
                  fill=(70, 72, 80))

    # left: wordmark with glow, tagline, url
    wm = font(FONT_BLACK, 92)
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    spaced(ld, (72, 300), NAME, wm, NEON + (190,), 11)
    layer = layer.filter(ImageFilter.GaussianBlur(16))
    im.alpha_composite(layer)
    d = ImageDraw.Draw(im)
    spaced(d, (72, 300), NAME, wm, NEON, 11)

    d.text((76, 352), "Watch several Kick", font=font(FONT_B, 36), fill=TEXT, anchor="lm")
    d.text((76, 396), "streams at once.", font=font(FONT_B, 36), fill=TEXT, anchor="lm")
    d.text((76, 456), "Up to eight in one tab. One voice at a time.",
           font=font(FONT_R, 24), fill=MUTED, anchor="lm")
    d.line([76, 500, 76 + 110, 500], fill=MAGENTA, width=5)
    d.text((76, 540), "bookhockeys.com/stacked", font=font(FONT_R, 24), fill=MUTED, anchor="lm")
    return im.convert("RGB")


def main():
    for px, fname in [(16, "favicon-16.png"), (32, "favicon-32.png"),
                      (192, "favicon-192.png"), (180, "apple-touch-icon.png")]:
        img = icon(px)
        if fname == "apple-touch-icon.png":
            # iOS ignores transparency; give it a solid square
            solid = Image.new("RGBA", img.size, BG + (255,))
            solid.alpha_composite(img)
            img = solid.convert("RGB")
        img.save(os.path.join(HERE, fname), optimize=True)
        print("wrote", fname)
    og_card().save(os.path.join(HERE, "og-card.png"), optimize=True)
    print("wrote og-card.png")


if __name__ == "__main__":
    main()
