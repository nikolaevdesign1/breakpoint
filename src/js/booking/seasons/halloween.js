import * as THREE from 'three';
import { LIFE_LAYER, rng, lifeTime } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { PITCH, spriteMesh, writeFrame, hideFrame, flush } from '../life/sprite.js';
import { loadHaunt, framesAt, headingIndex } from './haunt-kit.js';
import { windForce } from '../life/wind.js';

// Round 10, row 35: the ghosts of Halloween. Four parts, all removed with the decor group:
// - up to 12 translucent ghosts, rendered people of five times (scripts/life/render_ghosts.py, one
//   sprite card each on the life layer): 8 drift over the club on slow loops, through fences, walls and
//   now and then through a player (who shivers), 4 hide at the foot of trees and answer a click by
//   dissolving in a puff;
// - white sheets over benches, umpire chairs and tables, and four hung on a rope between two
//   posts on the lawn; they sway with the scene's wind (life/wind.js windForce), life layer;
// - cobwebs (soft white cards) in the corners of the court fences, on floodlight masts and on the
//   clubhouse front, with small spiders; static, so they go into the baked frame;
// - a few spiders drop on a thread from the eave and climb back (life layer).
// By day the ghosts are nearly clear; after dark they brighten with a cold light (no neon).

const GHOSTS = { fly: 8, hide: 4 };
const HIDE_BACK = 25; // s a dissolved ghost stays gone
const POP = 0.9; // s of the dissolve
const FLY_TINT = new THREE.Color(1.3, 1.5, 1.9); // night: cold white
const DAY_TINT = new THREE.Color(1.6, 1.6, 1.6);
export const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PITCH); // faces the drone
const smooth = THREE.MathUtils.smoothstep;

export const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** A quarter web with its apex at the top-left corner: radial threads and sagging rings. */
const webTexture = () => canvas(128, 128, (g) => {
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.6; g.lineCap = 'round';
  const a = [0.05, 0.3, 0.55, 0.8, 1.05, 1.3, 1.52];
  for (const t of a) { g.beginPath(); g.moveTo(1, 1); g.lineTo(1 + Math.cos(t) * 124, 1 + Math.sin(t) * 124); g.stroke(); }
  for (let r = 22; r < 126; r += 20) {
    g.beginPath();
    a.forEach((t, i) => { const x = 1 + Math.cos(t) * r; const y = 1 + Math.sin(t) * r; if (!i) g.moveTo(x, y); else g.quadraticCurveTo(1 + Math.cos((t + a[i - 1]) / 2) * r * 0.9, 1 + Math.sin((t + a[i - 1]) / 2) * r * 0.9, x, y); });
    g.stroke();
  }
});
const spiderTexture = () => canvas(64, 64, (g) => {
  g.strokeStyle = '#14110f'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32, 34); g.lineTo(32 + s * (16 + i * 3), 18 + i * 9); g.lineTo(32 + s * (26 + i * 2), 26 + i * 12); g.stroke(); }
  g.fillStyle = '#14110f';
  g.beginPath(); g.ellipse(32, 38, 9, 11, 0, 0, 7); g.ellipse(32, 24, 6, 6, 0, 0, 7); g.fill();
});
const puffTexture = () => canvas(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/** A card material on the life layer whose alpha comes from the instance colour's red channel. */
export function cardMaterial(map, { life = true } = {}) {
  const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.004, polygonOffset: !life, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (!life) return m;
  m.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.a *= vColor.r;'); };
  m.customProgramCacheKey = () => 'halloween-card';
  return gradeLife(m);
}
export const cards = (geo, mat, n, name, order) => {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  if (mat.onBeforeCompile.length) mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // the shader reads vColor: it must exist from the first compile
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  mesh.renderOrder = order;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
};

// --- Sheets ---------------------------------------------------------------------------------

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
/** Cloth shade: 1 on a fold's crest, darker in its crease, with faint dirty streaks towards the hem. */
const shade = (fold, down, seed) => 0.82 + 0.14 * fold - down * (0.06 + 0.1 * hash(seed)) * (hash(seed * 3.1) > 0.55 ? 1 : 0.35);

/** Adds a draped sheet (a bell over something rx × rz wide, h tall, folds falling to a wavy hem) to the arrays. */
function drape(out, x, y, z, rx, rz, h, yaw, phase) {
  const A = 40; const R = 9;
  const base = out.pos.length / 3;
  const c = Math.cos(yaw); const s = Math.sin(yaw);
  const folds = 7 + Math.floor(hash(phase + 1) * 4);
  for (let k = 0; k <= R; k++) {
    const t = k / R;
    for (let i = 0; i < A; i++) {
      const a = (i / A) * Math.PI * 2;
      const f = Math.sin(a * folds + phase + t * 1.5); // folds run down the cloth, a little twisted
      const hem = 1 + (0.07 * Math.sin(a * 5 + phase) + 0.05 * f) * t * t;
      const rad = k === 0 ? 0.08 : Math.sin(Math.min(1, t * 1.15) * Math.PI / 2) * hem * (1 + 0.05 * f * t);
      const lx = Math.cos(a) * rx * rad; const lz = Math.sin(a) * rz * rad;
      out.pos.push(x + lx * c - lz * s, y + h * (1 - t * t * 0.96 - (k === R ? 0.05 * Math.sin(a * 5 + phase) * (0.6 + f * 0.4) : 0)), z + lx * s + lz * c);
      out.free.push(t * 1.3);
      const v = shade(f * 0.5 + 0.5, t, phase * 100 + i);
      out.col.push(v, v, v * 0.97);
    }
  }
  for (let k = 0; k < R; k++) for (let i = 0; i < A; i++) {
    const a = base + k * A + i; const b = base + k * A + ((i + 1) % A);
    out.idx.push(a, a + A, b, b, a + A, b + A);
  }
}
/** A sheet pegged to a rope from (x0, z0) to (x1, z1) at height y, w wide, h long: pleats hang from the pegs. */
function hung(out, x0, z0, x1, z1, y, w, h, seed) {
  const N = 20; const M = 9;
  const base = out.pos.length / 3;
  const len = Math.hypot(x1 - x0, z1 - z0) || 1;
  const nx = -(z1 - z0) / len; const nz = (x1 - x0) / len; // across the cloth, out of its plane
  for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
    const u = i / N; const v = j / M;
    const pleat = Math.sin(u * Math.PI * 7 + seed) * (0.04 + 0.1 * v) + Math.sin(u * Math.PI * 17 + seed * 2) * 0.012 * v;
    const hemLift = v > 0.95 ? 0.05 * Math.sin(u * 20 + seed) : 0;
    out.pos.push(x0 + (x1 - x0) * u + nx * pleat, y - h * v + hemLift - 0.05 * Math.sin(u * Math.PI) * v, z0 + (z1 - z0) * u + nz * pleat);
    out.free.push(v * 2.2);
    const f = 0.5 + 0.5 * Math.sin(u * Math.PI * 7 + seed + 1.57); // lit side of each pleat
    const k = shade(f, v, seed * 50 + i);
    out.col.push(k, k, k * 0.97);
  }
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const a = base + j * (N + 1) + i;
    out.idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2);
  }
}

function sheetMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#fbf9f2', vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, emissive: new THREE.Color(0.5, 0.62, 0.9), emissiveIntensity: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = lifeTime;
    shader.uniforms.uWind = windForce;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFree;\nuniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bpW = aFree * uWind;
        transformed.x += sin(uTime * 1.7 + position.x * 1.3 + position.z * 1.1) * 0.05 * bpW;
        transformed.z += cos(uTime * 1.3 + position.x * 0.9 + position.z * 0.7) * 0.045 * bpW;
        transformed.y += sin(uTime * 2.3 + position.x * 2.0) * 0.012 * bpW;`);
  };
  m.customProgramCacheKey = () => 'halloween-sheet';
  return gradeLife(m);
}

/**
 * The Halloween ghosts, sheets, cobwebs and spiders. `fences`: court fence boxes (Box3); `plan`:
 * seasons/placement.js plan. Returns the static group plus the live hooks seasons.js calls.
 */
export function buildGhosts({ ctx, plan, fences }) {
  const { scene, root, camera } = ctx;
  const r = rng(0x9057);
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
  const instances = (match) => {
    const out = [];
    scene.traverse((o) => { if (!out.length && o.isInstancedMesh && match.test(o.name)) { o.updateWorldMatrix(true, false); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); m4.decompose(p, q, s); out.push({ x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z, yaw: new THREE.Euler().setFromQuaternion(q, 'YXZ').y }); } } });
    return out;
  };

  // --- Sheets: on benches, umpire chairs, tables, a rope on the lawn ---
  const sh = { pos: [], free: [], idx: [], col: [] };
  instances(/^Cube002$/).filter((_, i) => i % 3 === 0).forEach((b, i) => drape(sh, b.x, b.y, b.z, Math.min(1.2, b.sx), 0.5, 0.95, -b.yaw, i));
  instances(/^umpire_chair_mesh$/).filter((_, i) => i % 3 === 1).forEach((b, i) => drape(sh, b.x, b.y, b.z, 0.55, 0.6, Math.min(2.3, b.sy * 0.95), -b.yaw, i * 2));
  instances(/^clay-1_table_mesh_1$/).filter((_, i) => i % 4 === 2).forEach((b, i) => drape(sh, b.x, b.y, b.z, 0.7, 0.45, 0.8, -b.yaw, i * 3));
  [[16.2, -43.6], [20.4, -43.6]].forEach(([x, z], i) => { const at = plan.settle(x, z, 0.5, 1.5); if (at) drape(sh, at.x, plan.floorY(at.x, at.z), at.z, 0.32, 0.22, 0.45, r() * 3, i * 4); }); // a covered racket bag and chair
  const post = [[9.2, -45], [23.4, -45]].map(([x, z]) => plan.settle(x, z, 0.3, 1.2));
  const roped = post.every(Boolean);
  if (roped) {
    const [a, b] = post;
    const wire = [];
    for (let i = 0; i < 20; i++) for (const t of [i / 20, (i + 1) / 20]) wire.push(a.x + (b.x - a.x) * t, 2.35 - 0.2 * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: 0x2a2926 })));
    for (const o of post) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.45, 8), new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 0.8 })); pole.position.set(o.x, plan.floorY(o.x, o.z) + 1.22, o.z); pole.castShadow = true; group.add(pole); }
    for (let i = 0; i < 4; i++) { const t0 = 0.1 + i * 0.22; const x0 = a.x + (b.x - a.x) * t0; const x1 = a.x + (b.x - a.x) * (t0 + 0.17); const z0 = a.z + (b.z - a.z) * t0; const z1 = a.z + (b.z - a.z) * (t0 + 0.17); hung(sh, x0, z0, x1, z1, 2.3 - 0.8 * (t0 + 0.085 - 0.5) ** 2 * 0.6, 1, 1.35 + (i % 2) * 0.25, i * 1.7); }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sh.pos, 3));
  sg.setAttribute('aFree', new THREE.Float32BufferAttribute(sh.free, 1));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sh.col, 3));
  sg.setIndex(sh.idx);
  sg.computeVertexNormals();
  const sheetMat = sheetMaterial();
  const sheets = new THREE.Mesh(sg, sheetMat);
  sheets.name = 'life_halloween_sheets';
  sheets.frustumCulled = false;
  sheets.layers.set(LIFE_LAYER);
  sheets.userData.noAO = true;
  group.add(sheets);

  // --- Webs: fence corners, mast tops, the clubhouse front ---
  const webs = [];
  const web = (x, y, z, size, flip, tilt) => webs.push({ x, y, z, size, flip, tilt });
  for (const b of fences) {
    const top = Math.min(b.max.y, 4) - 0.1;
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) web(x + (x === b.min.x ? 0.05 : -0.05), top, z, 1.1 + r() * 0.5, x === b.max.x ? -1 : 1, false);
  }
  instances(/^flood_pole_mesh$/).filter((_, i) => i % 3 === 0).forEach((o) => web(o.x + 0.1, o.y + o.sy * 0.78, o.z, 1.1 + r() * 0.4, r() < 0.5 ? -1 : 1, true));
  for (let x = -22; x <= 58; x += 6.5) web(x, 3.1, -51.4, 1.1 + r() * 0.5, r() < 0.5 ? -1 : 1, false);
  const webMesh = cards(new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0), cardMaterial(webTexture(), { life: false }), Math.max(1, webs.length), 'halloween_webs', 3);
  const spiders = cards(new THREE.PlaneGeometry(1, 1), cardMaterial(spiderTexture(), { life: false }), Math.max(1, webs.length), 'halloween_spiders', 4);
  webs.forEach((w, i) => {
    q.copy(w.tilt ? TILT : new THREE.Quaternion());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0));
    webMesh.setMatrixAt(i, m4.compose(p.set(w.x, w.y, w.z), q, s.set(w.size * w.flip, w.size, 1)));
    spiders.setMatrixAt(i, m4.compose(p.set(w.x + w.flip * w.size * 0.42, w.y - w.size * 0.4, w.z + 0.02), q, s.setScalar(0.2)));
  });
  webMesh.count = spiders.count = webs.length;
  for (const m of [webMesh, spiders]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); group.add(m); }

  // --- Spiders on a thread, from the eave ---
  const drops = [-14.2, 3.4, 21.6, 39.1, 52.7].map((x, i) => ({ x, y: 3.05, z: -51.3, len: 1.1 + r() * 0.9, at: r() * 20, period: 14 + r() * 8, i }));
  const dropMesh = cards(new THREE.PlaneGeometry(1, 1), cardMaterial(spiderTexture()), drops.length, 'life_halloween_dropspiders', 5);
  dropMesh.layers.set(LIFE_LAYER);
  const thread = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(drops.length * 6), 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  thread.frustumCulled = false; thread.layers.set(LIFE_LAYER); thread.userData.noAO = true;
  group.add(dropMesh, thread);

  // --- Ghosts ---
  const ghosts = [];
  for (let i = 0; i < GHOSTS.fly; i++) ghosts.push({ fly: true, v: i % 5, cx: -30 + r() * 100, cz: -35 + r() * 100, rx: 5 + r() * 12, rz: 4 + r() * 10, w1: (0.04 + r() * 0.05) * (r() < 0.5 ? -1 : 1), w2: 0.05 + r() * 0.06, ph: r() * 6.28, y: 0.3 + r() * 1.1, size: 1.5 + r() * 0.3, blink: r() < 0.25, state: 0, t0: 0, x: 0, z: 0, h: 0, a: 0, px: null, pz: null, heading: 0, clipT: r() * 5 });
  const trees = instances(/^impostor_tree_island/).filter((t) => t.x > -45 && t.x < 95 && t.z > -55 && t.z < 85);
  for (let i = trees.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [trees[i], trees[j]] = [trees[j], trees[i]]; }
  const spots = [];
  for (const t of trees) if (spots.length < GHOSTS.hide && spots.every((h) => Math.hypot(h.x - t.x, h.z - t.z) > 28)) spots.push(t);
  spots.forEach((t, i) => ghosts.push({ fly: false, v: (i + 2) % 5, hx: t.x + 1.4, hz: t.z + 2.6, ph: r() * 6.28, size: 1.25, state: 0, t0: 0, x: 0, z: 0, h: 0, a: 0, px: null, pz: null, heading: 0, clipT: r() * 5 }));
  // The sprites arrive with the decor: ghosts.webp (~0.5 MB) is fetched here, not before.
  let kit = null;
  loadHaunt('ghosts', ctx.quality).then(({ data, bodyTex }) => {
    for (const g of ghosts) {
      g.mesh = spriteMesh(bodyTex, 1, { slide: 0.3, lift: 1.25 });
      g.mesh.name = 'life_halloween_ghost';
      g.mesh.material.depthWrite = false;
      g.mesh.material.alphaTest = 0.003;
      g.mesh.renderOrder = 4;
      hideFrame(g.mesh, 0); flush(g.mesh);
      group.add(g.mesh);
    }
    kit = data;
  }).catch((err) => console.warn('Ghosts failed', err));
  const glowMat = cardMaterial(puffTexture());
  glowMat.blending = THREE.AdditiveBlending;
  glowMat.color.set(0x9cbcff);
  const shadeMat = cardMaterial(puffTexture());
  shadeMat.color.set(0x141c2c);
  const shadeMesh = cards(new THREE.PlaneGeometry(1, 1), shadeMat, ghosts.length, 'life_halloween_ghost_shade', 2);
  const glowMesh = cards(new THREE.PlaneGeometry(1, 1), glowMat, ghosts.length, 'life_halloween_ghost_glow', 3);
  const puffMesh = cards(new THREE.PlaneGeometry(1, 1), cardMaterial(puffTexture()), 12, 'life_halloween_puffs', 5);
  for (const m of [shadeMesh, glowMesh, puffMesh, dropMesh]) { m.layers.set(LIFE_LAYER); m.count = 0; }
  group.add(shadeMesh, glowMesh, puffMesh);
  const puffs = [];
  const col = new THREE.Color();
  const right = new THREE.Vector3(); const v = new THREE.Vector3();
  const centre = (g) => g.h + 1.0 * g.size; // the middle of the figure, above its tail

  // Players a ghost drifts through shiver for a moment. The people are sprites that their own system
  // places every frame; this runs after it and shifts the card sideways (a quick tremor, easing off).
  const shivering = new Map(); // `${mesh.id}:${slot}` → { mesh, slot, t0, x0, xw }
  let bodies = [];
  let scannedAt = -9;
  const SHIVER = 1.7;
  function shiver(t) {
    if (t - scannedAt > 1) { scannedAt = t; bodies = []; scene.traverse((o) => { if (o.isInstancedMesh && o.userData.flip && !o.userData.ground && /^life_players/.test(o.name)) bodies.push(o); }); }
    for (const g of ghosts) {
      if (!g.fly || g.a < 0.1) continue;
      for (const b of bodies) {
        if (!b.visible) continue;
        for (let i = 0; i < b.count; i++) {
          b.getMatrixAt(i, m4);
          const el = m4.elements;
          if (el[0] === 0 && el[5] === 0) continue;
          if (Math.hypot(el[12] - g.x, el[14] - g.z) < 1.2 && g.h < 1.6) { const k = `${b.id}:${i}`; if (!shivering.has(k)) shivering.set(k, { mesh: b, slot: i, t0: t, x0: el[12], xw: Infinity }); }
        }
      }
    }
    for (const [k, sv] of shivering) {
      const u = (t - sv.t0) / SHIVER;
      sv.mesh.getMatrixAt(sv.slot, m4);
      const el = m4.elements;
      if (Math.abs(el[12] - sv.xw) > 1e-5) sv.x0 = el[12]; // the owner moved it: new rest position
      if (u >= 1) { shivering.delete(k); continue; }
      el[12] = sv.x0 + Math.sin(t * 52) * 0.035 * (1 - u);
      sv.xw = el[12];
      sv.mesh.setMatrixAt(sv.slot, m4);
      sv.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  let nl = -1; // night level, eased (the decor's own steps are coarse)
  function update(t, dt, level) {
    nl = nl < 0 ? level : nl + (level - nl) * Math.min(1, dt * 1.5);
    const night = nl;
    sheetMat.emissiveIntensity = night * 0.16;
    const base = 0.92 + 0.08 * night; // the sprites are see-through themselves; after dark the glow cards add to them
    ghosts.forEach((g, i) => {
      if (g.fly) {
        g.x = g.cx + Math.sin(t * g.w1 + g.ph) * g.rx;
        g.z = g.cz + Math.cos(t * g.w2 + g.ph * 1.3) * g.rz;
        g.h = g.y + Math.sin(t * 0.7 + g.ph) * 0.18;
      } else {
        g.x = g.hx; g.z = g.hz; g.h = Math.sin(t * 0.9 + g.ph) * 0.05;
      }
      if (g.px !== null) {
        const dx = g.x - g.px; const dz = g.z - g.pz;
        if (Math.hypot(dx, dz) > 1e-4) g.heading = Math.atan2(dx, -dz);
      }
      g.px = g.x; g.pz = g.z;
      g.clipT += dt;
      let a = g.fly ? base : Math.min(1, base + 0.08);
      let k = g.size;
      if (g.state === 1) { const u = (t - g.t0) / POP; if (u >= 1) { g.state = 2; g.t0 = t; } else { a *= 1 - u; k *= 1 + u * 0.5; } }
      if (g.state === 2) { a = 0; if (t - g.t0 > HIDE_BACK) { g.state = 3; g.t0 = t; } }
      if (g.state === 3) { const u = Math.min(1, (t - g.t0) / 2.5); a *= u; if (u >= 1) g.state = 0; }
      if (g.blink) a *= 0.45 + 0.55 * smooth(Math.sin(t * 5 + g.ph * 3) * Math.sin(t * 1.3 + g.ph), -0.55, -0.1);
      g.a = a;
      if (g.mesh && kit) {
        const list = kit.frames[kit.variants[g.v]][`drift|h${headingIndex(g.heading)}`];
        if (a > 0.01 && list) {
          const [fa, fb, ft] = framesAt(kit, list, g.clipT, kit.fps);
          writeFrame(g.mesh, 0, fa, fb, ft, g.x, g.h, g.z, k);
        } else hideFrame(g.mesh, 0);
        g.mesh.material.opacity = a;
        g.mesh.material.color.copy(DAY_TINT).lerp(FLY_TINT, night).multiplyScalar(1 + 2.4 * night); // the night grade would swallow it: they carry their own light
        flush(g.mesh);
      }
      m4.compose(p.set(g.x, g.h + 1.0 * g.size, g.z), TILT, s.set(2.6 * g.size, 2.6 * g.size, 1));
      shadeMesh.setMatrixAt(i, m4.compose(p.set(g.x, g.h + 0.95 * g.size, g.z), TILT, s.set(1.5 * g.size, 2.1 * g.size, 1)));
      shadeMesh.setColorAt(i, col.setScalar(a * 0.32 * (1 - night)));
      m4.compose(p.set(g.x, g.h + 1.0 * g.size, g.z), TILT, s.set(2.6 * g.size, 2.6 * g.size, 1));
      glowMesh.setMatrixAt(i, m4);
      glowMesh.setColorAt(i, col.setScalar(a * (0.12 + 0.3 * night)));
    });
    shadeMesh.count = ghosts.length;
    shadeMesh.instanceMatrix.needsUpdate = true;
    shadeMesh.instanceColor.needsUpdate = true;
    glowMesh.count = ghosts.length;
    glowMesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceColor.needsUpdate = true;
    shiver(t);

    for (let i = puffs.length - 1; i >= 0; i--) if (t - puffs[i].t0 > POP) puffs.splice(i, 1);
    puffs.forEach((f, i) => {
      const u = (t - f.t0) / POP;
      m4.compose(p.set(f.x + f.vx * u, f.y + f.vy * u + u * 0.6, f.z + f.vz * u), TILT, s.setScalar(0.5 + u * 1.3));
      puffMesh.setMatrixAt(i, m4);
      puffMesh.setColorAt(i, col.setScalar(0.5 * (1 - u)));
    });
    puffMesh.count = puffs.length;
    if (puffs.length) { puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor.needsUpdate = true; }

    const th = thread.geometry.attributes.position;
    drops.forEach((d, i) => {
      const c = ((t + d.at) % d.period) / d.period; // 0…1 through one visit: down, hang, up, rest
      const down = smooth(c, 0.05, 0.3) - smooth(c, 0.62, 0.85);
      const y = d.y - d.len * down * (1 + 0.04 * Math.sin(t * 3 + i));
      th.setXYZ(i * 2, d.x, d.y, d.z);
      th.setXYZ(i * 2 + 1, d.x, y, d.z);
      m4.compose(p.set(d.x, y - 0.1, d.z + 0.03), new THREE.Quaternion(), s.setScalar(down > 0.01 ? 0.22 : 0));
      dropMesh.setMatrixAt(i, m4);
      dropMesh.setColorAt(i, col.setScalar(1));
    });
    dropMesh.count = drops.length;
    dropMesh.instanceMatrix.needsUpdate = true; dropMesh.instanceColor.needsUpdate = true;
    th.needsUpdate = true;
    return true;
  }

  function hit(x, y) {
    let best = null; let bestD = Infinity;
    camera.getWorldDirection(v);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    ghosts.forEach((g) => {
      if (g.fly || g.state !== 0 || g.a < 0.08) return;
      p.set(g.x, centre(g), g.z).project(camera);
      const sx = ((p.x + 1) / 2) * innerWidth; const sy = ((1 - p.y) / 2) * innerHeight;
      const e = p.set(g.x, centre(g), g.z).addScaledVector(right, g.size * 0.7).project(camera);
      const rad = Math.max(30, Math.abs(((e.x + 1) / 2) * innerWidth - sx) * 1.2);
      const d = Math.hypot(sx - x, sy - y);
      if (d < rad && d < bestD) { bestD = d; best = g; }
    });
    return best;
  }

  return {
    group,
    update,
    pick: (x, y) => (hit(x, y) ? 'ghost' : null),
    label: (kind) => (kind === 'ghost' ? 'Boo!' : null),
    click(x, y) {
      const g = hit(x, y);
      if (!g) return false;
      const now = lifeTime.value;
      g.state = 1; g.t0 = now;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r(); puffs.push({ t0: now, x: g.x, y: centre(g), z: g.z, vx: Math.cos(a) * 1.1, vy: (r() - 0.3) * 0.8, vz: Math.sin(a) * 1.1 }); }
      return true;
    },
    /** Dev: park the first drifting ghost at (x, z) (to see a player shiver). */
    park(x, z) { Object.assign(ghosts[0], { cx: x, cz: z, rx: 0, rz: 0, y: 0.4 }); },
    /** Dev: park flying ghost i on (x, z), for the headless checks. */
    place(i, x, z) { const g = ghosts[i]; g.cx = x; g.cz = z; g.rx = g.rz = 0.01; g.y = 0.3; },
    debug: () => ({ ghosts: ghosts.map((g) => [g.fly ? 'fly' : 'hide', +g.a.toFixed(2), g.state, +g.x.toFixed(1), +g.h.toFixed(1), +g.z.toFixed(1)]), sheets: sh.idx.length / 3, webs: webs.length, shivering: shivering.size }),
  };
}
