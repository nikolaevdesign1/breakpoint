import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { curve, envelope, stroke } from './bird-flight.js';
import { createRest } from './bird-rest.js';

// Birds over the club (row 95.2): now and then a small flock crosses the grounds. Two Miami
// regulars, modelled at their real sizes and colours: brown pelicans in a loose line, flapping a
// few slow beats and gliding long, the beat passing down the line; and white ibises, quicker beats
// and short glides, all white with black wing tips, curved orange bill and pink legs trailing.
// One instanced mesh per species; the wings fold in the vertex shader (shoulder + wrist joints, the
// angles come per bird from the CPU). The shadow is the same mesh flattened along the sun onto the
// ground: faint and slightly smaller than the bird, as a sunlit bird's shadow is from 15 m up.

const ALT = { pelican: [10, 15], ibis: [8, 12] };
const FIRST = [14, 26]; // s after the map shows
const EVERY = [32, 75];
const REST_P = 0.3; // share of the visits that come down: land, stand a while, take off (life/bird-rest.js)
const GROUND = 0.07; // just above courts and paths
const rand = (a, b) => a + Math.random() * (b - a);

// --- Geometry ------------------------------------------------------------------------------
// Bird space: +z forward, +y up, wings along ±x. Vertex colour carries the plumage; aWing holds the
// wing joints for the shader: (side ±1 or 0 for the body, shoulder x, wrist distance from the shoulder).

export function builder() {
  const pos = []; const col = []; const wing = [];
  const c = new THREE.Color();
  const v = (x, y, z, hex, w = [0, 0, 0]) => { pos.push(x, y, z); c.set(hex); col.push(c.r, c.g, c.b); wing.push(...w); };
  return {
    v,
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 3));
      g.computeVertexNormals();
      return g;
    },
  };
}

/** Body along z from sections [z, half width, half height, y centre, upper colour, under colour]. */
export function loft(b, sections, seg = 8) {
  const ring = (s) => Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    const y = Math.sin(a);
    return { p: [Math.cos(a) * s[1], s[3] + y * s[2], s[0]], c: y >= -0.2 ? s[4] : s[5] ?? s[4] };
  });
  for (let k = 0; k < sections.length - 1; k++) {
    const A = ring(sections[k]);
    const B = ring(sections[k + 1]);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      for (const r of [A[i], B[i], B[j], A[i], B[j], A[j]]) b.v(...r.p, r.c);
    }
  }
}

/**
 * One wing as a strip of span stations: [span 0..1, leading-edge z, trailing-edge z, droop y,
 * upper colour, under colour]. Double-sided flat surface with a little camber.
 */
export function wingStrip(b, side, shoulder, half, wrist, stations, fingers = null) {
  const pt = (s, z, y) => [side * (shoulder + s * (half - shoulder)), y, z];
  const w = [side, shoulder, wrist];
  for (let k = 0; k < stations.length - 1; k++) {
    const [s0, le0, te0, y0, c0, u0] = stations[k];
    const [s1, le1, te1, y1, c1, u1] = stations[k + 1];
    const mid0 = (le0 + te0) / 2; const mid1 = (le1 + te1) / 2;
    const camber = (s) => 0.025 * (1 - s);
    const quad = (a, bb, cc, d, ca, cb) => {
      b.v(...a, ca, w); b.v(...bb, cb, w); b.v(...cc, cb, w);
      b.v(...a, ca, w); b.v(...cc, cb, w); b.v(...d, ca, w);
    };
    // upper surface: leading half raised by the camber, trailing half flat
    const L0 = pt(s0, le0, y0); const L1 = pt(s1, le1, y1);
    const M0 = pt(s0, mid0, y0 + camber(s0)); const M1 = pt(s1, mid1, y1 + camber(s1));
    const T0 = pt(s0, te0, y0); const T1 = pt(s1, te1, y1);
    const wind = side > 0;
    if (wind) { quad(L0, L1, M1, M0, c0, c1); quad(M0, M1, T1, T0, c0, c1); } else { quad(L0, M0, M1, L1, c0, c1); quad(M0, T0, T1, M1, c0, c1); }
    // underside (separate faces so the light from below/sky reads on the pale under-wing)
    const d = -0.004;
    const l0 = [L0[0], L0[1] + d, L0[2]]; const l1 = [L1[0], L1[1] + d, L1[2]];
    const t0 = [T0[0], T0[1] + d, T0[2]]; const t1 = [T1[0], T1[1] + d, T1[2]];
    if (wind) quad(l0, t0, t1, l1, u0, u1); else quad(l0, l1, t1, t0, u0, u1);
  }
  // Slotted primaries: separate feather tips fanning out past the end of the hand.
  if (fingers) {
    const { from, z, length, width, colour } = fingers;
    z.forEach((fz, i) => {
      const len = length[i];
      const a = pt(from, fz + width / 2, -0.04);
      const bb = pt(from, fz - width / 2, -0.04);
      const tipS = from + len / (half - shoulder);
      const cc = pt(tipS, fz - width * 0.35 - len * 0.12, -0.07);
      const d = pt(tipS, fz + width * 0.15 - len * 0.12, -0.07);
      b.v(...a, colour, w); b.v(...bb, colour, w); b.v(...cc, colour, w);
      b.v(...a, colour, w); b.v(...cc, colour, w); b.v(...d, colour, w);
    });
  }
}

