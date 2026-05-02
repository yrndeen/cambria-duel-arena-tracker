#!/usr/bin/env node
/**
 * Remove solid/near-black background from the Cambria emblem PNG via edge flood-fill.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const src = path.join(__dirname, "..", "assets", "cambria-emblem.png");
const tmp = path.join(__dirname, "..", "assets", "cambria-emblem.tmp.png");

function isBackgroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  const sat = max === 0 ? 0 : (max - min) / max;
  return max <= 48 && lum <= 42 && sat <= 0.35;
}

async function main() {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (ch !== 4) {
    throw new Error(`Expected 4 channels (RGBA), got ${ch}`);
  }

  const visited = new Uint8Array(w * h);
  const q = [];

  function idx(x, y) {
    return y * w + x;
  }

  function tryPush(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const o = i * ch;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (!isBackgroundPixel(r, g, b)) return;
    visited[i] = 1;
    q.push(i);
  }

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (q.length) {
    const i = q.pop();
    const x = i % w;
    const y = (i / w) | 0;
    const o = i * ch;
    data[o + 3] = 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  await sharp(Buffer.from(data), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toFile(tmp);

  fs.renameSync(tmp, src);
  console.log("Updated", src, "— black background removed (transparent).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
