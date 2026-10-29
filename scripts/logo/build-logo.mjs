// Break Point wordmark (row 90): BREAK over POINT in a heavy condensed grotesk, both lines the
// same width, like a fight-poster title. Anton (SIL OFL 1.1) is turned into outlines here, so the
// site never loads the font. Run: node scripts/logo/build-logo.mjs
// Writes public/logo/*.svg, the favicons (row 121: public/favicon.svg, favicon-32.png,
// apple-touch-icon.png) and refreshes the <symbol>s between <!-- logo:start/end --> markers.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FONTS = {
  shoulders: 'node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff',
  anton: 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff',
};
const [which = 'anton', outDir] = process.argv.slice(2); // outDir: preview only, sprites untouched
const font = opentype.parse(fs.readFileSync(path.join(ROOT, FONTS[which])).buffer.slice(0));
const SIZE = 1000;
const LINE_GAP = 0.06; // gap between the two lines, in cap heights: they almost touch
const TRACK = 4; // font units between letters, before the outline swells them
const SWELL = +(process.env.SWELL ?? 26); // outline stroke: heavier than the font's own black weight

/** Glyph outlines of one line, letters spaced by `gap`, starting at x = 0. */
function line(text, y, gap = TRACK) {
  const scale = SIZE / font.unitsPerEm;
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(x, y, SIZE).toPathData(1));
    x += g.advanceWidth * scale + gap;
  }
  return { d: parts.join(''), width: x - gap };
}

/** Measure real ink bounds of path data. */
function bounds(text, y, gap) {
  const scale = SIZE / font.unitsPerEm;
  let x = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    const bb = g.getPath(x, y, SIZE).getBoundingBox();
    if (ch === ' ') { x += g.advanceWidth * scale + gap; continue; }
    minX = Math.min(minX, bb.x1); maxX = Math.max(maxX, bb.x2);
    minY = Math.min(minY, bb.y1); maxY = Math.max(maxY, bb.y2);
    x += g.advanceWidth * scale + gap;
  }
  return { minX, maxX, minY, maxY };
}

// Stacked: widen the narrower line's tracking until both lines share one width.
const top = 'BREAK';
const bottom = 'POINT';
const capY = SIZE; // first baseline
const capH = (() => { const b = font.charToGlyph('H').getPath(0, 0, SIZE).getBoundingBox(); return b.y2 - b.y1; })();
const y2 = capY + capH * (1 + LINE_GAP);
let gapTop = TRACK, gapBottom = TRACK;
for (let i = 0; i < 40; i++) {
  const a = bounds(top, capY, gapTop);
  const b = bounds(bottom, y2, gapBottom);
  const wa = a.maxX - a.minX, wb = b.maxX - b.minX;
  if (Math.abs(wa - wb) < 0.5) break;
  if (wa < wb) gapTop += (wb - wa) / (top.length - 1);
  else gapBottom += (wa - wb) / (bottom.length - 1);
}
const A = bounds(top, capY, gapTop);
const B = bounds(bottom, y2, gapBottom);
const minX = Math.min(A.minX, B.minX), maxX = Math.max(A.maxX, B.maxX);
const minY = A.minY, maxY = B.maxY;
const stacked = { d: line(top, capY, gapTop).d + line(bottom, y2, gapBottom).d, vb: [minX, minY, maxX - minX, maxY - minY] };

// One line, for the footer and tight spots.
const single = line('BREAK POINT', capY, TRACK);
const S = bounds('BREAK POINT', capY, TRACK);
const oneLine = { d: single.d, vb: [S.minX, S.minY, S.maxX - S.minX, S.maxY - S.minY] };

