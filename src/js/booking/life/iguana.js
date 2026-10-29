import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { pathGrid } from './cat.js';
import { liveSunDir } from './clock.js';

// A green iguana (round 7, "clublife"): Miami's most common lizard, basking at the foot of a sunny
// wall or along the perimeter fence where the hedge gives cover. Adult size (1.4 m nose to tail
// tip, two thirds of it tail), grey-green with the banded tail and the orange cast older males
// have. It lies flat in the sun, now and then turns its head, bobs it, or curls its tail a little,
// and every so often shuffles round. When the cat comes near it bolts for the hedge, body and tail
// swinging, and turns up somewhere else a minute or two later.
//
// The body is one mesh skinned along a 25-joint spine in the vertex shader: the CPU lays the spine
// out each frame (heading, head yaw, tail curl, the running wave) and every vertex is placed from
// its spine coordinate and its offset from the spine (legs swing about their hips). The shadow is
// the same mesh flattened along the sun onto the ground.

const JOINTS = 25;
const LEN = 1.4; // m, snout to tail tip
const VENT = 0.95; // spine coordinate of the hips (from the tail tip)
const SHOULDER = 1.2;
const NECK = 1.29;
const FLEE_R = 6; // m: the cat this close and it runs
const RUN = 3.6; // m/s
const STROLL = 0.35;
const REAPPEAR = [55, 110];
const COUNT = 5; // row 175: a few round the grounds, a real one is small from the drone
const SPREAD = 9; // m between two basking lizards
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smooth = (x) => x * x * (3 - 2 * x);

// --- Geometry (spine space: aS = joint index 0..24 from the tail tip; aOff = right, up, forward) ----

