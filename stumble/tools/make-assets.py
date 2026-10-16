#!/usr/bin/env python3
"""Generate the Stumble site-kit images ("Neon Ink").

Drawn from scratch: a cyan ring on ink black with a gap at the top, and a
small white die-dot sitting in the gap (the countdown ring around ROLL,
about to roll). Re-run after a rename or a palette change:

    python tools/make-assets.py

Outputs (next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png,
    og-card.png
favicon.svg is hand-written and mirrors icon() below.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

NAME   = "STUMBLE"
BG     = (11, 13, 18)
PANEL  = (18, 21, 28)
BORDER = (38, 43, 54)
ACCENT = (34, 211, 238)
INK    = (4, 22, 26)
TEXT   = (232, 235, 242)
MUTED  = (139, 147, 167)
POS    = (163, 230, 53)
WHITE  = (255, 255, 255)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BLACK = "C:/Windows/Fonts/seguibl.ttf"
FONT_B     = "C:/Windows/Fonts/segoeuib.ttf"
FONT_R     = "C:/Windows/Fonts/segoeui.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def ring(d, cx, cy, r, width, frac_gap, color, start_deg=270.0):
    """Arc of a circle with a gap centred on start_deg (PIL: 0 = 3 o'clock,
    clockwise). frac_gap is the gap as a fraction of the circumference."""
    half = 180.0 * frac_gap
    a0 = start_deg + half - 360.0
    a1 = start_deg - half
    d.arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=color, width=int(width))


def icon(px):
    """Square app icon. Same geometry as favicon.svg (32-unit grid)."""
    ss = 8
    n = px * ss
    u = n / 32.0
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=7 * u, fill=BG)
    # ring: centre (16, 16.6), r 10 to the stroke middle, stroke 4 -> outer r 12
    cx, cy = 16 * u, 16.6 * u
    ring(d, cx, cy, 12 * u, 4 * u, 9 / 62.83, ACCENT)
    d.ellipse([cx - 2.4 * u, 6.6 * u - 2.4 * u, cx + 2.4 * u, 6.6 * u + 2.4 * u], fill=WHITE)
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
    ss = 2
    im = Image.new("RGBA", (w * ss, h * ss), BG + (255,))
    d = ImageDraw.Draw(im)
    S = lambda v: int(round(v * ss))

    # right: ROLL button with the countdown ring two-thirds drained clockwise
    cx, cy, r = S(905), S(315), S(190)
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - S(150), cy - S(150), cx + S(150), cy + S(150)], fill=ACCENT + (140,))
    glow = glow.filter(ImageFilter.GaussianBlur(S(40)))
    im.alpha_composite(glow)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=BORDER, width=S(16))
    # remaining arc: from 12 o'clock + drained part, clockwise back to 12
    remaining = 0.68
    a0 = 270 + 360 * (1 - remaining)
    d.arc([cx - r, cy - r, cx + r, cy + r], a0 - 360, 270, fill=ACCENT, width=S(16))
    d.ellipse([cx - S(150), cy - S(150), cx + S(150), cy + S(150)], fill=ACCENT)
    f_roll = font(FONT_BLACK, S(70))
    spaced(d, (cx - S(118), cy + S(25)), "ROLL", f_roll, INK, S(10))
    # white die-dot riding the ring's leading edge
    d.ellipse([cx - S(14), cy - r - S(14), cx + S(14), cy - r + S(14)], fill=WHITE)

    # left: wordmark with a soft glow, tagline, small LIVE pill, url
    wm = font(FONT_BLACK, S(96))
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    spaced(ld, (S(70), S(262)), NAME, wm, ACCENT + (170,), S(8))
    layer = layer.filter(ImageFilter.GaussianBlur(S(14)))
    im.alpha_composite(layer)
    d = ImageDraw.Draw(im)
    spaced(d, (S(70), S(262)), NAME, wm, TEXT, S(8))

    d.text((S(74), S(330)), "Roll a random live", font=font(FONT_B, S(40)), fill=TEXT, anchor="lm")
    d.text((S(74), S(380)), "Kick streamer.", font=font(FONT_B, S(40)), fill=TEXT, anchor="lm")
    d.text((S(74), S(440)), "Filters, a countdown you control,", font=font(FONT_R, S(25)), fill=MUTED, anchor="lm")
    d.text((S(74), S(474)), "your own notes on every streamer.", font=font(FONT_R, S(25)), fill=MUTED, anchor="lm")
    d.rounded_rectangle([S(74), S(522), S(150), S(552)], radius=S(15), fill=POS)
    d.text((S(112), S(537)), "LIVE", font=font(FONT_B, S(17)), fill=BG, anchor="mm")
    d.text((S(166), S(537)), "bookhockeys.com/stumble", font=font(FONT_R, S(24)), fill=MUTED, anchor="lm")
    return im.resize((w, h), Image.LANCZOS).convert("RGB")


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
        print("wrote", fname, img.size)
    og = og_card()
    og.save(os.path.join(HERE, "og-card.png"), optimize=True)
    print("wrote og-card.png", og.size)


if __name__ == "__main__":
    main()
