#!/usr/bin/env python3
"""Cut a folder of clips/images into a fast-paced, brand-style edit using FFmpeg.

Built for the "punchy social edit" look: short clips chained with energetic
xfade transitions, an optional slow Ken Burns zoom on still images, a color
grade pass, animated caption overlays, and a music bed (with optional
sidechain ducking under the original clip audio).

Output: vertical 1080x1920 (Reels/TikTok) by default, 30 fps, H.264 MP4.

Usage examples
--------------
    # Basic: every clip/image in ./clips -> edit.mp4, cycling transitions
    python video_editor.py ./clips -a music.mp3

    # Faster cuts, moody grade, ducked music under clip audio
    python video_editor.py ./clips -a music.mp3 \
        --clip-duration 0.8 --transition-duration 0.25 \
        --color-grade moody --duck

    # Add captions and preview the FFmpeg command without encoding
    python video_editor.py ./clips --captions captions.json --dry-run

captions.json format
---------------------
    [
      {"text": "WAIT FOR IT", "start": 0.0, "end": 1.2, "position": "top"},
      {"text": "@brand.prods", "start": 0.0, "end": 99, "position": "bottom"}
    ]

Requirements
------------
    * Python 3.8+
    * FFmpeg available on PATH (https://ffmpeg.org/download.html)
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}

FPS = 30

ASPECTS = {
    "reel": (1080, 1920),    # Instagram Reels / TikTok / Stories
    "square": (1080, 1080),  # Feed square
    "landscape": (1920, 1080),
}

# Curated FFmpeg xfade transitions that read as "energetic" cuts rather than
# slow dissolves -- a good default cycle for fast brand-style edits.
DEFAULT_TRANSITIONS = [
    "fadeblack", "wipeleft", "slideup", "circleopen", "zoomin",
    "wiperight", "slidedown", "pixelize", "dissolve", "hlslice",
]

COLOR_PRESETS = {
    "none": "",
    "cinematic": "eq=contrast=1.15:saturation=0.92:brightness=-0.02",
    "vibrant": "eq=contrast=1.1:saturation=1.4:brightness=0.02",
    "moody": "eq=contrast=1.2:saturation=0.75:brightness=-0.04,colorbalance=rs=-0.05:bs=0.08",
    "warm": "eq=contrast=1.05:saturation=1.1,colorbalance=rs=0.08:gs=0.02:bs=-0.08",
    "cool": "eq=contrast=1.05:saturation=1.05,colorbalance=rs=-0.06:bs=0.1",
}

CAPTION_POSITIONS = {
    "top": ("(w-text_w)/2", "h*0.08"),
    "center": ("(w-text_w)/2", "(h-text_h)/2"),
    "bottom": ("(w-text_w)/2", "h*0.85"),
}


@dataclass
class MediaItem:
    path: Path
    kind: str  # "image" or "video"


def find_media(folder: Path) -> list[MediaItem]:
    """Return clips/images in *folder*, sorted by filename (alphabetical order
    decides the cut order, so name files 01_..., 02_..., ...)."""
    items = []
    for p in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in VIDEO_EXTENSIONS:
            items.append(MediaItem(p, "video"))
        elif ext in IMAGE_EXTENSIONS:
            items.append(MediaItem(p, "image"))
    return items


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "Error: FFmpeg was not found on your PATH.\n"
            "Install it from https://ffmpeg.org/download.html and try again."
        )


def escape_drawtext(text: str) -> str:
    """Escape a string for safe use inside an FFmpeg drawtext text='...' value."""
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "’")
        .replace("%", "\\%")
    )


def load_captions(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    for cap in data:
        if cap.get("position", "bottom") not in CAPTION_POSITIONS:
            sys.exit(f"Error: caption position '{cap.get('position')}' must be one of {list(CAPTION_POSITIONS)}.")
    return data


def prep_filter(idx: int, kind: str, width: int, height: int, duration: float,
                 fps: int, zoom: bool, color_filter: str) -> str:
    """Build the per-input filter chain: scale/crop, optional Ken Burns zoom,
    color grade, and pixel format -- always landing on a fixed-size, fixed-rate
    stream labeled [v{idx}] so it can be chained into xfade transitions."""
    label_in = f"[{idx}:v]"
    label_out = f"[v{idx}]"

    if kind == "image" and zoom:
        frames = max(1, round(duration * fps))
        chain = (
            f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
            f"crop={width * 2}:{height * 2},"
            f"zoompan=z='min(zoom+0.0015,1.18)':d={frames}:s={width}x{height}:fps={fps},"
            f"setsar=1"
        )
    else:
        chain = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
            f"setsar=1,fps={fps}"
        )

    if color_filter:
        chain += f",{color_filter}"
    chain += ",format=yuv420p"

    return f"{label_in}{chain}{label_out}"


def build_video_chain(n: int, duration: float, transition_duration: float,
                       transitions: list[str]) -> tuple[list[str], str]:
    """Chain [v0..vn-1] with xfade transitions, cycling through *transitions*.
    Returns (filter parts, final label)."""
    if n == 1:
        return [], "[v0]"

    parts = []
    prev_label = "[v0]"
    offset = duration - transition_duration
    for i in range(1, n):
        out_label = "[vout]" if i == n - 1 else f"[vx{i}]"
        transition = transitions[(i - 1) % len(transitions)]
        parts.append(
            f"{prev_label}[v{i}]xfade=transition={transition}:"
            f"duration={transition_duration}:offset={offset:.3f}{out_label}"
        )
        prev_label = out_label
        offset += duration - transition_duration
    return parts, "[vout]"


def build_audio_chain(audio_labels: list[str], transition_duration: float) -> tuple[list[str], str]:
    """Crossfade a sequence of per-clip audio streams (e.g. [0:a],[1:a],...)
    into one continuous track using acrossfade, mirroring the video xfade
    chain so cuts and audio line up."""
    if not audio_labels:
        return [], ""
    if len(audio_labels) == 1:
        label = audio_labels[0]
        out = "[aclip]"
        return [f"{label}asetpts=PTS-STARTPTS{out}"], out

    parts = []
    prev = f"{audio_labels[0]}asetpts=PTS-STARTPTS[apre0]"
    parts.append(prev)
    prev_label = "[apre0]"
    for i in range(1, len(audio_labels)):
        out_label = "[aclip]" if i == len(audio_labels) - 1 else f"[ax{i}]"
        parts.append(f"{audio_labels[i]}asetpts=PTS-STARTPTS[apre{i}]")
        parts.append(
            f"{prev_label}[apre{i}]acrossfade=d={transition_duration}:c1=tri:c2=tri{out_label}"
        )
        prev_label = out_label
    return parts, "[aclip]"


def build_caption_chain(captions: list[dict], base_label: str) -> tuple[list[str], str]:
    parts = []
    label = base_label
    for i, cap in enumerate(captions):
        x, y = CAPTION_POSITIONS[cap.get("position", "bottom")]
        out_label = f"[cap{i}]"
        size = cap.get("size", 56)
        text = escape_drawtext(cap["text"])
        parts.append(
            f"{label}drawtext=text='{text}':fontsize={size}:fontcolor=white:"
            f"borderw=3:bordercolor=black@0.7:x={x}:y={y}:"
            f"enable='between(t,{cap['start']},{cap['end']})'{out_label}"
        )
        label = out_label
    return parts, label


def build_command(items: list[MediaItem], args: argparse.Namespace) -> list[str]:
    width, height = ASPECTS[args.aspect]
    transitions = (
        [t.strip() for t in args.transitions.split(",") if t.strip()]
        if args.transitions
        else DEFAULT_TRANSITIONS
    )
    color_filter = COLOR_PRESETS[args.color_grade]

    cmd: list[str] = ["ffmpeg", "-y"]

    for item in items:
        if item.kind == "image":
            cmd += ["-loop", "1", "-t", f"{args.clip_duration}", "-i", str(item.path)]
        else:
            cmd += ["-ss", f"{args.trim_start}", "-t", f"{args.clip_duration}", "-i", str(item.path)]

    bg_audio_idx = None
    if args.audio:
        cmd += ["-i", str(args.audio)]
        bg_audio_idx = len(items)

    filter_parts: list[str] = []

    for idx, item in enumerate(items):
        filter_parts.append(
            prep_filter(idx, item.kind, width, height, args.clip_duration, FPS, not args.no_zoom, color_filter)
        )

    video_parts, vlabel = build_video_chain(len(items), args.clip_duration, args.transition_duration, transitions)
    filter_parts += video_parts

    captions = load_captions(args.captions) if args.captions else []
    if captions:
        caption_parts, vlabel = build_caption_chain(captions, vlabel)
        filter_parts += caption_parts

    clip_audio_labels = []
    if not args.mute_clips:
        clip_audio_labels = [f"[{idx}:a]" for idx, item in enumerate(items) if item.kind == "video"]

    audio_parts, clip_audio_label = build_audio_chain(clip_audio_labels, args.transition_duration)
    filter_parts += audio_parts

    alabel = None
    if clip_audio_label and bg_audio_idx is not None:
        music_label = f"[{bg_audio_idx}:a]"
        if args.duck:
            filter_parts.append(
                f"{music_label}{clip_audio_label}sidechaincompress="
                f"threshold=0.05:ratio=8:attack=20:release=300[ducked]"
            )
            filter_parts.append(f"[ducked]{clip_audio_label}amix=inputs=2:duration=first:dropout_transition=2[aout]")
        else:
            filter_parts.append(f"{music_label}{clip_audio_label}amix=inputs=2:duration=first:dropout_transition=2[aout]")
        alabel = "[aout]"
    elif clip_audio_label:
        alabel = clip_audio_label
    elif bg_audio_idx is not None:
        alabel = f"[{bg_audio_idx}:a]"

    cmd += ["-filter_complex", ";".join(filter_parts), "-map", vlabel]
    if alabel is not None:
        cmd += ["-map", alabel]
        if bg_audio_idx is not None:
            cmd += ["-shortest"]

    cmd += [
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        "-preset", "medium",
        "-crf", "19",
        "-movflags", "+faststart",
    ]
    if alabel is not None:
        cmd += ["-c:a", "aac", "-b:a", "192k"]

    cmd.append(str(args.output))
    return cmd


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cut a folder of clips/images into a fast-paced, brand-style social edit with FFmpeg.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("folder", type=Path, help="Folder containing video clips and/or images.")
    parser.add_argument("-o", "--output", type=Path, default=Path("edit.mp4"), help="Output MP4 file path.")
    parser.add_argument("-a", "--audio", type=Path, default=None, help="Background music track.")
    parser.add_argument("--aspect", choices=ASPECTS, default="reel", help="Output canvas size.")
    parser.add_argument("-d", "--clip-duration", type=float, default=1.0, help="Seconds each clip/image is shown (including its transition overlap).")
    parser.add_argument("-t", "--transition-duration", type=float, default=0.35, help="Crossfade duration between cuts in seconds.")
    parser.add_argument("--transitions", type=str, default=None, help="Comma-separated FFmpeg xfade transition names to cycle through (default: a curated energetic set).")
    parser.add_argument("--color-grade", choices=COLOR_PRESETS, default="cinematic", help="Color grade preset.")
    parser.add_argument("--no-zoom", action="store_true", help="Disable the slow Ken Burns zoom on still images.")
    parser.add_argument("--mute-clips", action="store_true", help="Discard original audio from video clips (use only the music track).")
    parser.add_argument("--duck", action="store_true", help="Sidechain-duck the music under the original clip audio (requires both clip audio and --audio).")
    parser.add_argument("--trim-start", type=float, default=0.0, help="Seconds to skip from the start of every video clip before trimming to --clip-duration.")
    parser.add_argument("--captions", type=Path, default=None, help="JSON file with caption overlays, see module docstring for format.")
    parser.add_argument("--dry-run", action="store_true", help="Print the FFmpeg command without running it.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.folder.is_dir():
        sys.exit(f"Error: '{args.folder}' is not a directory.")

    items = find_media(args.folder)
    if not items:
        sys.exit(f"Error: no video clips or images found in '{args.folder}'.")

    if args.transition_duration >= args.clip_duration:
        sys.exit(
            "Error: --transition-duration must be shorter than --clip-duration "
            f"(got transition={args.transition_duration}, duration={args.clip_duration})."
        )

    if args.audio is not None and not args.audio.is_file():
        sys.exit(f"Error: audio file '{args.audio}' not found.")

    if args.captions is not None and not args.captions.is_file():
        sys.exit(f"Error: captions file '{args.captions}' not found.")

    if not args.dry_run:
        check_ffmpeg()

    cmd = build_command(items, args)

    kinds = ", ".join(f"{p.path.name} ({p.kind})" for p in items)
    print(f"Found {len(items)} item(s) in '{args.folder}': {kinds}")
    total = args.clip_duration + (len(items) - 1) * (args.clip_duration - args.transition_duration)
    width, height = ASPECTS[args.aspect]
    print(f"Approx. video length: {total:.1f}s at {width}x{height} {FPS}fps.")

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
