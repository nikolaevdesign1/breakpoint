import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';

// Cars coming and going (row 95.3). The parked cars are real meshes (scripts/lookdev/cars.py) that
// the optimizer merges with every other palette prop into one mesh. Here they are lifted back out:
// triangles painted with a car swatch inside the car park, split into cars by the gaps between
// bays. Each car keeps its own frame (centre, heading, wheel hubs) and all of them are redrawn as
// one mesh whose vertex shader places every car, spins its wheels and steers the front pair.
//
// Every minute or two one car backs out of its bay, swinging its tail into the aisle, pulls away
// and drives off down the driveway, or one comes in from the trees and turns nose-first into a free
// bay (row 129). Every manoeuvre stays on the asphalt of the lot and the driveway (the lot sits
// outside the club fence, inside a hedge that opens only to the driveway), keeps clear of the
// parked cars, and only one car moves at a time. Paths are curves with the speed planned along them:
// gentle starts and stops, slower through the turns, the wheels steered by the curvature.
//
// Parked cars sit in the static world and cast into the static shadow map; a car on the move
// switches to the life layer with a shadow projected along the sun onto the asphalt (exact for flat
// ground) plus a soft contact patch, and the shadow map is redrawn once when it leaves its bay and
// once when it parks, so no shadow is ever left behind.

// Swatch order of scripts/lookdev/lib_build.py (16 per row): car paints and parts come first.
const COLS = 16;
const CAR_SWATCHES = 17; // paint_white … seam
const WHEEL = new Set([8, 9, 10]); // tyre, rim, rim_dark
const TAIL_LAMP = 12;
const GRID = 0.2; // m: cells for splitting the car park into cars (bays leave ≥ 0.4 m between them)
const SHADOW_OPACITY = 0.58; // matches the baked shadows of the parked cars on asphalt
const ASPHALT_Y = 0.012;

// Timing (s).
const FIRST_EVENT = [24, 40];
const EVERY = [50, 140];

// Traffic keeps right: leaving (eastbound) on the +z half of the aisle and driveway, arriving on −z.
const KEEP_RIGHT = 1.3; // m from the centre line of the 6 m driveway
const FAR_X = 150; // down the driveway, past the right edge of any view (row 140), among the trees
const TURN_R = 4.4; // m: radius the centre of a car follows backing out of a bay
const PARK_R = 5; // m: turning into a bay
const CLEAR = 0.35; // m kept between a car and anything it passes
const V_LOT = 3; // m/s in the car park (~11 km/h)
const V_ROAD = 7.5; // m/s on the driveway
const V_REVERSE = 1.1;
const A_GO = 1.2; // m/s²
const A_BRAKE = 1.7;
const A_SIDE = 0.9; // m/s² in a turn: v ≤ √(a / curvature)

const rand = (a, b) => a + Math.random() * (b - a);
const MAX_CARS = 16;

/** Car-park triangles of the merged palette props, split into cars, removed from the props mesh. */
function extractCars(root) {
  const lotObj = root.getObjectByName('parking_lot');
  const lot = lotObj ? new THREE.Box3().setFromObject(lotObj).expandByScalar(1.2) : new THREE.Box3(new THREE.Vector3(59, -1, 44), new THREE.Vector3(103, 3, 68));
  const sources = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.material?.name === 'mat_props' && o.geometry.index) sources.push(o);
  });
  const tris = []; // { mesh, i (triangle), sw, c: Vector3 (world centroid) }
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const uv = new THREE.Vector2();
  for (const mesh of sources) {
    const g = mesh.geometry;
    const map = mesh.material.map;
    if (!map?.image) continue;
    map.updateMatrix();
    const rows = Math.round(map.image.height / (map.image.width / COLS));
    const { index } = g;
    const pos = g.attributes.position;
    const uvs = g.attributes.uv;
    mesh.updateWorldMatrix(true, false);
    for (let t = 0; t < index.count / 3; t++) {
      const a = index.getX(t * 3);
      uv.fromBufferAttribute(uvs, a).applyMatrix3(map.matrix);
      const sw = Math.floor(uv.x * COLS) + Math.floor(uv.y * rows) * COLS;
      if (sw < 0 || sw >= CAR_SWATCHES) continue;
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, index.getX(t * 3 + k)).applyMatrix4(mesh.matrixWorld);
      const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
      if (c.x < lot.min.x || c.x > lot.max.x || c.z < lot.min.z || c.z > lot.max.z || c.y > 2.4) continue;
      const ids = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)]; // the index is rewritten below
      tris.push({ mesh, t, ids, sw, c, v: v.map((p) => p.clone()) });
    }
  }
  if (!tris.length) return [];

  // Occupancy grid over the car park → connected blobs = cars.
  const nx = Math.ceil((lot.max.x - lot.min.x) / GRID) + 1;
  const nz = Math.ceil((lot.max.z - lot.min.z) / GRID) + 1;
  const cell = new Int32Array(nx * nz).fill(-1); // -1 empty, -2 filled, ≥0 blob id
  const cx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - lot.min.x) / GRID)));
  const cz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - lot.min.z) / GRID)));
  for (const tr of tris) {
    const xs = tr.v.map((p) => p.x);
    const zs = tr.v.map((p) => p.z);
    for (let i = cx(Math.min(...xs)); i <= cx(Math.max(...xs)); i++) {
      for (let j = cz(Math.min(...zs)); j <= cz(Math.max(...zs)); j++) cell[j * nx + i] = -2;
    }
  }
  let blobs = 0;
  const stack = [];
  for (let s = 0; s < cell.length; s++) {
    if (cell[s] !== -2) continue;
    cell[s] = blobs;
    stack.push(s);
    while (stack.length) {
      const q = stack.pop();
      const i = q % nx;
      const j = (q - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        if (cell[n] === -2) { cell[n] = blobs; stack.push(n); }
      }
    }
    blobs++;
  }
  const groups = Array.from({ length: blobs }, () => []);
  for (const tr of tris) groups[cell[cz(tr.c.z) * nx + cx(tr.c.x)]].push(tr);

  const cars = groups.filter((g) => g.length > 200).slice(0, MAX_CARS).map(carFrame);
  // Out of the merged props: they are drawn by the car mesh from now on.
  for (const mesh of sources) {
    const drop = new Set(tris.filter((tr) => tr.mesh === mesh && cars.some((c) => c.tris === groups[cell[cz(tr.c.z) * nx + cx(tr.c.x)]])).map((tr) => tr.t));
    if (!drop.size) continue;
    const { index } = mesh.geometry;
    const kept = [];
    for (let t = 0; t < index.count / 3; t++) if (!drop.has(t)) kept.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    const Arr = index.array.constructor;
    mesh.geometry.setIndex(new THREE.BufferAttribute(new Arr(kept), 1));
  }
  return cars;
}

