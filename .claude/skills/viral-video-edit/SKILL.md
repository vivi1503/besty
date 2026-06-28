---
name: viral-video-edit
description: Cut raw clips/photos into a fast-paced, brand-style social video (the "punchy reel" look — quick cuts on the beat, energetic transitions, bold captions, color grade, music sync). Use when the user wants a polished Instagram Reel / TikTok style edit, not a slow montage.
---

# Viral / Brand-Style Video Edit

This skill produces the editing style used by professional brand/product
Instagram accounts: short, punchy clips cut on the beat, varied transitions
(never the same one twice in a row), a consistent color grade, bold on-screen
captions, and music that ducks under any clip audio. It wraps `video_editor.py`
(repo root), an FFmpeg-based tool — there is no proprietary renderer, every
effect below maps directly to a flag on that script.

## What "editing at that level" actually means

Break the look into five concrete, controllable ingredients instead of
treating it as a vibe:

1. **Cut speed** — clips are short (0.6–1.5s for energetic content, up to
   2.5s for product/lifestyle beats) and ideally land on a musical beat.
   Controlled by `--clip-duration`.
2. **Transition variety** — never repeat the same transition back-to-back;
   mix hard cuts, wipes, zooms, and dissolves so no single transition
   becomes a "tell". Controlled by `--transitions` (a cycling list);
   `--transition-duration` should be short (0.2–0.4s) so transitions read as
   snappy, not slow.
3. **Motion on stills** — any static photo gets a slow Ken Burns zoom so it
   never feels frozen next to video clips. On by default, disable with
   `--no-zoom`.
4. **Color consistency** — one grade applied uniformly across every clip so
   footage from different sources looks like one shoot. Controlled by
   `--color-grade` (`cinematic`, `vibrant`, `moody`, `warm`, `cool`, `none`).
5. **Sound design** — original clip audio (whoosh/impact/ambient) stays
   present but the music bed ducks underneath it instead of fighting it.
   Controlled by `--audio` + `--duck`.

Captions (`--captions`) add the bold, high-contrast on-screen text these
accounts use for hooks and call-to-actions.

## Workflow

1. **Name and order the source clips/photos** in one folder, numerically
   prefixed (`01_hook.mp4`, `02_product.jpg`, `03_detail.mp4`, …) — the tool
   cuts them in that alphabetical order. Mix video clips and still photos
   freely.
2. **Pick a tempo.** Match `--clip-duration` to the music's BPM if you know
   it (`60 / BPM * beats_per_cut`), otherwise 0.8–1.2s is a safe energetic
   default. Keep `--transition-duration` well under `--clip-duration`
   (the tool errors out if it isn't).
3. **Write captions** (optional) as a small JSON file:
   ```json
   [
     {"text": "WAIT FOR IT", "start": 0.0, "end": 1.0, "position": "top"},
     {"text": "@brand.prods", "start": 0.0, "end": 99, "position": "bottom"}
   ]
   ```
   `position` is `top` | `center` | `bottom`.
4. **Always run `--dry-run` first.** It prints the exact FFmpeg command and
   the estimated final duration without encoding anything — use it to sanity
   check clip count, order, and total length before spending render time.
5. **Render**, then watch the output before declaring done — transitions and
   captions are easy to get subtly wrong (timing, position) and only show up
   on playback.

### Example

```bash
python video_editor.py ./clips \
  --aspect reel \
  --clip-duration 0.9 --transition-duration 0.25 \
  --color-grade moody \
  --captions captions.json \
  --audio music.mp3 --duck \
  -o final_edit.mp4
```

## Flag reference (`video_editor.py`)

| Flag | Purpose |
|------|---------|
| `folder` | Source clips/photos, cut in alphabetical filename order. |
| `--aspect` | `reel` (1080x1920), `square` (1080x1080), `landscape` (1920x1080). |
| `-d, --clip-duration` | Seconds each clip is shown, including its transition overlap. |
| `-t, --transition-duration` | Crossfade length between cuts; keep short for a punchy feel. |
| `--transitions` | Comma list of FFmpeg `xfade` transition names to cycle (default is a curated energetic set — `fadeblack,wipeleft,slideup,circleopen,zoomin,...`). |
| `--color-grade` | One uniform grade preset across the whole edit. |
| `--no-zoom` | Disable Ken Burns motion on still images. |
| `-a, --audio` | Background music track. |
| `--duck` | Sidechain-duck the music under original clip audio. |
| `--mute-clips` | Drop original clip audio entirely (music only). |
| `--captions` | JSON file of timed on-screen text overlays. |
| `--trim-start` | Skip N seconds from the start of every video clip (e.g. to skip a shaky start) before trimming to `--clip-duration`. |
| `--dry-run` | Print the FFmpeg command and estimated duration without rendering. |

## Known limits

- No automatic beat detection — pick `--clip-duration` to match the track's
  BPM manually, or pre-trim clips to exact beat-aligned lengths before
  running the tool.
- The clip-audio crossfade chain assumes the sequence is mostly video clips;
  if you mix in many still images and want clip audio retained, the audio
  timeline can drift from the video timeline — use `--mute-clips` plus
  `--audio` for image-heavy edits instead.
- Captions are static FFmpeg `drawtext` overlays (instant in/out), not
  animated kinetic typography — fine for hooks/CTAs, not for word-by-word
  karaoke captions.
