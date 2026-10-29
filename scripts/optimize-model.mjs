// Compresses the raw Blender export into the model the booking page loads.
//   npm run model   (blender/clay_courts.source.glb → public/models/clay_courts.glb)
//
// Textures ≤1024 px as WebP, heavy props simplified, trees/cars swapped for impostors,
// repeated meshes drawn as GPU instances, geometry quantized + meshopt-compressed.
// Court nodes (clay-1, clay-1_hl, …) keep their names: the page raycasts by name.
// Baked lightmaps (blender/lightmaps, see scripts/lookdev/) ship next to the model as WebP;
// their scales and target objects ride along in the scene extras. The sky HDRI goes along at 512 px.

import { statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, instance, join, textureCompress, meshopt, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'blender/clay_courts.source.glb'); // raw Blender export (kept out of public/)
const OUT = resolve(root, 'public/models/clay_courts.glb');
const LIGHTMAPS = resolve(root, 'blender/lightmaps');
const LIGHTMAPS_OUT = resolve(root, 'public/models/lightmaps');
const IMPOSTORS = resolve(root, 'blender/impostors');
const IMPOSTORS_OUT = resolve(root, 'public/models/impostors');
const HDRI = resolve(root, 'blender/assets/polyhaven/qwantani_late_afternoon_puresky/qwantani_late_afternoon_puresky_1k.hdr');
const HDRI_OUT = resolve(root, 'public/models/sky_512.hdr');
// `npm run model -- --textures`: re-pack only the textures and the sky of the shipped model.
const TEXTURES_ONLY = process.argv.includes('--textures');

// Templates parked at the origin (the demo rally's player and racket, the park bench that row 155
// found hovering over Papaya): never part of the club.
const DROP_NODE = /(^|_)template$/;
// Fabric displacement maps the exporter packed into colour + alpha: a 2K texture for a
// windscreen that reads as flat tinted see-through at map scale. Replaced by its average.
const FLATTEN_TEXTURES = /Displacement/i;
// Props with far more triangles than they need at map scale.
const SIMPLIFY = { 'Cube.002': 0.3 }; // park bench
// Parked cars (scripts/lookdev/cars.py): ~6k triangles each, half of them in rounded detail a car
// 4.5 m long never shows from 30 m up (row 155 optimisation pass).
const SIMPLIFY_MATCH = [[/^car_\d+_mesh$/, 0.5]];
const SMALL_COLOUR = /^(asphalt_diff|padel_turf_diff|fence_mesh_diamond|grime_atlas|rock_moss_set_02_diff)/;

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

/**
 * Textures (row 143): the drone never comes closer than 30 m, so surface detail maps (normal,
 * roughness, AO) need no more than 512 px; colour stays at 1024. WebP throughout.
 */
async function compressTextures(doc) {
  await doc.transform(
    // Row 155 optimisation pass: colour maps that only ever cover a few hundred pixels on screen
    // (or are soft by nature) go to half size: asphalt and turf under parked cars and glass, the
    // chain-link pattern (its mips are what the page shows), the clubhouse grime, the scanned rocks.
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], pattern: SMALL_COLOUR, slots: /^baseColorTexture$/, quality: 78 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /^(normalTexture|occlusionTexture|metallicRoughnessTexture)$/, quality: 80 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], slots: /^(baseColorTexture|emissiveTexture)$/, quality: 80 }),
  );
}

/**
 * The sky is only ambient light and soft reflections on the page (PMREM): a 512 × 256 copy of the
 * 1K HDRI (box-filtered in linear light, written back as RLE RGBE) lights it the same.
 */
