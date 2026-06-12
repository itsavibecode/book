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

# Rotation pin points enforced on every build:
#   slot 1 = PIN_FIRST  (always plays first)
#   slot 2 = the clip with the most-recent source/<name>.<ext> mtime
#   slot 3 = PIN_THIRD  (the long lead-off clip, always third)
#   slot 4+ = everything else, preserving the existing playlist.json
#            order so manual reorders within the tail survive re-runs
#
# When a new clip is encoded, it lands at slot 2 by mtime and bumps
# whatever was previously at slot 2 down past bookmentions.
PIN_FIRST = "/clips/hampton.mp4"
PIN_THIRD = "/bookmentions.mp4"

# Encode target: 720p30 H.264 video ~1 Mbps + 128 kbps AAC stereo audio,
# faststart so playback can begin before the file fully buffers. The page
# starts muted (autoplay policy requires it) but users can tap-for-sound
# to hear the clip audio.
ENCODE_ARGS = [
    "-vf", "scale=-2:720,fps=30",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "24",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-ar", "44100",
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

    # Universe of URLs that may appear in the playlist.
    on_disk = {f"/clips/{p.name}" for p in OUTDIR.glob("*.mp4")} | {PIN_THIRD}

    # Read the existing playlist so we can preserve manual reorders in
    # slots 4+ across re-runs.
    existing = []
    if PLAYLIST.exists():
        try:
            existing = json.loads(PLAYLIST.read_text(encoding="utf-8")).get("clips", [])
        except (json.JSONDecodeError, OSError):
            existing = []

    # Slot 2 candidate: the clip with the most-recent source/<name>.<ext>
    # mtime. Hampton and bookmentions are excluded because they have
    # their own pinned slots.
    newest_url = None
    candidates: list[tuple[float, str]] = []
    for src in SOURCE.iterdir():
        if not src.is_file() or src.name.startswith("."):
            continue
        if src.suffix.lower() not in ACCEPTED_SUFFIXES:
            continue
        url = f"/clips/{slugify(src.name)}.mp4"
        if url not in on_disk or url in (PIN_FIRST, PIN_THIRD):
            continue
        candidates.append((src.stat().st_mtime, url))
    if candidates:
        candidates.sort(reverse=True)
        newest_url = candidates[0][1]

    clips: list[str] = []
    seen: set[str] = set()

    # Slot 1: PIN_FIRST (hampton)
    if PIN_FIRST in on_disk:
        clips.append(PIN_FIRST)
        seen.add(PIN_FIRST)

    # Slot 2: newest clip by source mtime
    if newest_url and newest_url not in seen:
        clips.append(newest_url)
        seen.add(newest_url)

    # Slot 3: PIN_THIRD (bookmentions)
    if PIN_THIRD in on_disk and PIN_THIRD not in seen:
        clips.append(PIN_THIRD)
        seen.add(PIN_THIRD)

    # Slot 4+: preserve existing order for the rest. Clips that used to
    # be at slot 1, 2, or 3 in the old playlist naturally slide here.
    for url in existing:
        if url in on_disk and url not in seen:
            clips.append(url)
            seen.add(url)

    # Catch any on-disk clips not yet in the playlist (e.g. brand-new
    # builds with no prior history) — append alphabetically for stability.
    for url in sorted(on_disk):
        if url not in seen:
            clips.append(url)
            seen.add(url)

    PLAYLIST.write_text(json.dumps({"clips": clips}, indent=2) + "\n", encoding="utf-8")
    print(f"\nplaylist: {PLAYLIST.relative_to(ROOT)} ({len(clips)} entries)")
    for c in clips:
        print(f"  - {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
