import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { courtHit, ambientBus } from '../ambient.js';
import { loadAtlas, writeFrame, hideFrame, framePair, mirrored } from './sprite.js';
import { softRect } from './geom.js';

// Shared parts of the coaching lessons and the kids group (round 8, life/lessons.js, life/kids.js):
// the coaches' and kids' flipbook atlas (scripts/life/render_lessons.py), a flipbook "actor" that
// plays facing clips (feed, stand, ready…) or eight-heading clips (walking with the hopper, running),
// the ball hopper on its stand, balls in flight that bounce, roll and stay on the court until they are
// picked up, the pock of a hit and the coach's whistle (both through the ambient sound bed).

const atlasUrl = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;
let shared = null;
/** The coaches' and kids' atlas, loaded once for both systems. */
export function loadLessonAtlas(quality) {
  shared ??= Promise.all([
    fetch('/models/life/lessons.json').then((r) => r.json()),
    loadAtlas(atlasUrl('lessons', quality)),
    loadAtlas(atlasUrl('lessons-shadow', quality)),
  ]).then(([data, bodyTex, shadowTex]) => ({ data, bodyTex, shadowTex }));
  return shared;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const G = 9.81;
export const BALL_R = 0.034;
export const BASELINE = 11.885;
export const SERVICE = 6.4;
export const SINGLES = 4.115;

// Which sprite coach stands in for which coach of the club (coaches-data.js): women, and a few men
// with the second male look; the rest get the first.
const WOMEN = new Set(['sofia-marquez', 'lena-hoffmann', 'camila-duarte', 'olivia-grant', 'nina-petrova', 'isabela-ferreira', 'yuki-tanaka']);
const SECOND = new Set(['daniel-okafor', 'marcus-bell', 'jordan-hayes', 'karim-haddad', 'ethan-brooks']);
export function coachVariant(coach, data) {
  const want = !coach ? 'coach_m' : WOMEN.has(coach.slug) ? 'coach_f' : SECOND.has(coach.slug) ? 'coach_b' : 'coach_m';
  return data.frames[want] ? want : Object.keys(data.frames).find((v) => v.startsWith('coach')) ?? want;
}

// --- Flipbook actors --------------------------------------------------------------------------------

const CUT = 0.1; // s: a change of clip blends from the last frame shown

/**
 * An actor: { data, variant, x, y, z, clip, facing ('away' | 'toward' …, or null for the
 * eight-heading clips), heading (rad, 0 = away from the camera, clockwise), clipT, mirror }.
 */
export function actor(data, variant, x, y, z, clip, facing) {
  return { data, variant, x, y, z, clip, facing, heading: 0, clipT: Math.random() * 2, mirror: false, shown: null, shownKey: '', cutFrom: null, cutAt: -1, hidden: false };
}

export function setClip(a, clip, facing, dt, rate = 1, mirror = false) {
  if (clip !== a.clip || facing !== a.facing) { a.clip = clip; a.facing = facing; a.clipT = 0; }
  a.mirror = mirror;
  a.clipT += dt * rate;
}

export const clipLength = (data, clip) => data.clips[clip].frames / (data.clips[clip].fps ?? data.fps);

/** Writes actor `a` into instance `slot` of `body` / `shadow` (sprite meshes on its atlas). */
export function writeActor(body, shadow, slot, a, now) {
  if (a.hidden) { hideFrame(body, slot); hideFrame(shadow, slot); return; }
  const { data } = a;
  const c = data.clips[a.clip];
  const fps = c.fps ?? data.fps;
  const set = data.frames[a.variant];
  const H8 = data.headings ?? 8;
  const bodyOf = (e, flip) => {
    const f = data.body[e[0]];
    return (!!e[2] !== flip) ? mirrored(f) : f;
  };
  let list;
  let a0;
  let b0;
  let ft;
  if (a.facing) {
    list = set[`${a.clip}|${a.facing}`];
    const [i, j, t] = framePair(list.length, fps, a.clipT, c.loop);
    a0 = bodyOf(list[i], a.mirror);
    b0 = bodyOf(list[j], a.mirror);
    ft = t;
  } else {
    // Eight headings: between two of them the frames cross-fade by the angle (as the keeper's).
    const hf = ((((a.heading / (Math.PI * 2)) * H8) % H8) + H8) % H8;
    const h0 = Math.floor(hf);
    const h1 = (h0 + 1) % H8;
    const ht = THREE.MathUtils.smoothstep(hf - h0, 0.38, 0.62);
    const l0 = set[`${a.clip}|h${h0}`];
    const l1 = set[`${a.clip}|h${h1}`];
    list = ht < 0.5 ? l0 : l1;
    const [i, j, t] = framePair(list.length, fps, a.clipT, c.loop);
    a0 = bodyOf(list[i], false);
    b0 = bodyOf(list[j], false);
    ft = t;
    if (ht > 0.02 && ht < 0.98) { a0 = bodyOf(l0[i], false); b0 = bodyOf(l1[i], false); ft = ht; }
  }
  const key = `${a.clip}|${a.facing}|${a.mirror}`;
  if (key !== a.shownKey) { a.cutFrom = a.shown; a.cutAt = now; a.shownKey = key; }
  if (a.cutFrom && now - a.cutAt < CUT) { b0 = a0; a0 = a.cutFrom; ft = (now - a.cutAt) / CUT; }
  a.shown = ft < 0.5 ? a0 : b0;
  writeFrame(body, slot, a0, b0, ft, a.x, a.y, a.z);
  const [si, sj, st] = framePair(list.length, fps, a.clipT, c.loop, data.shadowEvery ?? 1);
  const s0 = list[si][1];
  const s1 = list[sj][1];
  if (s0 >= 0) writeFrame(shadow, slot, data.shadow[s0], data.shadow[s1 >= 0 ? s1 : s0], st, a.x, a.y + 0.004, a.z);
  else hideFrame(shadow, slot);
}

/** Heading (rad, 0 = away from the camera, clockwise seen from above) of a step dx, dz. */
export const headingOf = (dx, dz) => Math.atan2(dx, -dz);

/**
 * Moves `a` along `a.path` (points { x, z, shuffle? }) at `speed` m/s, turning smoothly; returns
 * true while it is on the way.
 */
export function walkPath(a, dt, speed, turn = 5) {
  let left = speed * dt;
  while (left > 0 && a.path?.length) {
    const g = a.path[0];
    const dx = g.x - a.x;
    const dz = g.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.03 && !g.shuffle) {
      let dh = headingOf(dx, dz) - a.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      a.heading += THREE.MathUtils.clamp(dh, -turn * dt, turn * dt);
    }
    if (d <= left) {
      a.x = g.x; a.z = g.z;
      left -= d;
      a.path.shift();
    } else {
      a.x += (dx / d) * left;
      a.z += (dz / d) * left;
      left = 0;
    }
  }
  return !!a.path?.length;
}

