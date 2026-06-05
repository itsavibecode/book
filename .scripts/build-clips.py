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

    # Rebuild the playlist while preserving any manual ordering already
    # in playlist.json:
    #   1. HEAD_CLIPS always lead (bookmentions.mp4 first).
    #   2. Existing playlist body order is preserved for any clip still
    #      present in clips/ — so manual reorders survive re-runs.
    #   3. Newly-encoded clips not yet in the playlist are appended at
    #      the end in alphabetical order for stability.
    #   4. Clips removed from disk drop out of the playlist silently.
    on_disk = {f"/clips/{p.name}" for p in OUTDIR.glob("*.mp4")} | set(HEAD_CLIPS)

    existing = []
    if PLAYLIST.exists():
        try:
            existing = json.loads(PLAYLIST.read_text(encoding="utf-8")).get("clips", [])
        except (json.JSONDecodeError, OSError):
            existing = []

    clips: list[str] = []
    seen: set[str] = set()

    # 1. HEAD_CLIPS pinned to the top in declared order
    for url in HEAD_CLIPS:
        if url not in seen:
            clips.append(url)
            seen.add(url)

    # 2. Preserve existing body order for clips that are still on disk
    for url in existing:
        if url in on_disk and url not in seen:
            clips.append(url)
            seen.add(url)

    # 3. Append any on-disk clips not yet in the playlist (alphabetical)
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
