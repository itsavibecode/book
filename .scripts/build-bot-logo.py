#!/usr/bin/env python3
"""Generate a square BookHockeys logo with a bot badge in the corner
for use as the OAuth app icon on Kick's developer portal.

Output: book/logo-bot.png (1024x1024 transparent)

Design:
  - Take the existing wordmark, scale it to ~78% of the canvas width,
    center it vertically + slightly biased toward the bottom so the
    bot badge has clear top-right real estate.
  - Bot badge sits in the top-right corner: a yellow disc with a
    thick black outline matching the wordmark style. Inside the disc
    is a simple comic-style robot head (head outline + two eyes +
    antenna) in the same blue as the wordmark's BOOK letters.
  - All elements get the wordmark's signature offset-black drop
    shadow so the badge reads as part of the same logo system, not
    a sticker someone slapped on top.

The result reads as "BookHockeys" + an unmistakable "this is the bot
/dev app" marker. Suitable for Kick's tiny app-icon display sizes
since the wordmark stays readable and the bot badge is a clear
silhouette.
"""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "logo.png"
OUT = ROOT / "logo-bot.png"

CANVAS = 1024
WORDMARK_WIDTH_FRAC = 0.78   # wordmark fills 78% of canvas width

# Comic-book palette from the existing wordmark.
BLUE_PRIMARY = (32, 188, 232, 255)   # the BOOK blue
YELLOW = (252, 226, 80, 255)         # the HOCKEYS yellow
INK = (0, 0, 0, 255)                 # the heavy black outline/drop-shadow

# Drop-shadow tunables — match the wordmark's chunky offset shadow.
SHADOW_OFFSET = 9
SHADOW_BLUR = 0  # the wordmark uses a hard offset, no blur


def composite_wordmark(canvas):
    """Resize the existing wordmark to WORDMARK_WIDTH_FRAC of the
    canvas, then paste it slightly above the vertical center so the
    bot badge in the corner doesn't visually crowd the title."""
    src = Image.open(SRC).convert("RGBA")
    target_w = int(CANVAS * WORDMARK_WIDTH_FRAC)
    target_h = int(src.size[1] * (target_w / src.size[0]))
    resized = src.resize((target_w, target_h), Image.LANCZOS)
    # Position: horizontally centered, vertically slightly below
    # center so there's breathing room above for the bot badge.
    x = (CANVAS - target_w) // 2
    y = (CANVAS - target_h) // 2 + 60
    canvas.alpha_composite(resized, (x, y))


def stroked_circle(draw, cx, cy, r, fill, stroke=INK, stroke_w=8):
    """Filled circle with a heavy outline -- matches the wordmark's
    style of bold black outlines on every shape."""
    draw.ellipse(
        (cx - r, cy - r, cx + r, cy + r),
        fill=fill,
        outline=stroke,
        width=stroke_w,
    )


def stroked_rounded_rect(draw, x0, y0, x1, y1, radius, fill, stroke=INK, stroke_w=8):
    draw.rounded_rectangle(
        (x0, y0, x1, y1),
        radius=radius,
        fill=fill,
        outline=stroke,
        width=stroke_w,
    )


def draw_bot_badge(canvas, cx, cy, badge_r):
    """Yellow disc with a bold black outline + drop shadow. Inside
    the disc, a simple comic robot head (head + antenna + two eyes
    + grill mouth) in the BOOK-blue color. Drawn on two layers so
    the shadow renders cleanly behind the disc itself."""

    # 1. Shadow layer (offset solid-black version of the badge + bot).
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sx, sy = cx + SHADOW_OFFSET, cy + SHADOW_OFFSET
    sd.ellipse(
        (sx - badge_r, sy - badge_r, sx + badge_r, sy + badge_r),
        fill=INK,
    )
    canvas.alpha_composite(shadow)

    # 2. Badge disc.
    bd = ImageDraw.Draw(canvas)
    stroked_circle(bd, cx, cy, badge_r, fill=YELLOW, stroke_w=10)

    # 3. Robot inside the disc. Geometry is relative to badge_r so
    # this scales cleanly if the badge size is ever tweaked.
    head_w = int(badge_r * 1.05)
    head_h = int(badge_r * 0.95)
    head_x0 = cx - head_w // 2
    head_y0 = cy - head_h // 2 + int(badge_r * 0.08)
    head_x1 = head_x0 + head_w
    head_y1 = head_y0 + head_h

    # Antenna -- stub line + small ball on top, drawn BEFORE the
    # head so the head covers the bottom of the line cleanly.
    antenna_top_y = head_y0 - int(badge_r * 0.32)
    bd.line(
        (cx, head_y0 + 4, cx, antenna_top_y + 6),
        fill=INK,
        width=int(badge_r * 0.09),
    )
    ball_r = int(badge_r * 0.10)
    stroked_circle(bd, cx, antenna_top_y, ball_r, fill=BLUE_PRIMARY, stroke_w=5)

    # Robot head (rounded square, BookHockeys blue).
    head_radius = int(badge_r * 0.22)
    stroked_rounded_rect(
        bd, head_x0, head_y0, head_x1, head_y1,
        radius=head_radius, fill=BLUE_PRIMARY, stroke_w=8,
    )

    # Two eyes (white discs with black centers -- friendly cartoon look).
    eye_r = int(badge_r * 0.13)
    eye_y = head_y0 + int(head_h * 0.42)
    eye_dx = int(head_w * 0.22)
    pupil_r = int(eye_r * 0.55)
    for ex in (cx - eye_dx, cx + eye_dx):
        stroked_circle(bd, ex, eye_y, eye_r, fill=(255, 255, 255, 255), stroke_w=4)
        bd.ellipse(
            (ex - pupil_r, eye_y - pupil_r, ex + pupil_r, eye_y + pupil_r),
            fill=INK,
        )

    # Mouth slot (short horizontal bar) below the eyes.
    mouth_y = head_y0 + int(head_h * 0.74)
    mouth_w = int(head_w * 0.32)
    mouth_h = int(badge_r * 0.07)
    bd.rounded_rectangle(
        (cx - mouth_w // 2, mouth_y - mouth_h // 2,
         cx + mouth_w // 2, mouth_y + mouth_h // 2),
        radius=mouth_h // 2,
        fill=INK,
    )


def main():
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    composite_wordmark(canvas)

    # Badge: top-right corner. Centered at ~(78% across, 22% down)
    # of the canvas, sized so it reads clearly even at 64x64.
    badge_r = int(CANVAS * 0.16)
    cx = int(CANVAS * 0.80)
    cy = int(CANVAS * 0.22)
    draw_bot_badge(canvas, cx, cy, badge_r)

    canvas.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes, {CANVAS}x{CANVAS})")


if __name__ == "__main__":
    main()