// --- Balls ------------------------------------------------------------------------------------------

/** Velocity that leaves `from` and lands at `to` (court level `ground`) after `T` seconds. */
export function aimed(from, to, T, ground) {
  return new THREE.Vector3((to.x - from.x) / T, (ground + BALL_R - from.y + 0.5 * G * T * T) / T, (to.z - from.z) / T);
}

/** Lifts `v` (from `from`) so the ball clears the net at z = netZ by `clear` m over the court. */
export function overNet(from, v, netZ, ground, clear = 1.2) {
  const tNet = (netZ - from.z) / v.z;
  if (!(tNet > 0)) return v;
  const y = from.y + v.y * tNet - 0.5 * G * tNet * tNet;
  if (y < ground + clear) {
    v.y += (ground + clear - y) / tNet;
    v.x *= 0.94; v.z *= 0.94;
  }
  return v;
}

/**
 * A ball in flight from `p` with velocity `v` at time `t`: it bounces (clay keeps less) and then
 * rolls to a stop, staying inside `bounds` { x0, x1, z0, z1 }. Returns a track with at(time, out).
 */
export function track(p, v, t, ground, bounds, { keep = 0.62, bounces = 4 } = {}) {
  const legs = [{ p: p.clone(), v: v.clone(), t }];
  let { p: q, v: w } = legs[0];
  let tt = t;
  let k = keep;
  for (let i = 0; i < bounces; i++) {
    const a = 0.5 * G; const b = -w.y; const c = -(q.y - (ground + BALL_R));
    const dt = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    const pb = new THREE.Vector3(q.x + w.x * dt, ground + BALL_R, q.z + w.z * dt);
    const vin = w.y - G * dt;
    const vb = new THREE.Vector3(w.x * 0.7, -vin * k, w.z * 0.7);
    tt += dt;
    legs.push({ p: pb, v: vb, t: tt });
    q = pb; w = vb;
    k *= 0.75;
    if (vb.y < 0.5) break;
  }
  // After the last hop it rolls, slowing: x(t) = p + v·τ·(1 − e^(−t/τ)); stopped at the fence.
  const last = legs[legs.length - 1];
  const tau = 0.7;
  const roll = { p: last.p.clone(), v: new THREE.Vector3(last.v.x, 0, last.v.z), t: last.t + Math.max(0, 2 * last.v.y / G) };
  roll.p.x += last.v.x * (roll.t - last.t);
  roll.p.z += last.v.z * (roll.t - last.t);
  const end = new THREE.Vector3(roll.p.x + roll.v.x * tau, ground + BALL_R, roll.p.z + roll.v.z * tau);
  const clampIn = (o) => {
    o.x = THREE.MathUtils.clamp(o.x, bounds.x0, bounds.x1);
    o.z = THREE.MathUtils.clamp(o.z, bounds.z0, bounds.z1);
    return o;
  };
  clampIn(end);
  return {
    legs, roll, end, tau,
    stopAt: roll.t + tau * 3.5,
    firstBounce: legs[1] ?? null,
    at(time, out) {
      if (time >= roll.t) {
        const e = 1 - Math.exp(-(time - roll.t) / tau);
        out.set(roll.p.x + roll.v.x * tau * e, ground + BALL_R, roll.p.z + roll.v.z * tau * e);
        return clampIn(out);
      }
      let L = legs[0];
      for (const l of legs) { if (time < l.t) break; L = l; }
      const dt = time - L.t;
      out.set(L.p.x + L.v.x * dt, L.p.y + L.v.y * dt - 0.5 * G * dt * dt, L.p.z + L.v.z * dt);
      if (out.y < ground + BALL_R) out.y = ground + BALL_R;
      return clampIn(out);
    },
  };
}

