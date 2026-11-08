import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { POND } from './pond.js';

// Round 10 (row 2): a flock that comes down. Ibises and pelicans glide in on a curve that slows
// them (wings spread and cupped, a hard flutter in the flare, nose up), touch the ground and fold
// their wings (a wingless, standing model takes over: legs, upright neck), stand and wander a while
// (ibises probing the ground, pelicans preening), and then take off one after another: a few running
// steps, hard beats, a climbing curve away. Geometry comes from life/birds.js through `lib`.
//
// Row 12: pelicans come down on the pond (life/pond.js) when it is in view: they skim in with the
// feet forward, touch the water with a ring and a splash, fold their wings and float low (no legs),
// drift about, dip the bill to drink, and now and then bathe (wings beating at the surface, body
// rolling, rings spreading); they take off by running over the water, each footfall a ring.

const FEET = 0.09; // the ground under the lawn and paths
const WATER = 0.02; // the pond's surface
const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

function ibisStanding({ builder, loft }) {
  const b = builder();
  const white = '#f1efe9'; const shade = '#d9d6cf'; const face = '#e07a52'; const bill = '#d9643f'; const leg = '#e48c78'; const tip = '#262626';
  loft(b, [
    [-0.22, 0.0, 0.0, 0.33, tip, tip],
    [-0.17, 0.05, 0.04, 0.35, white, shade],
    [-0.04, 0.075, 0.07, 0.38, white, shade],
    [0.07, 0.06, 0.06, 0.41, white, shade],
    [0.12, 0.03, 0.03, 0.47, white, white],
    [0.15, 0.02, 0.02, 0.54, white, white],
    [0.17, 0.02, 0.02, 0.6, white, white],
    [0.2, 0.03, 0.03, 0.62, face, face],
    [0.23, 0.012, 0.014, 0.6, bill, bill],
    [0.3, 0.008, 0.009, 0.55, bill, bill],
    [0.36, 0.0, 0.0, 0.48, bill, bill],
  ], 6);
  for (const side of [-1, 1]) {
    const x = side * 0.03;
    b.v(x - 0.007, 0.34, 0.0, leg); b.v(x + 0.007, 0.34, 0.0, leg); b.v(x, 0.0, 0.02, leg);
  }
  return b.geometry();
}

function pelicanStanding({ builder, loft }, { legs = true, floating = false } = {}) {
  const b = builder();
  const back = '#7d7366'; const belly = '#5d554b'; const head = '#ece5cc'; const neck = '#4a3a2e'; const bill = '#a39580'; const leg = '#3c3a37';
  loft(b, [
    [-0.46, 0.0, 0.0, 0.4, '#4a443c', '#4a443c'],
    [-0.38, 0.09, 0.06, 0.43, back, belly],
    [-0.22, 0.17, 0.13, 0.5, back, belly],
    [0.0, 0.18, 0.15, 0.53, back, belly],
    [0.18, 0.14, 0.12, 0.58, neck, neck],
    [0.25, 0.08, 0.09, 0.7, neck, neck],
    [0.27, 0.06, 0.08, 0.82, neck, neck],
    [0.3, 0.06, 0.06, 0.9, head, head],
    [0.36, 0.05, 0.05, 0.9, head, head],
    [0.4, 0.035, 0.04, 0.86, bill, bill],
    [0.75, 0.025, 0.03, 0.74, bill, bill],
    [0.8, 0.0, 0.0, 0.72, bill, bill],
  ]);
  if (legs) {
    for (const side of [-1, 1]) {
      const x = side * 0.07;
      b.v(x - 0.012, 0.42, 0.02, leg); b.v(x + 0.012, 0.42, 0.02, leg); b.v(x, 0.0, 0.06, leg);
    }
  }
  const g = b.geometry();
  if (floating) g.translate(0, -0.2, 0); // the belly at the water line: the legs are under it
  return g;
}

/**
 * env: { scene, rig, kinds, lib: { builder, loft, birdMaterial, shadowMaterial, gradeLife }, sunDir,
 * foldAt(sp, cycle, t, beatK), makeCycle(sp) }. Returns { launch(name), tick(now) → whether a flock is down or coming down }.
 */
