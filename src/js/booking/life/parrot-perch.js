import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { stroke } from './bird-flight.js';

// Row 12: parakeets that come down. Now and then a handful of monk parakeets drop out of a crossing
// and settle in a tree crown or on the top of a floodlight mast near the view. They stay a minute:
// look about, preen (head down, a quick scrub), call (a squawk, a bob), and now and then one hops
// to another branch or mast a few metres on (a short flapping flight, wings spread to land). Then
// they go, one after another, with a call. Sites are read from the scene: the crowns of the
// impostor trees (a few branch spots each) and the pole tops (flood_pole_mesh).

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const UP = new THREE.Vector3(0, 1, 0);
const REACH = 46; // m from the middle of the view: sites a visit may use
const HOP_MAX = 26; // m between two perches of one hop
const MAX = 8;

/** A parakeet sitting upright on a perch: body tilted nose-up, tail down, the wings folded along it. Feet at the origin. */
export function perchedGeometry({ builder, loft }) {
  const b = builder();
  const green = '#4f9437'; const belly = '#a6ad98'; const grey = '#bfc2b6'; const tail = '#3f7c3c'; const bill = '#e3c39c'; const blue = '#2f5d93';
  loft(b, [
    [-0.19, 0.0, 0.0, 0.0, blue, blue],
    [-0.14, 0.014, 0.006, 0.0, tail, '#5f8f4a'],
    [-0.08, 0.026, 0.018, 0.0, green, belly],
    [-0.02, 0.04, 0.036, 0.002, green, belly],
    [0.035, 0.042, 0.04, 0.006, green, grey],
    [0.07, 0.03, 0.03, 0.012, grey, grey],
    [0.1, 0.022, 0.022, 0.016, grey, grey],
    [0.113, 0.013, 0.014, 0.01, bill, bill],
    [0.13, 0.0, 0.0, 0.0, bill, bill],
  ], 7);
  const g = b.geometry();
  g.rotateX(-1.0); // nose up, tail hanging
  g.translate(0, 0.085, 0.01);
  return g;
}

/** Perch spots in the scene: [{ x, y, z, kind, id }]. */
export function collectSites(scene) {
  const out = [];
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const tree = /^impostor_tree/.test(o.name);
    const pole = o.name === 'flood_pole_mesh';
    if (!tree && !pole) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      m4.multiplyMatrices(o.matrixWorld, m4).decompose(v, q, s);
      if (pole) { out.push({ x: v.x, y: v.y + s.y * 1.0 + 0.04, z: v.z, kind: 'mast', id: out.length }); continue; }
      if (s.x < 0.8) continue;
      // Four branch spots in the upper crown of a tree.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + (v.x * 12.9 + v.z * 7.7) % 1.7;
        const r = (2.0 + 1.6 * ((k * 37 + v.x * 3.1) % 1)) * s.x;
        out.push({ x: v.x + Math.cos(a) * r, y: (6.2 + 2.6 * ((k * 53 + v.z * 5.3) % 1)) * s.y, z: v.z + Math.sin(a) * r, kind: 'tree', id: out.length });
      }
    }
  });
  return out;
}