/** Centre, heading (nose = away from the tail lamps) and wheel hubs of one car's triangles. */
function carFrame(tris) {
  // Principal axis of the footprint.
  let mx = 0; let mz = 0;
  tris.forEach((t) => { mx += t.c.x; mz += t.c.z; });
  mx /= tris.length; mz /= tris.length;
  let sxx = 0; let szz = 0; let sxz = 0;
  tris.forEach((t) => { const dx = t.c.x - mx; const dz = t.c.z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; });
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let fx = Math.cos(ang); let fz = Math.sin(ang);
  const tail = tris.filter((t) => t.sw === TAIL_LAMP);
  if (tail.length) {
    const tx = tail.reduce((a, t) => a + t.c.x, 0) / tail.length - mx;
    const tz = tail.reduce((a, t) => a + t.c.z, 0) / tail.length - mz;
    if (tx * fx + tz * fz > 0) { fx = -fx; fz = -fz; }
  }
  const yaw = Math.atan2(fx, fz); // local +z → world (sin yaw, cos yaw)
  const rx = Math.cos(yaw); const rz = -Math.sin(yaw); // local +x
  let f0 = Infinity; let f1 = -Infinity; let r0 = Infinity; let r1 = -Infinity; let y0 = Infinity;
  for (const t of tris) for (const p of t.v) {
    const f = (p.x - mx) * fx + (p.z - mz) * fz;
    const r = (p.x - mx) * rx + (p.z - mz) * rz;
    f0 = Math.min(f0, f); f1 = Math.max(f1, f); r0 = Math.min(r0, r); r1 = Math.max(r1, r); y0 = Math.min(y0, p.y);
  }
  const x = mx + fx * (f0 + f1) / 2 + rx * (r0 + r1) / 2;
  const z = mz + fz * (f0 + f1) / 2 + rz * (r0 + r1) / 2;
  const toLocal = (p) => new THREE.Vector3((p.x - x) * rx + (p.z - z) * rz, p.y - y0, (p.x - x) * fx + (p.z - z) * fz);

  // Wheels: four groups by side and axle; the hub is the middle of each group's bounds.
  const hubs = new Map();
  for (const t of tris) {
    if (!WHEEL.has(t.sw)) continue;
    const c = toLocal(t.c);
    const key = `${c.x > 0 ? 1 : 0}${c.z > 0 ? 1 : 0}`;
    const box = hubs.get(key) ?? hubs.set(key, new THREE.Box3()).get(key);
    t.v.forEach((p) => box.expandByPoint(toLocal(p)));
  }
  const hubOf = new Map([...hubs].map(([k, b]) => [k, b.getCenter(new THREE.Vector3())]));
  const front = [...hubOf].filter(([k]) => k[1] === '1').map(([, h]) => h.z);
  const rear = [...hubOf].filter(([k]) => k[1] === '0').map(([, h]) => h.z);
  const wheelbase = front.length && rear.length ? Math.max(...front) - Math.min(...rear) : 2.7;
  const radius = hubOf.size ? [...hubOf.values()].reduce((a, h) => a + h.y, 0) / hubOf.size : 0.32;
  return { tris, x, z, y: y0, yaw, length: f1 - f0, width: r1 - r0, wheelbase, radius, hubOf, toLocal };
}

