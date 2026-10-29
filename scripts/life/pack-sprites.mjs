// Packs the life flipbooks rendered in Blender (scripts/life/render_*.py) into WebP atlases for the
// booking map (row 95).   node scripts/life/pack-sprites.mjs [players|cat …]
//
// Every frame is trimmed to its alpha, packed on shelves, and described in a JSON next to the atlas:
// the pixel rect and where that rect sits in metres relative to the character's base point (image
// plane for the body seen from the drone, ground plane for the shadow seen from straight above).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FRAMES = resolve(root, 'blender/characters/frames');
const OUT = resolve(root, 'public/models/life');
const ALPHA_MIN = 8; // shadow catcher noise below this is dropped
const PAD = 8; // px between frames: still ≥ 3 px in the scaled-down atlases and their first mips

/** Trimmed RGBA buffer of one PNG plus its trim box (in source pixels, y down). */
async function trim(file, { black = false } = {}) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < ALPHA_MIN) { data[i + 3] = 0; continue; }
      if (black) { data[i] = data[i + 1] = data[i + 2] = 0; }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const tw = x1 - x0 + 1; const th = y1 - y0 + 1;
  const buf = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) data.copy(buf, y * tw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4);
  return { buf, w: tw, h: th, x0, y0, sw: w, sh: h };
}

/** Shelf packing, tallest first; returns atlas size and positions (in place on the items). */
function pack(items, width) {
  const order = [...items].sort((a, b) => b.h - a.h);
  let x = 0; let y = 0; let shelf = 0;
  for (const it of order) {
    if (x + it.w + PAD > width) { x = 0; y += shelf + PAD; shelf = 0; }
    it.ax = x; it.ay = y;
    x += it.w + PAD;
    shelf = Math.max(shelf, it.h);
  }
  const height = Math.ceil((y + shelf + 1) / 4) * 4; // WebGL 2: any size; no power-of-two padding
  return { width, height };
}

/**
 * Writes the atlas, plus a half-size copy (`-lo`) for phones and small GPUs: the rects are in 0..1,
 * so both share one json.
 */
async function writeAtlas(items, width, file, quality, alphaQuality = 90, scales = [1, 0.5]) {
  const size = pack(items, width);
  const composite = items.map((it) => ({ input: it.buf, raw: { width: it.w, height: it.h, channels: 4 }, left: it.ax, top: it.ay }));
  const png = await sharp({ create: { width: size.width, height: size.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composite).png().toBuffer();
  // Frames are rendered oversampled; the atlas the page loads is scaled down from it (scales[0]),
  // the phones' one further (scales[1]).
  for (const [k, sc] of scales.entries()) {
    const out = resolve(OUT, k ? file.replace('.webp', '-lo.webp') : file);
    const img = sc === 1 ? sharp(png) : sharp(png).resize(Math.round(size.width * sc), Math.round(size.height * sc), { kernel: 'lanczos3' });
    await img.webp({ quality, alphaQuality, effort: 6, smartSubsample: true }).toFile(out);
  }
  return size;
}

const round = (v) => Math.round(v * 1000) / 1000;

// Row 181: a coarse silhouette per body frame (alpha coverage on a grid in metres around the base
// point, one digit per cell), so the page can enter a looping clip at the frame most like the pose on
// screen and cross-fade between look-alikes instead of ghosting two different stances.
const SIG = { x0: -0.9, x1: 0.9, y0: -0.1, y1: 1.9, cols: 5, rows: 8 };
function signature(bt, ppm) {
  let out = '';
  const cw = (SIG.x1 - SIG.x0) / SIG.cols;
  const ch = (SIG.y1 - SIG.y0) / SIG.rows;
  for (let r = 0; r < SIG.rows; r++) {
    for (let c = 0; c < SIG.cols; c++) {
      let sum = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const X = SIG.x0 + (c + (sx + 0.5) / 4) * cw;
          const Y = SIG.y1 - (r + (sy + 0.5) / 4) * ch;
          const px = Math.floor((X - bt.m[0]) * ppm);
          const py = Math.floor((bt.m[3] - Y) * ppm);
          if (px >= 0 && py >= 0 && px < bt.w && py < bt.h) sum += bt.buf[(py * bt.w + px) * 4 + 3] / 255;
        }
      }
      out += Math.min(9, Math.round((sum / 16) * 9));
    }
  }
  return out;
}
const round5 = (v) => Math.round(v * 100000) / 100000; // atlas rects: sub-texel precision in a 4096 px atlas

/**
 * One sprite set: every frame directory under `dir` is split by `parse(name)` into [group, key]
 * (players: variant dir + clip_facing; cat: clip_heading), trimmed, packed, described.
 */