export function pelicanGeometry() {
  const b = builder();
  const back = '#7d7366'; const belly = '#5d554b'; const head = '#ece5cc'; const neck = '#4a3a2e'; const bill = '#a39580';
  // Head pulled back onto the shoulders, bill resting forward on the neck.
  loft(b, [
    [-0.48, 0.0, 0.0, 0.0, back, belly],
    [-0.4, 0.09, 0.05, 0.0, back, belly],
    [-0.25, 0.15, 0.11, 0.0, back, belly],
    [0.0, 0.17, 0.13, 0.01, back, belly],
    [0.18, 0.15, 0.12, 0.03, neck, neck],
    [0.3, 0.1, 0.1, 0.06, neck, neck],
    [0.38, 0.07, 0.08, 0.09, head, head],
    [0.46, 0.06, 0.06, 0.09, head, head],
    [0.5, 0.03, 0.035, 0.07, bill, bill],
    [0.82, 0.025, 0.03, 0.04, bill, bill],
    [0.86, 0.0, 0.0, 0.03, bill, bill],
  ]);
  // Tail: short, square, dark.
  b.v(-0.11, 0.02, -0.5, '#4a443c'); b.v(0.11, 0.02, -0.5, '#4a443c'); b.v(0, 0.03, -0.3, '#4a443c');
  // Broad wings, 2.05 m span, dark fingered primaries.
  const up = '#8c8475'; const cov = '#a59d8d'; const prim = '#38332d'; const under = '#5b544a';
  for (const side of [-1, 1]) {
    // Long, broad, nearly parallel-edged wing; the hand ends in five slotted primaries.
    wingStrip(b, side, 0.1, 0.92, 0.36, [
      [0.0, 0.1, -0.31, 0.0, cov, under],
      [0.3, 0.13, -0.32, 0.0, cov, under],
      [0.5, 0.15, -0.29, 0.0, up, under],
      [0.68, 0.12, -0.27, -0.01, up, under],
      [0.82, 0.09, -0.24, -0.02, prim, prim],
      [0.94, 0.05, -0.19, -0.035, prim, prim],
      [1.0, 0.02, -0.14, -0.04, prim, prim],
    ], { from: 0.97, z: [0.0, -0.04, -0.08, -0.115, -0.145], length: [0.1, 0.13, 0.13, 0.11, 0.08], width: 0.035, colour: prim });
  }
  return b.geometry();
}