/** One geometry for every car, in car space, tagged with its car index and wheel hubs. */
function carsGeometry(cars) {
  const pos = []; const nor = []; const uvs = []; const carIdx = []; const hub = [];
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const uv = new THREE.Vector2();
  cars.forEach((car, ci) => {
    const rot = new THREE.Matrix4().makeRotationY(-car.yaw);
    for (const t of car.tris) {
      const g = t.mesh.geometry;
      nm.getNormalMatrix(t.mesh.matrixWorld);
      const local = t.v.map(car.toLocal);
      const c = car.toLocal(t.c);
      const wheel = WHEEL.has(t.sw);
      const key = `${c.x > 0 ? 1 : 0}${c.z > 0 ? 1 : 0}`;
      const h = wheel ? car.hubOf.get(key) : null;
      const kind = wheel ? (c.z > 0 ? 2 : 1) : t.sw === TAIL_LAMP ? 3 : 0;
      for (let k = 0; k < 3; k++) {
        const vi = t.ids[k];
        pos.push(local[k].x, local[k].y, local[k].z);
        n.fromBufferAttribute(g.attributes.normal, vi).applyMatrix3(nm).applyMatrix4(rot).normalize();
        nor.push(n.x, n.y, n.z);
        uv.fromBufferAttribute(g.attributes.uv, vi);
        uvs.push(uv.x, uv.y);
        carIdx.push(ci);
        hub.push(h?.x ?? 0, h?.y ?? 0, h?.z ?? 0, kind);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aCar', new THREE.Float32BufferAttribute(carIdx, 1));
  geo.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(120, 0, 56), 90);
  return geo;
}

// --- Shaders --------------------------------------------------------------------------------
// uCarA[i] = (x, z, yaw, y)   uCarB[i] = (wheel spin, steer, state, rear lamps)
// state: 0 parked (static mesh), 1 moving (life mesh), 2 away (not drawn).

const GLSL_COMMON = (n) => /* glsl */`
  uniform vec4 uCarA[${n}];
  uniform vec4 uCarB[${n}];
  uniform float uShow; // which state this mesh draws
  attribute float aCar;
  attribute vec4 aHub;
  mat3 carRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 carRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  vec3 carWheel(vec3 p, vec4 b) {
    if (aHub.w < 0.5 || aHub.w > 2.5) return p;
    vec3 q = carRotX(b.x) * (p - aHub.xyz);
    if (aHub.w > 1.5) q = carRotY(b.y) * q;
    return aHub.xyz + q;
  }
  vec3 carWheelDir(vec3 d, vec4 b) {
    if (aHub.w < 0.5 || aHub.w > 2.5) return d;
    d = carRotX(b.x) * d;
    if (aHub.w > 1.5) d = carRotY(b.y) * d;
    return d;
  }
`;

const GLSL_PLACE = /* glsl */`
  vec4 cA = uCarA[int(aCar + 0.5)];
  vec4 cB = uCarB[int(aCar + 0.5)];
  float carShown = 1.0 - step(0.5, abs(cB.z - uShow));
  transformed = (carRotY(cA.z) * carWheel(transformed, cB) + vec3(cA.x, cA.w, cA.y)) * carShown;
`;

function carMaterial(base, uniforms, n, show) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uShow: { value: show } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON(n)}\nvarying float vLamp;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec4 nB = uCarB[int(aCar + 0.5)];
          objectNormal = carRotY(uCarA[int(aCar + 0.5)].z) * carWheelDir(objectNormal, nB);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_PLACE}\nvLamp = aHub.w > 2.5 ? cB.w : 0.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLamp;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.06, 0.03) * vLamp * 2.2;');
  };
  m.customProgramCacheKey = () => `life-car-${show}`;
  return m;
}

function depthMaterial(uniforms, n) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uShow: { value: 0 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON(n)}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_PLACE}`);
  };
  m.customProgramCacheKey = () => 'life-car-depth';
  return m;
}

/** The car flattened onto the asphalt along the sun: its shadow, drawn once per pixel. */
function shadowMaterial(uniforms, n, sunDir) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uShow: { value: 1 }, uSun: { value: sunDir.clone().normalize() }, uGround: { value: ASPHALT_Y } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON(n)}\nuniform vec3 uSun;\nuniform float uGround;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_PLACE}
        transformed -= uSun * ((transformed.y - uGround) / uSun.y);
        transformed.y = uGround * carShown;`);
  };
  m.customProgramCacheKey = () => 'life-car-shadow';
  return m;
}

function contactTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.filter = 'blur(10px)';
  g.fillStyle = '#000';
  g.fillRect(14, 14, 36, 100);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// --- Paths --------------------------------------------------------------------------------

const v2 = (x, z) => new THREE.Vector2(x, z);