async function packSet({ name, dir, groups, parse, complete, mirror, aliases, extra = () => ({}), quality = [86, 70], alpha = 90, width = 2048, scales, shadowScales = scales, hi, sig = false }) {
  const meta = JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8'));
  const { body, shadow, ppm, shadowPpm } = meta;
  const bodies = [];
  const shadows = [];
  const frames = {};
  for (const [group, sub] of groups(meta)) {
    if (complete && !complete(meta, sub)) continue;
    // Mirrored keys reuse their twin's body frames: pack the twins first (round 9: padel 'left' < 'right').
    const dirs = readdirSync(sub).filter((d) => statSync(resolve(sub, d)).isDirectory()).sort();
    const isTwin = (cf) => !!mirror?.(...parse(group, cf));
    for (const cf of [...dirs.filter((d) => !isTwin(d)), ...dirs.filter(isTwin)]) {
      const [a, b] = parse(group, cf);
      const files = readdirSync(resolve(sub, cf)).filter((f) => /^\d+\.png$/.test(f)).sort();
      const list = [];
      // Mirrored keys reuse the body frames of their mirror image, flipped on the page (the shadow,
      // cast by a sun from one side, is always its own).
      const twin = mirror?.(a, b);
      for (const [fi, f] of files.entries()) {
        let bi;
        if (twin) {
          bi = frames[a][twin][fi][0];
        } else {
          const bt = await trim(resolve(sub, cf, f));
          // Body rect in metres, image plane: x right, y up, origin at the base point.
          const win = meta.clips?.[String(b).split('|')[0]]?.body ?? body; // a clip may have its own, taller window (the serve)
          bt.m = [win.x0 + bt.x0 / ppm, win.y1 - (bt.y0 + bt.h) / ppm, win.x0 + (bt.x0 + bt.w) / ppm, win.y1 - bt.y0 / ppm];
          bt.group = group;
          if (sig) bt.sig = signature(bt, ppm);
          bi = bodies.push(bt) - 1;
        }
        const sfile = resolve(sub, cf, `s${f}`);
        // Shadows are rendered for every other frame (row 132): the frames between share the last one.
        let si = list.length ? list[list.length - 1][1] : -1;
        if (existsSync(sfile)) {
          const st = await trim(sfile, { black: true });
          // Shadow rect on the ground, three.js axes: x right, z towards the camera (Blender −y).
          const bx0 = shadow.x0 + st.x0 / shadowPpm;
          const bx1 = shadow.x0 + (st.x0 + st.w) / shadowPpm;
          const by1 = shadow.y1 - st.y0 / shadowPpm; // top row = far side (+y Blender = −z three)
          const by0 = shadow.y1 - (st.y0 + st.h) / shadowPpm;
          st.m = [bx0, -by1, bx1, -by0];
          si = shadows.push(st) - 1;
        }
        list.push(twin ? [bi, si, 1] : [bi, si]);
      }
      ((frames[a] ??= {}))[b] = list;
    }
  }
  // Row 149: sprites blend their edges now (premultiplied on the page), so the alpha keeps its detail.
  const bSize = await writeAtlas(bodies, width, `${name}.webp`, quality[0], alpha, scales);
  // Shadows are black: all their information is in the alpha channel.
  const sSize = shadows.length ? await writeAtlas(shadows, Math.min(width, 2048), `${name}-shadow.webp`, quality[1], quality[1], shadowScales) : { width: 0, height: 0 }; // ghosts cast none
  const uv = (it, size) => [round5(it.ax / size.width), round5(it.ay / size.height), round5(it.w / size.width), round5(it.h / size.height)];
  const rect = (it, size) => [...uv(it, size), ...it.m.map(round)];
  const out = { fps: meta.fps, clips: meta.clips, ...extra(meta), body: bodies.map((b) => rect(b, bSize)), shadow: shadows.map((s) => rect(s, sSize)), frames };
  aliases?.(out);
  if (sig) out.sig = { ...SIG, frames: bodies.map((b) => b.sig) };
  if (hi) {
    // Zoomed-in LOD (row 149): one sharper atlas per group (player variant), loaded on demand;
    // `rects[i]` is body frame i in its group's atlas (same metres as body[i]).
    out.hi = { farPpm: meta.ppm * scales[0], atlases: {}, rects: [] };
    for (const g of [...new Set(bodies.map((b) => b.group))]) {
      const items = bodies.filter((b) => b.group === g).map((b) => ({ ...b }));
      const file = `${name}-hi-${g}.webp`;
      const size = await writeAtlas(items, hi.width, file, hi.quality, alpha, [hi.scale]);
      out.hi.atlases[g] = `/models/life/${file}`;
      let k = 0;
      bodies.forEach((b, i) => { if (b.group === g) out.hi.rects[i] = uv(items[k++], size); });
      console.log(`  hi ${g}: ${Math.round(size.width * hi.scale)}×${Math.round(size.height * hi.scale)} ${(statSync(resolve(OUT, file)).size / 1024).toFixed(0)} KB`);
    }
  }
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(out));
  const kb = (f) => (existsSync(resolve(OUT, f)) ? (statSync(resolve(OUT, f)).size / 1024).toFixed(0) : 0);
  console.log(`${name}: ${bodies.length} frames, ${shadows.length} shadows, body ${bSize.width}×${bSize.height} ${kb(`${name}.webp`)} KB, shadow ${sSize.width}×${sSize.height} ${kb(`${name}-shadow.webp`)} KB, json ${kb(`${name}.json`)} KB`);
}

