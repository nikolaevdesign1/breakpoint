import * as THREE from 'three';
import { LIFE_LAYER } from './life/shared.js';
import { addSwayWeights, swayMaterial } from './life/wind.js';
import { gradeLife } from './lookdev.js';

// Camera-facing impostors for trees and bushes (row 53; parked cars are real meshes since row 62).
// The map camera never turns (fixed pitch, looking towards −z), so each sprite — rendered offline
// from that exact direction under the same sky and sun (scripts/lookdev/render_impostors.py) —
// stands in for a full photo-real model at two triangles. A second, invisible card facing the sun
// casts the matching shadow. Everything is GPU-instanced: one draw call per sprite.
// The visible cards sway in the wind (life/wind.js), so they live on the life layer: while the
// camera is still they are redrawn over the cached frame instead of re-rendering the club.

const PITCH = THREE.MathUtils.degToRad(52);

/** Deterministic random, so the tree belt and bushes look the same on every visit. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Placement -------------------------------------------------------------------

// Trees and fences of the plot (east of the grass courts and the car park: eastWoods).
const CLUB = { minX: -40, maxX: 116, minZ: -92, maxZ: 92 };
// Ground the drone can see at its widest (max zoom 92 m, pan bounds, up to 21:9 screens) plus a margin
// for crowns that reach into view (row 79). Trees beyond it were never on screen. The east edge
// follows the zoom-dependent pan limit (scene.js PAN_BOUNDS.edgeX): ~132 m at most, plus crowns.
// Row 152: the west edge follows the zoom like the east one (PAN_BOUNDS.edgeMinX), so the belt
// needs to reach ~35 m past the west fence, not ~80.
const BELT = { minX: -86, maxX: 156, minZ: -132, maxZ: 122 };
// Row 150: the kitchen garden on the north lawn. Greenhouses, gravel yard and vegetable beds are in
// the model (scripts/lookdev/garden.py: x 44…66, z −82…−63.4); the citrus orchard west of it, the
// flower beds and flowering shrubs are sprites (garden() below).
const YARD = { minX: 42, maxX: 68, minZ: -84, maxZ: -61.5 };
const ORCHARD = { minX: 1, maxX: 37, minZ: -95, maxZ: -66 };
const KEEP_CLEAR = [
  { minX: 98, maxX: 230, minZ: 49, maxZ: 63 }, // driveway to the parking
  { minX: 58, maxX: 104, minZ: 43, maxZ: 69 }, // parking lot
  { minX: 71, maxX: 105, minZ: -19, maxZ: 19 }, // grass courts (inside their fence)
  { minX: BELT.minX - 10, maxX: -34, minZ: -2.2, maxZ: 2.2 }, // west entrance lane, out to the belt edge
  YARD,
  ORCHARD,
];
const HEDGE_GAPS = [
  { minX: 65.5, maxX: 68.5, minZ: 41.5, maxZ: 45 }, // footpath into the car park
];
const CLUBHOUSE_BACK = -57.8; // three.js z of the clubhouse's back wall
const inside = (r, x, z) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;

/** Left and right of the plot (beside it, not in front or behind): trees there are kept at half density (row 66). */
const isSide = (x, z) => (x < CLUB.minX + 18 || x > 66) && z > CLUB.minZ + 22 && z < CLUB.maxZ - 22;

/** Tree belt around the plot: jittered grid, thinned at random, nothing on the driveway. */
function beltTrees(random) {
  const out = [];
  const step = 8;
  for (let ix = 0, x = BELT.minX; x <= BELT.maxX; ix++, x += step) {
    for (let iz = 0, z = BELT.minZ; z <= BELT.maxZ; iz++, z += step) {
      const px = x + (random() - 0.5) * step * 0.9;
      const pz = z + (random() - 0.5) * step * 0.9;
      if (inside(CLUB, px, pz) || KEEP_CLEAR.some((r) => inside(r, px, pz))) continue;
      if (px > 108 || (px > 56 && pz > 72)) continue; // planted by eastWoods instead
      // Denser near the plot (that's what the camera sees), sparser further out.
      const d = Math.max(CLUB.minX - px, px - CLUB.maxX, CLUB.minZ - pz, pz - CLUB.maxZ, 0);
      if (random() > (d < 30 ? 0.7 : 0.42)) continue;
      if (isSide(px, pz) && (ix + iz) % 2) continue; // side strips: every other grid cell
      out.push([px, pz, 0.8 + random() * 0.35]);
    }
  }
  return out;
}

