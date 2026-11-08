import * as THREE from 'three';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { part, merge } from '../../life/geom.js';

// Labor Day (round 11, row 9), the first Monday of September, four days before and one after: the
// last day of summer at the club. Charcoal grills on the lawn by the terrace with smoke rising
// (a few soft puffs each, on the life layer), long tables with checked cloths and food, a lemonade
// stand, beach umbrellas with loungers, strings of warm bulbs and calm red, white and blue
// pennants, and a low golden light over the whole map. Nothing on the courts. Light: instanced,
// no new files.

const RWB = ['#a8343a', '#efeade', '#40507f'];
const COALS = { glass: '#ff7a1f', glow: new THREE.Color(1, 0.35, 0.05), gain: 0.5 };
const K = 1.45; // props against their model size, so they read from the drone
const GRILLS = [[41.6, -44.4], [44.3, -43.2], [46.4, -44.9]];
const SMOKER = [39.0, -43.2];
const TABLES = [[40.4, -40.6], [45.6, -39.8]];
const STAND = [34.2, -44.2];
const UMBRELLAS = [[17.5, -42.6], [22.6, -41.6], [27.4, -42.8], [-14.5, -43.2], [-19.6, -44.4], [-9.6, -41.8]];

// --- Geometry (model size, metres) ----------------------------------------------------------

/** A kettle grill on three legs: black bowl, a grate, red coals, the lid propped open. */
function kettle() {
  const bowl = new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.8, 1).translate(0, 0.78, 0);
  const lid = new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).rotateX(-1.25).translate(0, 0.84, -0.3);
  const L = [part(bowl, '#26262a'), part(lid, '#2f2f34'),
    part(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 14).translate(0, 0.76, 0), '#9a9a9a'), // the grate
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 14).translate(0, 0.66, 0), '#7a2414'), // coals
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).translate(0, 0.38, 0), '#26262a')];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    L.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 5).rotateZ(Math.cos(a) * 0.1).rotateX(-Math.sin(a) * 0.1).translate(Math.cos(a) * 0.22, 0.4, Math.sin(a) * 0.22), '#1c1c1e'));
  }
  L.push(part(new THREE.BoxGeometry(0.16, 0.02, 0.02).translate(0, 0.98, -0.5), '#b9b6ad')); // lid handle
  return merge(L);
}

/** A long barrel smoker (a mangal): a half-cylinder lid on a firebox, a chimney, four legs. */
function smoker() {
  const L = [
    part(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI).translate(0, 0.62, 0), '#2d2d31'),
    part(new THREE.BoxGeometry(1.1, 0.2, 0.44).translate(0, 0.52, 0), '#232326'),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).translate(0.46, 0.98, 0), '#1c1c1e'),
    part(new THREE.BoxGeometry(1.1, 0.02, 0.4).translate(0, 0.62, 0), '#7a2414'),
  ];
  for (const [x, z] of [[-0.5, -0.17], [0.5, -0.17], [-0.5, 0.17], [0.5, 0.17]]) L.push(part(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 5).translate(x, 0.25, z), '#1c1c1e'));
  return merge(L);
}

/** A trestle table 1.9 m long: wood top and legs. The cloth is a separate textured plane. */
export function table() {
  const L = [part(new THREE.BoxGeometry(1.9, 0.05, 0.8).translate(0, 0.74, 0), '#8a5a34')];
  for (const x of [-0.8, 0.8]) for (const z of [-0.3, 0.3]) L.push(part(new THREE.BoxGeometry(0.06, 0.72, 0.06).translate(x, 0.36, z), '#6e4528'));
  return merge(L);
}