/** Cubic Bézier piece [a, b, c, d] of [x, z] points. */
const bez = (a, b, c, d) => [a, b, c, d].map(([x, z]) => v2(x, z));
export const straight = (a, d) => bez(a, [a[0] + (d[0] - a[0]) / 3, a[1] + (d[1] - a[1]) / 3], [a[0] + (d[0] - a[0]) * 2 / 3, a[1] + (d[1] - a[1]) * 2 / 3], d);
const ARC = 0.5523; // control length of a quarter circle, × radius
/** Quarter turn from `a` (heading `ha`, unit [x, z]) to `d` (heading `hd`) of radius r. */
const quarter = (a, ha, d, hd, r) => bez(a, [a[0] + ha[0] * r * ARC, a[1] + ha[1] * r * ARC], [d[0] - hd[0] * r * ARC, d[1] - hd[1] * r * ARC], d);
/** S-bend between two parallel headings (a lane change), over its own length. */
const shift = (a, d, h) => {
  const k = Math.hypot(d[0] - a[0], d[1] - a[1]) * 0.45;
  return bez(a, [a[0] + h[0] * k, a[1] + h[1] * k], [d[0] - h[0] * k, d[1] - h[1] * k], d);
};

/**
 * A leg of a drive: pieces sampled every ~0.1 m, with the arc length, heading and curvature at each
 * sample, and a speed planned along it: the limit of the road, slower where it bends, accelerating
 * and braking gently, standing at the start and (if `stop`) at the end. `dir` −1: rolling backwards.
 */
export function makeLeg(pieces, dir, { vmax, stop = true }) {
  const pts = [];
  for (const [a, b, c, d] of pieces) {
    const n = Math.max(8, Math.ceil(a.distanceTo(d) * 10));
    for (let i = pts.length ? 1 : 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      pts.push(v2(
        u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
        u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
      ));
    }
  }
  const n = pts.length;
  const s = new Float32Array(n);
  const yaw = new Float32Array(n); // heading of the car body (its nose)
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + pts[i].distanceTo(pts[i - 1]);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    yaw[i] = Math.atan2((b.x - a.x) * dir, (b.y - a.y) * dir);
  }
  // Curvature (yaw change per metre of the car's own forward travel) and the speed it allows.
  const turn = new Float32Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    const dy = Math.atan2(Math.sin(yaw[b] - yaw[a]), Math.cos(yaw[b] - yaw[a]));
    turn[i] = dy / (Math.max(1e-4, s[b] - s[a]) * dir);
    const lim = typeof vmax === 'function' ? vmax(s[i], s[n - 1]) : vmax;
    v[i] = Math.min(lim, Math.sqrt(A_SIDE / Math.max(1e-3, Math.abs(turn[i]))));
  }
  // Forward pass: accelerate from standing; backward pass: brake in time for every bend and the stop.
  v[0] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * A_GO * (s[i] - s[i - 1])));
  if (stop) v[n - 1] = 0;
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * A_BRAKE * (s[i + 1] - s[i])));
  return { pts, s, yaw, turn, v, length: s[n - 1], dir, stop };
}

/** Position, heading, curvature and planned speed `d` metres along a leg. */
export function legAt(leg, d, out) {
  const { s } = leg;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
  const k = Math.min(1, Math.max(0, (d - s[lo]) / Math.max(1e-6, s[hi] - s[lo])));
  out.x = leg.pts[lo].x + (leg.pts[hi].x - leg.pts[lo].x) * k;
  out.z = leg.pts[lo].y + (leg.pts[hi].y - leg.pts[lo].y) * k;
  const dy = Math.atan2(Math.sin(leg.yaw[hi] - leg.yaw[lo]), Math.cos(leg.yaw[hi] - leg.yaw[lo]));
  out.yaw = leg.yaw[lo] + dy * k;
  out.turn = leg.turn[lo] + (leg.turn[hi] - leg.turn[lo]) * k;
  out.v = leg.v[lo] + (leg.v[hi] - leg.v[lo]) * k;
  return out;
}

/** Do two car footprints (centre x, z, nose heading, half length, half width) overlap? (SAT) */
function overlaps(a, b) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  const corners = (c) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [
    c.x + Math.sin(c.yaw) * c.hl * i + Math.cos(c.yaw) * c.hw * j,
    c.z + Math.cos(c.yaw) * c.hl * i - Math.sin(c.yaw) * c.hw * j,
  ]);
  const ca = corners(a);
  const cb = corners(b);
  return axes.every((t) => {
    const ax = Math.sin(t); const az = Math.cos(t);
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    return Math.max(...pa) > Math.min(...pb) && Math.max(...pb) > Math.min(...pa);
  });
}

// --- System ----------------------------------------------------------------------------------