function downsampleHdr(src, out) {
  const buf = readFileSync(src);
  let p = 0;
  const line = () => { const e = buf.indexOf(10, p); const l = buf.toString('latin1', p, e); p = e + 1; return l; };
  let l;
  while ((l = line()) !== '') { /* header */ }
  const [, h, , w] = line().split(' ');
  const W = Number(w); const H = Number(h);
  const px = new Float32Array(W * H * 3);
  const row = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[p] === 2 && buf[p + 1] === 2) { // new RLE
      p += 4;
      for (let c = 0; c < 4; c++) {
        for (let x = 0; x < W;) {
          let n = buf[p++];
          if (n > 128) { n -= 128; const v = buf[p++]; while (n--) row[(x++) * 4 + c] = v; } else { while (n--) row[(x++) * 4 + c] = buf[p++]; }
        }
      }
    } else { for (let x = 0; x < W * 4; x++) row[x] = buf[p++]; }
    for (let x = 0; x < W; x++) {
      const e = row[x * 4 + 3];
      const f = e ? 2 ** (e - 136) : 0;
      for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = row[x * 4 + c] * f;
    }
  }
  const w2 = W >> 1; const h2 = H >> 1;
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h2} +X ${w2}\n`, 'latin1');
  const body = Buffer.alloc(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const v = [0, 1, 2].map((c) => (px[((2 * y) * W + 2 * x) * 3 + c] + px[((2 * y) * W + 2 * x + 1) * 3 + c] + px[((2 * y + 1) * W + 2 * x) * 3 + c] + px[((2 * y + 1) * W + 2 * x + 1) * 3 + c]) / 4);
      const m = Math.max(...v);
      const i = (y * w2 + x) * 4;
      if (m < 1e-32) { body.fill(0, i, i + 4); continue; }
      const e = Math.ceil(Math.log2(m)) + (m === 2 ** Math.ceil(Math.log2(m)) ? 1 : 0);
      const k = 256 / 2 ** e;
      body[i] = Math.min(255, Math.floor(v[0] * k)); body[i + 1] = Math.min(255, Math.floor(v[1] * k)); body[i + 2] = Math.min(255, Math.floor(v[2] * k)); body[i + 3] = e + 128;
    }
  }
  // Row 155: scanlines written run-length encoded (Radiance "new RLE", per channel): ~40% smaller, lossless.
  const rows = [];
  for (let y = 0; y < h2; y++) {
    rows.push(Buffer.from([2, 2, w2 >> 8, w2 & 255]));
    for (let c = 0; c < 4; c++) {
      const ch = Array.from({ length: w2 }, (_, x) => body[(y * w2 + x) * 4 + c]);
      const out = [];
      for (let x = 0; x < w2;) {
        let r = 1;
        while (x + r < w2 && r < 127 && ch[x + r] === ch[x]) r++;
        if (r >= 4) { out.push(128 + r, ch[x]); x += r; continue; }
        const s = x;
        while (x < w2 && x - s < 128) {
          let q = 1;
          while (x + q < w2 && q < 4 && ch[x + q] === ch[x]) q++;
          if (q >= 4) break;
          x++;
        }
        out.push(x - s, ...ch.slice(s, x));
      }
      rows.push(Buffer.from(out));
    }
  }
  writeFileSync(out, Buffer.concat([head, ...rows]));
}

if (TEXTURES_ONLY) {
  const before = statSync(OUT).size;
  const shipped = await io.read(OUT);
  shipped.setLogger(new Logger(Logger.Verbosity.ERROR));
  await compressTextures(shipped);
  await io.write(OUT, shipped);
  downsampleHdr(HDRI, HDRI_OUT);
  console.log(`model textures: ${mb(before)} → ${mb(statSync(OUT).size)}; sky ${mb(statSync(HDRI_OUT).size)}`);
  process.exit(0);
}

const doc = await io.read(SRC);
doc.setLogger(new Logger(Logger.Verbosity.ERROR)); // quantize warns about tiled UVs, which it rightly leaves as floats
const docRoot = doc.getRoot();

const disposeTree = (node) => { node.listChildren().forEach(disposeTree); node.dispose(); };
for (const node of docRoot.listNodes()) {
  if (DROP_NODE.test(node.getName())) disposeTree(node);
}

// Trees and parked cars become camera-facing impostors on the page (scripts/lookdev/render_impostors.py):
// keep only where they stand.
const props = { trees: [], cars: [] };
const yawOf = (q) => Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
for (const node of [...docRoot.listNodes()]) {
  const name = node.getName();
  const isTree = /^tree_(\d+|lowpoly_base)$/.test(name);
  const isCar = /^parked_car_\d+$/.test(name);
  if (!isTree && !isCar) continue;
  const [x, , z] = node.getWorldTranslation();
  const round = (v) => Math.round(v * 100) / 100;
  if (isTree) props.trees.push([round(x), round(z), round(node.getWorldScale()[0] / 1.6)]);
  else props.cars.push([round(x), round(z), round(yawOf(node.getWorldRotation()))]);
  disposeTree(node);
}

for (const material of docRoot.listMaterials()) {
  const tex = material.getBaseColorTexture();
  if (!tex || !FLATTEN_TEXTURES.test(tex.getName() + tex.getURI())) continue;
  const { channels } = await sharp(Buffer.from(tex.getImage())).stats();
  const toLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const grey = channels.length < 3; // single-channel maps (+ optional alpha)
  const [r, g, b] = [0, 1, 2].map((i) => toLinear(channels[grey ? 0 : i].mean));
  const hasAlpha = channels.length === 2 || channels.length === 4;
  const a = hasAlpha ? channels[channels.length - 1].mean / 255 : 1;
  const f = material.getBaseColorFactor();
  material.setBaseColorTexture(null).setBaseColorFactor([r * f[0], g * f[1], b * f[2], a * f[3]]);
}

await doc.transform(dedup({ keepUniqueNames: true }), weld());

for (const mesh of docRoot.listMeshes()) {
  const name = mesh.getName();
  for (const prim of mesh.listPrimitives()) {
    const ratio = SIMPLIFY[name] ?? SIMPLIFY_MATCH.find(([re]) => re.test(name))?.[1];
    if (ratio) {
      const before = prim.getIndices().getCount() / 3;
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.002 });
      console.log(`  ${name} ${before} → ${prim.getIndices().getCount() / 3} tris`);
    }
  }
}

// Nodes the page finds by name stay separate: courts, their overlays and lightmapped surfaces.
// Everything else (fences, posts, nets, props…) is merged per material to cut draw calls.
const lightmapped = existsSync(resolve(LIGHTMAPS, 'lightmaps.json'))
  ? Object.values(JSON.parse(readFileSync(resolve(LIGHTMAPS, 'lightmaps.json'), 'utf8'))).flatMap((l) => l.objects)
  : [];
const COURT = /^(clay|hard|padel|grass)-\d$/;
const keep = (name) => COURT.test(name) || name.endsWith('_hl') || lightmapped.includes(name);

await doc.transform(
  instance({ min: 5 }),
  join({ filter: (node) => !keep(node.getName()) }),
  prune({ keepAttributes: true, keepLeaves: false }), // keep TEXCOORD_1: lightmaps are applied at runtime
  meshopt({ encoder: MeshoptEncoder, level: 'medium' })
);
await compressTextures(doc);

// Lightmaps: PNG → WebP, metadata into the scene extras (read by src/js/booking/scene.js).
const extras = {};
if (existsSync(resolve(LIGHTMAPS, 'lightmaps.json'))) {
  const meta = JSON.parse(readFileSync(resolve(LIGHTMAPS, 'lightmaps.json'), 'utf8'));
  mkdirSync(LIGHTMAPS_OUT, { recursive: true });
  for (const [key, lm] of Object.entries(meta)) {
    const file = `${key}.webp`;
    await sharp(resolve(LIGHTMAPS, lm.file)).webp({ quality: 90, effort: 6 }).toFile(resolve(LIGHTMAPS_OUT, file));
    meta[key] = { url: `/models/lightmaps/${file}`, scale: lm.scale, objects: lm.objects };
    console.log(`  lightmap ${key}: ${mb(statSync(resolve(LIGHTMAPS_OUT, file)).size)}`);
  }
  extras.lightmaps = meta;
}
// Impostor sprites: PNG → WebP with alpha, metadata (world size, base anchor) into the extras.
if (existsSync(resolve(IMPOSTORS, 'impostors.json'))) {
  const meta = JSON.parse(readFileSync(resolve(IMPOSTORS, 'impostors.json'), 'utf8'));
  mkdirSync(IMPOSTORS_OUT, { recursive: true });
  let bytes = 0;
  for (const [id, info] of Object.entries(meta)) {
    await sharp(resolve(IMPOSTORS, `${id}.png`)).webp({ quality: 70, alphaQuality: 70, effort: 6 }).toFile(resolve(IMPOSTORS_OUT, `${id}.webp`));
    bytes += statSync(resolve(IMPOSTORS_OUT, `${id}.webp`)).size;
    meta[id] = { url: `/models/impostors/${id}.webp`, w: info.w, h: info.h, anchor: info.anchor };
  }
  extras.impostors = meta;
  console.log(`  impostors: ${Object.keys(meta).length} sprites, ${mb(bytes)}`);
}
extras.props = props;
docRoot.getDefaultScene().setExtras(extras);
downsampleHdr(HDRI, HDRI_OUT);

await io.write(OUT, doc);
console.log(`model: ${mb(statSync(SRC).size)} → ${mb(statSync(OUT).size)}`);