function iguanaGeometry() {
  const pos = []; const col = []; const sp = []; const off = []; const leg = [];
  const c = new THREE.Color();
  const v = (s, o, hex, l = [0, 0]) => {
    pos.push(0, 0, 0);
    c.set(hex);
    col.push(c.r, c.g, c.b);
    sp.push((s / LEN) * (JOINTS - 1));
    off.push(o[0], o[1], o[2]);
    leg.push(l[0], l[1]);
  };
  const tri = (a, b, d) => { v(...a); v(...b); v(...d); };
  // Sections: [s, half width, half height, centre height, upper colour, belly colour]
  const band = (s) => (s < VENT && Math.floor(s / 0.085) % 2 ? '#4a5236' : '#8c9a5e');
  const sections = [
    [0.0, 0.003, 0.003, 0.012],
    [0.15, 0.01, 0.009, 0.016],
    [0.35, 0.019, 0.016, 0.022],
    [0.6, 0.032, 0.026, 0.031],
    [0.82, 0.047, 0.036, 0.04],
    [0.95, 0.066, 0.046, 0.048],
    [1.05, 0.084, 0.054, 0.055],
    [1.14, 0.086, 0.056, 0.058],
    [1.21, 0.068, 0.05, 0.06],
    [1.27, 0.047, 0.043, 0.062],
    [1.31, 0.049, 0.046, 0.067],
    [1.36, 0.039, 0.035, 0.065],
    [1.395, 0.018, 0.019, 0.059],
    [1.4, 0.0, 0.0, 0.057],
  ]; // an adult male: heavy-bodied, the tail thick at the base
  const SEG = 8;
  const ringAt = (sec) => Array.from({ length: SEG }, (_, i) => {
    const a = (i / SEG) * Math.PI * 2;
    const up = Math.sin(a);
    const s = sec[0];
    const top = s > NECK ? '#8b8a5a' : band(s);
    const belly = s > NECK ? '#a29c6b' : '#9a9a6c';
    return { o: [Math.cos(a) * sec[1], sec[3] + up * sec[2], 0], col: up > -0.25 ? top : belly, s };
  });
  for (let k = 0; k < sections.length - 1; k++) {
    const A = ringAt(sections[k]);
    const B = ringAt(sections[k + 1]);
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      const q = (r) => [r.s, r.o, r.col];
      tri(q(A[i]), q(B[j]), q(B[i]));
      tri(q(A[i]), q(A[j]), q(B[j]));
    }
  }
  // Dorsal crest: a row of small spines from the neck down the first third of the tail.
  for (let s = 0.62; s < NECK; s += 0.035) {
    const h = s > 1.0 ? 0.03 : 0.018;
    const y = 0.03 + 0.06 * Math.min(1, (s - 0.5) / 0.6);
    tri([s - 0.012, [0, y, 0], '#9a7a45'], [s + 0.012, [0, y, 0], '#9a7a45'], [s, [0, y + h, 0], '#b88a4c']);
  }
  // Dewlap: a flat fold under the throat.
  tri([1.27, [0, 0.03, 0], '#b88a4c'], [1.35, [0, 0.035, 0], '#b88a4c'], [1.3, [0, 0.0, 0], '#a87a42']);
  // Legs: splayed out from the hips and shoulders, elbows/knees up, feet flat with long toes.
  // aLeg = (swing amplitude, phase): diagonal pairs move together (a lizard's trot).
  for (const [s, side, phase] of [[SHOULDER, 1, 0], [SHOULDER, -1, Math.PI], [VENT + 0.02, 1, Math.PI], [VENT + 0.02, -1, 0]]) {
    const hind = s < 1;
    const out = hind ? 0.2 : 0.17;
    const knee = [side * out * 0.55, 0.075, hind ? -0.02 : 0.03];
    const foot = [side * out, 0.0, hind ? -0.07 : 0.05];
    const hip = [side * 0.06, 0.05, 0];
    const w = 0.014;
    const l = [0.55, phase];
    const limb = (a, b, wd) => {
      tri([s, [a[0], a[1] + wd, a[2]], '#5f6a40', l], [s, [b[0], b[1] + wd, b[2]], '#5f6a40', l], [s, [b[0], b[1] - wd, b[2]], '#4b5434', l]);
      tri([s, [a[0], a[1] + wd, a[2]], '#5f6a40', l], [s, [b[0], b[1] - wd, b[2]], '#4b5434', l], [s, [a[0], a[1] - wd, a[2]], '#4b5434', l]);
      tri([s, [a[0], a[1], a[2] + wd], '#5f6a40', l], [s, [b[0], b[1], b[2] + wd], '#5f6a40', l], [s, [b[0], b[1], b[2] - wd], '#4b5434', l]);
      tri([s, [a[0], a[1], a[2] + wd], '#5f6a40', l], [s, [b[0], b[1], b[2] - wd], '#4b5434', l], [s, [a[0], a[1], a[2] - wd], '#4b5434', l]);
    };
    limb(hip, knee, w);
    limb(knee, foot, w * 0.8);
    // toes
    for (const t of [-0.5, 0, 0.5]) {
      const tip = [foot[0] + side * 0.03 * Math.cos(t), 0.003, foot[2] + 0.045 * Math.sin(t) + (hind ? -0.01 : 0.01)];
      tri([s, [foot[0], 0.006, foot[2] - 0.005], '#4b5434', l], [s, [foot[0], 0.006, foot[2] + 0.005], '#4b5434', l], [s, tip, '#3d4330', l]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sp, 1));
  g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 3));
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 2));
  // Normals in spine space: computed on a straight spine laid along +z.
  const straight = g.clone();
  const p = straight.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = (sp[i] / (JOINTS - 1)) * LEN;
    p.setXYZ(i, off[i * 3], off[i * 3 + 1], s + off[i * 3 + 2]);
  }
  straight.computeVertexNormals();
  g.setAttribute('normal', straight.attributes.normal);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const SPINE_GLSL = /* glsl */`
  uniform vec4 uSpine[${JOINTS}]; // x, z, heading (forward = (sin a, cos a)), y
  uniform float uStride; // leg phase (rad)
  uniform float uSwing;  // 0 at rest … 1 running
  attribute float aS;
  attribute vec3 aOff;
  attribute vec2 aLeg;
  vec4 spineAt(float s, out float ang) {
    float i = clamp(floor(s), 0.0, ${JOINTS - 2}.0);
    float f = s - i;
    vec4 a = uSpine[int(i)];
    vec4 b = uSpine[int(i) + 1];
    float d = b.z - a.z;
    d = atan(sin(d), cos(d));
    ang = a.z + d * f;
    return mix(a, b, f);
  }
  vec3 legOffset(vec3 o) {
    float sw = aLeg.x * uSwing * sin(uStride + aLeg.y);
    float c = cos(sw), s = sin(sw);
    // swing about the vertical through the hip, and lift the foot on the forward stroke
    vec3 r = vec3(c * o.x + s * o.z, o.y, -s * o.x + c * o.z);
    r.y += aLeg.x * uSwing * 0.03 * max(0.0, cos(uStride + aLeg.y)) * step(o.y, 0.02);
    return r;
  }
  vec3 placeSpine(vec3 o, out float ang) {
    vec4 p = spineAt(aS, ang);
    vec3 q = legOffset(o);
    vec2 fwd = vec2(sin(ang), cos(ang));
    vec2 right = vec2(cos(ang), -sin(ang));
    return vec3(p.x + right.x * q.x + fwd.x * q.z, p.w + q.y, p.y + right.y * q.x + fwd.y * q.z);
  }
`;

