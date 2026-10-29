// Packs the golf cart's raw Blender export (scripts/life/build_cart.py) for the booking map:
//   node scripts/life/optimize-cart.mjs   (blender/life/cart.raw.glb → public/models/life/cart.glb)
// Welded, deduplicated, quantised and meshopt-compressed (the page's GLTFLoader has the decoder).
// Node names stay: the page finds cart_body, cart_driver, cart_glass and wheel_fl/fr/rl/rr by name.

import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = resolve(root, 'blender/life/cart.raw.glb');
const OUT = resolve(root, 'public/models/life/cart.glb');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(SRC);
await doc.transform(
  dedup(),
  weld(),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 8 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write(OUT, doc);
const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`cart.glb: ${kb(SRC)} KB → ${kb(OUT)} KB`);
