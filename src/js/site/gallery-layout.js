// Canvas layouts of the club gallery (map-gallery.js). Pure functions: every picture is placed exactly once,
// nothing overlaps. Wide screens get a landscape cloud, phones and tablets in portrait a dense portrait field.

// Small deterministic generator, so the map looks the same on every visit.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const even = (n) => Math.round(n / 2) * 2;
const GAP = 4;

// ---------- Wide: a landscape field with an organic outline ----------
export const WIDE = { w: 1600, h: 900 };
const WIDTHS = [48, 58, 70, 84, 100, 118];
const MAX_H = 150;

// An organic blob: three overlapping ellipses, like the reference's cluster.
const inBlob = (x, y) => [[0.3, 0.46, 0.3, 0.44], [0.58, 0.54, 0.34, 0.42], [0.82, 0.4, 0.2, 0.36]]
  .some(([cx, cy, rx, ry]) => (((x / WIDE.w - cx) / rx) ** 2 + ((y / WIDE.h - cy) / ry) ** 2) < 1);

function tryWide(items, k) {
  const rand = rng(20261030);
  const sized = items.map((src, i) => {
    let w = even(WIDTHS[Math.floor(rand() * WIDTHS.length)] * k);
    let h = even(w / src.ar);
    if (h > MAX_H * k) { h = even(MAX_H * k); w = even(h * src.ar); }
    return { src, i, w, h };
  }).sort((a, b) => b.w * b.h - a.w * a.h); // big ones first: they are the hard ones to fit
  const placed = [];
  for (const s of sized) {
    let ok = false;
    for (let tries = 0; tries < 900 && !ok; tries += 1) {
      const x = even(rand() * (WIDE.w - s.w));
      const y = even(rand() * (WIDE.h - s.h));
      if (![[x, y], [x + s.w, y], [x, y + s.h], [x + s.w, y + s.h], [x + s.w / 2, y + s.h / 2]].every(([px, py]) => inBlob(px, py))) continue;
      if (placed.some((p) => x < p.x + p.w + GAP && x + s.w + GAP > p.x && y < p.y + p.h + GAP && y + s.h + GAP > p.y)) continue;
      placed.push({ x, y, w: s.w, h: s.h, src: s.src, i: s.i, pos: `${Math.round(rand() * 40 + 30)}% ${Math.round(rand() * 30 + 10)}%` });
      ok = true;
    }
    if (!ok) return null;
  }
  return placed.sort((a, b) => a.i - b.i);
}

export function layoutWide(items) {
  for (let k = 1; k > 0.5; k -= 0.04) {
    const placed = tryWide(items, k);
    if (placed) return { w: WIDE.w, h: WIDE.h, tiles: placed };
  }
  return { w: WIDE.w, h: WIDE.h, tiles: [] };
}

// ---------- Narrow: a portrait field, skyline packing ----------
// Short side 104..176 units; one unit is one css pixel at the start scale, so pictures read big on a phone.
const FIELD_W = 860;
const STEP = 4;

export function layoutNarrow(items) {
  const rand = rng(20261106);
  const sky = new Array(FIELD_W / STEP).fill(0);
  const placed = [];
  items.forEach((src, i) => {
    const side = 104 + Math.floor(rand() * 5) * 18; // 104..176
    let w; let h;
    if (src.ar >= 1) { h = even(side); w = even(h * src.ar); } else { w = even(side); h = even(w / src.ar); }
    if (w > 320) { w = 320; h = even(w / src.ar); }
    if (h > 300) { h = 300; w = even(h * src.ar); }
    const cols = Math.ceil((w + GAP) / STEP);
    let best = { y: Infinity, x: 0 };
    for (let c = 0; c + cols <= sky.length; c += 1) {
      let y = 0;
      for (let k = c; k < c + cols; k += 1) y = Math.max(y, sky[k]);
      y += (rand() - 0.5) * 0.001; // tie-break
      if (y < best.y) best = { y, x: c * STEP };
    }
    const y = Math.round(best.y);
    for (let k = best.x / STEP; k < best.x / STEP + cols && k < sky.length; k += 1) sky[k] = y + h + GAP;
    placed.push({ x: best.x, y, w, h, src, i, pos: `${Math.round(rand() * 40 + 30)}% ${Math.round(rand() * 30 + 10)}%` });
  });
  const fh = Math.max(...sky);
  return { w: FIELD_W, h: even(fh), tiles: placed };
}