export function createRest(env) {
  const { scene, rig, kinds, lib, sunDir, pond } = env;
  const sit = {};
  for (const [name, make, from] of [['pelican', pelicanStanding, 'pelican'], ['ibis', ibisStanding, 'ibis'], ['swimmer', (l) => pelicanStanding(l, { legs: false, floating: true }), 'pelican']]) {
    const geo = make(lib);
    geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(kinds[from].sp.max * 2), 2));
    const mesh = new THREE.InstancedMesh(geo, lib.gradeLife(lib.birdMaterial()), kinds[from].sp.max);
    const shadow = new THREE.InstancedMesh(geo, lib.shadowMaterial(sunDir, kinds[from].sp.shadow), kinds[from].sp.max);
    for (const o of [mesh, shadow]) {
      o.layers.set(LIFE_LAYER);
      o.frustumCulled = false;
      o.visible = false;
      o.count = 0;
      o.userData.noAO = true;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.name = `life_${name}_standing`;
    shadow.name = `life_${name}_standing_shadow`;
    shadow.renderOrder = 1;
    scene.add(mesh, shadow);
    sit[name] = { mesh, shadow };
  }

  let flock = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();

  /** Quadratic bezier a → c → b at k. */
  const bez = (a, c, b, k, out) => {
    const w = 1 - k;
    return out.set(w * w * a.x + 2 * w * k * c.x + k * k * b.x, w * w * a.y + 2 * w * k * c.y + k * k * b.y, w * w * a.z + 2 * w * k * c.z + k * k * b.z);
  };

  /** Is the pond on screen (with some room round it)? Then the pelicans come down on it. */
  const pondInView = () => {
    if (!pond) return false;
    const s = rig.screenOf(POND.x, POND.z);
    return s.x > 70 && s.x < innerWidth - 70 && s.y > 90 && s.y < innerHeight - 110;
  };

  function launch(name, opts = {}) {
    const { sp } = kinds[name];
    const water = name === 'pelican' && !!pond && (opts.water ?? pondInView());
    const { x, z } = rig.state;
    const ang = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const n = name === 'pelican' ? 2 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 5);
    const shore = name === 'ibis' && !!pond && (opts.shore ?? pondInView()); // row 12: ibises come to the pond's edge to drink
    const spot = water ? new THREE.Vector3(POND.x, WATER, POND.z) : new THREE.Vector3(x + rand(-12, 12), FEET, z + rand(-12, 12));
    const now = performance.now() / 1000;
    const alt = name === 'pelican' ? rand(10, 14) : rand(8, 11);
    const cycle = env.makeCycle(sp);
    const birds = [];
    for (let i = 0; i < n; i++) {
      let P;
      if (water) {
        // Spread over the pond, none closer than 2.8 m to another.
        for (let k = 0; k < 24; k++) {
          P = new THREE.Vector3(POND.x + rand(-1, 1) * POND.rx * 0.62, WATER, POND.z + rand(-1, 1) * POND.rz * 0.58);
          if (birds.every((o) => o.P.distanceTo(P) > 2.8)) break;
        }
      } else if (shore) {
        // along the bank, none closer than 1.4 m to another
        for (let k = 0; k < 24; k++) {
          const a = rand(0, Math.PI * 2);
          P = new THREE.Vector3(POND.x + Math.cos(a) * POND.rx * 1.14, FEET, POND.z + Math.sin(a) * POND.rz * 1.14);
          if (birds.every((o) => o.P.distanceTo(P) > 1.4)) break;
        }
      } else P = spot.clone().addScaledVector(side, rand(-4.5, 4.5)).addScaledVector(dir, rand(-3, 3)).setY(FEET);
      birds.push({
        P, yaw: Math.atan2(dir.x, dir.z) + rand(-0.5, 0.5), water,
        a: P.clone().addScaledVector(dir, -rand(70, 85)).addScaledVector(side, rand(-8, 8)).setY(alt + rand(-1.5, 1.5)),
        // onto the water the glide is a long skim: low, a flat final approach
        c: P.clone().addScaledVector(dir, -(water ? rand(9, 13) : rand(12, 18))).addScaledVector(side, rand(-3, 3)).setY(water ? rand(1.3, 2.1) : rand(3, 5)),
        shore, state: 'in', t0: now + i * rand(0.25, 0.6), dur: rand(9, 11.5), beatK: rand(0.96, 1.06), ph: rand(0, 6.28),
        until: 0, walkTo: null, wait: 0, spd: rand(0.22, 0.4), act: 'float', actUntil: 0, ripAt: 0,
      });
    }
    flock = { name, birds, dir, side, cycle, water, standFor: water ? rand(30, 48) : rand(14, 28) };
    const rest = water ? sit.swimmer : sit[name];
    for (const set of [kinds[name], rest]) set.mesh.visible = set.shadow.visible = true;
  }

  function leave(b, now, i) {
    const f = flock;
    b.state = 'out';
    b.a = b.P.clone();
    if (b.water) b.a.y = 0.12;
    b.c = b.P.clone().addScaledVector(f.dir, rand(4, 6)).setY(b.water ? rand(0.5, 0.9) : rand(0.8, 1.6));
    b.b = b.P.clone().addScaledVector(f.dir, rand(55, 70)).addScaledVector(f.side, rand(-10, 10)).setY(rand(10, 15));
    b.t0 = now + i * rand(0.3, 0.9);
    b.dur = b.water ? rand(8, 10) : rand(7, 9);
  }

  const yawOf = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

  return {
    launch,
    get water() { return !!flock?.water; },
    get active() { return !!flock; },
    tick(now) {
      if (!flock) return false;
      const { name, birds, water } = flock;
      const { sp, mesh, shadow, fold } = kinds[name];
      const set = water ? sit.swimmer : sit[name];
      const sm = set.mesh;
      const ss = set.shadow;
      let nf = 0; let ns = 0; let gone = 0;
      if (!flock.upAt && birds.every((b) => b.state === 'sit')) flock.upAt = now + flock.standFor;
      if (flock.upAt && now > flock.upAt && !flock.leaving) {
        flock.leaving = true;
        birds.forEach((b, i) => leave(b, now, i));
      }
      for (const [i, b] of birds.entries()) {
        if (b.state === 'sit') {
          if (b.water) {
            // On the water: float and drift, dip the bill for a drink, now and then bathe.
            if (now > b.actUntil && !flock.leaving) {
              const pool = ['float', 'float', 'dip', 'bathe'].filter((a) => a !== b.act || a === 'float');
              b.act = pool[Math.floor(Math.random() * pool.length)];
              b.actAt = now;
              b.actUntil = now + (b.act === 'float' ? rand(4, 9) : b.act === 'dip' ? 2.1 : 3.6);
              if (b.act === 'float') b.walkTo = new THREE.Vector3(POND.x + rand(-1, 1) * POND.rx * 0.6, WATER, POND.z + rand(-1, 1) * POND.rz * 0.55);
            }
            const k = (now - b.actAt) / Math.max(0.01, b.actUntil - b.actAt);
            let pitch = 0; let roll = 0; let lift = 0;
            if (b.act === 'float') {
              if (b.walkTo) {
                const d = Math.hypot(b.walkTo.x - b.P.x, b.walkTo.z - b.P.z);
                const want = yawOf(b.P, b.walkTo);
                b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * 0.03;
                const pace = 0.22 * Math.min(1, d / 1.2 + 0.2); // paddling: a slow glide
                if (d > 0.3 && pond.inside(b.P.x + Math.sin(b.yaw) * 0.4, b.P.z + Math.cos(b.yaw) * 0.4, 0.8)) { b.P.x += Math.sin(b.yaw) * pace * 0.016; b.P.z += Math.cos(b.yaw) * pace * 0.016; }
                if (now > b.ripAt && d > 0.3) { pond.ripple(b.P.x - Math.sin(b.yaw) * 0.3, b.P.z - Math.cos(b.yaw) * 0.3, 0.38); b.ripAt = now + rand(1.0, 1.8); }
              }
              pitch = 0.05 * Math.sin(now * 0.8 + b.ph);
              roll = 0.03 * Math.sin(now * 0.6 + b.ph * 2);
              lift = 0.012 * Math.sin(now * 1.1 + b.ph);
            } else if (b.act === 'dip') {
              // Bill down into the water, up with a toss of the head.
              const down = Math.sin(Math.PI * THREE.MathUtils.clamp(k * 1.15, 0, 1)) ** 0.8;
              pitch = 0.5 * down;
              lift = -0.05 * down;
              if (k > 0.35 && !b.dipped) { b.dipped = true; pond.ripple(b.P.x + Math.sin(b.yaw) * 0.5, b.P.z + Math.cos(b.yaw) * 0.5, 0.7); }
              if (k > 0.9) b.dipped = false;
            } else if (b.act === 'bathe') {
              // Wings beating at the surface, the body up on its tail and rolling from side to side;
              // drawn with the flying model, folded and spread again, ringed by splashes.
              const beat = Math.sin((now - b.actAt) * 7.5 + b.ph);
              const envl = THREE.MathUtils.smoothstep(k, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(k, 0.82, 1));
              const gs = kinds.pelican.sp.glideFold;
              const s = THREE.MathUtils.lerp(gs[0], 0.15 + 0.7 * beat, envl);
              const w = THREE.MathUtils.lerp(gs[1], -0.25 - 0.3 * Math.max(0, -beat), envl);
              const rl = Math.sin((now - b.actAt) * 3.1) * 0.4 * envl;
              if (now > b.ripAt) { pond.ripple(b.P.x + rand(-0.9, 0.9), b.P.z + rand(-0.9, 0.9), 1.1 + 0.8 * envl); b.ripAt = now + 0.28; }
              p.set(b.P.x, WATER + 0.16 + 0.05 * envl, b.P.z);
              m4.compose(p, q.setFromEuler(e.set(-0.42 * envl, b.yaw, rl, 'YXZ')), one);
              mesh.setMatrixAt(nf, m4);
              shadow.setMatrixAt(nf, m4);
              fold.setXY(nf, s, w);
              nf++;
              continue;
            }
            p.set(b.P.x, WATER + lift, b.P.z);
            m4.compose(p, q.setFromEuler(e.set(pitch, b.yaw, roll, 'YXZ')), one);
            sm.setMatrixAt(ns, m4);
            ss.setMatrixAt(ns, m4);
            ns++;
            continue;
          }
          // Stand and wander: a few slow steps, then a pause (ibises probe the ground, pelicans preen).
          let pitch = 0;
          if (now > b.until) {
            b.walking = !b.walking;
            b.until = now + (b.walking ? rand(1.5, 4) : rand(2, 6));
            if (b.walking) b.walkTo = b.P.clone().add(new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
          }
          if (b.shore) {
            // at the water's edge: face it, bill down for a drink every few seconds
            b.walking = false;
            const want = Math.atan2(POND.x - b.P.x, POND.z - b.P.z);
            b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * 0.05;
            pitch = 0.62 * Math.max(0, Math.sin(now * 0.9 + b.ph * 3)) ** 3;
            if (pitch > 0.55 && now > b.ripAt) { pond.ripple(b.P.x + Math.sin(b.yaw) * 0.45, b.P.z + Math.cos(b.yaw) * 0.45, 0.5); b.ripAt = now + 2; }
          } else if (b.walking) {
            const d = Math.hypot(b.walkTo.x - b.P.x, b.walkTo.z - b.P.z);
            const want = yawOf(b.P, b.walkTo);
            b.yaw += Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw)) * 0.06;
            if (d > 0.15) { b.P.x += Math.sin(b.yaw) * b.spd * 0.016; b.P.z += Math.cos(b.yaw) * b.spd * 0.016; } else b.until = 0;
            pitch = name === 'ibis' ? 0.18 * Math.max(0, Math.sin(now * 3 + b.ph)) : 0;
          } else {
            pitch = name === 'ibis' ? 0.5 * Math.max(0, Math.sin(now * 2.2 + b.ph * 3)) ** 2 : 0.12 * Math.sin(now * 0.7 + b.ph);
          }
          m4.compose(b.P, q.setFromEuler(e.set(pitch, b.yaw, 0, 'YXZ')), one);
          sm.setMatrixAt(ns, m4);
          ss.setMatrixAt(ns, m4);
          ns++;
          continue;
        }
        if (now < b.t0) continue;
        const u = THREE.MathUtils.clamp((now - b.t0) / b.dur, 0, 1);
        const inbound = b.state === 'in';
        const ease = (k) => (inbound ? 1 - (1 - k) ** 1.9 : k ** 1.7);
        const target = inbound ? b.P : b.b;
        bez(b.a, b.c, target, ease(u), p);
        bez(b.a, b.c, target, ease(Math.min(1, u + 0.02)), ahead);
        if (inbound && b.water) p.y = Math.max(p.y, 0.14) ; // the body rides just over the water until it settles
        const yaw = ahead.distanceToSquared(p) > 1e-6 ? yawOf(p, ahead) : b.yaw;
        const climb = Math.atan2(ahead.y - p.y, Math.hypot(ahead.x - p.x, ahead.z - p.z) + 1e-4);
        let s; let w; let roll = 0; let pitchN = -climb * 0.7;
        if (inbound) {
          const flare = THREE.MathUtils.smoothstep(u, 0.78, 0.97);
          const [gs, gw] = env.foldAt(sp, flock.cycle, now - b.t0, b.beatK);
          // Wings spread and cupped through the flare, a hard flutter, nose up.
          const flap = Math.sin((now - b.t0) * sp.beat * 2.2 * Math.PI * 2 + b.ph);
          s = THREE.MathUtils.lerp(gs, 0.35 + 0.65 * flap, flare);
          w = THREE.MathUtils.lerp(gw, -0.2 - 0.25 * Math.max(0, -flap), flare);
          pitchN -= flare * 0.65;
          roll = Math.sin((now - b.t0) * 0.6 + b.ph) * 0.08 * (1 - flare);
          b.yaw = yaw;
          if (b.water && p.y < 0.6 && now > b.ripAt) { pond.ripple(p.x, p.z, 0.8 + flare * 0.9); b.ripAt = now + 0.1; } // the feet and the belly skim the surface
          if (u >= 1) {
            b.state = 'sit'; b.until = now + rand(0.5, 2); b.walking = false;
            if (b.water) { b.act = 'float'; b.actAt = now; b.actUntil = now + rand(1.5, 3); b.walkTo = null; pond.ripple(b.P.x, b.P.z, 1.9); pond.ripple(b.P.x - Math.sin(b.yaw) * 1.2, b.P.z - Math.cos(b.yaw) * 1.2, 1.4); }
            sm.setMatrixAt(ns, m4.compose(b.P, q.setFromEuler(e.set(0, b.yaw, 0, 'YXZ')), one)); ss.setMatrixAt(ns, m4); ns++;
            continue;
          }
        } else {
          // Running start, hard beats, then the usual rhythm.
          const hard = 1 - THREE.MathUtils.smoothstep(u, 0.15, 0.5);
          const ph = (now - b.t0) * sp.beat * (1.4 - 0.4 * (1 - hard)) * Math.PI * 2 + b.ph;
          const [gs, gw] = env.foldAt(sp, flock.cycle, now - b.t0, b.beatK);
          s = THREE.MathUtils.lerp(gs, 0.15 + 0.75 * Math.sin(ph), hard);
          w = THREE.MathUtils.lerp(gw, -0.3 * (1 - Math.cos(ph)) * 0.5, hard);
          pitchN -= 0.25 * hard;
          if (b.water && p.y < 0.55 && now > b.ripAt) { pond.ripple(p.x, p.z, 1.0 + 0.5 * hard); b.ripAt = now + 0.13; } // a footfall on the water every few strides
          if (u >= 1) { gone++; continue; }
        }
        m4.compose(p, q.setFromEuler(e.set(pitchN, yaw, roll, 'YXZ')), one);
        mesh.setMatrixAt(nf, m4);
        shadow.setMatrixAt(nf, m4);
        fold.setXY(nf, s, w);
        nf++;
      }
      for (const [a, b2, n] of [[mesh, shadow, nf], [sm, ss, ns]]) {
        a.count = b2.count = n;
        a.instanceMatrix.needsUpdate = b2.instanceMatrix.needsUpdate = true;
      }
      fold.needsUpdate = true;
      if (flock.leaving && gone === birds.length) {
        for (const st of [kinds[name], set]) { st.mesh.visible = st.shadow.visible = false; st.mesh.count = st.shadow.count = 0; }
        flock = null;
        return false;
      }
      return true;
    },
    debug: () => (flock ? { kind: flock.name, water: !!flock.water, states: flock.birds.map((b) => (b.state === 'sit' && b.water ? b.act : b.state)).join(','), at: flock.birds.map((b) => [+b.P.x.toFixed(1), +b.P.z.toFixed(1)]) } : null),
  };
}
