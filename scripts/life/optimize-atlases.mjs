// Row 48: re-encodes the packed flipbook atlases (pack-sprites.mjs output) smaller. The sprites are
// 30 px tall on screen, so colour quality 56-60 and a coarser alpha (alphaQuality 45-55: the
// biggest saver on a mostly transparent sheet) are invisible. Shadows are black: only their alpha counts.
// Run it on FRESH pack-sprites output (it re-encodes in place; running twice only adds generation loss):
//   node scripts/life/optimize-atlases.mjs [dir=public/models/life] [names...]
import { readdirSync, statSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const dir = resolve(process.argv[2] ?? 'public/models/life');
const only = process.argv.slice(3);
// [quality, alphaQuality]
const RULES = [
  [/shadow/, [30, 50]],
  [/^players/, [60, 50]],
  [/^padel/, [60, 50]],
  [/^lessons/, [56, 45]],
  [/^cat\.|^cat-lo/, [58, 50]],
  [/^keeper/, [58, 52]],
  [/^death/, [58, 52]],
  [/^ghosts/, [56, 40]],
];
sharp.cache(false);
let before = 0;
let after = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.webp') && !x.includes('portrait'))) {
  if (only.length && !only.some((n) => f.startsWith(n))) continue;
  const rule = RULES.find(([re]) => re.test(f));
  if (!rule) continue;
  const [quality, alphaQuality] = rule[1];
  const src = resolve(dir, f);
  const tmp = `${src}.tmp`;
  await sharp(src, { limitInputPixels: false }).webp({ quality, alphaQuality, effort: 6, smartSubsample: true }).toFile(tmp);
  const a = statSync(src).size;
  const b = statSync(tmp).size;
  if (b < a) { renameSync(tmp, src); before += a; after += b; console.log(`${f}: ${(a / 1024).toFixed(0)} -> ${(b / 1024).toFixed(0)} KB`); } else { renameSync(tmp, `${tmp}.skip`); console.log(`${f}: kept`); }
}
console.log(`total ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB`);