/**
 * Instanced balls with their shadows along the sun: `fly` balls in the air (tracks) and balls lying
 * on the court (points). One pool per system.
 */
export function ballPool(scene, capacity, sun) {
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 10, 8),
    gradeLife(new THREE.MeshStandardMaterial({ color: 0xc9d93a, roughness: 0.85 })), capacity);
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(BALL_R * 1.1, 10).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), capacity);
  balls.name = 'life_lesson_balls';
  shadows.name = 'life_lesson_ball_shadows';
  for (const o of [balls, shadows]) {
    o.frustumCulled = false;
    o.layers.set(LIFE_LAYER);
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.count = 0;
  }
  shadows.renderOrder = 1;
  scene.add(balls, shadows);
  const m4 = new THREE.Matrix4();
  let n = 0;
  return {
    begin() { n = 0; },
    /** One ball at p (on court `ground`). */
    put(p, ground) {
      if (n >= capacity) return;
      m4.makeTranslation(p.x, p.y, p.z);
      balls.setMatrixAt(n, m4);
      const s = sun.dir;
      const h = p.y - ground;
      m4.makeTranslation(p.x - (s.x / s.y) * h, ground + 0.005, p.z - (s.z / s.y) * h);
      shadows.setMatrixAt(n, m4);
      n++;
    },
    end() {
      balls.count = shadows.count = n;
      balls.instanceMatrix.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- Ball hopper on its stand -----------------------------------------------------------------------

const HOP_W = 0.32;
const HOP_D = 0.34;
const HOP_TOP = 0.86; // m: the rim on the stand (handles turned down into legs)
export const HOPPER_CAP = 72;

function wireTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    const v = 1 + i * 10.3;
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 64); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(64, v); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** Hoppers on stands (instanced: one per court that has one). set(i, x, y, z, fill 0..1, shown). */
export function hoppers(scene, count, sun) {
  const box = new THREE.BoxGeometry(HOP_W, HOP_D, HOP_W);
  const metal = gradeLife(new THREE.MeshStandardMaterial({ color: 0x2b2c2d, roughness: 0.5, metalness: 0.6, alphaMap: wireTexture(), alphaTest: 0.4, side: THREE.DoubleSide }));
  // Open top: drop the box's +y face (faces are in order +x, −x, +y, −y, +z, −z, two triangles each).
  box.setIndex(Array.from(box.index.array).filter((_, i) => Math.floor(i / 6) !== 2));
  box.clearGroups();
  box.translate(0, HOP_TOP - HOP_D / 2, 0);
  const legGeo = (() => {
    const parts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const g = new THREE.CylinderGeometry(0.006, 0.006, HOP_TOP - HOP_D + 0.06, 5);
      g.translate(0, (HOP_TOP - HOP_D + 0.06) / 2, 0);
      g.rotateZ(sx * 0.09);
      g.rotateX(-sz * 0.09);
      g.translate(sx * (HOP_W / 2 - 0.01), 0, sz * (HOP_W / 2 - 0.01));
      parts.push(g);
    }
    // the two handles, turned down: a bar across each side at foot height
    for (const sx of [-1, 1]) {
      const b = new THREE.CylinderGeometry(0.006, 0.006, HOP_W + 0.12, 5).rotateX(Math.PI / 2);
      b.translate(sx * (HOP_W / 2 + 0.035), 0.02, 0);
      parts.push(b);
    }
    return mergeSimple(parts);
  })();
  const baskets = new THREE.InstancedMesh(box, metal, count);
  const legs = new THREE.InstancedMesh(legGeo, gradeLife(new THREE.MeshStandardMaterial({ color: 0x1f2021, roughness: 0.5, metalness: 0.5 })), count);
  // The balls inside: a few layers of spheres, as many as the fill.
  const PER = 16;
  const ballGeo = new THREE.SphereGeometry(0.033, 8, 6);
  const inside = new THREE.InstancedMesh(ballGeo, gradeLife(new THREE.MeshStandardMaterial({ color: 0xc9d93a, roughness: 0.9 })), count * PER * 3);
  const shade = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: softRect(64, 64, 6), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }), count);
  for (const o of [baskets, legs, inside, shade]) {
    o.frustumCulled = false;
    o.layers.set(LIFE_LAYER);
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  baskets.name = 'life_hopper';
  shade.renderOrder = 1;
  scene.add(shade, legs, baskets, inside);
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const spots = [];
  for (let l = 0; l < 3; l++) {
    for (let i = 0; i < PER; i++) {
      const gx = (i % 4) - 1.5;
      const gz = Math.floor(i / 4) - 1.5;
      spots.push([gx * 0.074 + (l % 2) * 0.018, HOP_TOP - HOP_D + 0.035 + l * 0.058, gz * 0.074 + (l % 2) * 0.018]);
    }
  }
  return {
    set(i, x, y, z, fill, shown) {
      if (!shown) {
        baskets.setMatrixAt(i, zero); legs.setMatrixAt(i, zero); shade.setMatrixAt(i, zero);
        for (let k = 0; k < spots.length; k++) inside.setMatrixAt(i * spots.length + k, zero);
        return;
      }
      m4.makeTranslation(x, y, z);
      baskets.setMatrixAt(i, m4);
      legs.setMatrixAt(i, m4);
      const s = sun.dir;
      const off = (HOP_TOP * 0.8) / Math.max(0.25, s.y);
      shade.setMatrixAt(i, m4.compose(new THREE.Vector3(x - s.x * off * 0.5, y + 0.003, z - s.z * off * 0.5), new THREE.Quaternion(), new THREE.Vector3(0.5 + off * 0.5, 1, 0.5)));
      const n = Math.round(THREE.MathUtils.clamp(fill, 0, 1) * spots.length);
      spots.forEach(([bx, by, bz], k) => {
        inside.setMatrixAt(i * spots.length + k, k < n ? m4.makeTranslation(x + bx, y + by, z + bz) : zero);
      });
    },
    flush() {
      for (const o of [baskets, legs, inside, shade]) o.instanceMatrix.needsUpdate = true;
    },
  };
}

