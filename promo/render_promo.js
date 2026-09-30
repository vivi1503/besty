#!/usr/bin/env node
/*
 * Render heshbonit_promo.html into an MP4 (1080x1920, vertical for Reels/TikTok/Stories).
 *
 * Every frame is captured deterministically by calling window.seek(t) in the page,
 * so the output is smooth regardless of machine speed.
 *
 * Usage:
 *   node promo/render_promo.js [-i page.html] [-o out.mp4] [--fps 30] [--audio music.mp3]
 *
 * Needs Playwright (npm i -g playwright) and FFmpeg on PATH (or set FFMPEG=/path/to/ffmpeg).
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const input = path.resolve(opt('-i', path.join(__dirname, 'heshbonit_promo.html')));
const out = path.resolve(opt('-o', 'heshbonit_promo.mp4'));
const fps = Number(opt('--fps', 30));
const audio = opt('--audio', null);
const ffmpegBin = process.env.FFMPEG || 'ffmpeg';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const url = 'file://' + input + '?render=1';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * fps);

  const ffArgs = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
  if (audio) ffArgs.push('-i', audio);
  ffArgs.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (audio) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${duration - 1.5}:d=1.5`, '-shortest');
  ffArgs.push(out);
  const ff = spawn(ffmpegBin, ffArgs, { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));

  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.seek(t), i / fps);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log(`\nSaved ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
