#!/usr/bin/env python3
"""Generate the Kick Translate site-kit images (design A "Neon Splat").

Same pattern as book/stacked/tools/make-assets.py. The mark is two chat
bubbles: a magenta outline (the original line) behind a filled neon one (the
translation). Re-run after a rename or a palette change:

    python tools/make-assets.py

Outputs (next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png,
    og-card.png
favicon.svg is hand-written and mirrors icon() below.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BG      = (5, 5, 6)
PANEL   = (12, 12, 16)
BORDER  = (27, 27, 34)
NEON    = (57, 255, 20)
MAGENTA = (255, 47, 214)
TEXT    = (240, 240, 240)
MUTED   = (138, 138, 150)
TR      = (201, 214, 255)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BLACK = "C:/Windows/Fonts/seguibl.ttf"
FONT_B     = "C:/Windows/Fonts/segoeuib.ttf"
FONT_R     = "C:/Windows/Fonts/segoeui.ttf"
FONT_JA    = "C:/Windows/Fonts/YuGothM.ttc"
FONT_KO    = "C:/Windows/Fonts/malgun.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def icon(px):
    """Square app icon. Same geometry as favicon.svg (32-unit grid)."""
    ss = 8
    n = px * ss
    u = n / 32.0
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=5 * u, fill=BG)
    sw = max(1, int(2 * u))
    # back bubble: magenta outline, tail bottom-left (the original line)
    d.rounded_rectangle([3 * u, 4 * u, 20 * u, 16 * u], radius=3 * u, outline=MAGENTA, width=sw)
    d.line([(6 * u, 16 * u), (6 * u, 19.5 * u), (10 * u, 16 * u)], fill=MAGENTA, width=sw, joint="curve")
    # front bubble: neon fill, tail bottom-right (the translation)
    d.rounded_rectangle([11 * u, 12 * u, 29 * u, 25 * u], radius=3 * u, fill=NEON)
    d.polygon([(22 * u, 24.5 * u), (26 * u, 24.5 * u), (26 * u, 28.5 * u)], fill=NEON)
    d.rounded_rectangle([15 * u, 16 * u, 25 * u, 18 * u], radius=1 * u, fill=BG)
    d.rounded_rectangle([15 * u, 20 * u, 21 * u, 22 * u], radius=1 * u, fill=BG)
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

    # right: a chat panel, original lines with their translation underneath
    px0, py0, px1, py1 = 660, 92, 1136, 540
    d.rounded_rectangle([px0, py0, px1, py1], radius=10, fill=PANEL, outline=BORDER, width=2)
    d.rounded_rectangle([px0 + 18, py0 + 18, px0 + 200, py0 + 50], radius=16, outline=NEON, width=2)
    d.ellipse([px0 + 32, py0 + 29, px0 + 42, py0 + 39], fill=NEON)
    d.text((px0 + 52, py0 + 34), "On this device", font=font(FONT_B, 17), fill=NEON, anchor="lm")
    d.rounded_rectangle([px1 - 86, py0 + 22, px1 - 18, py0 + 46], radius=12, outline=MAGENTA, width=2)
    d.text((px1 - 52, py0 + 34), "LIVE", font=font(FONT_B, 14), fill=MAGENTA, anchor="mm")
    rows = [
        ("satojun", (147, 235, 224), "\u304d\u305f\u3088", FONT_JA, "JA", "I'm here"),
        ("lenaaa", (245, 185, 66), "esto es muy bueno", FONT_R, "ES", "This is really good"),
        ("joon_k", (251, 113, 133), "\uc774\uac70 \uc9c4\uc9dc \uc6c3\uae30\ub2e4", FONT_KO, "KO", "This is really funny"),
        ("drago_br", (244, 114, 182), "quando acaba a live?", FONT_R, "PT", "When does the stream end?"),
    ]
    y = py0 + 96
    for name, col, orig, ofont, tag, tr in rows:
        nf = font(FONT_B, 21)
        d.text((px0 + 24, y), name + ":", font=nf, fill=col, anchor="ls")
        x = px0 + 24 + d.textlength(name + ": ", font=nf)
        d.text((x, y), orig, font=font(ofont, 21), fill=TEXT, anchor="ls")
        y2 = y + 34
        d.rounded_rectangle([px0 + 44, y2 - 18, px0 + 78, y2 + 2], radius=3, outline=BORDER, width=2)
        d.text((px0 + 61, y2 - 8), tag, font=font(FONT_B, 12), fill=MUTED, anchor="mm")
        d.text((px0 + 90, y2), tr, font=font(FONT_R, 20), fill=TR, anchor="ls")
        d.ellipse([px1 - 34, y2 - 12, px1 - 24, y2 - 2], fill=NEON)
        y += 102

    # left: wordmark with glow, tagline, url
    wm = font(FONT_BLACK, 70)
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    spaced(ld, (72, 230), "KICK", wm, NEON + (190,), 8)
    spaced(ld, (72, 306), "TRANSLATE", wm, NEON + (190,), 8)
    layer = layer.filter(ImageFilter.GaussianBlur(16))
    im.alpha_composite(layer)
    d = ImageDraw.Draw(im)
    spaced(d, (72, 230), "KICK", wm, NEON, 8)
    spaced(d, (72, 306), "TRANSLATE", wm, NEON, 8)

    d.text((76, 372), "Read any Kick chat", font=font(FONT_B, 34), fill=TEXT, anchor="lm")
    d.text((76, 414), "in your language.", font=font(FONT_B, 34), fill=TEXT, anchor="lm")
    d.text((76, 468), "A translation under every foreign line.",
           font=font(FONT_R, 23), fill=MUTED, anchor="lm")
    d.line([76, 506, 76 + 110, 506], fill=MAGENTA, width=5)
    d.text((76, 544), "bookhockeys.com/translate", font=font(FONT_R, 24), fill=MUTED, anchor="lm")
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
