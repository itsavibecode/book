"""Build favicon set + apple-touch-icon + OG card for the Hantavirus Monitor.

Run from the hantavirus/ folder:

    python .scripts/build-icons.py

Outputs (in hantavirus/):
  favicon-16.png, favicon-32.png, favicon-192.png, favicon-512.png
  apple-touch-icon.png (180x180)
  favicon.ico (multi-res 16/32/48)
  og-card.png (1200x630)

The mark is a "radar pulse" — concentric cyan rings with a centre dot,
echoing the dashboard's pulsing S3 markers.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)

CYAN = '#5ad9ff'
BG_RGB = (7, 9, 14)
TEXT_RGB = (216, 221, 230)
MUTED_RGB = (106, 117, 135)
DIM_RGB = (74, 83, 100)


def hex_to_rgba(h, alpha=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)


def draw_pulse_logo(size, with_glow=True):
    """Draw the radar-pulse mark into a square RGBA image."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cx = cy = size / 2
    pad = size * 0.06
    max_r = size / 2 - pad
    rings = [
        (max_r,         max(2, size // 64),  60),
        (max_r * 0.74,  max(2, size // 56), 110),
        (max_r * 0.50,  max(2, size // 48), 180),
        (max_r * 0.27,  max(2, size // 42), 240),
    ]
    if with_glow:
        glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        for (r, w, a) in rings:
            gd.ellipse([cx - r, cy - r, cx + r, cy + r],
                       outline=hex_to_rgba(CYAN, int(a * 0.55)),
                       width=w + max(2, size // 64))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.014))
        img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    for (r, w, a) in rings:
        d.ellipse([cx - r, cy - r, cx + r, cy + r],
                  outline=hex_to_rgba(CYAN, a), width=w)
    dot_r = size * 0.06
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
              fill=hex_to_rgba(CYAN))
    return img


def draw_small_pulse(size):
    """Simplified version legible at 16/32 px."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    pad = 1
    r1 = size / 2 - pad
    r2 = r1 * 0.45
    d.ellipse([cx - r1, cy - r1, cx + r1, cy + r1],
              outline=hex_to_rgba(CYAN, 200), width=max(1, size // 16))
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2],
              outline=hex_to_rgba(CYAN), width=max(1, size // 12))
    dot_r = r1 * 0.18
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
              fill=hex_to_rgba(CYAN))
    return img


def save_pngs():
    for size, name in [
        (16, 'favicon-16.png'),
        (32, 'favicon-32.png'),
        (180, 'apple-touch-icon.png'),
        (192, 'favicon-192.png'),
        (512, 'favicon-512.png'),
    ]:
        img = draw_small_pulse(size) if size <= 32 else draw_pulse_logo(size)
        img.save(os.path.join(ROOT, name))
        print('wrote ' + name + ' (' + str(size) + 'x' + str(size) + ')')


def save_ico():
    base = Image.open(os.path.join(ROOT, 'favicon-32.png'))
    base.save(os.path.join(ROOT, 'favicon.ico'),
              sizes=[(16, 16), (32, 32), (48, 48)])
    print('wrote favicon.ico (16/32/48)')


def find_font(candidates, size):
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_og_card():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), BG_RGB)

    # Soft cyan glow in upper-left and lower-right corners
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-300, -300, 700, 500], fill=(90, 217, 255, 18))
    gd.ellipse([W - 600, H - 400, W + 200, H + 100], fill=(90, 217, 255, 12))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=120))
    img.paste(glow, (0, 0), glow)

    # Subtle grid lines for the "ops" look
    d = ImageDraw.Draw(img, 'RGBA')
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(26, 35, 49, 40), width=1)
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=(26, 35, 49, 40), width=1)

    # Logo
    logo_size = 360
    logo = draw_pulse_logo(logo_size)
    img.paste(logo, (90, (H - logo_size) // 2), logo)

    # Fonts (try Windows mono first, then DejaVu, then default)
    mono_bold = [
        'C:/Windows/Fonts/consolab.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
        '/Library/Fonts/Menlo.ttc',
    ]
    mono_reg = [
        'C:/Windows/Fonts/consola.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    ]
    sans_bold = [
        'C:/Windows/Fonts/segoeuib.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ]
    f_title = find_font(sans_bold, 70)
    f_brand = find_font(mono_bold, 28)
    f_sub = find_font(mono_reg, 24)
    f_tag = find_font(mono_reg, 20)

    text_x = 510
    # Brand line
    d.text((text_x, 150), 'HANTAVIRUS MONITOR // OPS',
           fill=hex_to_rgba(CYAN), font=f_brand)
    # Big title
    d.text((text_x, 198), 'Global Hantavirus',
           fill=TEXT_RGB + (255,), font=f_title)
    d.text((text_x, 280), 'Surveillance',
           fill=TEXT_RGB + (255,), font=f_title)
    # Sub
    d.text((text_x, 388), 'HPS  /  HFRS  /  Andes virus',
           fill=MUTED_RGB + (255,), font=f_sub)

    # Severity legend
    legend_y = H - 90
    items = [
        ('S1', (90, 217, 255), 'RECOVERED'),
        ('S2', (245, 197, 24), 'ACTIVE'),
        ('S3', (255, 77, 77), 'DEATH / CLUSTER'),
    ]
    cx = text_x
    for tag, color, label in items:
        d.ellipse([cx, legend_y + 4, cx + 18, legend_y + 22],
                  fill=color + (255,))
        d.text((cx + 28, legend_y), tag,
               fill=color + (255,), font=f_tag)
        d.text((cx + 62, legend_y + 2), label,
               fill=MUTED_RGB + (255,), font=f_tag)
        # measure label width to advance dynamically
        bbox = d.textbbox((0, 0), label, font=f_tag)
        cx += 96 + (bbox[2] - bbox[0]) + 28

    # Bottom-right URL
    url_text = 'bookhockeys.com/hantavirus'
    bbox = d.textbbox((0, 0), url_text, font=f_tag)
    w = bbox[2] - bbox[0]
    d.text((W - w - 60, H - 50), url_text,
           fill=DIM_RGB + (255,), font=f_tag)

    img.save(os.path.join(ROOT, 'og-card.png'), 'PNG', optimize=True)
    print('wrote og-card.png (1200x630)')


if __name__ == '__main__':
    save_pngs()
    save_ico()
    build_og_card()
    print('done.')
