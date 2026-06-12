#!/usr/bin/env python3
"""Turn a folder of images into a 1080p MP4 video using FFmpeg.

Built for a relaxing, aesthetic "spa vlog" style montage: each image is held
for a few seconds, frames cross-fade into one another for a smooth POV feel,
and an optional ambient background track can be mixed in.

Output: 1920x1080 (1080p), 30 fps, H.264 MP4.

Usage examples
--------------
    # Basic: every image in ./frames -> spa_vlog.mp4
    python images_to_video.py ./frames

    # Custom timing, output name and ambient music
    python images_to_video.py ./frames -o vlog.mp4 \
        --duration 3 --transition 1 --audio ambient_spa.mp3

Requirements
------------
    * Python 3.8+
    * FFmpeg available on PATH (https://ffmpeg.org/download.html)
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# Image extensions we will pick up from the input folder.
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

WIDTH, HEIGHT = 1920, 1080  # 1080p
FPS = 30


def find_images(folder: Path) -> list[Path]:
    """Return image files in *folder*, sorted in a natural, predictable order."""
    images = [
        p
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    ]
    # Sort case-insensitively by name so frame1, frame2, ... line up as expected.
    images.sort(key=lambda p: p.name.lower())
    return images


def check_ffmpeg() -> None:
    """Exit with a helpful message if FFmpeg is not installed."""
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "Error: FFmpeg was not found on your PATH.\n"
            "Install it from https://ffmpeg.org/download.html and try again."
        )


def build_filter_complex(
    n: int, duration: float, transition: float
) -> tuple[str, str]:
    """Build the FFmpeg filtergraph that scales, pads and cross-fades frames.

    Returns a tuple of (filter_complex_string, final_video_label).
    """
    # Each input is scaled to fit inside 1080p while preserving aspect ratio,
    # then padded with black bars so every frame is exactly 1920x1080. We also
    # force a constant frame rate and SAR so xfade can chain the streams.
    scale_pad = (
        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        f"setsar=1,fps={FPS},format=yuv420p"
    )

    parts = []
    for i in range(n):
        parts.append(f"[{i}:v]{scale_pad}[v{i}]")

    if n == 1:
        # Single image: nothing to cross-fade.
        return ";".join(parts), "[v0]"

    if transition <= 0:
        # Hard cuts: simply concatenate the prepared streams.
        concat_inputs = "".join(f"[v{i}]" for i in range(n))
        parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[vout]")
        return ";".join(parts), "[vout]"

    # Cross-fade (xfade) chain. Each xfade offset is the cumulative visible time
    # of all previous clips minus the overlap already consumed by transitions.
    prev_label = "[v0]"
    offset = duration - transition
    for i in range(1, n):
        out_label = "[vout]" if i == n - 1 else f"[x{i}]"
        parts.append(
            f"{prev_label}[v{i}]xfade=transition=fade:"
            f"duration={transition}:offset={offset:.3f}{out_label}"
        )
        prev_label = out_label
        # Next clip adds (duration - transition) of fresh, non-overlapping time.
        offset += duration - transition

    return ";".join(parts), "[vout]"


def build_command(
    images: list[Path],
    output: Path,
    duration: float,
    transition: float,
    audio: Path | None,
) -> list[str]:
    """Assemble the full FFmpeg command line."""
    cmd: list[str] = ["ffmpeg", "-y"]

    # Each image becomes a looped input that lasts `duration` seconds.
    for img in images:
        cmd += ["-loop", "1", "-t", f"{duration}", "-i", str(img)]

    if audio is not None:
        cmd += ["-i", str(audio)]

    filter_complex, vlabel = build_filter_complex(
        len(images), duration, transition
    )
    cmd += ["-filter_complex", filter_complex, "-map", vlabel]

    if audio is not None:
        # The audio input index is right after all the images.
        cmd += ["-map", f"{len(images)}:a"]
        # Trim/stop the muxer at the shortest stream so audio doesn't run long.
        cmd += ["-shortest"]

    cmd += [
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        "-preset", "medium",
        "-crf", "20",
        "-movflags", "+faststart",
    ]

    if audio is not None:
        cmd += ["-c:a", "aac", "-b:a", "192k"]

    cmd.append(str(output))
    return cmd


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a 1080p 30fps MP4 from a folder of images using FFmpeg.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("folder", type=Path, help="Folder containing the images.")
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("spa_vlog.mp4"),
        help="Output MP4 file path.",
    )
    parser.add_argument(
        "-d", "--duration", type=float, default=3.0,
        help="Seconds each image is shown (including its transition).",
    )
    parser.add_argument(
        "-t", "--transition", type=float, default=1.0,
        help="Cross-fade duration between frames in seconds (0 = hard cuts).",
    )
    parser.add_argument(
        "-a", "--audio", type=Path, default=None,
        help="Optional background audio track (e.g. ambient spa music).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the FFmpeg command without running it.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.folder.is_dir():
        sys.exit(f"Error: '{args.folder}' is not a directory.")

    images = find_images(args.folder)
    if not images:
        sys.exit(f"Error: no images found in '{args.folder}'.")

    if args.transition >= args.duration:
        sys.exit(
            "Error: --transition must be shorter than --duration "
            f"(got transition={args.transition}, duration={args.duration})."
        )

    if args.audio is not None and not args.audio.is_file():
        sys.exit(f"Error: audio file '{args.audio}' not found.")

    check_ffmpeg()

    cmd = build_command(
        images, args.output, args.duration, args.transition, args.audio
    )

    print(f"Found {len(images)} image(s) in '{args.folder}'.")
    total = args.duration + (len(images) - 1) * (args.duration - args.transition)
    print(f"Approx. video length: {total:.1f}s at {WIDTH}x{HEIGHT} {FPS}fps.")

    if args.dry_run:
        print("\nDry run - FFmpeg command:")
        print(" ".join(cmd))
        return 0

    print("\nEncoding... this may take a moment.")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        return result.returncode

    print(f"\nDone. Wrote '{args.output}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