/**
 * Woods east and south-east of the car park (row 140): a closed stand of trees right behind the grass
 * courts' fence and the car park hedge, so the view ends on woodland instead of an open lawn.
 */
function eastWoods(random) {
  const out = [];
  const step = 6.5;
  const zones = [
    { minX: 108, maxX: BELT.maxX, minZ: BELT.minZ, maxZ: BELT.maxZ },
    { minX: 56, maxX: 106, minZ: 72, maxZ: BELT.maxZ },
  ];
  for (const r of zones) {
    for (let x = r.minX; x <= r.maxX; x += step) {
      for (let z = r.minZ; z <= r.maxZ; z += step) {
        const px = x + (random() - 0.5) * step * 0.8;
        const pz = z + (random() - 0.5) * step * 0.8;
        if (random() > 0.86 || KEEP_CLEAR.some((k) => inside(k, px, pz))) continue;
        out.push([px, pz, 0.8 + random() * 0.35]);
      }
    }
  }
  return out;
}

/**
 * Trees of the plot itself: half of those in the side strips go (every other one along z), and the
 * few rooted right behind the clubhouse step back so their crowns don't sit on its roof.
 */
function plotTrees(trees) {
  const sides = trees.filter(([x, z]) => isSide(x, z)).sort((a, b) => a[0] < 0 === b[0] < 0 ? a[1] - b[1] : a[0] - b[0]);
  const drop = new Set(sides.filter((_, i) => i % 2));
  return trees
    .filter((t) => !drop.has(t))
    .map(([x, z, s]) => [x, z > CLUBHOUSE_BACK - 7 && z < CLUBHOUSE_BACK && x > -30 && x < 64 ? CLUBHOUSE_BACK - 7 : z, THREE.MathUtils.clamp(s, 0.72, 1.12)])
    .filter(([x, z]) => !KEEP_CLEAR.some((r) => inside(r, x, z))); // after the step back: not into the garden
}

/**
 * Row 150: no crown on top of another. Trees are kept first come, first served; one whose crown
 * would overlap a kept one by more than a little is dropped. Crowded clumps thin out, the belt
 * keeps its gaps, and fewer big sprites are drawn.
 */
