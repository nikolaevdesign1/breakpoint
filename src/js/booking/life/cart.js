import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { pathGrid } from './cat.js';
import { makeLeg, legAt } from './cars.js';
import { furniture } from './keeper.js';
import { liveSunDir } from './clock.js';
import { loadCartModel, fallbackCartModel, cartLight, cartMaterial, glassMaterial, groundHeights, createCartShadow } from './cart-look.js';
import { COURTS } from '../../shared/availability.js';

// The club's golf cart (round 7, "clublife"): a plain white two-seater utility cart with a canopy
// and a small cargo bed (a water cooler, a crate of bottles, two baskets of balls), driven by a
// member of staff along the footpaths. It drives from stop to stop (a court gate, the clubhouse,
// the groundskeeper's shed), waits there a little while things are dropped off, and goes on.
//
// It only drives where the paths are wide enough for it: the path mesh is rasterised on a 0.5 m
// grid, and a cell counts only if the whole cart's half-width plus a margin around it is path too
// (so it never clips a fence, a court or the hedge) and no bench or pole stands close. Routes are
// shortest paths on that grid, pulled straight where the way is clear and rounded at the corners;
// the speed along them is planned like the cars' (life/cars.js): gentle starts and stops, slow in
// the bends, wheels steered by the curvature. It slows and waits for anyone in front of it: the
// groundskeeper, the cat, the iguana.
//
// Round 8: the cart is a Blender model at real size (2.4 m long, 1.2 m wide, 1.8 m to the roof),
// loaded once the map is up, with one clean shadow along the live sun (see life/cart-look.js).

const CELL = 0.5;
const HALF_W = 0.6; // m: half the cart's width
const CLEAR = 0.3; // m kept to the path's edge
const PROP_CLEAR = 1.2; // m kept from benches, poles, lamp posts
const V_MAX = 3.0; // m/s on the paths (~11 km/h)
const WHEEL_R = 0.229;
const WHEELBASE = 1.64;
const STOP = [6, 14]; // s at a stop
const LOOK = 5; // m ahead it watches for people
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// --- Route grid -----------------------------------------------------------------------------

/** Path cells wide enough for the cart and clear of the furniture. */
function driveGrid(root, scene) {
  const g = pathGrid(root, CELL);
  if (!g) return null;
  const { nx, nz, ok } = g;
  const c0 = g.centre(0);
  g.x0 = c0.x - CELL / 2;
  g.z0 = c0.z - CELL / 2;
  // Distance (in cells) to the nearest non-path cell: two chamfer passes.
  const INF = 1e6;
  const dist = new Float32Array(nx * nz);
  for (let k = 0; k < dist.length; k++) dist[k] = ok[k] ? INF : 0;
  const D = Math.SQRT2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      if (i > 0) dist[k] = Math.min(dist[k], dist[k - 1] + 1);
      if (j > 0) dist[k] = Math.min(dist[k], dist[k - nx] + 1);
      if (i > 0 && j > 0) dist[k] = Math.min(dist[k], dist[k - nx - 1] + D);
      if (i < nx - 1 && j > 0) dist[k] = Math.min(dist[k], dist[k - nx + 1] + D);
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) dist[k] = Math.min(dist[k], 1);
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      if (i < nx - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1);
      if (j < nz - 1) dist[k] = Math.min(dist[k], dist[k + nx] + 1);
      if (i < nx - 1 && j < nz - 1) dist[k] = Math.min(dist[k], dist[k + nx + 1] + D);
      if (i > 0 && j < nz - 1) dist[k] = Math.min(dist[k], dist[k + nx - 1] + D);
    }
  }
  const need = (HALF_W + CLEAR) / CELL + 0.5;
  const drive = new Uint8Array(nx * nz);
  for (let k = 0; k < drive.length; k++) drive[k] = dist[k] >= need ? 1 : 0;
  // Keep clear of benches, poles and the like that stand on or by the paths.
  for (const [x, z] of furniture(scene)) {
    const r = Math.ceil(PROP_CLEAR / CELL);
    const c = g.cellAt(x, z);
    if (c < 0) continue;
    const ci = c % nx;
    const cj = Math.floor(c / nx);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di; const j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        if (Math.hypot(di, dj) * CELL <= PROP_CLEAR) drive[j * nx + i] = 0;
      }
    }
  }
  // …and of every smaller structure standing on the paved areas (the pergola, kiosks, planters):
  // meshes up to a few metres across and taller than a kerb.
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.name.startsWith('life_')) return;
    tmp.setFromObject(o);
    const w = tmp.max.x - tmp.min.x;
    const d = tmp.max.z - tmp.min.z;
    if (w * d > 160 || tmp.max.y - tmp.min.y < 0.3 || tmp.min.y > 2.2) return;
    const [i0, j0] = [Math.floor((tmp.min.x - HALF_W - CLEAR - g.x0) / CELL), Math.floor((tmp.min.z - HALF_W - CLEAR - g.z0) / CELL)];
    const [i1, j1] = [Math.ceil((tmp.max.x + HALF_W + CLEAR - g.x0) / CELL), Math.ceil((tmp.max.z + HALF_W + CLEAR - g.z0) / CELL)];
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) drive[j * nx + i] = 0;
    }
  });
  // The biggest connected piece only (a cart can't jump between islands).
  const comp = new Int32Array(nx * nz).fill(-1);
  let best = -1; let bestN = 0; let id = 0;
  for (let s = 0; s < drive.length; s++) {
    if (!drive[s] || comp[s] >= 0) continue;
    const stack = [s]; comp[s] = id; let n = 0;
    while (stack.length) {
      const q = stack.pop(); n++;
      const i = q % nx; const j = (q - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di; const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = b * nx + a;
        if (drive[m] && comp[m] < 0) { comp[m] = id; stack.push(m); }
      }
    }
    if (n > bestN) { bestN = n; best = id; }
    id++;
  }
  for (let k = 0; k < drive.length; k++) if (comp[k] !== best) drive[k] = 0;
  const cells = [];
  for (let k = 0; k < drive.length; k++) if (drive[k]) cells.push(k);
  return { ...g, drive, cells };
}

