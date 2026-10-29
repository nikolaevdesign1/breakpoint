// Re-tints Poly Haven diffuse maps to the club's surface colours, keeping their grain.
//   node scripts/lookdev/tint-textures.mjs
// out = target × (luminance / mean luminance)^contrast, blended with the source hue by `keep`.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ph = resolve(dirname(fileURLToPath(import.meta.url)), '../../blender/assets/polyhaven');

const JOBS = [
  { src: 'red_sand', out: 'clay', target: [158, 64, 30], contrast: 1.0, keep: 0.08 },
  { src: 'painted_concrete_02', out: 'hard_blue', target: [36, 86, 164], contrast: 0.55, keep: 0 },
  { src: 'painted_concrete_02', out: 'apron_green', target: [48, 106, 64], contrast: 0.55, keep: 0 },
  { src: 'dirty_carpet', out: 'padel_turf', target: [28, 74, 150], contrast: 0.45, keep: 0 },
  { src: 'sparse_grass', out: 'lawn', target: [50, 82, 34], contrast: 0.75, keep: 0.25 },
  { src: 'asphalt_02', out: 'asphalt', target: [80, 80, 78], contrast: 1, keep: 0 },
  { src: 'brushed_concrete', out: 'path', target: [170, 160, 140], contrast: 0.7, keep: 0.15 },
  { src: 'painted_plaster_wall', out: 'stucco', target: [224, 218, 204], contrast: 0.6, keep: 0 },
];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

for (const job of JOBS) {
  const file = `${ph}/${job.src}/${job.src}_diff_1k.jpg`;
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let mean = 0;
  for (let i = 0; i < data.length; i += 3) mean += lum(data[i], data[i + 1], data[i + 2]);
  mean /= data.length / 3;
  const srcMean = [0, 1, 2].map((c) => { let s = 0; for (let i = c; i < data.length; i += 3) s += data[i]; return s / (data.length / 3); });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const k = Math.pow(Math.max(1e-3, lum(data[i], data[i + 1], data[i + 2]) / mean), job.contrast);
    for (let c = 0; c < 3; c++) {
      const tinted = job.target[c] * k;
      const hue = (data[i + c] / srcMean[c]) * job.target[c]; // source hue shifts, rescaled to the target
      out[i + c] = Math.max(0, Math.min(255, Math.round(tinted * (1 - job.keep) + hue * job.keep)));
    }
  }
  const dest = `${ph}/${job.src}/${job.out}_diff_1k.jpg`;
  await sharp(out, { raw: info }).jpeg({ quality: 92 }).toFile(dest);
  console.log('tinted', dest);
}