function spaced(trees, radius = 5.2, overlap = 0.84) {
  const cell = 12;
  const grid = new Map();
  const out = [];
  for (const t of trees) {
    const [x, z, s] = t;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let free = true;
    for (let i = -1; i <= 1 && free; i++) {
      for (let j = -1; j <= 1 && free; j++) {
        free = !(grid.get(`${cx + i},${cz + j}`) ?? []).some((u) => Math.hypot(u[0] - x, u[1] - z) < radius * (s + u[2]) * overlap);
      }
    }
    if (!free) continue;
    out.push(t);
    const k = `${cx},${cz}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(t);
  }
  return out;
}

/**
 * Row 150 (157: looser): the garden around the greenhouses. An old citrus orchard whose rows have
 * drifted (trees missing, leaning off the line, different ages), lantana in loose drifts along the
 * yard and the orchard instead of a hedge-straight line, flowering shrubs in clumps. [id, x, z, scale].
 */
function garden(random) {
  const out = [];
  const gauss = () => (random() + random() + random() - 1.5) / 1.5; // soft bell, −1…1
  // Orchard: a grid only in spirit. Each tree wanders up to ~1.6 m off its spot, a few are gone,
  // rows bow a little, sizes vary from young to old.
  let i = 0;
  for (let x = ORCHARD.minX + 2.5; x <= ORCHARD.maxX - 2; x += 4.6, i++) {
    const bow = (random() - 0.5) * 1.6;
    let k = 0;
    for (let z = ORCHARD.maxZ - 3; z >= ORCHARD.minZ + 2; z -= 4.6, k++) {
      if (random() < 0.14) continue;
      const t = (z - ORCHARD.minZ) / (ORCHARD.maxZ - ORCHARD.minZ);
      out.push([random() < 0.5 ? 'fruit_a' : 'fruit_b', x + bow * Math.sin(t * Math.PI) + gauss() * 1.6, z + gauss() * 1.6, 0.8 + random() * 0.5]);
    }
  }
  // Lantana drifts: clumps of 2–6 plants scattered around a few centres along each edge, gaps between.
  const drifts = (x0, x1, z, depth) => {
    for (let x = x0 + random() * 3; x <= x1; x += 3 + random() * 6) {
      const n = 2 + Math.floor(random() * 5);
      for (let m = 0; m < n; m++) out.push(['flower_c', x + gauss() * 1.8, z + gauss() * depth, 0.6 + random() * 0.5]);
    }
  };
  drifts(YARD.minX + 1, YARD.maxX - 1, -62.2, 1.2);
  drifts(ORCHARD.minX, ORCHARD.maxX, ORCHARD.maxZ + 1.6, 1.6);
  // Bougainvillea / hibiscus: a clump of 1–3 at each corner, never exactly on it.
  for (const [x, z] of [[YARD.minX - 1.5, -63.5], [YARD.maxX + 1.5, -63.5], [YARD.minX - 1.8, -82.5], [YARD.maxX + 1.8, -82.5], [ORCHARD.maxX + 2.2, -88]]) {
    const n = 1 + Math.floor(random() * 3);
    for (let m = 0; m < n; m++) out.push([random() < 0.5 ? 'flower_a' : 'flower_b', x + gauss() * 2.4, z + gauss() * 2.4, 0.7 + random() * 0.45]);
  }
  return out;
}

/**
 * Row 150: open lawn behind the clubhouse (and in the west strip), where nothing stands within ~11 m, gets a shrub group
 * (a flowering shrub with a green bush or two) instead of another big tree.
 */
function fillHoles(taken, random) {
  const out = [];
  const near = (x, z, d) => taken.some(([tx, tz]) => Math.abs(tx - x) < d && Math.abs(tz - z) < d && Math.hypot(tx - x, tz - z) < d);
  const zones = [{ minX: -38, maxX: 118, minZ: -128, maxZ: -64 }, { minX: -60, maxX: -38, minZ: -60, maxZ: 84 }]; // north lawn, west strip (row 152)
  for (const r of zones) for (let x = r.minX; x <= r.maxX; x += 9) {
    for (let z = r.maxZ; z >= r.minZ; z -= 9) {
      const px = x + (random() - 0.5) * 7;
      const pz = z + (random() - 0.5) * 7;
      if (near(px, pz, 11) || KEEP_CLEAR.some((r) => inside(r, px, pz))) continue;
      out.push([random() < 0.5 ? 'flower_a' : 'flower_b', px, pz, 0.8 + random() * 0.3]);
      const a = random() * Math.PI * 2;
      out.push([`bush_${'abc'[Math.floor(random() * 3)]}`, px + Math.cos(a) * (1.6 + random() * 1.6), pz + Math.sin(a) * (1.6 + random() * 1.6), 0.8 + random() * 0.4]);
      if (random() < 0.5) out.push([`bush_${'abc'[Math.floor(random() * 3)]}`, px - 2 - random(), pz + random(), 0.8 + random() * 0.3]);
      taken.push([px, pz]);
    }
  }
  return out;
}

/** Bushes just outside the perimeter fence, leaving the entrance free. */
function fenceBushes(random) {
  const fence = { minX: -34, maxX: 72, minZ: -58, maxZ: 80 };
  const out = [];
  const add = (x, z) => {
    if (random() < 0.3) return;
    if (Math.abs(z) < 4 && x < fence.minX + 1) return; // gate
    if (KEEP_CLEAR.some((r) => inside(r, x, z))) return;
    out.push([x, z, 0.75 + random() * 0.55]);
  };
  for (let x = fence.minX; x <= fence.maxX; x += 2.6) {
    add(x + random(), fence.minZ - 1.6 - random());
    add(x + random(), fence.maxZ + 1.6 + random());
  }
  for (let z = fence.minZ; z <= fence.maxZ; z += 2.6) {
    add(fence.minX - 1.6 - random(), z + random());
    add(fence.maxX + 1.6 + random(), z + random());
  }
  return out;
}

/** Hedge around the car park, open towards the driveway. */
function parkingHedge(random) {
  const lot = { minX: 60, maxX: 102, minZ: 45, maxZ: 67 };
  const out = [];
  const push = (x, z, s) => { if (!HEDGE_GAPS.some((r) => inside(r, x, z))) out.push([x, z, s]); };
  for (let x = lot.minX; x <= lot.maxX; x += 1.8) {
    push(x + random() * 0.6, lot.minZ - 1.3 - random() * 0.4, 0.85 + random() * 0.3);
    push(x + random() * 0.6, lot.maxZ + 1.3 + random() * 0.4, 0.85 + random() * 0.3);
  }
  for (let z = lot.minZ; z <= lot.maxZ; z += 1.8) {
    push(lot.minX - 1.3 - random() * 0.4, z + random() * 0.6, 0.85 + random() * 0.3);
    if (z < 52 || z > 60) push(lot.maxX + 1.3 + random() * 0.4, z + random() * 0.6, 0.85 + random() * 0.3);
  }
  return out;
}

// --- Geometry --------------------------------------------------------------------

/**
 * Card in the camera plane, pivoting on the sprite's base anchor. The part of the sprite below
 * the anchor shows what stands in front of the base (the near half of a car, the front of a
 * canopy), so the card slides towards the camera along the view ray until its lower edge clears
 * the ground — same picture on screen, nothing cut off by the lawn.
 */
function viewCard(info) {
  const g = new THREE.PlaneGeometry(info.w, info.h, 4, 10); // subdivided: the crown bends in the wind
  g.translate((0.5 - info.anchor[0]) * info.w, (0.5 - info.anchor[1]) * info.h, 0);
  addSwayWeights(g, (1 - info.anchor[1]) * info.h, Math.max(0.01, info.anchor[1] * info.h));
  g.rotateX(-PITCH);
  const k = (info.anchor[1] * info.h) / Math.tan(PITCH) + 0.05;
  g.translate(0, Math.sin(PITCH) * k, Math.cos(PITCH) * k);
  return g;
}

/** Same silhouette turned to face the sun: casts the shadow, never drawn. */
function sunCard(info, sunDir) {
  const g = new THREE.PlaneGeometry(info.w, info.h * 0.92);
  g.translate((0.5 - info.anchor[0]) * info.w, (0.5 - info.anchor[1]) * info.h * 0.92, 0);
  const n = sunDir.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const right = new THREE.Vector3().crossVectors(up, n);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(right, up, n));
  return g;
}

/**
 * Row 154: leaves that shimmer while the drone moves. Sprites are uploaded premultiplied, so their
 * mips never pull the black of empty texels into the leaves (the colour is divided back out here),
 * and the alpha is sharpened to about one pixel of ramp around the cut-off before alpha-to-coverage
 * turns it into MSAA samples: leaf edges stay put and anti-aliased at every zoom, instead of
 * flickering in and out of the alpha test as the mip level and sub-pixel position change.
 */
function crispFoliage(material) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb /= max(sampledDiffuseColor.a, 1e-3);`)
      .replace('#include <alphatest_fragment>', `
        diffuseColor.a = clamp((diffuseColor.a - alphaTest) / max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);
        if (diffuseColor.a < 0.004) discard;`);
  };
  material.customProgramCacheKey = () => `${prevKey}|crisp`;
}