export function createCars({ scene, root, sunDir, refreshShadows }, { still }) {
  if (import.meta.env.DEV && window.__bpNoCars) return null;
  const cars = extractCars(root);
  if (!cars.length) return null;
  const n = cars.length;
  clearBakedFootprints(root, cars);
  const uniforms = {
    uCarA: { value: cars.map((c) => new THREE.Vector4(c.x, c.z, c.yaw, c.y)) },
    uCarB: { value: cars.map(() => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const geo = carsGeometry(cars);
  const base = cars[0].tris[0].mesh.material;

  const parked = new THREE.Mesh(geo, carMaterial(base, uniforms, n, 0));
  parked.name = 'life_cars_parked';
  parked.castShadow = true;
  parked.receiveShadow = true;
  parked.customDepthMaterial = depthMaterial(uniforms, n);
  parked.frustumCulled = false;

  const moving = new THREE.Mesh(geo, gradeLife(carMaterial(base, uniforms, n, 1)));
  moving.name = 'life_cars_moving';
  moving.receiveShadow = true;
  moving.frustumCulled = false;
  moving.layers.set(LIFE_LAYER);
  moving.visible = false;

  const shadow = new THREE.Mesh(geo, shadowMaterial(uniforms, n, sunDir));
  shadow.name = 'life_cars_shadow';
  shadow.frustumCulled = false;
  shadow.renderOrder = 1;
  shadow.layers.set(LIFE_LAYER);
  shadow.visible = false;
  shadow.userData.noAO = true;

  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  );
  contact.name = 'life_car_contact';
  contact.renderOrder = 1;
  contact.layers.set(LIFE_LAYER);
  contact.visible = false;

  scene.add(parked, moving, shadow, contact);

  // Bays: the lot's painted stripes give the columns, the parked cars give the rows and how
  // cars stand in them (nose in).
  const rows = [];
  for (const c of cars) {
    const row = rows.find((r) => Math.abs(r.z - c.z) < 2.5);
    if (row) row.cars.push(c); else rows.push({ z: c.z, cars: [c] });
  }
  rows.forEach((r) => {
    r.z = r.cars.reduce((a, c) => a + c.z, 0) / r.cars.length;
    const nose = r.cars.reduce((a, c) => a + Math.cos(c.yaw), 0); // + → nose towards +z
    r.yaw = nose >= 0 ? 0 : Math.PI;
  });
  const columns = bayColumns(root, cars);
  const bays = rows.flatMap((r) => columns.map((x) => ({ x, z: r.z, yaw: r.yaw, car: null })));
  const bayOf = (c) => bays.reduce((best, b) => (Math.hypot(b.x - c.x, b.z - c.z) < Math.hypot(best.x - c.x, best.z - c.z) ? b : best), bays[0]);
  cars.forEach((c) => { c.bay = bayOf(c); c.bay.car = c; c.state = 0; });

  // The asphalt a car may use: the lot inside its hedge, and the driveway out to the east.
  const lotObj = root.getObjectByName('parking_lot');
  const lot = lotObj ? new THREE.Box3().setFromObject(lotObj) : new THREE.Box3(new THREE.Vector3(60, 0, 45), new THREE.Vector3(102, 0, 67));
  const driveway = root.getObjectByName('parking_driveway');
  const road = driveway ? new THREE.Box3().setFromObject(driveway) : new THREE.Box3(new THREE.Vector3(lot.max.x, 0, 53), new THREE.Vector3(170, 0, 59));
  const roadZ = (road.min.z + road.max.z) / 2;
  const exitX = lot.max.x;
  const LANE_OUT = roadZ + KEEP_RIGHT;
  const LANE_IN = roadZ - KEEP_RIGHT;
  const maxLen = Math.max(...cars.map((c) => c.length));
  // Where each row's bumpers end on the aisle side, and the aisle between them.
  const rowEdge = (r) => r.z + Math.cos(r.yaw) * -1 * (maxLen / 2); // nose in: the tail faces the aisle
  const north = rows.reduce((a, r) => (r.z < a.z ? r : a), rows[0]);
  const south = rows.reduce((a, r) => (r.z > a.z ? r : a), rows[0]);
  const aisle = { minZ: rowEdge(north), maxZ: rowEdge(south) };
  const aisleZ = (aisle.minZ + aisle.maxZ) / 2;

  // (The footprints checked against these already carry the CLEAR margin.)
  const inLot = (x, z) => x > lot.min.x && x < lot.max.x && z > lot.min.z && z < lot.max.z;
  const onRoad = (x, z) => x > lot.max.x - 1 && z > road.min.z && z < road.max.z;

  /** Backs out of a bay (tail swinging west, nose ends up east), then drives off down the driveway. */
  function leaveBay(car) {
    const { x, z } = car;
    const out = Math.sign(aisleZ - z); // +1: the aisle is towards +z
    const len = car.length;
    // Straight back until the nose has cleared the neighbours' tails, then the swing.
    const zc = rowEdge(z < aisleZ ? north : south) + out * (CLEAR + len / 2);
    const ze = zc + out * TURN_R;
    const back = makeLeg([straight([x, z], [x, zc]), quarter([x, zc], [0, out], [x - TURN_R, ze], [-1, 0], TURN_R)], -1, { vmax: V_REVERSE });
    const x0 = x - TURN_R;
    const pieces = [
      shift([x0, ze], [x0 + 12, LANE_OUT], [1, 0]),
      straight([x0 + 12, LANE_OUT], [FAR_X, LANE_OUT]),
    ];
    const go = makeLeg(pieces, 1, { vmax: (d) => (x0 + d > exitX ? V_ROAD : V_LOT), stop: false });
    return [back, go];
  }

  /** In from the trees on the westbound lane, swinging wide, nose first into the bay. */
  function enterBay(car, bay) {
    const into = Math.cos(bay.yaw) > 0 ? 1 : -1; // nose towards +z (1) or −z (−1)
    const zApp = aisleZ - into * 2.1; // wide of the turn: the tail clears the next car on the way in
    const zEnd = zApp + into * PARK_R;
    const xTurn = bay.x + PARK_R;
    // Off the driveway on its own lane, over to the approach line inside the lot, then the turn.
    const x1 = exitX - car.length / 2 - CLEAR; // the lane change starts once the tail is in the lot
    const x2 = Math.max(xTurn, x1 - 9);
    if (x1 - x2 < 6) return null; // too near the mouth of the driveway to swing in
    const pieces = [
      straight([FAR_X, LANE_IN], [x1, LANE_IN]),
      shift([x1, LANE_IN], [x2, zApp], [-1, 0]),
    ];
    if (x2 > xTurn + 0.01) pieces.push(straight([x2, zApp], [xTurn, zApp]));
    pieces.push(quarter([xTurn, zApp], [-1, 0], [bay.x, zEnd], [0, into], PARK_R));
    pieces.push(straight([bay.x, zEnd], [bay.x, bay.z]));
    return [makeLeg(pieces, 1, { vmax: (d, L) => (L - d > lotDist(pieces) ? V_ROAD : V_LOT) })];
  }
  const lotDist = (pieces) => pieces.slice(1).reduce((a, p) => a + p[0].distanceTo(p[3]) * 1.1, 0);

  /**
   * Checks a drive against the lot: every 0.25 m the car's footprint (plus CLEAR) must lie on the
   * asphalt and miss every other car standing in a bay. Bays too close to the west end to back out
   * of with the tail to the west are never used for coming and going.
   */
  let fitsWhy = null; // dev: why the last check failed
  function fits(car, legs) {
    if (!legs) return false;
    const others = cars.filter((c) => c !== car && c.state === 0 && c.bay !== car.bay);
    const p = {};
    for (const leg of legs) {
      for (let d = 0; d <= leg.length; d += 0.25) {
        legAt(leg, d, p);
        const box = { x: p.x, z: p.z, yaw: p.yaw, hl: car.length / 2 + CLEAR, hw: car.width / 2 + CLEAR };
        for (const [i, j] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
          const cx = box.x + Math.sin(box.yaw) * box.hl * i + Math.cos(box.yaw) * box.hw * j;
          const cz = box.z + Math.cos(box.yaw) * box.hl * i - Math.sin(box.yaw) * box.hw * j;
          if (!inLot(cx, cz) && !onRoad(cx, cz)) { fitsWhy = ['edge', +cx.toFixed(2), +cz.toFixed(2), +d.toFixed(2)]; return false; }
        }
        // In its own bay a car may stand as close to its neighbours as it is parked.
        const tight = Math.abs(p.z - (car.bay?.z ?? 1e9)) < car.length / 2 && Math.abs(p.x - (car.bay?.x ?? 1e9)) < 0.3;
        const own = { ...box, hl: car.length / 2 + (tight ? 0.02 : CLEAR * 0.6), hw: car.width / 2 + (tight ? 0.02 : CLEAR * 0.6) };
        const hit = others.find((o) => overlaps(own, { x: o.x, z: o.z, yaw: o.yaw, hl: o.length / 2, hw: o.width / 2 }));
        if (hit) { fitsWhy = ['car', +hit.x.toFixed(1), +hit.z.toFixed(1), +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2)]; return false; }
      }
    }
    return true;
  }

  let staticChanged = false;
  let next = performance.now() / 1000 + rand(...FIRST_EVENT);
  let drive = null; // { car, legs, leg, d, v, steer, pause, arriving, spin }
  const at = {};

  function start(arriving) {
    let car;
    let legs;
    if (arriving) {
      const away = cars.filter((c) => c.state === 2);
      if (!away.length) return false;
      car = away[Math.floor(Math.random() * away.length)];
      const free = bays.filter((b) => !b.car).sort(() => Math.random() - 0.5);
      // A bay it can drive into, and later back out of again.
      const bay = free.find((b) => {
        const ghost = { ...car, x: b.x, z: b.z, yaw: b.yaw, bay: b };
        return fits(ghost, legs = enterBay(ghost, b)) && fits(ghost, leaveBay(ghost));
      });
      if (!bay) return false;
      bay.car = car;
      car.bay = bay;
    } else {
      const here = cars.filter((c) => c.state === 0).sort(() => Math.random() - 0.5);
      car = here.find((c) => fits(c, legs = leaveBay(c)));
      if (!car) return false;
      car.bay.car = null;
      // It leaves the baked world now: the shadow map and the cached frame are redrawn without it.
      staticChanged = true;
      refreshShadows();
    }
    drive = { car, legs, leg: 0, d: 0, v: 0, steer: 0, pause: arriving ? 0 : 0.8, arriving, spin: 0 };
    if (arriving) place(car, legs[0].pts[0].x, legs[0].pts[0].y, legs[0].yaw[0]);
    setState(car, 1);
    return true;
  }

  function setState(car, s) {
    car.state = s;
    uniforms.uCarB.value[cars.indexOf(car)].z = s;
  }

  function place(car, x, z, yaw) {
    car.x = x; car.z = z; car.yaw = yaw;
    const a = uniforms.uCarA.value[cars.indexOf(car)];
    a.set(x, z, yaw, car.y);
  }

  function step(dt) {
    const { car } = drive;
    const leg = drive.legs[drive.leg];
    const b = uniforms.uCarB.value[cars.indexOf(car)];
    if (drive.pause > 0) {
      drive.pause -= dt;
      b.w = 1; // foot on the brake
      return;
    }
    // Follow the planned speed (a short lag smooths the start of each leg).
    const planned = legAt(leg, Math.min(leg.length, drive.d + 0.2), at).v; // a step ahead: never stuck at 0
    drive.v += (Math.max(planned, 0.12) - drive.v) * Math.min(1, dt * 6); // creeps the last centimetres
    const ds = Math.min(leg.length - drive.d, drive.v * dt);
    drive.d += ds;
    legAt(leg, drive.d, at);
    place(car, at.x, at.z, at.yaw);
    // Front wheels from the curvature of the car's own track; they spin by the distance rolled.
    const steer = THREE.MathUtils.clamp(Math.atan(car.wheelbase * at.turn), -0.6, 0.6);
    drive.steer += (steer - drive.steer) * Math.min(1, dt * 8);
    drive.spin += (ds * leg.dir) / car.radius;
    b.x = drive.spin;
    b.y = drive.steer;
    const ahead = legAt(leg, Math.min(leg.length, drive.d + 1.2), {}).v;
    b.w = leg.dir < 0 || ahead < drive.v - 0.15 || (leg.stop && leg.length - drive.d < 0.3) ? 1 : 0;

    if (drive.d >= leg.length - 1e-3) {
      if (drive.leg < drive.legs.length - 1) {
        drive.leg++;
        drive.d = 0;
        drive.v = 0;
        drive.pause = 0.7; // shift from reverse to drive
      } else if (drive.arriving) {
        // Parked: back into the baked world, shadow map redrawn with it.
        place(car, car.bay.x, car.bay.z, car.bay.yaw);
        b.set(drive.spin, 0, 0, 0);
        setState(car, 0);
        staticChanged = true;
        refreshShadows();
        drive = null;
      } else {
        setState(car, 2);
        b.w = 0;
        drive = null;
      }
    }
  }

  function updateMovingVisuals() {
    const on = !!drive;
    moving.visible = on;
    shadow.visible = on;
    contact.visible = on;
    if (!on) return;
    const { car } = drive;
    contact.position.set(car.x, ASPHALT_Y + 0.004, car.z);
    contact.rotation.y = car.yaw;
    contact.scale.set(car.width * 1.05, 1, car.length * 1.02);
  }

  return {
    name: 'cars',
    tick(t, dt) {
      if (still) return false;
      const now = performance.now() / 1000;
      if (!drive && now > next) {
        const here = cars.filter((c) => c.state === 0).length;
        const arriving = here <= Math.round(n * 0.65) || (here < n && Math.random() < 0.45);
        if (!start(arriving)) start(!arriving);
        next = now + rand(...EVERY);
      }
      if (drive) step(Math.min(dt, 0.05));
      updateMovingVisuals();
      return !!drive;
    },
    takeStaticChange() {
      const c = staticChanged;
      staticChanged = false;
      return c;
    },
    debug: () => ({ cars: n, parked: cars.filter((c) => c.state === 0).length, away: cars.filter((c) => c.state === 2).length, moving: drive ? { idx: cars.indexOf(drive.car), leg: drive.leg, d: +drive.d.toFixed(1), v: +drive.v.toFixed(2), arriving: drive.arriving } : null, bays: bays.length }),
    info: () => ({ cars: cars.map((c) => ({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(3), L: +c.length.toFixed(2), W: +c.width.toFixed(2), state: c.state })), aisle, aisleZ, exitX, roadZ }),
    /** Dev: which bays can a car leave from / park in right now. */
    check() {
      const probe = cars[0];
      return bays.map((b) => {
        const ghost = { ...probe, x: b.x, z: b.z, yaw: b.yaw, bay: b, state: 2 };
        const who = b.car ?? ghost;
        const leave = fits(who, leaveBay(who));
        const whyL = fitsWhy;
        const enter = !b.car && fits(ghost, enterBay(ghost, b));
        return { x: +b.x.toFixed(1), z: +b.z.toFixed(1), taken: !!b.car, leave, enter, whyL, whyE: fitsWhy };
      });
    },
    /** Dev: start the next event now. */
    trigger(arriving) { if (!drive) start(arriving ?? Math.random() < 0.5); },
    /** Dev: path samples of the current drive. */
    track: () => drive?.legs.map((l) => l.pts.filter((_, i) => i % 5 === 0).map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)])),
    plan: () => drive?.legs.map((l) => Array.from(l.v).filter((_, i) => i % 5 === 0).map((v, i) => `${(l.s[i * 5]).toFixed(1)}:${v.toFixed(2)}/${l.turn[i * 5].toFixed(2)}/${l.yaw[i * 5].toFixed(2)}`).join(' ')),
  };
}