function ibisGeometry() {
  const b = builder();
  const white = '#f1efe9'; const shade = '#d9d6cf'; const face = '#e07a52'; const bill = '#d9643f'; const leg = '#e48c78';
  loft(b, [
    [-0.24, 0.0, 0.0, 0.0, white, shade],
    [-0.18, 0.05, 0.03, 0.0, white, shade],
    [-0.04, 0.075, 0.06, 0.0, white, shade],
    [0.08, 0.06, 0.05, 0.01, white, shade],
    [0.17, 0.025, 0.025, 0.02, white, shade],
    [0.27, 0.02, 0.02, 0.025, white, shade],
    [0.31, 0.03, 0.028, 0.03, face, face],
    [0.34, 0.012, 0.014, 0.025, bill, bill],
    [0.42, 0.008, 0.009, 0.01, bill, bill],
    [0.47, 0.0, 0.0, -0.015, bill, bill],
  ], 6);
  // Legs trailing past the tail.
  for (const side of [-1, 1]) {
    const x = side * 0.018;
    b.v(x - 0.006, -0.01, -0.12, leg); b.v(x + 0.006, -0.01, -0.12, leg); b.v(x, -0.012, -0.38, leg);
  }
  const W = '#f3f1ec'; const U = '#e2dfd8'; const tip = '#1c1c1c';
  for (const side of [-1, 1]) {
    wingStrip(b, side, 0.05, 0.44, 0.16, [
      [0.0, 0.08, -0.11, 0.0, W, U],
      [0.35, 0.095, -0.115, 0.0, W, U],
      [0.6, 0.09, -0.1, 0.0, W, U],
      [0.8, 0.07, -0.08, -0.01, W, U],
      [0.88, 0.055, -0.065, -0.015, tip, tip],
      [1.0, 0.025, -0.035, -0.025, tip, tip],
    ], { from: 0.98, z: [0.02, -0.005, -0.03], length: [0.035, 0.045, 0.035], width: 0.02, colour: tip });
  }
  return b.geometry();
}

// --- Shader ----------------------------------------------------------------------------------

const WING_GLSL = /* glsl */`
  attribute vec3 aWing;   // side, shoulder x, wrist distance
  attribute vec2 aFold;   // per bird: shoulder angle, wrist angle (rad, + = up)
  vec3 foldNormal(vec3 n, vec3 p) {
    if (aWing.x == 0.0) return n;
    float a = (abs(p.x) - aWing.y < aWing.z ? aFold.x : aFold.x + aFold.y) * aWing.x;
    float c = cos(a), s = sin(a);
    return vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
  }
  vec3 foldWing(vec3 p) {
    if (aWing.x == 0.0) return p;
    float d = abs(p.x) - aWing.y;
    float inner = min(d, aWing.z);
    float outer = max(d - aWing.z, 0.0);
    float a1 = aFold.x;
    float a2 = aFold.x + aFold.y;
    float x = aWing.y + inner * cos(a1) + outer * cos(a2);
    float y = p.y + inner * sin(a1) + outer * sin(a2);
    return vec3(aWing.x * x, y, p.z);
  }
`;

export function birdMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WING_GLSL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = foldNormal(objectNormal, position);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = foldWing(transformed);');
  };
  m.customProgramCacheKey = () => 'life-bird';
  return m;
}

export function shadowMaterial(sunDir, opacity) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSun = { value: sunDir.clone().normalize() };
    shader.uniforms.uGround = { value: GROUND };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WING_GLSL}\nuniform vec3 uSun;\nuniform float uGround;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = foldWing(transformed);')
      // Flatten in world space: the instance matrix places the bird, then the sun ray drops it.
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        wp.xyz -= uSun * ((wp.y - uGround) / uSun.y);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'life-bird-shadow';
  return m;
}

// --- Species ---------------------------------------------------------------------------------
// Flap: shoulder swings ±amp around a slight dihedral, the wrist lags and folds on the upstroke.