/** Shortest 8-way route on the drive grid (BFS), as world points, cell to cell. */
function gridRoute(g, from, to) {
  const { nx, nz, drive } = g;
  const prev = new Int32Array(drive.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (c === to) break;
    const i = c % nx; const j = (c - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (!drive[n] || prev[n] !== -1) continue;
      if (di && dj && (!drive[j * nx + a] || !drive[b * nx + i])) continue;
      prev[n] = c;
      queue.push(n);
    }
  }
  if (prev[to] === -1) return null;
  const out = [];
  for (let c = to; c !== from; c = prev[c]) out.push(g.centre(c));
  out.push(g.centre(from));
  return out.reverse();
}

/** Is the straight line a → b on drivable cells all the way? */
function clearLine(g, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(d / (CELL * 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = g.cellAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (c < 0 || !g.drive[c]) return false;
  }
  return true;
}

/** Grid route → corner points (string-pulled) → curve pieces with rounded corners. */
function smoothPieces(g, pts) {
  const keep = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(g, pts[i], pts[j])) j--;
    keep.push(pts[j]);
    i = j;
  }
  const v2 = (p) => new THREE.Vector2(p.x, p.z);
  const P = keep.map(v2);
  const pieces = [];
  let start = P[0];
  for (let k = 1; k < P.length; k++) {
    const c = P[k];
    if (k === P.length - 1) {
      pieces.push([start, start.clone().lerp(c, 1 / 3), start.clone().lerp(c, 2 / 3), c]);
      break;
    }
    const n = P[k + 1];
    const a = c.clone().sub(start);
    const b = n.clone().sub(c);
    const r = Math.min(2.6, a.length() * 0.45, b.length() * 0.45);
    const p1 = c.clone().addScaledVector(a.normalize(), -r);
    const p2 = c.clone().addScaledVector(b.normalize(), r);
    if (p1.distanceTo(start) > 0.01) pieces.push([start, start.clone().lerp(p1, 1 / 3), start.clone().lerp(p1, 2 / 3), p1]);
    pieces.push([p1, p1.clone().lerp(c, 0.55), p2.clone().lerp(c, 0.55), p2]);
    start = p2;
  }
  return pieces;
}

// --- System ---------------------------------------------------------------------------------

export function createCart(ctx, opts) {
  if (opts.still) return null;
  // Rasterising the paths takes a few frames' worth of work: done when the page is idle, not in
  // the frame after the map first shows.
  const sys = { name: 'cart', tick: () => false };
  const model = loadCartModel().catch((err) => {
    console.warn('[cart] model not loaded, using the simple one:', err?.message ?? err);
    return fallbackCartModel();
  });
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300));
  model.then((m) => idle(() => { const s = buildCart(ctx, opts, m); if (s) Object.assign(sys, s); }, { timeout: 2500 }));
  return sys;
}