function iguanaMaterial(uniforms, shadow, sunDir) {
  const m = shadow
    ? new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (shadow) shader.uniforms.uSun = { value: sunDir };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SPINE_GLSL}\n${shadow ? 'uniform vec3 uSun;\nuniform float uGroundY;' : ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          float na;
          spineAt(aS, na);
          float c = cos(na), s = sin(na);
          // spine space (x right, z forward) → world, about y
          objectNormal = vec3(c * objectNormal.x + s * objectNormal.z, objectNormal.y, -s * objectNormal.x + c * objectNormal.z);
        }`)
      .replace('#include <begin_vertex>', `float bpAng;
        vec3 transformed = placeSpine(aOff, bpAng);
        ${shadow ? 'vec3 bpSun = normalize(uSun); transformed -= bpSun * ((transformed.y - uGroundY) / max(bpSun.y, 0.15)); transformed.y = uGroundY + 0.004;' : ''}`);
  };
  m.customProgramCacheKey = () => `life-iguana-${shadow}`;
  return shadow ? m : gradeLife(m);
}

// --- System ---------------------------------------------------------------------------------

export function createIguana(ctx, { still }) {
  if (still) return null;
  const { scene, root, camera, hedge = [], cat, quality, threats = () => [] } = ctx;
  const grid = pathGrid(root);
  if (!grid || !hedge.length) return null;
  const sun = liveSunDir(ctx);

  // Buildings it must run round, not through.
  const blocks = ['clubhouse_mesh001', 'storage_shed_mesh'].map((n) => root.getObjectByName(n)).filter(Boolean)
    .map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.4));
  /** Does the segment a → b cross a building? */
  const crosses = (p, q) => {
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 1e-3) return null;
    const ray = new THREE.Ray(new THREE.Vector3(p.x, 0.5, p.z), new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize());
    const hit = new THREE.Vector3();
    return blocks.find((box) => ray.intersectBox(box, hit) && hit.distanceTo(ray.origin) < len) ?? null;
  };
  // Cover: the perimeter hedge and every shrub and flower bed on the grounds.
  const cover = [...hedge];
  {
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !/^impostor_(bush|flower)/.test(o.name)) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld);
        cover.push({ x: v.x, z: v.z });
      }
    });
  }
  // Basking spots: the walk along the clubhouse's sunny front, and path edges beside a shrub or the
  // hedge; each with the nearest cover it can reach in a dash without running round a building.
  const house = root.getObjectByName('clubhouse_mesh001');
  const hb = house ? new THREE.Box3().setFromObject(house) : null;
  const spots = [];
  for (const c of grid.cells) {
    const p = grid.centre(c);
    const byHouse = hb && p.x > hb.min.x + 1 && p.x < hb.max.x - 1 && p.z > hb.max.z && p.z < hb.max.z + 1.9;
    const reach = byHouse ? 24 : 6;
    let hide = null;
    let best = reach;
    for (const b of cover) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < best && d > 0.8 && !crosses(p, b)) { best = d; hide = b; }
    }
    if (hide) spots.push({ p, hide, house: byHouse });
  }
  if (!spots.length) return null;
  const nearestBush = (p) => cover.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a), cover[0]);

  const geo = iguanaGeometry();
  const look = new THREE.Vector3();
  function viewCentre() {
    camera.getWorldDirection(look);
    const t = -camera.position.y / look.y;
    return new THREE.Vector3(camera.position.x + look.x * t, 0, camera.position.z + look.z * t);
  }

  /** Waypoints from `a` to `b`, round the corners of any building in the way (one or two corners). */
  function around(a, b) {
    const box = crosses(a, b);
    if (!box) return [b];
    const c = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]]
      .map(([x, z]) => new THREE.Vector3(x + Math.sign(x - (box.min.x + box.max.x) / 2) * 0.3, 0, z + Math.sign(z - (box.min.z + box.max.z) / 2) * 0.3));
    const paths = [];
    for (let i = 0; i < 4; i++) {
      paths.push([c[i]]);
      paths.push([c[i], c[(i + 1) % 4]], [c[i], c[(i + 3) % 4]]);
    }
    const length = (pts) => [a, ...pts, b].reduce((sum, p, k, all) => sum + (k ? p.distanceTo(all[k - 1]) : 0), 0);
    const ok = paths.filter((pts) => [a, ...pts, b].every((p, k, all) => !k || !crosses(all[k - 1], p)));
    ok.sort((x, y) => length(x) - length(y));
    return ok.length ? [...ok[0], b] : [b];
  }


  /** One lizard: its own spine uniforms, meshes and moods; the spots and cover are shared. */
  function makeOne(n) {
    const uniforms = {
      uSpine: { value: Array.from({ length: JOINTS }, () => new THREE.Vector4()) },
      uStride: { value: 0 },
      uSwing: { value: 0 },
      uGroundY: { value: grid.y },
    };
    const body = new THREE.Mesh(geo, iguanaMaterial(uniforms, false));
    const shade = new THREE.Mesh(geo, iguanaMaterial(uniforms, true, sun.dir));
    body.name = `life_iguana_${n}`;
    shade.name = `life_iguana_${n}_shadow`;
    shade.renderOrder = 1;
    for (const o of [body, shade]) {
      o.layers.set(LIFE_LAYER);
      o.frustumCulled = false;
      o.userData.noAO = true;
    }
    scene.add(shade, body);

    const ig = {
      pos: new THREE.Vector3(), // the hips
      heading: 0,
      head: 0, headGoal: 0, // yaw of the head (rad)
      bob: 0, // seconds left of a head-bob display
      curl: 0, curlGoal: 0, // tail curl
      swing: 0, // 0 basking … 1 running
      stride: 0,
      trail: [], // recent hip positions while moving (the body follows its own track)
      state: 'bask', // bask | stroll | flee | away
      goal: null,
      until: 0,
      lift: 0, // body height off the ground (raised when running)
    };

    /** A basking spot, preferably near where the visitor is looking and away from the cat. */
    function spotNear() {
      const centre = viewCentre();
      const c = cat?.where?.();
      const others = herd.filter((o) => o !== self && o.ig.state !== 'away').map((o) => o.ig.pos);
      const ok = spots.filter((s) => (!c || Math.hypot(s.p.x - c.x, s.p.z - c.z) > FLEE_R * 2)
        && others.every((q) => Math.hypot(s.p.x - q.x, s.p.z - q.z) > SPREAD));
      const near = ok.filter((s) => Math.hypot(s.p.x - centre.x, s.p.z - centre.z) < 32);
      return pick(near.length ? near : ok.length ? ok : spots);
    }

    function settle(spot) {
      ig.spot = spot;
      ig.pos.set(spot.p.x + rand(-0.3, 0.3), 0, spot.p.z + rand(-0.3, 0.3));
      // Lie along the wall or the hedge, head a little out.
      const away = spot.hide ? Math.atan2(spot.p.x - spot.hide.x, spot.p.z - spot.hide.z) : 0;
      ig.heading = spot.house
        ? (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.35, 0.35) // along the foot of the wall
        : away + (Math.random() < 0.5 ? 1 : -1) * rand(1.1, 1.9);
      ig.trail = [];
      ig.state = 'bask';
      ig.until = performance.now() / 1000 + rand(3, 8);
    }

    function emerge() {
      // Out of the hedge by a basking spot, a short slow walk into the sun.
      const spot = spotNear();
      const bush = spot.hide ?? nearestBush(spot.p);
      ig.spot = spot;
      ig.pos.set(bush.x, 0, bush.z);
      ig.trail = [];
      ig.goal = spot.p.clone();
      ig.heading = Math.atan2(spot.p.x - bush.x, spot.p.z - bush.z);
      ig.state = 'stroll';
    }

    function flee() {
      const bush = ig.spot?.hide ?? nearestBush(ig.pos);
      const [first, ...rest] = around(ig.pos, new THREE.Vector3(bush.x, 0, bush.z));
      ig.goal = first;
      ig.then = rest;
      ig.state = 'flee';
    }


    // Spine layout: from the hips forwards to the snout and back to the tail tip.
    const ds = LEN / (JOINTS - 1);
    const hipJ = Math.round((VENT / LEN) * (JOINTS - 1));
    function layout(t) {
      const J = uniforms.uSpine.value;
      const wave = ig.swing * 0.38;
      const k = (2 * Math.PI) / 0.75; // one body wave over 0.75 m
      const angle = (i) => {
        const s = i * ds;
        let a = ig.heading;
        // the running wave travels from the head down the tail
        a += wave * Math.sin(k * s - ig.stride) * (s < VENT ? 1.3 : 0.6);
        if (s < VENT) {
          const u = (VENT - s) / VENT; // 0 at the hips … 1 at the tip
          a += ig.curl * u * u * 2.2 + Math.sin(t * 0.6 + s * 3) * 0.05 * (1 - ig.swing) * u;
        }
        if (s > NECK - 0.03) a += ig.head;
        return a;
      };
      const lift = grid.y + ig.lift;
      const headUp = ig.bob > 0 ? Math.abs(Math.sin(ig.bob * Math.PI * 3)) * 0.04 : 0;
      J[hipJ].set(ig.pos.x, ig.pos.z, angle(hipJ), lift);
      for (let i = hipJ + 1; i < JOINTS; i++) {
        const a = angle(i - 0.5);
        const p = J[i - 1];
        const y = lift + (i * ds > NECK ? headUp * ((i * ds - NECK) / (LEN - NECK)) + 0.01 : 0);
        J[i].set(p.x + Math.sin(a) * ds, p.y + Math.cos(a) * ds, angle(i), y);
      }
      for (let i = hipJ - 1; i >= 0; i--) {
        const a = angle(i + 0.5);
        const p = J[i + 1];
        J[i].set(p.x - Math.sin(a) * ds, p.y - Math.cos(a) * ds, angle(i), grid.y + ig.lift * (i / hipJ));
      }
      uniforms.uStride.value = ig.stride;
      uniforms.uSwing.value = ig.swing;
    }


    const self = {
      ig,
      show(v) { body.visible = shade.visible = v; },
      tick(t, dt) {
        // The cat, the cart, the groundskeeper: any of them this close and it runs.
        const near = [cat?.where?.(), ...threats()].some((q) => q && Math.hypot(q.x - ig.pos.x, q.z - ig.pos.z) < FLEE_R);
        if (near && (ig.state === 'bask' || ig.state === 'stroll')) flee();
        if (ig.state === 'away') {
          body.visible = shade.visible = false;
          if (t > ig.until) { emerge(); body.visible = shade.visible = true; }
          return false;
        }
        // Basking: head turns, a bob now and then, the tail settles; sometimes a slow shuffle round.
        if (ig.state === 'bask') {
          ig.swing = Math.max(0, ig.swing - dt * 3);
          ig.lift = Math.max(0, ig.lift - dt * 0.1);
          if (t > ig.until) {
            const r = Math.random();
            if (r < 0.45) ig.headGoal = rand(-0.6, 0.6);
            else if (r < 0.65) ig.bob = 1.1;
            else if (r < 0.85) ig.curlGoal = rand(-0.5, 0.5);
            else {
              const a = ig.heading + rand(-1.2, 1.2);
              ig.goal = new THREE.Vector3(ig.pos.x + Math.sin(a) * rand(0.4, 0.9), 0, ig.pos.z + Math.cos(a) * rand(0.4, 0.9));
              ig.state = 'stroll';
            }
            ig.until = t + rand(2.5, 7);
          }
        } else {
          // Walking or running to the goal; the head leads, the body swings.
          const fast = ig.state === 'flee';
          const speed = fast ? RUN : STROLL;
          ig.swing = Math.min(fast ? 1 : 0.45, ig.swing + dt * (fast ? 6 : 1.5));
          ig.lift = Math.min(fast ? 0.025 : 0.01, ig.lift + dt * 0.2);
          const dx = ig.goal.x - ig.pos.x;
          const dz = ig.goal.z - ig.pos.z;
          const d = Math.hypot(dx, dz);
          const target = Math.atan2(dx, dz);
          let dh = Math.atan2(Math.sin(target - ig.heading), Math.cos(target - ig.heading));
          ig.heading += Math.max(-dt * (fast ? 9 : 2), Math.min(dt * (fast ? 9 : 2), dh));
          const stepLen = Math.min(d, speed * dt * (Math.abs(dh) > 1.2 && !fast ? 0.3 : 1));
          ig.pos.x += (dx / (d || 1)) * stepLen;
          ig.pos.z += (dz / (d || 1)) * stepLen;
          ig.stride += (stepLen / 0.16) * Math.PI; // a stride per ~0.32 m
          ig.headGoal = 0;
          if (d < 0.05 && ig.then?.length) {
            ig.goal = ig.then.shift();
          } else if (d < 0.05) {
            if (fast) { ig.state = 'away'; ig.until = t + rand(...REAPPEAR); } else { ig.state = 'bask'; ig.until = t + rand(2, 5); }
          }
        }
        if (ig.bob > 0) ig.bob = Math.max(0, ig.bob - dt);
        ig.head += (ig.headGoal - ig.head) * Math.min(1, dt * 2.5);
        ig.curl += (ig.curlGoal * (1 - ig.swing) - ig.curl) * Math.min(1, dt * 0.8);
        layout(t);
        return true;
      },
      settle,
      flee,
      spotNear,
    };
    return self;
  }

  const herd = [];
  const count = quality === 'low' ? 3 : COUNT;
  for (let n = 0; n < count; n++) {
    const one = makeOne(n);
    herd.push(one);
    // The first few bask from the start, the rest come out of the hedge later on.
    if (n < 2) one.settle(one.spotNear());
    else { one.ig.state = 'away'; one.ig.until = performance.now() / 1000 + rand(6, 20) * (n - 1); one.show(false); }
  }

  let last = performance.now() / 1000;
  return {
    name: 'iguana',
    tick() {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      sun.update();
      let alive = false;
      for (const one of herd) alive = one.tick(t, dt) || alive;
      return alive;
    },
    debug: () => herd.map(({ ig }) => ({ state: ig.state, x: +ig.pos.x.toFixed(1), z: +ig.pos.z.toFixed(1) })),
    /** They watch the cart themselves (several lizards, one cart): nothing for it to wait for. */
    where: () => null,
    /** Dev: put the first one at the spot nearest (x, z). */
    place(x, z) {
      const s = spots.reduce((a, b) => (Math.hypot(b.p.x - x, b.p.z - z) < Math.hypot(a.p.x - x, a.p.z - z) ? b : a), spots[0]);
      herd[0].settle(s);
      herd[0].show(true);
      return { x: herd[0].ig.pos.x, z: herd[0].ig.pos.z };
    },
    scare() { herd.forEach((one) => { if (one.ig.state === 'bask' || one.ig.state === 'stroll') one.flee(); }); },
    spots: () => spots.map((s) => [+s.p.x.toFixed(1), +s.p.z.toFixed(1), s.house ? 'house' : 'shrub']),
    act(what) {
      const ig = herd[0].ig;
      if (what === 'bob') ig.bob = 1.1; else if (what === 'head') ig.headGoal = rand(-0.7, 0.7); else if (what === 'tail') ig.curlGoal = rand(-0.6, 0.6);
    },
  };
}
