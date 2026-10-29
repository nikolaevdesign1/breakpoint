import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { weatherSky } from '../life/sky.js';
import { gradeLife } from '../lookdev.js';
import { builder, loft, wingStrip, birdMaterial, shadowMaterial } from '../life/birds.js';
import { SHOW_COURT } from '../../shared/tournaments.js';
import { courtPick } from './court-pick.js';
import { wingClatter } from './sounds.js';

// Round 9 (row 28): pigeons on an empty court. Now and then by day a small flock of feral pigeons
// comes down onto the net (or the top rail of the fence) of a free court near where the visitor is
// looking: they swoop in, flare, and sit in a row, shuffling round now and then. When players come
// on, or the cat, the groundskeeper or the cart comes close, they clatter off all at once and are
// gone. Round 10: some flocks come down on the court itself and walk about pecking (heads bobbing,
// now and then a short flutter), the others take the net or the fence; wings beat in a shorter
// stroke with a flutter on landing. Built the birds.js way: lofted body, wings folded in the vertex shader, the shadow the same
// mesh flattened along the sun. Perched birds use a wingless body (the wings lie along it).

const FIRST = [16, 30]; // s after the life starts
const EVERY = [40, 90]; // s between visits
const STAY = [50, 110]; // s on the net when nothing disturbs them
const SEEK = 46; // m from the view centre: courts further away are not chosen
const FLY_IN = [2.6, 3.4]; // s
const FLY_OUT = 2.4; // s
const SCARE = { cat: 6, keeper: 7, cart: 9 }; // m
const MIN_PX = 8; // a pigeon's length on screen at least (at drone height a true-size one is a speck)
const SCALE = [1, 1.9]; // round 10: true size, only lifted a little when the view is far away
const LEN = 0.32; // m
const rand = (a, b) => a + Math.random() * (b - a);

// --- Geometry: feet at y = 0, +z forward ---
const BACK = '#8f949c'; const BELLY = '#7d828a'; const NECK = '#5e6d69'; const HEAD = '#7a7f88';
const WING = '#a2a7af'; const BAR = '#4b4e55'; const PRIM = '#3e4046'; const BEAK = '#3a3532'; const UNDER = '#c4c7cc';

function body(b, perched) {
  const w = perched ? WING : BACK; // perched: the folded wings cover the back
  loft(b, [
    [-0.17, 0.0, 0.0, 0.075, PRIM, PRIM],
    [-0.15, 0.03, 0.008, 0.078, PRIM, PRIM],
    [-0.1, 0.045, 0.026, 0.088, perched ? BAR : BACK, BELLY],
    [-0.04, 0.072, 0.058, 0.1, w, BELLY],
    [0.03, 0.078, 0.066, 0.106, w, BELLY],
    [0.08, 0.06, 0.054, 0.13, NECK, NECK],
    [0.11, 0.036, 0.036, 0.168, NECK, NECK],
    [0.135, 0.03, 0.03, 0.188, HEAD, HEAD],
    [0.16, 0.02, 0.02, 0.19, HEAD, HEAD],
    [0.165, 0.007, 0.007, 0.186, BEAK, BEAK],
    [0.19, 0.0, 0.0, 0.182, BEAK, BEAK],
  ], 6);
}

function perchedGeometry() {
  const b = builder();
  body(b, true);
  // Legs: two short pink strokes under the body.
  for (const side of [-1, 1]) {
    const x = side * 0.02;
    b.v(x - 0.006, 0.05, 0.01, '#b56a6a'); b.v(x + 0.006, 0.05, 0.01, '#b56a6a'); b.v(x, 0.0, 0.015, '#b56a6a');
  }
  return b.geometry();
}

function flyingGeometry() {
  const b = builder();
  body(b, false);
  for (const side of [-1, 1]) {
    wingStrip(b, side, 0.04, 0.33, 0.11, [
      [0.0, 0.06, -0.08, 0.1, WING, UNDER],
      [0.3, 0.07, -0.085, 0.1, WING, UNDER],
      [0.42, 0.065, -0.085, 0.1, BAR, UNDER],
      [0.52, 0.06, -0.08, 0.1, WING, UNDER],
      [0.78, 0.045, -0.065, 0.095, PRIM, PRIM],
      [1.0, 0.015, -0.035, 0.085, PRIM, PRIM],
    ]);
  }
  return b.geometry();
}

