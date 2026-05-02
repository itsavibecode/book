"""Build favicons + OG card for /shoovlator/.

Sources (committed, alongside this script):
  mascot-shoovy.png — Shoovy face cutout (transparent PNG)
  og-source.jpg     — "Squeeze" video frame, 1920x1080

Outputs:
  favicon-16.png, favicon-32.png, favicon-192.png, apple-touch-icon.png
  favicon.ico (multi-res 16/32/48)
  og-card.png (1200x630)

Run from repo root:
  python book/shoovlator/build_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE   = os.path.dirname(os.path.abspath(__file__))
MASCOT = os.path.join(HERE, "mascot-shoovy.png")
OG_SRC = os.path.join(HERE, "og-source.jpg")

GOLD    = (255, 209, 102)
BG_DARK = (26, 26, 26)


def font(weight, size):
    """Pick the best available Windows font for `weight` ('bold' | 'regular' | 'semibold')."""
    candidates = {
        "bold":     ["arialbd.ttf", "seguibl.ttf", "segoeuib.ttf"],
        "semibold": ["seguisb.ttf", "segoeuisl.ttf", "arialbd.ttf"],
        "regular":  ["segoeui.ttf", "arial.ttf"],
    }[weight]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def square_crop_mascot(mascot):
    """Tight-crop to the non-transparent bounding box, then pad to a square."""
    bbox = mascot.getbbox()
    cropped = mascot.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(cropped, ((side - w) // 2, (side - h) // 2), cropped)
    return sq


def make_favicon(size, mascot_sq):
    """Gold disc + Shoovy mascot inside, scaled to `size`x`size`."""
    # Build at 4x then downsample for crisp edges
    s = size * 4
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.ellipse((0, 0, s - 1, s - 1), fill=GOLD + (255,))

    # Mascot fills 78% of the disc, centered
    target = int(s * 0.78)
    mascot = mascot_sq.resize((target, target), Image.LANCZOS)
    canvas.paste(mascot, ((s - target) // 2, (s - target) // 2), mascot)

    return canvas.resize((size, size), Image.LANCZOS)


def cover_fit_disc(diameter, mascot_full, y_pos=0.30):
    """Replicates the page header logo: object-fit:cover, object-position:center 30%,
    background:#ffd166, border-radius:50%. Head fills the circle; gold only shows
    through the mascot's transparent regions, not as a ring around it."""
    s = diameter * 4

    # Cover-fit the original mascot to s x s
    w, h = mascot_full.size
    scale = s / min(w, h)
    nw, nh = int(w * scale), int(h * scale)
    scaled = mascot_full.resize((nw, nh), Image.LANCZOS)

    # Crop to s x s with vertical bias (object-position: center y_pos)
    left = max(0, (nw - s) // 2)
    top = max(0, int((nh - s) * y_pos))
    cropped = scaled.crop((left, top, left + s, top + s))

    # Composite on a gold square so transparent regions of the mascot show gold
    bg = Image.new("RGBA", (s, s), GOLD + (255,))
    composited = Image.alpha_composite(bg, cropped)

    # Circular clip
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    final = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    final.paste(composited, (0, 0), mask)

    return final.resize((diameter, diameter), Image.LANCZOS)


def make_og(mascot_sq, mascot_full, squeeze):
    """1200x630 share card. Squeeze frame as background, gold mascot disc + wordmark left."""
    W, H = 1200, 630

    # Cover-fit the background
    sw, sh = squeeze.size
    scale = max(W / sw, H / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    bg = squeeze.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H))
    # Anchor a bit right so Shoovy stays visible on the right
    canvas.paste(bg, ((W - nw) // 2 + 100, (H - nh) // 2))
    canvas = canvas.convert("RGBA")

    # Left-to-right darken gradient — heavy on the left for text legibility
    grad = Image.linear_gradient("L").rotate(-90).resize((W, H))   # left=0 black, right=255 white
    grad = ImageOps.invert(grad)                                   # left=255, right=0
    grad = grad.point(lambda p: int(p * 0.85))                     # max 217/255 darkness
    overlay = Image.new("RGBA", (W, H), (10, 10, 10, 255))
    overlay.putalpha(grad)
    canvas = Image.alpha_composite(canvas, overlay)

    # Gold mascot disc — bottom-right corner accent.
    # Uses cover-fit (matching .brand .mascot CSS on the page) so the head
    # fills the disc instead of floating inside a gold ring.
    disc_size = 280
    disc = cover_fit_disc(disc_size, mascot_full, y_pos=0.30)
    canvas.paste(disc, (W - disc_size - 50, H - disc_size - 50), disc)

    draw = ImageDraw.Draw(canvas)
    pad = 64

    # Title: "Shoov" in white + "lator" in gold
    title_size = 132
    f_title = font("bold", title_size)
    title_y = 170
    draw.text((pad, title_y), "Shoov", fill=(255, 255, 255, 255), font=f_title)
    bbox_shoov = draw.textbbox((pad, title_y), "Shoov", font=f_title)
    draw.text((bbox_shoov[2], title_y), "lator", fill=GOLD + (255,), font=f_title)

    # Tagline (gold accent, broken across two lines for readability)
    f_tag = font("semibold", 36)
    tag = "Type English. Get it back just\nmuch more enough confused than usually."
    draw.multiline_text((pad, 340), tag, fill=(228, 228, 228, 255), font=f_tag, spacing=12)

    # Bottom strip
    f_meta = font("regular", 22)
    draw.text(
        (pad, H - 60),
        "BOOKHOCKEYS.COM/SHOOVLATOR  ·  RUNS IN YOUR BROWSER",
        fill=(170, 170, 170, 255),
        font=f_meta,
    )

    return canvas.convert("RGB")


def main():
    mascot   = Image.open(MASCOT).convert("RGBA")
    squeeze  = Image.open(OG_SRC).convert("RGB")
    mascot_sq = square_crop_mascot(mascot)

    # Favicons
    sizes = {
        "favicon-16.png":         16,
        "favicon-32.png":         32,
        "apple-touch-icon.png":  180,
        "favicon-192.png":       192,
    }
    for name, size in sizes.items():
        out = make_favicon(size, mascot_sq)
        out.save(os.path.join(HERE, name), optimize=True)
        print(f"  wrote {name} ({size}x{size})")

    # Multi-resolution .ico
    ico_src = make_favicon(64, mascot_sq)
    ico_path = os.path.join(HERE, "favicon.ico")
    ico_src.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  wrote favicon.ico (16/32/48)")

    # OG card
    og = make_og(mascot_sq, mascot, squeeze)
    og_path = os.path.join(HERE, "og-card.png")
    og.save(og_path, optimize=True)
    print(f"  wrote og-card.png (1200x630)")


if __name__ == "__main__":
    main()