/** What is on the table: platters, bowls, a watermelon, corn, buns, a pitcher. */
export function feast() {
  const L = [];
  const dish = (x, z, r, base, top, h) => {
    L.push(part(new THREE.CylinderGeometry(r, r * 0.85, 0.03, 12).translate(x, 0.785, z), base));
    if (top) L.push(part(new THREE.SphereGeometry(r * 0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h, 1).translate(x, 0.8, z), top));
  };
  dish(-0.7, 0.05, 0.17, '#efeade', '#a85a2a', 0.8); // burgers
  dish(-0.35, -0.12, 0.15, '#efeade', '#d9a93a', 0.5); // corn
  dish(0, 0.1, 0.19, '#40507f', '#d9363c', 0.9); // watermelon
  dish(0.38, -0.08, 0.14, '#efeade', '#7aa33c', 0.7); // salad
  dish(0.72, 0.1, 0.16, '#a8343a', '#e8d9b0', 0.6); // chips
  L.push(part(new THREE.CylinderGeometry(0.07, 0.065, 0.24, 8).translate(0.2, 0.9, 0.28), '#f2d04a')); // lemonade pitcher
  L.push(part(new THREE.CylinderGeometry(0.07, 0.065, 0.24, 8).translate(-0.55, 0.9, -0.25), '#f2d04a'));
  for (let i = 0; i < 5; i++) L.push(part(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 6).translate(-0.2 + i * 0.1, 0.81, 0.3), i % 2 ? '#d9363c' : '#efeade'));
  return merge(L);
}

export function checkCloth(color = '#c9423f') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#efeade'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 8, y * 8, 8, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  t.anisotropy = 4;
  return t;
}

/** A beach umbrella: a leaning pole and a ribbed canopy in alternating red, white and blue wedges. */
function umbrella() {
  const pos = []; const col = [];
  const n = 12; const R = 1.15; const Ht = 0.5; const top = 2.15;
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2; const a1 = ((k + 1) / n) * Math.PI * 2;
    c.set(RWB[k % 3]);
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const am = (a0 + a1) / 2;
    for (const v of [[0, top + 0.08, 0], p(a0, R, top - Ht), p(am, R * 1.02, top - Ht - 0.07), [0, top + 0.08, 0], p(am, R * 1.02, top - Ht - 0.07), p(a1, R, top - Ht)]) { pos.push(...v); col.push(c.r, c.g, c.b); }
  }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  canopy.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  canopy.computeVertexNormals();
  canopy.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.14));
  return merge([
    canopy,
    part(new THREE.CylinderGeometry(0.025, 0.03, 2.3, 6).rotateZ(-0.14).translate(0.15, 1.12, 0), '#d8d4c8'),
    part(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.17, 2.3, 0), '#c9a54a'),
  ]);
}

/** A lounger: a frame, a flat seat and a raised back, a striped cushion. */
function lounger() {
  const L = [];
  const stripe = (x0, y, z, w, len, rot, k) => L.push(part(new THREE.BoxGeometry(w, 0.05, len).rotateX(rot).translate(x0, y, z), k % 2 ? '#efeade' : '#40507f'));
  for (let k = 0; k < 6; k++) stripe(-0.25 + k * 0.1, 0.32, 0.2, 0.1, 0.9, 0, k); // seat, 6 stripes across
  for (let k = 0; k < 6; k++) stripe(-0.25 + k * 0.1, 0.62, -0.5, 0.1, 0.62, 0.95, k); // the back, tilted
  L.push(part(new THREE.BoxGeometry(0.62, 0.04, 1.0).translate(0, 0.28, 0.2), '#c9a56a'));
  for (const x of [-0.28, 0.28]) {
    L.push(part(new THREE.BoxGeometry(0.04, 0.28, 0.04).translate(x, 0.14, 0.62), '#c9a56a'));
    L.push(part(new THREE.BoxGeometry(0.04, 0.28, 0.04).translate(x, 0.14, -0.18), '#c9a56a'));
  }
  return merge(L);
}

