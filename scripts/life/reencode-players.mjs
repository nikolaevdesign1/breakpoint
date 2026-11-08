// Row 19: a second, lighter pass over the players' atlases to hold the new stroke frames to +1 MB:
//   node scripts/life/reencode-players.mjs <quality> <alphaQuality>   (run from the project root)
import sharp from 'sharp';
import { renameSync, statSync } from 'node:fs';
const [q, aq] = [+process.argv[2], +process.argv[3]];
for (const f of ['players-hi-a','players-hi-b','players-hi-c','players-lo','players']) {
  const src = `${process.cwd()}/public/models/life/${f}.webp`;
  await sharp(src, { limitInputPixels: false }).webp({ quality: q, alphaQuality: aq, effort: 6, smartSubsample: true }).toFile(src + '.tmp');
  console.log(f, statSync(src).size >> 10, '->', statSync(src + '.tmp').size >> 10);
  renameSync(src + '.tmp', src);
}