export function createPerch(env) {
  const { scene, rig, camera, makeFly, lib, call } = env;
  const fly = makeFly(); // { mesh, shadow, fold }: the flying model, a mesh of its own
  const geo = perchedGeometry(lib);
  geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2));
  const sitMesh = new THREE.InstancedMesh(geo, lib.gradeLife(lib.birdMaterial()), MAX);
  const sitShadow = new THREE.InstancedMesh(geo, env.shadowFor(0.2), MAX);
  for (const o of [sitMesh, sitShadow, fly.mesh, fly.shadow]) {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.visible = false;
    o.count = 0;
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  sitMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  sitMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  fly.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  fly.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  sitMesh.name = 'life_parakeets_perched';
  sitShadow.name = 'life_parakeets_perched_shadow';
  fly.mesh.name = 'life_parakeets_hop';
  fly.shadow.name = 'life_parakeets_hop_shadow';
  sitShadow.renderOrder = fly.shadow.renderOrder = 1;
  scene.add(sitMesh, sitShadow, fly.mesh, fly.shadow);

  let sites = null;
  let visit = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const tint = new THREE.Color();

  const bez = (a, c, b, k, out) => {
    const w = 1 - k;
    return out.set(w * w * a.x + 2 * w * k * c.x + k * k * b.x, w * w * a.y + 2 * w * k * c.y + k * k * b.y, w * w * a.z + 2 * w * k * c.z + k * k * b.z);
  };
  const yawOf = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const onScreen = (x, z) => { const s = rig.screenOf(x, z); return s.x > 40 && s.x < innerWidth - 40 && s.y > 70 && s.y < innerHeight - 90; };

  /** Where a visit can happen: an anchor site near the middle of the view, and the sites round it a hop away. */
  function choose() {
    sites ??= collectSites(scene);
    const { x, z } = rig.state;
    const near = sites.filter((s) => Math.hypot(s.x - x, s.z - z) < REACH && onScreen(s.x, s.z));
    if (!near.length) return null;
    // Prefer the middle of what is seen: sort by distance to the view's centre, take among the closest.
    near.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const anchor = pick(near.slice(0, Math.min(14, near.length)));
    const around = sites.filter((s) => s !== anchor && Math.hypot(s.x - anchor.x, s.z - anchor.z) < HOP_MAX);
    return { anchor, around: [anchor, ...around] };
  }

  const free = (s) => !visit.birds.some((b) => b.site === s || (b.to === s) || (b.P && Math.hypot(b.P.x - s.x, b.P.z - s.z) < 0.9 && Math.abs(b.P.y - s.y) < 1.2 && b.state === 'sit'));

  function launch() {
    const c = choose();
    if (!c) return false;
    const { anchor, around } = c;
    const ang = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const n = 3 + Math.floor(Math.random() * 4);
    const now = performance.now() / 1000;
    const birds = [];
    visit = { birds, anchor, around, dir, until: 0, leaving: false, stay: rand(32, 70), t0: now };
    const TINTS = env.tints;
    for (let i = 0; i < n; i++) {
      const spot = around.filter((s) => free(s) && Math.hypot(s.x - anchor.x, s.z - anchor.z) < (i < 2 ? 4 : 10));
      const site = spot.length ? pick(spot) : null;
      if (!site) continue;
      const P = new THREE.Vector3(site.x, site.y, site.z);
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      birds.push({
        P, site, state: 'in', yaw: rand(0, Math.PI * 2),
        a: P.clone().addScaledVector(dir, -rand(60, 85)).addScaledVector(side, rand(-10, 10)).setY(P.y + rand(5, 9)),
        c: P.clone().addScaledVector(dir, -rand(6, 10)).addScaledVector(side, rand(-2, 2)).setY(P.y + rand(1.6, 3)),
        t0: now + i * rand(0.25, 0.7), dur: rand(6, 8), ph: rand(0, 6.28), beat: rand(8.5, 10.5),
        act: 'look', actAt: 0, actUntil: 0, hopAt: now + rand(10, 24), tint: TINTS[Math.floor(Math.random() * TINTS.length)], bob: 0, to: null, callAt: now + rand(2, 6),
      });
    }
    if (!birds.length) { visit = null; return false; }
    for (const o of [sitMesh, sitShadow, fly.mesh, fly.shadow]) o.visible = true;
    return true;
  }

  function hop(b, now) {
    const opts = visit.around.filter((s) => s !== b.site && free(s) && Math.hypot(s.x - b.P.x, s.z - b.P.z) < HOP_MAX && Math.hypot(s.x - b.P.x, s.z - b.P.z) > 1.4);
    if (!opts.length) { b.hopAt = now + rand(6, 12); return; }
    const to = pick(opts);
    b.to = to;
    b.state = 'flit';
    b.a = b.P.clone();
    b.b = new THREE.Vector3(to.x, to.y, to.z);
    const d = b.a.distanceTo(b.b);
    b.c = b.a.clone().lerp(b.b, 0.5).setY(Math.max(b.a.y, b.b.y) + 0.8 + d * 0.16);
    b.t0 = now;
    b.dur = 0.9 + d / 7;
    b.site = null;
    call(b.P.x, b.P.z, 0.7);
  }

  /** The visit is over: each bird goes in its own time, one after another. */
  function leaveAll(now) {
    visit.leaving = true;
    visit.birds.forEach((b, i) => { b.leaveAt = now + i * rand(0.3, 1.1); });
  }

  function startOut(b, now) {
    b.state = 'out';
    b.a = b.P.clone();
    b.c = b.P.clone().addScaledVector(visit.dir, rand(2, 4)).setY(b.P.y + rand(1.2, 2.2));
    b.b = b.P.clone().addScaledVector(visit.dir, rand(70, 100)).setY(b.P.y + rand(8, 16));
    b.t0 = now;
    b.dur = rand(5, 7);
    b.site = null;
    call(b.P.x, b.P.z, 0.8);
  }

  function writeTint(mesh, k, c) { tint.setRGB(...c); mesh.setColorAt(k, tint); }

  function tick(now) {
    if (!visit) return false;
    const { birds } = visit;
    let nf = 0; let ns = 0; let gone = 0;
    if (!visit.upAt && birds.every((b) => b.state === 'sit')) visit.upAt = now + visit.stay;
    if (visit.upAt && now > visit.upAt && !visit.leaving) leaveAll(now);
    for (const b of birds) {
      if (b.state === 'sit') {
        // Perched: look about, preen, call; now and then hop on.
        if (now > b.actUntil) {
          b.act = pick(['look', 'look', 'preen', 'call', 'look', 'preen']);
          b.actAt = now;
          b.actUntil = now + (b.act === 'call' ? 0.9 : b.act === 'preen' ? rand(1.4, 3) : rand(1.5, 4));
          b.turn = rand(-0.9, 0.9);
          b.yaw0 = b.yaw;
          if (b.act === 'call') call(b.P.x, b.P.z, 1);
        }
        const k = (now - b.actAt) / Math.max(0.01, b.actUntil - b.actAt);
        let pitch = 0; let roll = 0; let lift = 0; let yaw = b.yaw;
        if (b.act === 'look') {
          yaw = b.yaw0 + b.turn * THREE.MathUtils.smoothstep(k, 0, 0.3); // the body turns to look, held
          b.yaw = yaw;
        } else if (b.act === 'preen') {
          // Head down to the wing: the body leans over and the scrub is a quick shiver.
          const lean = Math.sin(Math.PI * THREE.MathUtils.clamp(k, 0, 1)) ** 0.6;
          pitch = 0.32 * lean + 0.05 * lean * Math.sin(now * 38 + b.ph);
          roll = 0.18 * lean * Math.sin(now * 2.1);
        } else {
          // A call: up on the toes, the body jerks forward on each note.
          lift = 0.012 * Math.sin(Math.PI * k);
          pitch = 0.06 * Math.max(0, Math.sin(now * 22 + b.ph)) * Math.sin(Math.PI * k);
        }
        if (b.callAt < now && !visit.leaving) { b.callAt = now + rand(5, 16); if (b.act !== 'call') call(b.P.x, b.P.z, 0.6); }
        if (now > b.hopAt && !visit.leaving && b.act !== 'preen') { hop(b, now); b.hopAt = now + rand(9, 20); }
        if (visit.leaving && now >= (b.leaveAt ?? 0)) startOut(b, now);
        if (b.state === 'sit') {
          p.set(b.P.x, b.P.y + lift, b.P.z);
          m4.compose(p, q.setFromEuler(e.set(pitch, yaw, roll, 'YXZ')), one);
          sitMesh.setMatrixAt(ns, m4);
          sitShadow.setMatrixAt(ns, m4);
          writeTint(sitMesh, ns, b.tint);
          ns++;
          continue;
        }
      }
      if (now < b.t0) continue; // not here yet
      const u = THREE.MathUtils.clamp((now - b.t0) / b.dur, 0, 1);
      const state = b.state;
      const ease = (k) => (state === 'in' ? 1 - (1 - k) ** 1.9 : state === 'out' ? k ** 1.5 : k * k * (3 - 2 * k));
      const target = state === 'out' ? b.b : state === 'flit' ? b.b : b.P;
      bez(b.a, b.c, target, ease(u), p);
      bez(b.a, b.c, target, ease(Math.min(1, u + 0.03)), ahead);
      const yaw = ahead.distanceToSquared(p) > 1e-7 ? yawOf(p, ahead) : b.yaw;
      const climb = Math.atan2(ahead.y - p.y, Math.hypot(ahead.x - p.x, ahead.z - p.z) + 1e-4);
      const landing = state === 'in' || state === 'flit';
      const flare = landing ? THREE.MathUtils.smoothstep(u, 0.72, 0.97) : 0;
      // quick beats; the flare is a hard flutter, wings spread and cupped, nose up
      const ph = (now - b.t0) * b.beat * Math.PI * 2 + b.ph;
      const wingBeat = stroke(ph);
      let s = 0.1 + 0.62 * wingBeat;
      let w = -0.25 * (1 - Math.cos(ph - 0.8));
      s = THREE.MathUtils.lerp(s, 0.35 + 0.65 * Math.sin(ph * 1.3), flare);
      w = THREE.MathUtils.lerp(w, -0.2 - 0.25 * Math.max(0, -Math.sin(ph * 1.3)), flare);
      if (state === 'out' && u < 0.12) { s = 0.15 + 0.7 * Math.sin(ph * 1.2); w = -0.2; }
      const pitchN = -climb * 0.8 - flare * 0.9;
      if (landing && u >= 1) {
        b.state = 'sit';
        b.P.copy(target);
        b.yaw = yaw;
        b.site = state === 'flit' ? b.to : b.site;
        b.to = null;
        b.act = 'look'; b.actAt = now; b.actUntil = now + rand(1, 2.5); b.yaw0 = b.yaw; b.turn = 0;
        b.hopAt = Math.max(b.hopAt, now + rand(8, 18));
        p.set(b.P.x, b.P.y, b.P.z);
        m4.compose(p, q.setFromEuler(e.set(0, b.yaw, 0, 'YXZ')), one);
        sitMesh.setMatrixAt(ns, m4); sitShadow.setMatrixAt(ns, m4); writeTint(sitMesh, ns, b.tint); ns++;
        continue;
      }
      if (state === 'out' && u >= 1) { gone++; continue; }
      b.yaw = yaw;
      m4.compose(p, q.setFromEuler(e.set(pitchN, yaw, Math.sin(now * 3 + b.ph) * 0.12, 'YXZ')), one);
      fly.mesh.setMatrixAt(nf, m4);
      fly.shadow.setMatrixAt(nf, m4);
      fly.fold.setXY(nf, s, w);
      writeTint(fly.mesh, nf, b.tint);
      nf++;
    }
    for (const [a, c, n] of [[sitMesh, sitShadow, ns], [fly.mesh, fly.shadow, nf]]) {
      a.count = c.count = n;
      a.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
      if (a.instanceColor) a.instanceColor.needsUpdate = true;
    }
    fly.fold.needsUpdate = true;
    if (visit.leaving && gone === birds.length) {
      for (const o of [sitMesh, sitShadow, fly.mesh, fly.shadow]) { o.visible = false; o.count = 0; }
      visit = null;
      return false;
    }
    return true;
  }

  return {
    launch,
    tick,
    get active() { return !!visit; },
    debug: () => (visit ? { anchor: [+visit.anchor.x.toFixed(1), +visit.anchor.z.toFixed(1), visit.anchor.kind], sites: sites?.length, birds: visit.birds.map((b) => `${b.state}${b.state === 'sit' ? ':' + b.act : ''}`).join(','), at: visit.birds.map((b) => [+b.P.x.toFixed(1), +b.P.y.toFixed(1), +b.P.z.toFixed(1)]) } : { sites: sites?.length ?? 0 }),
  };
}