/** The lemonade stand: a wooden counter, a striped awning, a big jar, cups, lemons. */
function stand() {
  const L = [
    part(new THREE.BoxGeometry(1.5, 0.9, 0.6).translate(0, 0.45, 0), '#b9854e'),
    part(new THREE.BoxGeometry(1.56, 0.05, 0.66).translate(0, 0.92, 0), '#8a5a34'),
  ];
  for (let k = 0; k < 10; k++) L.push(part(new THREE.BoxGeometry(0.15, 0.5, 0.02).translate(-0.675 + k * 0.15, 0.5, 0.31), k % 2 ? '#efeade' : '#f2d04a')); // striped front
  for (const x of [-0.7, 0.7]) L.push(part(new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(x, 1.4, -0.26), '#8a5a34')); // posts
  for (let k = 0; k < 10; k++) L.push(part(new THREE.BoxGeometry(0.16, 0.03, 0.78).rotateX(0.28).translate(-0.72 + k * 0.16, 1.98, 0.02), k % 2 ? '#efeade' : '#f2d04a')); // awning
  L.push(part(new THREE.CylinderGeometry(0.14, 0.12, 0.36, 10).translate(-0.4, 1.12, 0), '#f6e27a')); // the jar
  L.push(part(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10).translate(-0.4, 1.32, 0), '#b9b6ad'));
  for (let i = 0; i < 7; i++) L.push(part(new THREE.CylinderGeometry(0.035, 0.028, 0.09, 6).translate(0.05 + (i % 4) * 0.09, 0.99 + Math.floor(i / 4) * 0.09, 0.05), '#efeade'));
  for (let i = 0; i < 6; i++) L.push(part(new THREE.SphereGeometry(0.045, 6, 5).scale(1, 0.8, 1).translate(0.42 + (i % 3) * 0.1, 0.97, -0.05 + Math.floor(i / 3) * 0.1), '#f2d04a'));
  return merge(L);
}