const SPECIES = {
  pelican: {
    geometry: pelicanGeometry, max: 7, speed: 10.5, beat: 1.45, amp: 0.55, wrist: 0.45, heave: 0.14, speedSpread: 0.012,
    flaps: [3, 6], glide: [2.5, 5.5], glideFold: [0.03, -0.1], shadow: 0.3, swing: [14, 26], period: [26, 40],
    flock: () => {
      const n = 3 + Math.floor(Math.random() * 4);
      const side = Math.random() < 0.5 ? -1 : 1;
      // A loose echelon: each bird a little behind and to one side of the one ahead.
      return Array.from({ length: n }, (_, i) => [side * i * rand(1.6, 2.4), rand(-0.4, 0.4) + i * 0.15, -i * rand(2.6, 3.4), i * 0.18]);
    },
  },
  ibis: {
    geometry: ibisGeometry, max: 12, speed: 12, beat: 3.1, amp: 0.62, wrist: 0.4, heave: 0.05, speedSpread: 0.025,
    flaps: [5, 10], glide: [0.8, 1.8], glideFold: [0.06, -0.05], shadow: 0.24, swing: [10, 20], period: [18, 30],
    flock: () => {
      const n = 5 + Math.floor(Math.random() * 7);
      // Loose V, slightly ragged.
      return Array.from({ length: n }, (_, i) => {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        return [k * rand(1.1, 1.6) + rand(-0.3, 0.3), rand(-0.6, 0.6), -Math.abs(k) * rand(1.2, 1.8) + rand(-0.4, 0.4), Math.random()];
      });
    },
  },
};

