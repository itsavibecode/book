#!/usr/bin/env python3
"""Build/refresh the background-clip pipeline.

Reads any raw videos in `clips/source/`, transcodes each to a web-friendly
720p H.264 MP4 in `clips/`, then regenerates `clips/playlist.json`.

Run with:
    python .scripts/build-clips.py

Drop new clips in clips/source/ (any format ffmpeg can read: .mp4, .mov,
.webm, .mkv, .avi, .m4v). Re-runs are idempotent: a clip is re-encoded
only if its source is newer than the existing output.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "clips" / "source"
OUTDIR = ROOT / "clips"
PLAYLIST = OUTDIR / "playlist.json"

# Always start the rotation with the original root-level video so it
# leads off (it's already the LCP-optimized hero clip with the poster).
HEAD_CLIPS = ["/bookmentions.mp4"]

# Encode target: 720p30, H.264 ~1 Mbps, no audio (page mutes anyway),
# faststart so playback can begin before the file fully buffers.
ENCODE_ARGS = [
    "-vf", "scale=-2:720,fps=30",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "24",
    "-an",
    "-movflags", "+faststart",
]

ACCEPTED_SUFFIXES = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


def slugify(name: str) -> str:
    base = Path(name).stem.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base or "clip"


def transcode(src: Path, dst: Path) -> None:
    """Run ffmpeg src -> dst with web-friendly settings."""
    cmd = ["ffmpeg", "-i", str(src), *ENCODE_ARGS, "-y", str(dst)]
    print(f"  encoding {src.name} -> {dst.name}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  ERROR encoding {src.name}:")
        print(res.stderr[-1500:])
        sys.exit(1)


def main() -> int:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)

    encoded = []
    skipped = []
    for src in sorted(SOURCE.iterdir()):
        if not src.is_file():
            continue
        if src.suffix.lower() not in ACCEPTED_SUFFIXES:
            continue
        if src.name.startswith(".") or src.name == ".gitkeep":
            continue
        dst = OUTDIR / f"{slugify(src.name)}.mp4"
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped.append(dst.name)
            continue
        transcode(src, dst)
        encoded.append(dst.name)

    if encoded:
        print(f"transcoded {len(encoded)} clip(s)")
    if skipped:
        print(f"skipped {len(skipped)} up-to-date clip(s)")

    # Rebuild the playlist: bookmentions.mp4 first, then every .mp4 in
    # clips/ in alphabetical order.
    clip_files = sorted(p.name for p in OUTDIR.glob("*.mp4"))
    clips = list(HEAD_CLIPS) + [f"/clips/{n}" for n in clip_files]

    PLAYLIST.write_text(json.dumps({"clips": clips}, indent=2) + "\n", encoding="utf-8")
    print(f"\nplaylist: {PLAYLIST.relative_to(ROOT)} ({len(clips)} entries)")
    for c in clips:
        print(f"  - {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