/**
 * Builds every impostor batch into `parent`.
 * @param {object} meta   sprite id → { url, w, h, anchor } (from the GLB extras)
 * @param {object} props  { trees: [[x, z, s]] } (from the GLB extras)
 * @param {(material) => void} decorate  hooks shared shader tweaks (see-through dither)
 * @returns {Promise<THREE.Texture[]>} textures, for upload before the first frame
 */
export async function buildImpostors(parent, { meta, props, sunDir, decorate, onProgress }) {
  if (!meta || !props) return [];
  const random = rng(20261002);
  const place = new Map(); // sprite id → [[x, z, scale]]
  const put = (id, x, z, s) => { if (meta[id]) (place.get(id) ?? place.set(id, []).get(id)).push([x, z, s]); };

  const treeIds = Object.keys(meta).filter((id) => id.startsWith('tree_'));
  const bushIds = Object.keys(meta).filter((id) => id.startsWith('bush_'));
  // Trees from the model, kept to real sizes (≈ 8–13 m) and off the car park and driveway; no two
  // crowns piled up (row 150).
  const trees = spaced([...plotTrees(props.trees).filter(([x, z]) => !(x > 56 && z > 72)), ...beltTrees(random), ...eastWoods(rng(140))]);
  trees.forEach(([x, z, s], i) => put(treeIds[(i * 7 + 3) % treeIds.length], x, z, s));
  const plants = garden(rng(150));
  plants.push(...fillHoles([...trees, ...plants.map(([, x, z]) => [x, z])], rng(151)));
  plants.forEach(([id, x, z, s]) => put(id, x, z, s));
  const hedge = fenceBushes(random);
  [...hedge, ...parkingHedge(random)].forEach(([x, z, s], i) => put(bushIds[(i * 5 + 1) % bushIds.length], x, z, s));
  parent.userData.hedge = hedge.map(([x, z]) => ({ x, z })); // where the cat can slip in to hide (row 137)

  const loader = new THREE.TextureLoader();
  const ids = [...place.keys()];
  let done = 0;
  const textures = await Promise.all(ids.map((id) => loader.loadAsync(meta[id].url).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = true; // see crispFoliage
    t.anisotropy = 4;
    onProgress?.(++done / ids.length);
    return t;
  })));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  ids.forEach((id, k) => {
    const info = meta[id];
    const spots = place.get(id);
    const map = textures[k];

    // Sprites hold scene-linear radiance clipped at 1 (Blender, Standard view); a small lift
    // matches them to the lit materials around them.
    const look = new THREE.MeshBasicMaterial({ map, color: new THREE.Color().setScalar(1.45), alphaTest: 0.35, alphaToCoverage: true, fog: true });
    decorate?.(look);
    crispFoliage(look);
    swayMaterial(look, id.startsWith('tree_') ? 0.14 : 0.035);
    gradeLife(look);
    const cards = new THREE.InstancedMesh(viewCard(info), look, spots.length);
    cards.name = `impostor_${id}`;
    cards.userData.noAO = true;
    cards.layers.set(LIFE_LAYER);

    const shade = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, colorWrite: false, depthWrite: false });
    const casters = new THREE.InstancedMesh(sunCard(info, sunDir), shade, spots.length);
    casters.castShadow = true;
    casters.userData.noAO = true;
    casters.userData.shadowOnly = true; // shown only for the frames that redraw the shadow map

    spots.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      cards.setMatrixAt(i, m4);
      casters.setMatrixAt(i, m4);
    });
    cards.computeBoundingSphere();
    casters.computeBoundingSphere();
    parent.add(cards, casters);
  });
  return textures;
}