function buildCart(ctx, { still }, model) {
  if (still) return null;
  const { scene, root, keeper, cat, iguana } = ctx;
  const g = driveGrid(root, scene);
  if (!g || g.cells.length < 50) return null;
  const sun = liveSunDir(ctx);

  // Stops: outside every court gate on the middle walk, the clubhouse front, the shed.
  const nearestDrive = (x, z, max = 6) => {
    let best = -1; let bestD = max * max;
    for (const c of g.cells) {
      const p = g.centre(c);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  const stops = [];
  for (const c of COURTS) {
    const apron = root.getObjectByName(`${c.id}_apron`);
    if (!apron) continue;
    const b = new THREE.Box3().setFromObject(apron);
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    // Beside the gate, not in front of it.
    const gz = cz > 0 ? b.min.z - 1.4 : b.max.z + 1.4;
    const cell = nearestDrive(cx + 2.4, gz, 3);
    if (cell >= 0) stops.push({ cell, name: c.id });
  }
  const house = root.getObjectByName('clubhouse_mesh001');
  if (house) {
    const b = new THREE.Box3().setFromObject(house);
    const cell = nearestDrive((b.min.x + b.max.x) / 2 - 8, b.max.z + 2.5, 6);
    if (cell >= 0) stops.push({ cell, name: 'clubhouse', long: true });
  }
  const shed = root.getObjectByName('storage_shed_mesh');
  if (shed) {
    const b = new THREE.Box3().setFromObject(shed);
    const cell = nearestDrive(b.max.x + 2, (b.min.z + b.max.z) / 2, 6);
    if (cell >= 0) stops.push({ cell, name: 'shed', long: true });
  }
  if (stops.length < 2) return null;

  // --- Meshes ---
  const light = cartLight(ctx, sun.dir);
  const paint = cartMaterial(light.U);
  const cart = new THREE.Group();
  cart.name = 'life_golf_cart';
  const bodyMesh = new THREE.Mesh(model.body, paint);
  bodyMesh.name = 'life_golf_cart_body';
  cart.add(bodyMesh);
  if (model.glass) {
    const glass = new THREE.Mesh(model.glass, glassMaterial());
    glass.name = 'life_golf_cart_glass';
    glass.renderOrder = 2;
    cart.add(glass);
  }
  const wheels = [];
  for (const { geo, centre, front } of model.wheels) {
    const pivot = new THREE.Group(); // steers
    pivot.position.copy(centre);
    const w = new THREE.Mesh(geo, paint); // spins
    w.name = 'life_golf_cart_wheel';
    pivot.add(w);
    cart.add(pivot);
    wheels.push({ pivot, w, front });
  }
  cart.traverse((o) => {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.receiveShadow = false; // the static shadow map reads unreliably in the cached-frame pass: lit the same in both
    o.userData.noAO = true;
  });
  scene.add(cart);

  // Shadow: one decal draped over the real ground, from a mask of the cart flattened along the sun.
  const pb = new THREE.Box3().setFromObject(root.getObjectByName('paths'));
  const heightAt = groundHeights(root, { minX: Math.max(pb.min.x, -36) - 14, maxX: pb.max.x + 14, minZ: pb.min.z - 14, maxZ: pb.max.z + 14 }, g.y);
  const shadow = createCartShadow(ctx, light.U, heightAt, g.y);
  shadow.setParts([bodyMesh, ...wheels.map((w) => w.w)]);
  shadow.decal.layers.set(LIFE_LAYER);
  scene.add(shadow.decal);

  // --- Driving ---
  const st = {
    at: pick(stops),
    leg: null,
    d: 0,
    v: 0,
    steer: 0,
    spin: 0,
    wait: rand(2, 6),
    x: 0, z: 0, yaw: 0,
    blocked: 0,
  };
  {
    const p = g.centre(st.at.cell);
    st.x = p.x; st.z = p.z; st.yaw = Math.random() * Math.PI * 2;
  }

  function plan(to) {
    const from = g.cellAt(st.x, st.z);
    const start = from >= 0 && g.drive[from] ? from : nearestDrive(st.x, st.z, 8);
    if (start < 0) return null;
    const pts = gridRoute(g, start, to.cell);
    if (!pts || pts.length < 3) return null;
    pts[0] = new THREE.Vector3(st.x, g.y, st.z);
    // Leave along the way it faces when that is clear: no turning on the spot.
    const ahead = new THREE.Vector3(st.x + Math.sin(st.yaw) * 2.2, g.y, st.z + Math.cos(st.yaw) * 2.2);
    if (clearLine(g, pts[0], ahead) && ahead.distanceTo(pts[Math.min(6, pts.length - 1)]) < pts[0].distanceTo(pts[Math.min(6, pts.length - 1)])) pts.splice(1, 0, ahead);
    return makeLeg(smoothPieces(g, pts), 1, { vmax: V_MAX });
  }

  function next() {
    const options = stops.filter((s) => s !== st.at);
    for (let tries = 0; tries < 6; tries++) {
      const to = pick(options);
      const leg = plan(to);
      if (leg && leg.length > 8) {
        st.leg = leg; st.to = to; st.d = 0; st.v = 0;
        return;
      }
    }
    st.wait = 5;
  }

  /** Someone within LOOK metres ahead, in the cart's lane: how far. */
  function blockedAhead() {
    let near = Infinity;
    const fx = Math.sin(st.yaw); const fz = Math.cos(st.yaw);
    for (const [sys, who] of [[keeper, keeper?.where?.()], [cat, cat?.where?.()], [iguana, iguana?.where?.()]]) {
      if (!who) continue;
      const dx = who.x - st.x; const dz = who.z - st.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < LOOK + 1.4 && side < HALF_W + 0.9) {
        near = Math.min(near, along - 1.4);
        if (sys === iguana) iguana.scare?.(); // a lizard on the path dashes off as the cart rolls up
      }
    }
    return near;
  }

  const at = {};
  function drive(dt) {
    if (!st.leg) {
      st.wait -= dt;
      if (st.wait <= 0) next();
      return;
    }
    const leg = st.leg;
    const planned = legAt(leg, Math.min(leg.length, st.d + 0.2), at).v;
    let target = Math.max(planned, 0.15);
    const gap = blockedAhead();
    if (gap < LOOK) {
      target = Math.min(target, Math.max(0, (gap - 0.6) * 0.8)); // ease to a stop a little short
      st.blocked += dt;
      if (st.blocked > 12 && st.v < 0.05) { st.blocked = 0; next(); return; } // someone settled in the way: go elsewhere
    } else st.blocked = 0;
    st.v += (target - st.v) * Math.min(1, dt * (target < st.v ? 4 : 2));
    const ds = Math.min(leg.length - st.d, st.v * dt);
    st.d += ds;
    legAt(leg, st.d, at);
    st.x = at.x; st.z = at.z; st.yaw = at.yaw;
    const steer = THREE.MathUtils.clamp(Math.atan(WHEELBASE * at.turn), -0.6, 0.6);
    st.steer += (steer - st.steer) * Math.min(1, dt * 8);
    st.spin += ds / WHEEL_R;
    if (st.d >= leg.length - 0.02) {
      st.at = st.to;
      st.leg = null;
      st.v = 0;
      st.wait = st.at.long ? rand(14, 30) : rand(...STOP);
    }
  }

  function place() {
    cart.position.set(st.x, g.y, st.z);
    cart.rotation.y = st.yaw;
    for (const w of wheels) {
      w.pivot.rotation.y = w.front ? st.steer : 0;
      w.w.rotation.x = st.spin;
    }
    cart.updateMatrixWorld(true);
    light.update(cart);
    shadow.update(cart);
  }
  place();

  let last = performance.now() / 1000;
  let first = true;
  return {
    name: 'cart',
    tick() {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      sun.update();
      const moving = !!st.leg;
      drive(dt);
      place();
      const out = first || moving || !!st.leg;
      first = false;
      return out;
    },
    debug: () => ({ x: +st.x.toFixed(1), z: +st.z.toFixed(1), v: +st.v.toFixed(2), to: st.to?.name, at: st.at?.name, d: st.leg ? `${st.d.toFixed(0)}/${st.leg.length.toFixed(0)}` : null, wait: +st.wait.toFixed(1), stops: stops.length, cells: g.cells.length }),
    where: () => ({ x: st.x, z: st.z }),
    /** Dev: the shadow's mask target and the ground heights it drapes over. */
    look: { shadow, heightAt, model: model.source },
    /** Dev: drive to a stop now (`name`: a court id, 'clubhouse', 'shed'); `skip` metres of it done. */
    trigger(name, skip = 0) {
      const to = stops.find((s) => s.name === name) ?? pick(stops.filter((s) => s !== st.at));
      const leg = plan(to);
      if (!leg) return false;
      st.leg = leg; st.to = to; st.d = Math.min(skip, leg.length - 1); st.v = 1.5;
      return { length: +leg.length.toFixed(1), to: to.name };
    },
    /** Dev: put the cart at a stop. */
    park(name) {
      const s = stops.find((x) => x.name === name);
      if (!s) return false;
      const p = g.centre(s.cell);
      st.at = s; st.leg = null; st.x = p.x; st.z = p.z; st.wait = 1e9;
      place();
      return true;
    },
    stops: () => stops.map((s) => { const p = g.centre(s.cell); return [s.name, +p.x.toFixed(1), +p.z.toFixed(1)]; }),
    track: () => st.leg?.pts.filter((_, i) => i % 10 === 0).map((p) => [+p.x.toFixed(1), +p.y.toFixed(1)]),
  };
}
