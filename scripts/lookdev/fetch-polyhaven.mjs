// Downloads Poly Haven (CC0) models used for impostor rendering into blender/assets/polyhaven/models/.
//   node scripts/lookdev/fetch-polyhaven.mjs island_tree_01 shrub_04 …
// Files come from the official CDN listed by https://api.polyhaven.com/files/<asset> (glTF, 1K textures).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../blender/assets/polyhaven/models');
for (const asset of process.argv.slice(2)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${asset}`)).json();
  const g = files.gltf['1k'].gltf;
  const list = [[`${asset}.gltf`, g.url, g.size], ...Object.entries(g.include || {}).map(([p, f]) => [p, f.url, f.size])];
  let total = 0;
  for (const [rel, url, size] of list) {
    const dest = resolve(root, asset, rel);
    total += size;
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  console.log(asset, `${list.length} files`, `${total} bytes`);
}
