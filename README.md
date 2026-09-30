# Spa Vlog — Images to Video

A small Python tool that turns a folder of images into a polished **1080p
MP4 at 30 fps** using FFmpeg. Designed for a relaxing, aesthetic "spa vlog"
style montage — frames cross-fade smoothly into one another for a calm POV
feel, with optional ambient background music.

## Requirements

- Python 3.8+
- [FFmpeg](https://ffmpeg.org/download.html) on your `PATH`

Check FFmpeg is installed:

```bash
ffmpeg -version
```

## Usage

Put your frames in a folder (they are ordered alphabetically by filename, so
name them `01.jpg`, `02.jpg`, … for a predictable sequence), then:

```bash
# Basic: every image in ./frames -> spa_vlog.mp4
python images_to_video.py ./frames

# Custom timing, output name, and ambient music
python images_to_video.py ./frames -o vlog.mp4 \
    --duration 3 --transition 1 --audio ambient_spa.mp3

# Preview the FFmpeg command without encoding
python images_to_video.py ./frames --dry-run
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `folder` | — | Folder containing the images (required). |
| `-o, --output` | `spa_vlog.mp4` | Output MP4 file path. |
| `-d, --duration` | `3.0` | Seconds each image is shown (including its transition). |
| `-t, --transition` | `1.0` | Cross-fade between frames in seconds (`0` = hard cuts). |
| `-a, --audio` | none | Optional background audio track. |
| `--dry-run` | off | Print the FFmpeg command without running it. |

## How it works

Each image is scaled to fit inside 1920×1080 (aspect ratio preserved) and
padded to exactly fill the frame, then chained together with FFmpeg's `xfade`
filter for smooth cross-fades. Output is H.264 (`yuv420p`) with `+faststart`
for instant web playback; audio, when supplied, is encoded as AAC and trimmed
to the video length.

Supported image types: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`, `.tif`,
`.tiff`.

---

# Heshbonit — Promo Motion Video

`promo/` contains a 20-second vertical (1080×1920, 30 fps) motion-graphics ad
for [heshbonit.org](http://heshbonit.org), sized for Reels, TikTok and Stories.

- `promo/heshbonit_promo.mp4` — the rendered video.
- `promo/heshbonit_promo.html` — the animation source. Open it in a browser to
  watch a live loop. All on-screen text (Hebrew) is in the `CONFIG` object at
  the top of the script, and brand colors are CSS variables in `:root`.
- `promo/render_promo.js` — renders the HTML frame by frame into MP4.

Re-render after editing (needs Node + Playwright and FFmpeg):

```bash
node promo/render_promo.js -o promo/heshbonit_promo.mp4
# with background music (fades out at the end):
node promo/render_promo.js -o promo/heshbonit_promo.mp4 --audio music.mp3
```