/**
 * The car park's baked lightmap (sky light, Cycles) was baked with the cars standing on it: under
 * each one the asphalt is nearly black. A car that drives off would leave that hole behind, so the
 * footprints are filled in from the asphalt around them (a soft, slightly darker patch, like any
 * well-used bay). Parked cars keep their contact shadow from the sun shadow map and the AO pass.
 */
function clearBakedFootprints(root, cars) {
  const lot = root.getObjectByName('parking_lot');
  const tex = lot?.material?.lightMap;
  const uv1 = lot?.geometry.attributes.uv1;
  if (!tex?.image?.width || !uv1 || !lot.geometry.index) return;
  // World (x, z) → lightmap pixel, affine over the lot's flat quad.
  lot.updateWorldMatrix(true, false);
  const [a, b, c] = [0, 1, 2].map((k) => lot.geometry.index.getX(k));
  const P = [a, b, c].map((i) => new THREE.Vector3().fromBufferAttribute(lot.geometry.attributes.position, i).applyMatrix4(lot.matrixWorld));
  const U = [a, b, c].map((i) => new THREE.Vector2().fromBufferAttribute(uv1, i));
  const W = tex.image.width;
  const H = tex.image.height;
  const m = new THREE.Matrix3().set(P[0].x, P[0].z, 1, P[1].x, P[1].z, 1, P[2].x, P[2].z, 1).invert();
  const solve = (vals) => new THREE.Vector3(...vals).applyMatrix3(m); // coefficients of x, z, 1
  const cu = solve(U.map((u) => u.x * W));
  const cv = solve(U.map((u) => u.y * H));
  const px = (x, z) => [cu.x * x + cu.y * z + cu.z, cv.x * x + cv.y * z + cv.z];

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(tex.image, 0, 0);
  const margin = 0.18;
  for (const car of cars) {
    const fx = Math.sin(car.yaw); const fz = Math.cos(car.yaw);
    const rx = fz; const rz = -fx;
    const hw = car.width / 2 + margin;
    const hl = car.length / 2 + margin;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => px(car.x + rx * hw * i + fx * hl * j, car.z + rz * hw * i + fz * hl * j));
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q[0]))) - 2);
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q[1]))) - 2);
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((q) => q[0]))) + 2);
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((q) => q[1]))) + 2);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const img = g.getImageData(x0, y0, w, h);
    const src = img.data.slice();
    const read = (x, z) => {
      const [u, v] = px(x, z);
      const i = (Math.min(h - 1, Math.max(0, Math.round(v) - y0)) * w + Math.min(w - 1, Math.max(0, Math.round(u) - x0))) * 4;
      return [src[i], src[i + 1], src[i + 2]];
    };
    // Pixel → world: invert the 2×2 part of the affine map.
    const det = cu.x * cv.y - cu.y * cv.x;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const du = x0 + xx + 0.5 - cu.z;
        const dv = y0 + yy + 0.5 - cv.z;
        const wx = (cv.y * du - cu.y * dv) / det;
        const wz = (-cv.x * du + cu.x * dv) / det;
        const lr = (wx - car.x) * rx + (wz - car.z) * rz; // across
        const lf = (wx - car.x) * fx + (wz - car.z) * fz; // along
        if (Math.abs(lr) > hw || Math.abs(lf) > hl) continue;
        const tA = (lr + hw) / (2 * hw);
        const tB = (lf + hl) / (2 * hl);
        const left = read(car.x - rx * hw + fx * lf, car.z - rz * hw + fz * lf);
        const right = read(car.x + rx * hw + fx * lf, car.z + rz * hw + fz * lf);
        const back = read(car.x + rx * lr - fx * hl, car.z + rz * lr - fz * hl);
        const front = read(car.x + rx * lr + fx * hl, car.z + rz * lr + fz * hl);
        // Nearer edges count more; the middle of the bay settles a touch darker than the aisle.
        const wa = 1 / (Math.min(tA, 1 - tA) + 0.05);
        const wb = 1 / (Math.min(tB, 1 - tB) + 0.05);
        const i = (yy * w + xx) * 4;
        for (let k = 0; k < 3; k++) {
          const across = left[k] + (right[k] - left[k]) * tA;
          const along = back[k] + (front[k] - back[k]) * tB;
          img.data[i + k] = ((across * wa + along * wb) / (wa + wb)) * 0.96;
        }
      }
    }
    g.putImageData(img, x0, y0);
  }
  tex.image = canvas;
  tex.needsUpdate = true;
}

/** Bay centres along x: midway between the painted stripes, or a 2.6 m grid around the cars. */
function bayColumns(root, cars) {
  const lines = root.getObjectByName('parking_lines');
  const xs = new Set();
  if (lines?.isMesh) {
    lines.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const pos = lines.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) xs.add(Math.round(p.fromBufferAttribute(pos, i).applyMatrix4(lines.matrixWorld).x * 5) / 5);
  }
  const stripes = [...xs].sort((a, b) => a - b).reduce((acc, x) => {
    if (acc.length && x - acc[acc.length - 1] < 0.5) acc[acc.length - 1] = (acc[acc.length - 1] + x) / 2; else acc.push(x);
    return acc;
  }, []);
  if (stripes.length > 2) return stripes.slice(1).map((x, i) => (x + stripes[i]) / 2);
  const x0 = Math.min(...cars.map((c) => c.x));
  return Array.from({ length: 15 }, (_, i) => x0 + i * 2.6);
}
