#!/usr/bin/env python3
"""Generate a square BookHockeys bot logo for use as the OAuth app
icon on Kick's developer portal.

Output: book/logo-bot.png (1024x1024 transparent)

Design:
  - Dead-center bot icon (comic robot head + antenna in BookHockeys
    blue/yellow) over a white comic-book starburst.
  - No wordmark -- the burst + bot is the whole composition. Reads
    cleanly at every size from 64x64 up to 1024x1024 since there's
    no fine type to lose at small sizes.
  - The starburst echoes the small white "sparkle" element in the
    original BookHockeys wordmark (the little burst between the B
    and the H), scaled up to a full backdrop. 12 sharp points with
    slight irregularity per point so it feels hand-drawn rather
    than perfectly mathematical.
  - All elements use the wordmark's signature offset-black drop
    shadow + heavy black outline so the bot mark reads as part of
    the same logo system.
"""
import math
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT = ROOT / "logo-bot.png"

CANVAS = 1024

# Comic-book palette from the existing wordmark.
BLUE_PRIMARY = (32, 188, 232, 255)   # the BOOK blue
YELLOW = (252, 226, 80, 255)         # the HOCKEYS yellow
WHITE = (255, 255, 255, 255)         # the splash burst fill
INK = (0, 0, 0, 255)                 # the heavy black outline/drop-shadow

# Drop-shadow tunables — match the wordmark's chunky offset shadow.
SHADOW_OFFSET = 9


def starburst_points(cx, cy, n_points, outer_r, inner_r):
    """Build a starburst polygon as an alternating outer/inner ring
    of (x, y) points. Each ray gets a slight per-index size jitter
    so the burst feels comic-book-organic rather than perfectly
    geometric. Jitter is deterministic (math-based, not random) so
    every build of the logo produces the same shape."""
    pts = []
    # Start with the first ray pointing straight up.
    start_angle = -math.pi / 2
    for i in range(n_points):
        # Outer point.
        ang = start_angle + (i / n_points) * 2 * math.pi
        # Deterministic jitter: combine two sin waves at different
        # frequencies so adjacent rays have visibly different lengths
        # without any one being a clear outlier.
        jitter = 0.08 * math.sin(i * 1.7) + 0.05 * math.sin(i * 3.1)
        r = outer_r * (1 + jitter)
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
        # Inner valley between this ray and the next.
        valley_ang = ang + (math.pi / n_points)
        valley_jitter = 0.04 * math.sin(i * 2.3 + 1)
        valley_r = inner_r * (1 + valley_jitter)
        pts.append((cx + math.cos(valley_ang) * valley_r,
                    cy + math.sin(valley_ang) * valley_r))
    return pts


def draw_starburst(canvas, cx, cy, outer_r, inner_r):
    """Comic-book splash: white-filled 12-point burst with a heavy
    black outline + offset black drop shadow. Drawn before the bot
    so the bot sits over it."""
    pts = starburst_points(cx, cy, n_points=12,
                           outer_r=outer_r, inner_r=inner_r)

    # Drop shadow needs to be VERY offset for a 12-pointed burst,
    # because the sharp points cover up small offsets when stacked.
    # 18px is just enough to peek out from each ray and read as a
    # proper comic shadow.
    shadow_offset = SHADOW_OFFSET * 2

    # 1. Shadow layer (offset solid-black copy of the burst).
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    shadow_pts = [(x + shadow_offset, y + shadow_offset) for (x, y) in pts]
    sd.polygon(shadow_pts, fill=INK)
    canvas.alpha_composite(shadow)

    # 2. White burst with a thick black outline. PIL's polygon
    # supports a `width` parameter for the outline that does proper
    # corner joins (no overlapping line ends like manual line-drawing
    # would produce).
    bd = ImageDraw.Draw(canvas)
    bd.polygon(pts, fill=WHITE, outline=INK, width=10)


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

    # Bot dead-center, large. With no wordmark to share the canvas
    # with, the bot disc gets to be the whole show.
    cx = CANVAS // 2
    cy = CANVAS // 2
    badge_r = int(CANVAS * 0.24)

    # Starburst BEHIND the bot. Outer points sit ~1.55x past the
    # bot's edge, inner valleys ~1.05x so the burst peeks around the
    # bot without the bot disc covering the valleys -- the burst's
    # ragged silhouette is the whole visual identity of this mark.
    draw_starburst(canvas, cx, cy,
                   outer_r=int(badge_r * 1.55),
                   inner_r=int(badge_r * 1.05))

    # Bot on top.
    draw_bot_badge(canvas, cx, cy, badge_r)

    canvas.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes, {CANVAS}x{CANVAS})")


if __name__ == "__main__":
    main()