export function createBirds({ scene, sunDir, rig }, { still }) {
  if (still) return null;
  const kinds = {};
  for (const [name, sp] of Object.entries(SPECIES)) {
    const geo = sp.geometry();
    geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(sp.max * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, gradeLife(birdMaterial()), sp.max);
    const shadow = new THREE.InstancedMesh(geo, shadowMaterial(sunDir, sp.shadow), sp.max);
    for (const o of [mesh, shadow]) {
      o.layers.set(LIFE_LAYER);
      o.frustumCulled = false;
      o.visible = false;
      o.userData.noAO = true;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.name = `life_${name}`;
    shadow.name = `life_${name}_shadow`;
    shadow.renderOrder = 1;
    scene.add(mesh, shadow);
    kinds[name] = { sp, mesh, shadow, fold: geo.attributes.aFold };
  }

  const rest = createRest({ scene, sunDir, rig, kinds, foldAt, makeCycle, lib: { builder, loft, birdMaterial, shadowMaterial, gradeLife } });
  let flock = null; // { kind, birds: [{ off, phase, ... }], origin, dir, t0, length }
  let next = performance.now() / 1000 + rand(...FIRST);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const slot = new THREE.Vector3();
  const e = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0);

  function launch(kind) {
    const name = kind ?? (Math.random() < 0.55 ? 'pelican' : 'ibis');
    const { sp } = kinds[name];
    // A line across whatever the visitor is looking at, from off screen to off screen.
    const { x, z } = rig.state;
    const ang = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const reach = 150;
    const origin = new THREE.Vector3(x, rand(...ALT[name]), z).addScaledVector(side, rand(-22, 22)).addScaledVector(dir, -reach);
    const birds = sp.flock().slice(0, sp.max).map(([sx, dy, dz, lag]) => ({
      off: new THREE.Vector3().addScaledVector(side, sx).addScaledVector(dir, dz).setY(dy),
      lag: lag * (name === 'pelican' ? 0.9 : 1),
      jitter: rand(0.94, 1.06),
      bob: rand(0, 6.28),
      pace: 1 + rand(-sp.speedSpread, sp.speedSpread), // flock-mates fly at slightly different speeds
      swell: rand(0, 6.28), // each rides its own slow rise and fall: the flock spreads over several heights
      beatK: rand(0.96, 1.05),
    }));
    const path = curve({ dir, speed: sp.speed, amp: rand(...sp.swing) * (Math.random() < 0.5 ? -1 : 1), period: rand(...sp.period), phase: rand(0, 6.28) });
    flock = { name, birds, origin, dir, path, yaw: path.base, t0: performance.now() / 1000, duration: (reach * 2 + 30) / sp.speed, cycle: makeCycle(sp), climb: rand(-0.6, 0.6) };
    kinds[name].mesh.count = kinds[name].shadow.count = birds.length;
    kinds[name].mesh.visible = kinds[name].shadow.visible = true;
  }

  /** The flock's shared rhythm: a run of beats, then a glide, repeating with some variety. */
  function makeCycle(sp) {
    const parts = [];
    let t = 0;
    while (t < 60) {
      const beats = Math.round(rand(...sp.flaps));
      parts.push({ t, flap: beats / sp.beat });
      t += beats / sp.beat;
      const g = rand(...sp.glide);
      parts.push({ t, glide: g });
      t += g;
    }
    return parts;
  }

  /** Shoulder and wrist angles at flock time `t` (s). Beats ease in and out of the glide. */
  function foldAt(sp, cycle, t, beatK = 1) {
    const part = cycle.findLast((c) => c.t <= t) ?? cycle[0];
    const [gs, gw] = sp.glideFold;
    if (part.glide) return [gs, gw, 0];
    const local = t - part.t;
    const env = Math.min(1, envelope(local, part.flap, 0.33) + (local > part.flap - 0.33 ? 0.35 : 0));
    const ph = local * sp.beat * beatK * Math.PI * 2;
    // Downstroke is the power stroke: a bit longer than the upstroke; the wrist trails the shoulder.
    const shoulder = gs + env * sp.amp * stroke(ph);
    const wrist = gw + env * (-sp.wrist * 0.5 * (1 - Math.cos(ph - 0.9)) + 0.1);
    return [shoulder, wrist, -env * Math.cos(ph)];
  }

  return {
    name: 'birds',
    tick() {
      const now = performance.now() / 1000;
      if (rest.active) {
        if (!rest.tick(now)) next = now + rand(...EVERY);
        return true;
      }
      if (!flock) {
        if (now > next) {
          if (Math.random() < REST_P) { rest.launch(Math.random() < 0.5 ? 'pelican' : 'ibis'); return true; }
          launch();
        } else return false;
      }
      const { sp, mesh, shadow, fold } = kinds[flock.name];
      const t = now - flock.t0;
      if (t > flock.duration) {
        mesh.visible = shadow.visible = false;
        flock = null;
        next = now + rand(...EVERY);
        return false;
      }
      const { path } = flock;
      path.at(t, centre);
      const yaw = path.yaw(t);
      flock.birds.forEach((b, i) => {
        const tb = t * b.jitter;
        // The slot in the formation, swung round with the flock's heading (not all the way: the line stays a line).
        slot.copy(b.off).applyAxisAngle(UP, (yaw - flock.yaw) * 0.8);
        p.copy(flock.origin).add(centre).add(slot);
        p.addScaledVector(flock.dir, (b.pace - 1) * t * sp.speed);
        const [s, w, heave] = foldAt(sp, flock.cycle, Math.max(0, t - b.lag), b.beatK);
        // Height: a slow swell, the flock's own climb, and the body rising on each downstroke.
        p.y += Math.sin(tb * 0.45 + b.swell) * 0.9 + flock.climb * Math.sin(t * 0.12) * 2 + heave * sp.heave;
        const rise = Math.cos(tb * 0.45 + b.swell) * 0.9 * 0.45 / sp.speed;
        const bank = path.bank(t) * 0.9 + Math.sin(tb * 0.31 + b.bob) * 0.04;
        q.setFromEuler(e.set(-0.04 - rise * 1.5 - heave * 0.05, yaw + Math.sin(tb * 0.5 + b.bob) * 0.03, bank, 'YXZ'));
        m4.compose(p, q, one);
        mesh.setMatrixAt(i, m4);
        shadow.setMatrixAt(i, m4);
        fold.setXY(i, s, w);
      });
      mesh.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
      fold.needsUpdate = true;
      return true;
    },
    debug: () => (flock ? { kind: flock.name, n: flock.birds.length, t: +(performance.now() / 1000 - flock.t0).toFixed(1) } : { next: +(next - performance.now() / 1000).toFixed(1) }),
    /** Dev: a flock that lands, stands and takes off. */
    land(kind = 'ibis') {
      if (flock) { kinds[flock.name].mesh.visible = kinds[flock.name].shadow.visible = false; flock = null; }
      if (!rest.active) rest.launch(kind);
    },
    rest: () => rest.debug(),
    /** Dev: send a flock over now. */
    trigger(kind) {
      if (flock) kinds[flock.name].mesh.visible = kinds[flock.name].shadow.visible = false;
      launch(kind);
    },
  };
}