const PLAYERS = {
  name: 'players',
  dir: resolve(FRAMES, 'players'),
  // variant directories, each holding clip_facing directories
  groups: () => readdirSync(resolve(FRAMES, 'players')).filter((d) => statSync(resolve(FRAMES, 'players', d)).isDirectory()).sort().map((v) => [v, resolve(FRAMES, 'players', v)]),
  parse: (variant, cf) => {
    const i = cf.lastIndexOf('_');
    return [variant, `${cf.slice(0, i)}|${cf.slice(i + 1)}`];
  },
  // Round 9: walks in eight headings (h0 away from the drone, clockwise), the side-steps became the
  // shuffle and the run; the old names stay readable for life/lessons.js (its students).
  aliases: (out) => {
    const H = { away: 'h0', right: 'h2', toward: 'h4', left: 'h6' };
    const C = { sidestep_l: 'shuffle_l', sidestep_r: 'shuffle_r', strafe_l: 'shuffle_l', strafe_r: 'shuffle_r' };
    for (const set of Object.values(out.frames)) {
      for (const [f, h] of Object.entries(H)) if (set[`walk|${h}`] && !set[`walk|${f}`]) set[`walk|${f}`] = set[`walk|${h}`];
      for (const [o, n] of Object.entries(C)) for (const f of ['away', 'toward']) if (set[`${n}|${f}`]) set[`${o}|${f}`] = set[`${n}|${f}`];
    }
    for (const [o, n] of Object.entries(C)) if (out.clips[n]) out.clips[o] = out.clips[n];
  },
  // Only variants whose every clip is rendered for both facings (a render may still be running).
  complete: (meta, sub) => Object.entries(meta.clips).every(([clip, c]) => (c.facings ?? ['away', 'toward']).every((f) => {
    const d = resolve(sub, `${clip}_${f}`);
    return existsSync(d) && readdirSync(d).filter((x) => /^\d+\.png$/.test(x)).length === c.frames;
  })),
  extra: () => ({ shadowEvery: 2 }), // render_players.py SHADOW_EVERY
  quality: [72, 55], // ~1500 frames at 24 fps (row 132)
  alpha: 80,
  width: 8192,
  scales: [0.4, 0.26], // rendered at 120 px/m (row 149): 48 for the shared atlas on desktops, 31 on phones
  shadowScales: [0.8, 0.45], // shadows are rendered at 20 px/m: 16 / 9
  hi: { scale: 0.75, width: 5460, quality: 72 }, // 90 px/m per variant when zoomed in: a 4096 px wide atlas each
  sig: true, // row 181: silhouettes for pose-matched clip changes
};

// Round 9 (row 38): padel players, side-on. 'left' is the mirror image of 'right' (own shadows).
const PADEL = {
  ...PLAYERS,
  name: 'padel',
  dir: resolve(FRAMES, 'padel'),
  groups: () => readdirSync(resolve(FRAMES, 'padel')).filter((d) => statSync(resolve(FRAMES, 'padel', d)).isDirectory()).sort().map((v) => [v, resolve(FRAMES, 'padel', v)]),
  mirror: (_, key) => (key.endsWith('|left') ? key.replace('|left', '|right') : null),
  aliases: null,
  quality: [70, 55],
  width: 4096,
  scales: [0.4, 0.26],
  hi: null,
  sig: false,
};

