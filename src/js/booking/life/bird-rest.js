import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';

// Round 10 (row 2): a flock that comes down. Ibises and pelicans glide in on a curve that slows
// them (wings spread and cupped, a hard flutter in the flare, nose up), touch the ground and fold
// their wings (a wingless, standing model takes over: legs, upright neck), stand and wander a while
// (ibises probing the ground, pelicans preening), and then take off one after another: a few running
// steps, hard beats, a climbing curve away. Geometry comes from life/birds.js through `lib`.

const FEET = 0.09; // the ground under the lawn and paths
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

function pelicanStanding({ builder, loft }) {
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
  for (const side of [-1, 1]) {
    const x = side * 0.07;
    b.v(x - 0.012, 0.42, 0.02, leg); b.v(x + 0.012, 0.42, 0.02, leg); b.v(x, 0.0, 0.06, leg);
  }
  return b.geometry();
}

/**
 * env: { scene, rig, kinds, lib: { builder, loft, birdMaterial, shadowMaterial, gradeLife }, sunDir,
 * foldAt(sp, cycle, t, beatK), makeCycle(sp) }. Returns { launch(name), tick(now) → whether a flock is down or coming down }.
 */
export function createRest(env) {
  const { scene, rig, kinds, lib, sunDir } = env;
  const sit = {};
  for (const [name, make] of [['pelican', pelicanStanding], ['ibis', ibisStanding]]) {
    const geo = make(lib);
    geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(kinds[name].sp.max * 2), 2));
    const mesh = new THREE.InstancedMesh(geo, lib.gradeLife(lib.birdMaterial()), kinds[name].sp.max);
    const shadow = new THREE.InstancedMesh(geo, lib.shadowMaterial(sunDir, kinds[name].sp.shadow), kinds[name].sp.max);
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

  function launch(name) {
    const { sp } = kinds[name];
    const { x, z } = rig.state;
    const ang = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const n = name === 'pelican' ? 2 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 5);
    const spot = new THREE.Vector3(x + rand(-12, 12), FEET, z + rand(-12, 12));
    const now = performance.now() / 1000;
    const alt = name === 'pelican' ? rand(10, 14) : rand(8, 11);
    const cycle = env.makeCycle(sp);
    const birds = Array.from({ length: n }, (_, i) => {
      const P = spot.clone().addScaledVector(side, rand(-4.5, 4.5)).addScaledVector(dir, rand(-3, 3)).setY(FEET);
      return {
        P, yaw: Math.atan2(dir.x, dir.z) + rand(-0.5, 0.5),
        a: P.clone().addScaledVector(dir, -rand(70, 85)).addScaledVector(side, rand(-8, 8)).setY(alt + rand(-1.5, 1.5)),
        c: P.clone().addScaledVector(dir, -rand(12, 18)).addScaledVector(side, rand(-3, 3)).setY(rand(3, 5)),
        state: 'in', t0: now + i * rand(0.25, 0.6), dur: rand(9, 11.5), beatK: rand(0.96, 1.06), ph: rand(0, 6.28),
        until: 0, walkTo: null, wait: 0, spd: rand(0.22, 0.4),
      };
    });
    flock = { name, birds, dir, side, cycle, standFor: rand(14, 28) };
    for (const set of [kinds[name], sit[name]]) set.mesh.visible = set.shadow.visible = true;
  }

  function leave(b, now, i) {
    const f = flock;
    b.state = 'out';
    b.a = b.P.clone();
    b.c = b.P.clone().addScaledVector(f.dir, rand(4, 6)).setY(rand(0.8, 1.6));
    b.b = b.P.clone().addScaledVector(f.dir, rand(55, 70)).addScaledVector(f.side, rand(-10, 10)).setY(rand(10, 15));
    b.t0 = now + i * rand(0.3, 0.9);
    b.dur = rand(7, 9);
  }

  const yawOf = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

  return {
    launch,
    get active() { return !!flock; },
    tick(now) {
      if (!flock) return false;
      const { name, birds } = flock;
      const { sp, mesh, shadow, fold } = kinds[name];
      const sm = sit[name].mesh;
      const ss = sit[name].shadow;
      let nf = 0; let ns = 0; let gone = 0;
      if (!flock.upAt && birds.every((b) => b.state === 'sit')) flock.upAt = now + flock.standFor;
      if (flock.upAt && now > flock.upAt && !flock.leaving) {
        flock.leaving = true;
        birds.forEach((b, i) => leave(b, now, i));
      }
      for (const [i, b] of birds.entries()) {
        if (b.state === 'sit') {
          // Stand and wander: a few slow steps, then a pause (ibises probe the ground, pelicans preen).
          let pitch = 0;
          if (now > b.until) {
            b.walking = !b.walking;
            b.until = now + (b.walking ? rand(1.5, 4) : rand(2, 6));
            if (b.walking) b.walkTo = b.P.clone().add(new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
          }
          if (b.walking) {
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
          if (u >= 1) { b.state = 'sit'; b.until = now + rand(0.5, 2); b.walking = false; sm.setMatrixAt(ns, m4.compose(b.P, q.setFromEuler(e.set(0, b.yaw, 0, 'YXZ')), one)); ss.setMatrixAt(ns, m4); ns++; continue; }
        } else {
          // Running start, hard beats, then the usual rhythm.
          const hard = 1 - THREE.MathUtils.smoothstep(u, 0.15, 0.5);
          const ph = (now - b.t0) * sp.beat * (1.4 - 0.4 * (1 - hard)) * Math.PI * 2 + b.ph;
          const [gs, gw] = env.foldAt(sp, flock.cycle, now - b.t0, b.beatK);
          s = THREE.MathUtils.lerp(gs, 0.15 + 0.75 * Math.sin(ph), hard);
          w = THREE.MathUtils.lerp(gw, -0.3 * (1 - Math.cos(ph)) * 0.5, hard);
          pitchN -= 0.25 * hard;
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
        for (const set of [kinds[name], sit[name]]) { set.mesh.visible = set.shadow.visible = false; set.mesh.count = set.shadow.count = 0; }
        flock = null;
        return false;
      }
      return true;
    },
    debug: () => (flock ? { kind: flock.name, states: flock.birds.map((b) => b.state).join(',') } : null),
  };
}