const pad = (v) => [v[0] - SWELL / 2, v[1] - SWELL / 2, v[2] + SWELL, v[3] + SWELL];
stacked.vb = pad(stacked.vb);
oneLine.vb = pad(oneLine.vb);
const vb = (v) => v.map((n) => +n.toFixed(1)).join(' ');
const ink = (fill) => `fill="${fill}" stroke="${fill}" stroke-width="${SWELL}" stroke-linejoin="miter"`;
const svg = (o) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb(o.vb)}"><path d="${o.d}" ${ink('#0a0a0a')}/></svg>\n`;
const out = outDir || path.join(ROOT, 'public/logo');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'break-point-stacked.svg'), svg(stacked));
fs.writeFileSync(path.join(out, 'break-point-line.svg'), svg(oneLine));

// Favicon (row 121): the first letters of the two lines, B over P, light on a dark square.
// Same outlines and line gap as the wordmark. Anton is so condensed that two stacked letters make a
// sliver in a square, so the pair is widened (`stretch`) and drawn without the swell until the
// counters stay open at 16px.
const FAV = { stretch: 2.6, swell: 0, fill: 0.86, gap: 0.18, ink: '#f4f3ef', ground: '#121211' };
function faviconSvg() {
  const yP = capY + capH * (1 + FAV.gap); // a wider gap than the wordmark's, so B and P stay apart at 16px
  const b = bounds('B', capY, 0);
  const p = bounds('P', yP, 0);
  const h = p.maxY - b.minY + FAV.swell;
  const side = Math.round(h / FAV.fill);
  const dy = (side - h) / 2 + FAV.swell / 2 - b.minY; // the stack sits in the vertical centre
  const glyph = (ch, bb, y) => {
    const path = font.charToGlyph(ch).getPath(0, y + dy, SIZE);
    const cx = (bb.minX + bb.maxX) / 2;
    path.commands.forEach((c) => { for (const k of ['x', 'x1', 'x2']) if (k in c) c[k] = side / 2 + (c[k] - cx) * FAV.stretch; });
    return path.toPathData(1);
  };
  const d = glyph('B', b, capY) + glyph('P', p, yP);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="${FAV.ground}"/>`
    + `<path d="${d}" fill="${FAV.ink}" stroke="${FAV.ink}" stroke-width="${FAV.swell}" stroke-linejoin="miter"/></svg>\n`;
  return { svg, side };
}
const { svg: fav, side: favSide } = faviconSvg();
const pub = outDir || path.join(ROOT, 'public');
fs.writeFileSync(path.join(pub, 'favicon.svg'), fav);
// PNGs rendered at 8x and scaled down, so the edges are evenly antialiased.
for (const [file, px] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ...(outDir ? [['favicon-16.png', 16]] : [])]) {
  await sharp(Buffer.from(fav), { density: (72 * px * 8) / favSide })
    .resize(px, px, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(pub, file));
}

if (outDir) { console.log('preview written to', outDir); process.exit(0); }

const symbols = [
  '<!-- logo:start (generated by scripts/logo/build-logo.mjs) -->',
  // No paint here: fill / stroke come from CSS on the <svg> (solid in the header, outline in the footer).
  `<symbol id="bp-logo" viewBox="${vb(stacked.vb)}"><path d="${stacked.d}"/></symbol>`,
  `<symbol id="bp-logo-line" viewBox="${vb(oneLine.vb)}"><path d="${oneLine.d}"/></symbol>`,
  '<!-- logo:end -->',
].join('');
for (const file of ['partials/nav.html', 'booking.html']) {
  const p = path.join(ROOT, file);
  let s = fs.readFileSync(p, 'utf8');
  const re = /<!-- logo:start[\s\S]*?<!-- logo:end -->/;
  if (re.test(s)) s = s.replace(re, symbols);
  else s = s.replace('</defs>', `${symbols}</defs>`);
  fs.writeFileSync(p, s);
}
console.log('swell', SWELL, '| stacked', vb(stacked.vb), 'aspect', (stacked.vb[2] / stacked.vb[3]).toFixed(3), '| line', vb(oneLine.vb), 'aspect', (oneLine.vb[2] / oneLine.vb[3]).toFixed(3));