const CAT = {
  name: 'cat',
  dir: resolve(FRAMES, 'cat'),
  groups: () => [['cat', resolve(FRAMES, 'cat')]],
  parse: (_, cf) => {
    const i = cf.lastIndexOf('_');
    return [cf.slice(0, i), Number(cf.slice(i + 1))];
  },
  // Headings 5–7 are the mirror images of 3–1 (row 143: 3/8 fewer body frames to download).
  mirror: (_, h) => (h > 4 ? 8 - h : null),
  extra: (meta) => ({ headings: meta.headings, speed: meta.speed, shadowEvery: meta.shadowEvery ?? 1 }),
  quality: [66, 58],
  alpha: 60, // a small, furry silhouette: soft alpha steps don't show
  scales: [0.66, 0.42], // rendered at 128 px/m: ~84 for desktops, ~54 for phones
};

// Round 7: the clay groundskeeper (render_keeper.py), eight headings like the cat.
const KEEPER = {
  ...CAT,
  name: 'keeper',
  dir: resolve(FRAMES, 'keeper'),
  groups: () => [['keeper', resolve(FRAMES, 'keeper')]],
  extra: (meta) => ({ headings: meta.headings, speed: meta.speed, hand: meta.hand, shadowEvery: meta.shadowEvery ?? 1 }),
  quality: [68, 58],
  alpha: 70,
  scales: [0.56, 0.36], // rendered at 100 px/m: 56 for desktops, 36 for phones
};

// Round 8: coaches and kids (render_lessons.py). Variant directories hold clip_facing directories,
// facing 'away' / 'toward' or a heading h0..h7; headings 5..7 reuse the mirrored bodies of 3..1.
const LESSONS = {
  name: 'lessons',
  dir: resolve(FRAMES, 'lessons'),
  groups: () => readdirSync(resolve(FRAMES, 'lessons')).filter((d) => statSync(resolve(FRAMES, 'lessons', d)).isDirectory()).sort().map((v) => [v, resolve(FRAMES, 'lessons', v)]),
  parse: (variant, cf) => {
    const i = cf.lastIndexOf('_');
    return [variant, `${cf.slice(0, i)}|${cf.slice(i + 1)}`];
  },
  mirror: (_, key) => {
    const m = /^(.*)\|h(\d)$/.exec(key);
    return m && +m[2] > 4 ? `${m[1]}|h${8 - +m[2]}` : null;
  },
  extra: (meta) => ({ shadowEvery: meta.shadowEvery ?? 2, headings: meta.headings, variants: meta.variants }),
  quality: [60, 50],
  alpha: 60,
  width: 8192, // packed half size: 4096 wide, under 4096 tall
  scales: [0.5, 0.32], // rendered at 96 px/m: 48 for desktops (as the players), 31 for phones
  shadowScales: [0.8, 0.45],
};

// Round 10 (row 65): Death walks the keeper's walk in Halloween (render_death.py), eight headings.
const DEATH = { ...KEEPER, name: 'death', dir: resolve(FRAMES, 'death'), groups: () => [['death', resolve(FRAMES, 'death')]], extra: (meta) => ({ headings: meta.headings, speed: meta.speed, hand: meta.hand, shadowEvery: meta.shadowEvery ?? 1 }) };

// Round 10 (row 65): five ghosts (render_ghosts.py), variant directories holding drift_h0..h7, no shadows.
const GHOSTS = {
  name: 'ghosts',
  dir: resolve(FRAMES, 'ghosts'),
  groups: () => readdirSync(resolve(FRAMES, 'ghosts')).filter((d) => statSync(resolve(FRAMES, 'ghosts', d)).isDirectory()).sort().map((v) => [v, resolve(FRAMES, 'ghosts', v)]),
  parse: (variant, cf) => {
    const i = cf.lastIndexOf('_');
    return [variant, `${cf.slice(0, i)}|h${cf.slice(i + 1)}`];
  },
  mirror: (_, key) => {
    const m = /^(.*)\|h(\d)$/.exec(key);
    return m && +m[2] > 4 ? `${m[1]}|h${8 - +m[2]}` : null;
  },
  extra: (meta) => ({ headings: meta.headings, variants: meta.variants }),
  quality: [60, 40],
  alpha: 55,
  width: 4096,
  scales: [0.5, 0.32], // rendered at 100 px/m: 50 on desktops, 32 on phones
};

mkdirSync(OUT, { recursive: true });
const which = process.argv.slice(2);
if (!which.length || which.includes('players')) await packSet(PLAYERS);
if (!which.length || which.includes('cat')) await packSet(CAT);
if (which.includes('padel')) await packSet(PADEL);
if (which.includes('keeper')) await packSet(KEEPER);
if (which.includes('lessons')) await packSet(LESSONS);
if (which.includes('death')) await packSet(DEATH);
if (which.includes('ghosts')) await packSet(GHOSTS);