function mergeSimple(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// --- Sound --------------------------------------------------------------------------------------------

/** How loud something at (x, z) is for the visitor (0..1.2), and where it sits left to right. */
export function earOf(rig, x, z, reach = 70) {
  const v = rig.state;
  const level = THREE.MathUtils.clamp(1 - Math.hypot(x - v.x, z - v.z) / reach, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2);
  const s = rig.screenOf(x, z);
  return { level, pan: THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.8, 0.8) };
}

/** A ball struck at (x, z): the players' pock. */
export function pock(rig, x, z, soft = 1) {
  const { level, pan } = earOf(rig, x, z);
  if (level * soft > 0.05) courtHit(level * soft, pan);
}

/**
 * The coach's whistle at (x, z): a pea whistle is a bright tone near 3 kHz whose pitch and level
 * flutter fast as the pea spins, with a little breath noise. `blasts`: lengths in seconds.
 */
export function whistle(rig, x, z, blasts = [0.22, 0.5]) {
  const bus = ambientBus();
  if (!bus) return false;
  const { level, pan } = earOf(rig, x, z, 110);
  if (level < 0.02) return false;
  const { ctx, out } = bus;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  let t = ctx.currentTime + 0.02;
  const peak = 0.05 * Math.min(1, level);
  for (const len of blasts) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = rand(2950, 3150);
    osc.frequency.setValueAtTime(f * 0.94, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    // the pea: a fast flutter of pitch and level
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(32, 42);
    const depth = ctx.createGain();
    depth.gain.value = f * 0.035;
    lfo.connect(depth).connect(osc.frequency);
    const trem = ctx.createGain();
    trem.gain.value = 0.35;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.setValueAtTime(peak, t + len - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const am = ctx.createGain();
    am.gain.value = 0.65;
    lfo.connect(trem).connect(am.gain);
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = f;
    tone.Q.value = 2.2;
    osc.connect(am).connect(g).connect(p);
    osc.connect(tone).connect(g);
    osc.start(t); lfo.start(t);
    osc.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
    t += len + 0.12;
  }
  return true;
}
