#!/usr/bin/env python3
"""Generate the Baited site-kit images and the burn-in watermark.

Everything here is drawn from scratch: a lime fish-hook glyph on graphite,
plus the wordmark. Re-run after a rename or a palette change:

    python tools/make-assets.py

Outputs (all next to index.html):
    favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png,
    og-card.png, watermark.png
and prints the base64 of watermark.png so it can be pasted into index.html.
"""
import base64, io, os
from PIL import Image, ImageDraw, ImageFont

NAME    = "baited"
TAGLINE = "Troll video maker"
LIME    = (181, 232, 83)
INK     = (16, 25, 10)
GRAPH   = (23, 25, 28)
CARD    = (30, 33, 37)
BORDER  = (44, 48, 53)
TEXT    = (214, 217, 220)
SUB     = (154, 160, 166)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_R = "C:/Windows/Fonts/segoeui.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def hook(d, cx, cy, s, color, width):
    """Fish hook: straight shank, round bend, barb. s = overall height."""
    eye_r = s * 0.10
    top = cy - s / 2
    d.ellipse([cx - eye_r, top, cx + eye_r, top + eye_r * 2],
              outline=color, width=width)
    shank_top = top + eye_r * 2
    bend_r = s * 0.26
    bend_cy = cy + s / 2 - bend_r
    d.line([cx, shank_top, cx, bend_cy], fill=color, width=width)
    box = [cx - bend_r, bend_cy - bend_r, cx + bend_r, bend_cy + bend_r]
    d.arc(box, start=0, end=200, fill=color, width=width)
    # barb: short spur off the tip, pointing back up
    tipx = cx - bend_r * 0.94
    tipy = bend_cy - bend_r * 0.34
    d.line([tipx, tipy, tipx + bend_r * 0.55, tipy - bend_r * 0.75],
           fill=color, width=max(2, width - 1))


def icon(px):
    """Square app icon: graphite rounded square, lime hook."""
    ss = 4
    im = Image.new("RGBA", (px * ss, px * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    n = px * ss
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=GRAPH)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22,
                        outline=BORDER, width=max(1, int(n * 0.012)))
    hook(d, n * 0.5, n * 0.52, n * 0.58, LIME, max(2, int(n * 0.075)))
    return im.resize((px, px), Image.LANCZOS)


def watermark():
    """~120x40 rounded dark pill, lime hook + 'baited'. Burned in by ffmpeg."""
    ss = 4
    w, h = 120 * ss, 40 * ss
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=h * 0.34,
                        fill=(17, 19, 22, 214), outline=LIME + (150,),
                        width=int(2 * ss))
    hook(d, 26 * ss, 20 * ss, 22 * ss, LIME, int(2.6 * ss))
    f = font(FONT_B, int(19 * ss))
    d.text((44 * ss, 19 * ss), NAME, font=f, fill=LIME + (240,), anchor="lm")
    return im.resize((120, 40), Image.LANCZOS)


def og_card():
    w, h = 1200, 630
    im = Image.new("RGB", (w, h), GRAPH)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([56, 56, w - 56, h - 56], radius=28,
                        fill=CARD, outline=BORDER, width=2)
    hook(d, 190, 315, 210, LIME, 13)
    d.text((300, 232), NAME, font=font(FONT_B, 104), fill=(242, 243, 244), anchor="lm")
    d.text((304, 318), TAGLINE, font=font(FONT_R, 40), fill=SUB, anchor="lm")
    d.text((304, 392), "854x480 MP4, rendered in your browser.",
           font=font(FONT_R, 30), fill=TEXT, anchor="lm")
    d.text((304, 436), "Nothing is uploaded.",
           font=font(FONT_R, 30), fill=TEXT, anchor="lm")
    d.line([304, 480, 304 + 120, 480], fill=LIME, width=6)
    d.text((304, 524), "bookhockeys.com/troll",
           font=font(FONT_R, 26), fill=SUB, anchor="lm")
    return im


def main():
    for px, fname in [(16, "favicon-16.png"), (32, "favicon-32.png"),
                      (192, "favicon-192.png"), (180, "apple-touch-icon.png")]:
        icon(px).save(os.path.join(HERE, fname))
        print("wrote", fname)
    og_card().save(os.path.join(HERE, "og-card.png"))
    print("wrote og-card.png")
    wm = watermark()
    wm.save(os.path.join(HERE, "watermark.png"))
    buf = io.BytesIO()
    wm.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    print("wrote watermark.png  (%d bytes, %d base64 chars)" % (len(buf.getvalue()), len(b64)))
    with open(os.path.join(HERE, "tools", "watermark.b64.txt"), "w") as fh:
        fh.write(b64)
    print("base64 written to tools/watermark.b64.txt - paste into WATERMARK_PNG in index.html")


if __name__ == "__main__":
    main()
