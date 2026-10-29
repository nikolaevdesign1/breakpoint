import * as THREE from 'three';

// Baked lightmaps for the club model. Own module so the About rally can load them without the look-dev post stack.

export const LIGHTMAP_URLS = { atlas: '/models/lightmaps/atlas.webp', ground: '/models/lightmaps/ground.webp' };

export function loadLightmaps(onProgress) {
  const loader = new THREE.TextureLoader();
  const entries = Object.entries(LIGHTMAP_URLS);
  let done = 0;
  return Promise.all(entries.map(([key, url]) => loader.loadAsync(url).then((tex) => {
    tex.flipY = false; // glTF UV convention
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.channel = 1; // second UV set
    tex.generateMipmaps = true;
    onProgress?.(++done / entries.length);
    return [key, tex];
  }))).then(Object.fromEntries);
}

/**
 * Baked sky + bounce light on static surfaces. The bake stores irradiance/π normalised by `scale`;
 * three.js multiplies lightMap by albedo/π, hence π · scale. Those surfaces then take only a little
 * of the environment (reflections), the sky diffuse is already in the lightmap.
 */
export function applyLightmaps(root, meta, textures) {
  if (!meta) return;
  const clones = new Map();
  for (const [key, lm] of Object.entries(meta)) {
    const tex = textures[key];
    if (!tex) continue;
    const names = new Set(lm.objects);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.uv1) return;
      if (!names.has(o.name) && !names.has(o.parent?.name)) return;
      const swap = (m) => {
        const id = `${key}:${m.uuid}`;
        if (!clones.has(id)) {
          const c = m.clone();
          c.lightMap = tex;
          c.lightMapIntensity = Math.PI * lm.scale;
          c.envMapIntensity = 0.35;
          clones.set(id, c);
        }
        return clones.get(id);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }
}