function chalkSign() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#25302a'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#b9854e'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#f2efe6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 22px Anton, Switzer, sans-serif';
  g.fillText('LEMONADE', 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Smoke ----------------------------------------------------------------------------------

function createSmoke(ctx, sources, still) {
  const PER = 9;
  const n = sources.length * PER;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-ctx.rig.pitch);
  const age = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAge', age);
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfcac2, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAge;\nvarying float vAge;\nvarying vec2 vSm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n        vAge = aAge; vSm = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAge;\nvarying vec2 vSm;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sd = length(vSm - 0.5) * 2.0;
        diffuseColor.a *= smoothstep(1.0, 0.15, sd) * smoothstep(0.0, 0.12, vAge) * pow(1.0 - vAge, 1.6) * 0.5;`);
  };
  mat.customProgramCacheKey = () => 'labor-smoke';
  gradeLife(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'labor_smoke';
  mesh.layers.set(LIFE_LAYER);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  mesh.renderOrder = 4;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m4 = new THREE.Matrix4();
  const seeds = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]);
  return {
    mesh,
    update(t, k = 1) {
      for (let s = 0; s < sources.length; s++) {
        const [x, y, z] = sources[s];
        for (let i = 0; i < PER; i++) {
          const j = s * PER + i;
          const sd = seeds[j];
          const life = 5.5 + sd[0] * 2;
          const a = still ? (i + sd[1]) / PER : ((t + sd[1] * 20 + i * (life / PER)) % life) / life;
          const rise = a * 2.6;
          const size = (0.25 + a * 1.1) * (0.8 + sd[2] * 0.4) * k;
          m4.makeScale(size, size, size).setPosition(x + a * 0.9 + Math.sin(a * 5 + sd[1] * 6) * 0.18 * a, y + rise, z + Math.cos(a * 4 + sd[2] * 6) * 0.14 * a);
          mesh.setMatrixAt(j, m4);
          age.setX(j, a);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      age.needsUpdate = true;
    },
  };
}

export default function build(kit) {
  const { ctx, plan, bunting, lights, strands, TINTS, scatter, once, r, still } = kit;
  const group = new THREE.Group();
  const glow = [];
  const solid = (extra) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...extra });
  const spot = (x, z, rad, reach = 1.4) => {
    const at = plan.settle(x, z, rad, reach);
    if (!at) return null;
    plan.take(at.x, at.z, rad * 1.05);
    return { x: at.x, z: at.z, y: plan.floorY(at.x, at.z) };
  };

  // Strings of warm bulbs on the fences and the eave, calm pennants under them.
  lights(group, strands({ y: 3.7 }), TINTS.WARM, glow);
  bunting(group, strands({ y: 3.15, out: 0.2 }), RWB, { step: 0.8 });

  // Grills and the smoker, with coals that glow at dusk.
  const grillSpots = GRILLS.map(([x, z]) => spot(x, z, 0.4)).filter(Boolean);
  scatter(group, once('labor-kettle', kettle), solid({ side: THREE.DoubleSide }), grillSpots.map((s, i) => [s.x, s.y, s.z, 0.6 + i * 0.9, K]));
  const smokerAt = spot(SMOKER[0], SMOKER[1], 0.7);
  if (smokerAt) scatter(group, once('labor-smoker', smoker), solid({ side: THREE.DoubleSide }), [[smokerAt.x, smokerAt.y, smokerAt.z, 0.15, K]]);
  const coals = new THREE.MeshStandardMaterial({ color: '#7a2414', emissive: new THREE.Color(1, 0.3, 0.05), emissiveIntensity: 0.2, roughness: 0.9 });
  grillSpots.forEach((s) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * K, 0.2 * K, 0.02, 12), coals); m.position.set(s.x, s.y + 0.69 * K, s.z); m.userData.noAO = true; group.add(m); });
  glow.push((level, k) => { coals.emissiveIntensity = 0.5 + level * 1.8 * Math.min(k, 3); });

  // Tables with checked cloths and food.
  const tableSpots = TABLES.map(([x, z]) => spot(x, z, 1.0, 1.6)).filter(Boolean);
  scatter(group, once('labor-table', table), solid(), tableSpots.map((s) => [s.x, s.y, s.z, 0, K]));
  scatter(group, once('labor-feast', feast), solid(), tableSpots.map((s) => [s.x, s.y, s.z, 0, K]));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 0.9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: once('labor-check', checkCloth), roughness: 0.9, side: THREE.DoubleSide }));
  tableSpots.forEach((s) => { const m = cloth.clone(); m.position.set(s.x, s.y + 0.77 * K, s.z); m.scale.setScalar(K); m.receiveShadow = true; m.userData.noAO = true; group.add(m); });

  // The lemonade stand.
  const standAt = spot(STAND[0], STAND[1], 1.0, 1.8);
  if (standAt) {
    scatter(group, once('labor-stand', stand), solid(), [[standAt.x, standAt.y, standAt.z, 0, K]]);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * K, 0.35 * K), new THREE.MeshStandardMaterial({ map: once('labor-sign', chalkSign), roughness: 0.9 }));
    sign.position.set(standAt.x + 1.05 * K, standAt.y + 0.5 * K, standAt.z + 0.55 * K);
    sign.rotation.set(-0.5, -0.2, 0);
    sign.castShadow = true;
    sign.userData.noAO = true;
    group.add(sign);
  }

  // Umbrellas with a pair of loungers each.
  const umb = [];
  const lng = [];
  UMBRELLAS.forEach(([x, z], i) => {
    const s = spot(x, z, 1.1, 2.4);
    if (!s) return;
    umb.push([s.x, s.y, s.z, r() * 6, K * (0.95 + r() * 0.15)]);
    lng.push([s.x - 0.95 * K, s.y, s.z + 0.7 * K, Math.PI / 2 + (r() - 0.5) * 0.3, K], [s.x + 0.3 * K, s.y, s.z + 1.5 * K, (r() - 0.5) * 0.4, K]);
  });
  if (umb.length) {
    scatter(group, once('labor-umbrella', umbrella), solid({ side: THREE.DoubleSide }), umb);
    scatter(group, once('labor-lounger', lounger), solid(), lng);
  }

  // Smoke over the grills and the smoker.
  const sources = grillSpots.map((s) => [s.x, s.y + 0.95 * K, s.z - 0.05]);
  if (smokerAt) sources.push([smokerAt.x + 0.46 * K, smokerAt.y + 1.25 * K, smokerAt.z]);
  const smoke = createSmoke(ctx, sources, still);
  const api = {
    update(t, dt, night) {
      if (!smoke.mesh.parent) ctx.scene.add(smoke.mesh);
      smoke.update(t, 1 - 0.15 * night);
      smoke.mesh.material.color.setScalar(0.95 - 0.4 * night);
      return !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { ctx.scene.remove(smoke.mesh); },
  };

  return { group, glow, live: api, accent: { tint: [1.07, 1.0, 0.86] } };
}