export function createPigeons(ctx, { still, players, padel, lessons, kids, keeper, cat, cart, tournament }) {
  if (still) return null;
  const { scene, camera, rig, sunDir } = ctx;
  const pick = courtPick(ctx);
  if (!pick.all().length) return null;

  const MAX = 7;
  const mk = (geo, name) => {
    geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, gradeLife(birdMaterial()), MAX);
    const shadow = new THREE.InstancedMesh(geo, shadowMaterial(sunDir, 0.28), MAX);
    for (const o of [mesh, shadow]) {
      o.layers.set(LIFE_LAYER);
      o.frustumCulled = false;
      o.visible = false;
      o.count = 0;
      o.userData.noAO = true;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.name = `life_${name}`;
    shadow.name = `life_${name}_shadow`;
    shadow.renderOrder = 1;
    scene.add(mesh, shadow);
    return { mesh, shadow, fold: geo.attributes.aFold };
  };
  const flying = mk(flyingGeometry(), 'pigeons_flying');
  const sitting = mk(perchedGeometry(), 'pigeons_perched');

  let flock = null; // { id, birds, leaveAt, leaving }
  let next = performance.now() / 1000 + rand(...FIRST);
  let lastCheck = 0;
  let lastTick = performance.now() / 1000;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // --- Where they may sit ---
  function busy(id) {
    if (players?.game?.(id) || padel?.game?.(id)) return true;
    if (lessons?.courts?.().includes(id)) return true;
    if (kids?.debug?.()?.court === id) return true;
    const k = keeper?.debug?.();
    if (k?.active && k.court === id) return true;
    return id === SHOW_COURT && !!tournament?.debug?.()?.shown;
  }

  /** Perches along the net (or the fence top) of a court: positions, the way they face. */
  function perches(c, n) {
    const { min, max } = c.box;
    const alongX = max.x - min.x > max.z - min.z;
    const padelCourt = c.court.type === 'padel';
    const y0 = max.y;
    const midA = alongX ? (min.x + max.x) / 2 : (min.z + max.z) / 2; // along the long axis
    const midL = alongX ? (min.z + max.z) / 2 : (min.x + max.x) / 2; // across
    const ground = Math.random() < 0.45;
    if (ground) {
      // Round 10: scattered on the court surface round one spot, each with its own errand.
      const cx = (min.x + max.x) / 2 + rand(-3, 3);
      const cz = (min.z + max.z) / 2 + rand(-3, 3);
      return Array.from({ length: n }, () => ({ p: new THREE.Vector3(cx + rand(-1.6, 1.6), y0, cz + rand(-1.6, 1.6)), yaw: rand(0, Math.PI * 2), ground: { cx, cz, r: 3.2, walk: false, until: performance.now() / 1000 + rand(0.5, 3), to: null, ph: rand(0, 6.28) } }));
    }
    const onNet = Math.random() < 0.7;
    const half = padelCourt ? 5 : 6.4;
    const out = [];
    const spacing = 0.55;
    let s = rand(-half + 0.8, half - 0.8 - spacing * n);
    const fenceSide = Math.random() < 0.5 ? -1 : 1;
    const fenceL = alongX ? (fenceSide < 0 ? min.z : max.z) : (fenceSide < 0 ? min.x : max.x);
    for (let i = 0; i < n; i++) {
      s += spacing * rand(0.8, 1.6);
      let a; let l; let y;
      if (onNet) {
        const off = Math.abs(s);
        a = midA; l = midL + s;
        y = y0 + (padelCourt ? 0.88 + 0.04 * off / half : 0.914 + 0.156 * off / half);
      } else {
        a = midA + s * 1.4; l = fenceL; y = y0 + 3.97;
      }
      // Facing across the net (either side), or into / out of the court from the fence.
      const face = Math.random() < 0.5 ? 1 : -1;
      const yaw = onNet ? (alongX ? face * Math.PI / 2 : (face > 0 ? 0 : Math.PI)) : (alongX ? (face > 0 ? 0 : Math.PI) : face * Math.PI / 2);
      out.push({ p: new THREE.Vector3(alongX ? a : l, y, alongX ? l : a), yaw: yaw + rand(-0.25, 0.25) });
    }
    return out;
  }

  function choose() {
    const v = rig.state;
    const free = pick.all().filter((c) => !busy(c.court.id)).map((c) => {
      const x = (c.box.min.x + c.box.max.x) / 2;
      const z = (c.box.min.z + c.box.max.z) / 2;
      return { c, d: Math.hypot(x - v.x, z - v.z) };
    }).filter((o) => o.d < SEEK).sort((a, b) => a.d - b.d);
    return free.length ? free[Math.floor(Math.random() * Math.min(3, free.length))].c : null;
  }

  function arrive(c) {
    const now = performance.now() / 1000;
    const n = 3 + Math.floor(Math.random() * 4);
    const from = rand(0, Math.PI * 2);
    const birds = perches(c, n).map((p, i) => {
      const dir = new THREE.Vector3(Math.sin(from + rand(-0.3, 0.3)), 0, Math.cos(from + rand(-0.3, 0.3)));
      return {
        ...p,
        a: p.p.clone().addScaledVector(dir, rand(22, 28)).setY(p.p.y + rand(9, 13)),
        b: p.p.clone().addScaledVector(dir, rand(4, 6)).setY(p.p.y + rand(1.5, 2.5)),
        t0: now + i * rand(0.12, 0.3), dur: rand(...FLY_IN),
        state: 'in', beat: rand(7, 9), ph: rand(0, 6.28), turnAt: now + rand(4, 10),
      };
    });
    flock = { id: c.court.id, birds, leaveAt: now + rand(...STAY), leaving: false };
  }

  function leave(from) {
    if (!flock || flock.leaving) return;
    const now = performance.now() / 1000;
    flock.leaving = true;
    let pan = 0;
    for (const [i, b] of flock.birds.entries()) {
      const away = from ? new THREE.Vector3(b.p.x - from.x, 0, b.p.z - from.z) : new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
      if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
      away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.5, 0.5));
      const start = b.state === 'in' ? flyPos(b, now, new THREE.Vector3()) : b.p.clone();
      Object.assign(b, {
        state: 'out', a: start, b: start.clone().addScaledVector(away, rand(3, 5)).setY(start.y + rand(1.5, 3)),
        c: start.clone().addScaledVector(away, rand(30, 38)).setY(start.y + rand(12, 16)),
        t0: now + i * rand(0.02, 0.12), dur: FLY_OUT * rand(0.9, 1.15), beat: rand(9, 11),
      });
      pan = rig.screenOf(start.x, start.z).x;
    }
    const v = rig.state;
    const d = Math.hypot(flock.birds[0].p.x - v.x, flock.birds[0].p.z - v.z);
    wingClatter(THREE.MathUtils.clamp(1 - d / 60, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.4, 1.2), (pan / innerWidth) * 2 - 1, flock.birds.length);
  }

  // --- Motion ---
  const angleTo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();

  /** Position on the way in (a → b → perch) or out (a → b → c), eased. */
  function flyPos(b, now, out) {
    const u = THREE.MathUtils.clamp((now - b.t0) / b.dur, 0, 1);
    const k = b.state === 'in' ? 1 - (1 - u) ** 2.2 : u ** 1.6; // slows to land, speeds away
    const p0 = b.a; const p1 = b.b; const p2 = b.state === 'in' ? b.p : b.c;
    const w = 1 - k;
    return out.set(w * w * p0.x + 2 * w * k * p1.x + k * k * p2.x, w * w * p0.y + 2 * w * k * p1.y + k * k * p2.y, w * w * p0.z + 2 * w * k * p1.z + k * k * p2.z);
  }

  function threat() {
    const f = flock;
    if (busy(f.id)) return 'court';
    for (const [name, sys] of [['cat', cat], ['keeper', keeper], ['cart', cart]]) {
      const w = sys?.where?.();
      if (w && f.birds.some((b) => Math.hypot(w.x - b.p.x, w.z - b.p.z) < SCARE[name])) return w;
    }
    return null;
  }

  return {
    name: 'pigeons',
    tick() {
      const now = performance.now() / 1000;
      const day = weatherSky.day > 0.25 && weatherSky.storm < 0.3;
      if (!flock) {
        if (now < next) return false;
        const c = day ? choose() : null;
        if (!c) { next = now + rand(8, 14); return false; }
        arrive(c);
      }
      if (!flock.leaving && now - lastCheck > 0.25) {
        lastCheck = now;
        const t = threat();
        if (t) leave(t === 'court' ? null : t);
        else if (!day || now > flock.leaveAt) leave(null);
      }

      // Size: never a speck on screen.
      const first = flock.birds[0].p;
      const ppm = innerHeight / (2 * camera.position.distanceTo(first) * halfTan);
      const scale = THREE.MathUtils.clamp(MIN_PX / (LEN * ppm), ...SCALE);

      const dt = Math.min(0.1, now - lastTick);
      lastTick = now;
      let nf = 0; let ns = 0; let gone = 0; let moving = false;
      for (const b of flock.birds) {
        if (now < b.t0 && b.state === 'in') continue; // not here yet
        const u = (now - b.t0) / b.dur;
        if (b.state === 'out' && u >= 1) { gone++; continue; }
        if (b.state === 'in' && u >= 1) b.state = 'sit';
        if (b.state === 'sit') {
          // Now and then one shuffles round to face the other way, or half way.
          let pitch = 0;
          let lift = 0;
          if (b.ground) {
            // On the court: walk a few steps (head bobbing), stop and peck in bursts, now and then turn.
            const g = b.ground;
            if (now > g.until) {
              g.walk = !g.walk;
              g.until = now + (g.walk ? rand(1.2, 3.2) : rand(1.5, 4.5));
              if (g.walk) g.to = new THREE.Vector3(g.cx + rand(-g.r, g.r), b.p.y, g.cz + rand(-g.r, g.r));
            }
            if (g.walk) {
              const dx = g.to.x - b.p.x; const dz = g.to.z - b.p.z;
              const d = Math.hypot(dx, dz);
              b.yaw += angleTo(Math.atan2(dx, dz), b.yaw) * Math.min(1, dt * 6);
              if (d > 0.1) { b.p.x += (dx / d) * 0.38 * dt; b.p.z += (dz / d) * 0.38 * dt; } else g.until = 0;
              pitch = -0.1 * Math.sin(now * 14 + g.ph); // the head bob of a walking pigeon
              lift = Math.abs(Math.sin(now * 7 + g.ph)) * 0.01;
            } else {
              const wave = Math.max(0, Math.sin(now * 5.5 + g.ph * 3)) ** 3;
              pitch = 0.75 * wave * (Math.sin(now * 0.7 + g.ph) > -0.3 ? 1 : 0.2); // pecks in bursts
            }
          } else if (now > b.turnAt) { b.yaw += (Math.random() < 0.5 ? Math.PI : rand(-0.9, 0.9)); b.turnAt = now + rand(5, 14); }
          e.set(pitch, b.yaw, 0);
          b.p.y += lift;
          m4.compose(b.p, q.setFromEuler(e), sc.setScalar(scale));
          b.p.y -= lift;
          sitting.mesh.setMatrixAt(ns, m4);
          sitting.shadow.setMatrixAt(ns, m4);
          sitting.fold.setXY(ns, 0, 0);
          ns++;
          continue;
        }
        moving = true;
        const p = flyPos(b, now, tmp);
        // Heading along the way it is going; flapping hard, then wings spread to flare and land.
        const ahead = flyPos(b, now + 0.05, new THREE.Vector3()).sub(p);
        const yaw = Math.atan2(ahead.x, ahead.z);
        const climb = Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z) + 1e-4);
        const flare = b.state === 'in' ? THREE.MathUtils.smoothstep(u, 0.72, 0.95) : 0;
        e.set(-climb * 0.6 - flare * 0.5, yaw, 0);
        m4.compose(p, q.setFromEuler(e), sc.setScalar(scale));
        flying.mesh.setMatrixAt(nf, m4);
        flying.shadow.setMatrixAt(nf, m4);
        const glide = b.state === 'in' && u > 0.45 && u < 0.72;
        const ph = (now - b.t0) * b.beat * Math.PI * 2 + b.ph;
        const s = Math.sin(ph + 0.35 * Math.sin(ph));
        const amp = glide ? 0.08 : 0.75 * (1 - flare * 0.4) + flare * 0.2 * Math.sin(now * 31); // a flutter as it settles
        flying.fold.setXY(nf, 0.12 + amp * s + flare * 0.35, glide ? -0.05 : -0.35 * 0.5 * (1 - Math.cos(ph - 0.9)) + 0.1);
        nf++;
      }
      for (const [set, n] of [[flying, nf], [sitting, ns]]) {
        set.mesh.count = set.shadow.count = n;
        set.mesh.visible = set.shadow.visible = n > 0;
        set.mesh.instanceMatrix.needsUpdate = set.shadow.instanceMatrix.needsUpdate = true;
        set.fold.needsUpdate = true;
      }
      if (flock.leaving && gone === flock.birds.length) {
        flock = null;
        next = now + rand(...EVERY);
      }
      return moving || ns > 0;
    },
    debug: () => (flock ? { court: flock.id, leaving: flock.leaving, birds: flock.birds.map((b) => b.state).join(',') } : { next: +(next - performance.now() / 1000).toFixed(1) }),
    /** Dev: bring a flock to a court now (or the best free one), or scare it off. */
    trigger(id) {
      if (flock) return false;
      const c = id ? pick.byId(id) : choose();
      if (!c) return false;
      arrive(c);
      return true;
    },
    scare(x, z) { leave(x == null ? null : { x, z }); },
  };
}
