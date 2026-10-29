import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIFE_LAYER, lifeTime, rng } from './shared.js';
import { gradeLife } from '../lookdev.js';

// Tournament day dressing for the show court (round 7, life/tournament.js loads this on demand):
// - temporary aluminium stands on the lawn beside the court: four rows, 0.4 m rise, 0.72 m deep,
//   built in metres and static (they cast into the baked shadow map once, when they go up);
// - a seated crowd: one instanced low-poly person (~400 triangles) on the life layer, muted clothes,
//   heads that follow the ball, forearms that clap after a point; their sun shadows come from an
//   invisible static stand-in, so they fall on the planks like everything else's;
// - pennant strings along the court's end fences and the boundary fence, fluttering with the wind;
// - a scoreboard behind the far baseline: a static frame and a face redrawn when the score changes.

const ROWS = 4;
const RISE = 0.4;
const DEPTH = 0.72;
const LENGTH = 10.2; // along the court; the island trees north and south of the lawn stay clear
const SEAT_PITCH = 0.5;
const FOOT_H = 0.14; // first footboard above the lawn
const SEAT_UP = 0.42; // seat above its own footboard
const footY = (i) => FOOT_H + RISE * i;
const seatY = (i) => footY(i) + SEAT_UP;

const PITCH = THREE.MathUtils.degToRad(52); // the drone's tilt (camera-rig.js): cords face it
const BACK = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));

// Clothes in sun-faded, muted tones; skin and hair across the range.
const SHIRTS = ['#e4e1da', '#2f3a4c', '#56606b', '#7d8560', '#a8997a', '#9c5a3c', '#6d8597', '#93a08d', '#3d3f42', '#b9b3a8', '#8a4c4c', '#c8bca3', '#4f6f6b', '#646544', '#36251b', '#5b4a63'];
const PANTS = ['#2e3a4f', '#3b4656', '#2e3a4f', '#9c8d70', '#d6d1c6', '#5a5d61', '#25272a', '#6a6b4c', '#7a6e5e'];
const SKIN = ['#f1d2bd', '#e3b899', '#c99673', '#a8754f', '#7c5134', '#5a3a26'];
const HAIR = ['#1d1612', '#2e2119', '#4a3324', '#76573a', '#b89a6a', '#8c8c8c', '#d8d2c6'];
const CAPS = ['#f2f0ea', '#2f3a4c', '#b9ab8c', '#646544', '#9c441f'];
const PENNANTS = ['#9c441f', '#fff3da', '#646544', '#36251b', '#e8e2d4'];

const lin = (hex) => new THREE.Color(hex); // THREE.Color parses sRGB hex into linear

// --- Shared bits ---------------------------------------------------------------------------

/** A box between two points (a limb, a tube, a beam), `w` × `d` across. */
function beam(a, b, w, d = w) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(w, dir.length(), d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

const v3 =(x, y, z) => new THREE.Vector3(x, y, z);

// --- Stands ------------------------------------------------------------------------------------

/**
 * Stands in a local frame: u runs back from the front edge (away from the court), y up, w along the
 * court. `place(u, y, w)` maps to the world.
 */
function standGeometry(place) {
  const planks = [];
  const frame = [];
  const P = (u, y, w) => place(u, y, w);
  const half = LENGTH / 2 + 0.05;
  const plank = (u0, u1, y, t) => {
    const c = P((u0 + u1) / 2, y - t / 2, 0);
    planks.push(new THREE.BoxGeometry(u1 - u0, t, LENGTH + 0.1).translate(c.x, c.y, c.z));
  };
  for (let i = 0; i < ROWS; i++) {
    const u = DEPTH * i;
    plank(u + 0.02, u + 0.155, footY(i), 0.035);
    plank(u + 0.165, u + 0.3, footY(i), 0.035);
    plank(u + 0.43, u + 0.545, seatY(i), 0.04);
    plank(u + 0.555, u + 0.67, seatY(i), 0.04);
  }
  const back = DEPTH * ROWS - 0.03;
  const railTop = seatY(ROWS - 1) + 0.78;
  const frames = Math.round(LENGTH / 2.5) + 1;
  for (let k = 0; k < frames; k++) {
    const w = -LENGTH / 2 + 0.15 + (k * (LENGTH - 0.3)) / (frames - 1);
    // Sloped stringer under the rows, three legs, one brace.
    frame.push(beam(P(0.06, 0.06, w), P(back, seatY(ROWS - 1) - 0.06, w), 0.07, 0.05));
    for (const u of [0.08, back * 0.5, back]) {
      const top = FOOT_H + (u / back) * (seatY(ROWS - 1) - FOOT_H);
      frame.push(beam(P(u, 0, w), P(u, top, w), 0.06));
      frame.push(new THREE.BoxGeometry(0.2, 0.012, 0.2).translate(...P(u, 0.006, w).toArray())); // base plate
    }
    frame.push(beam(P(0.1, 0.1, w), P(back * 0.5, FOOT_H + 0.5 * (seatY(ROWS - 1) - FOOT_H) - 0.1, w), 0.04));
    frame.push(beam(P(back * 0.5, 0.1, w), P(back, seatY(ROWS - 1) - 0.2, w), 0.04));
    // Brackets that carry each row's footboard and seat.
    for (let i = 0; i < ROWS; i++) {
      const u = DEPTH * i;
      frame.push(beam(P(u, footY(i) - 0.05, w), P(u + 0.32, footY(i) - 0.05, w), 0.05, 0.04));
      frame.push(beam(P(u + 0.42, seatY(i) - 0.06, w), P(u + 0.69, seatY(i) - 0.06, w), 0.05, 0.04));
      frame.push(beam(P(u + 0.6, footY(i) - 0.05, w), P(u + 0.6, seatY(i) - 0.06, w), 0.04));
    }
    // Guard rail post at the back.
    frame.push(beam(P(back, seatY(ROWS - 1) - 0.2, w), P(back, railTop, w), 0.045));
  }
  // Back rails and the sloped end rails.
  for (const y of [railTop, railTop - 0.42]) frame.push(beam(P(back, y, -half), P(back, y, half), 0.045));
  for (const w of [-half, half]) {
    frame.push(beam(P(0.02, footY(0) + 0.9, w), P(back, railTop, w), 0.045));
    frame.push(beam(P(0.02, 0, w), P(0.02, footY(0) + 0.9, w), 0.045));
    frame.push(beam(P(0.02, footY(0) + 0.45, w), P(back, railTop - 0.42, w), 0.035));
  }
  return { planks: mergeGeometries(planks), frame: mergeGeometries(frame) };
}

// --- Crowd ------------------------------------------------------------------------------------

// Rig pivots (person space: seat top under the hips at the origin, facing +z).
const NECK = v3(0, 0.6, -0.02);
const ELBOW = 0.21;
const ELBOW_Y = 0.27;
const ELBOW_Z = 0.03;

/** One seated person; per-vertex part (0 shirt, 1 trousers, 2 skin, 3 hair, 4 shoes, 5 cap brim) and rig (0 body, 1 head, 2/3 forearms). */
function personGeometry() {
  const parts = [];
  const add = (g, part, rig) => {
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    g.setAttribute('aRig', new THREE.BufferAttribute(new Float32Array(n).fill(rig), 1));
    parts.push(g);
  };
  const torso = new THREE.CapsuleGeometry(0.13, 0.26, 2, 8);
  torso.scale(1.24, 1, 0.8).translate(0, 0.33, -0.03);
  add(torso, 0, 0);
  add(new THREE.BoxGeometry(0.32, 0.12, 0.24).translate(0, 0.07, 0), 1, 0);
  for (const s of [-1, 1]) {
    add(beam(v3(0.09 * s, 0.08, -0.02), v3(0.1 * s, 0.09, 0.42), 0.14, 0.15), 1, 0); // thigh
    add(beam(v3(0.1 * s, 0.1, 0.42), v3(0.1 * s, -0.37, 0.46), 0.11), 1, 0); // shin
    add(new THREE.BoxGeometry(0.1, 0.07, 0.24).translate(0.1 * s, -0.385, 0.52), 4, 0); // shoe
    const shoulder = v3(0.19 * s, 0.5, -0.03);
    const elbow = v3(ELBOW * s, ELBOW_Y, ELBOW_Z);
    const mid = shoulder.clone().lerp(elbow, 0.55);
    add(beam(shoulder, mid, 0.095), 0, 0); // sleeve
    add(beam(mid, elbow, 0.08), 2, 0);
    const wrist = v3(0.13 * s, 0.17, 0.31);
    const rig = s < 0 ? 2 : 3;
    add(beam(elbow, wrist, 0.075), 2, rig);
    add(beam(wrist, v3(0.11 * s, 0.15, 0.4), 0.07, 0.035), 2, rig);
  }
  add(beam(v3(0, 0.55, -0.02), v3(0, 0.65, -0.01), 0.08), 2, 1); // neck
  const head = new THREE.SphereGeometry(0.1, 10, 8);
  head.scale(0.92, 1.15, 1).translate(0, 0.735, 0);
  add(head, 2, 1);
  const hair = new THREE.SphereGeometry(0.106, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hair.scale(0.94, 1.1, 1.02).translate(0, 0.745, -0.012);
  add(hair, 3, 1);
  add(new THREE.BoxGeometry(0.17, 0.014, 0.09).translate(0, 0.79, 0.105), 5, 1); // cap brim
  // Strip to the attributes every part has.
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aPart', 'aRig'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(parts);
}

/** A rough body for the sun to cast from (torso, head, thighs), in person space. */
function proxyParts() {
  return [
    new THREE.BoxGeometry(0.3, 0.5, 0.19).translate(0, 0.33, -0.03),
    new THREE.BoxGeometry(0.17, 0.22, 0.19).translate(0, 0.73, 0),
    new THREE.BoxGeometry(0.3, 0.13, 0.42).translate(0, 0.08, 0.2),
  ];
}

function crowdMaterial(sun, uniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart;
        attribute float aRig;
        attribute vec3 aShirt;
        attribute vec3 aPants;
        attribute vec3 aSkin;
        attribute vec3 aHair;
        attribute vec3 aSeed; // phase, look lag, cap (0/1)
        attribute float aClap;
        uniform float uTime;
        uniform vec3 uLookA;
        uniform vec3 uLookB;
        varying vec3 vTint;
        mat3 bpRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 bpRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        mat3 bpR = mat3(1.0);
        vec3 bpPivot = vec3(0.0);
        float bpPhase = aSeed.x * 6.2831;
        if (aRig > 0.5 && aRig < 1.5) {
          // The head turns to the ball (two smoothings: some people are a beat behind).
          bpPivot = vec3(${NECK.x.toFixed(2)}, ${NECK.y.toFixed(2)}, ${NECK.z.toFixed(2)});
          vec3 look = mix(uLookA, uLookB, aSeed.y);
          vec3 at = (modelMatrix * instanceMatrix * vec4(bpPivot, 1.0)).xyz;
          vec3 d = transpose(mat3(instanceMatrix)) * (look - at);
          float yaw = clamp(atan(d.x, d.z), -1.25, 1.25);
          float down = clamp(atan(-d.y, length(d.xz)), -0.15, 0.55);
          bpR = bpRotY(yaw) * bpRotX(down * 0.8);
        } else if (aRig > 1.5) {
          // Forearms: up in front of the chest, hands meeting about four times a second.
          float side = aRig < 2.5 ? -1.0 : 1.0;
          bpPivot = vec3(side * ${ELBOW.toFixed(2)}, ${ELBOW_Y.toFixed(2)}, ${ELBOW_Z.toFixed(2)});
          float clap = aClap;
          float hit = 0.5 + 0.5 * sin(uTime * (24.0 + aSeed.x * 4.0) + bpPhase);
          bpR = bpRotY(-side * clap * (0.24 + 0.27 * hit)) * bpRotX(-0.95 * clap);
        }
        // A slow sway from the hips, everyone on their own beat.
        mat3 bpLean = bpRotX(0.03 * sin(uTime * (0.7 + aSeed.y * 0.5) + bpPhase) + 0.06 * aClap);
        objectNormal = bpLean * (bpR * objectNormal);`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = bpPivot + bpR * (position - bpPivot);
        transformed = vec3(0.0, 0.08, 0.0) + bpLean * (transformed - vec3(0.0, 0.08, 0.0));
        if (aPart > 4.5 && aSeed.z < 0.5) transformed = bpPivot; // no cap, no brim
        vTint = aPart < 0.5 ? aShirt : aPart < 1.5 ? aPants : aPart < 2.5 ? aSkin : aPart < 4.5 && aPart > 3.5 ? vec3(aSeed.x > 0.5 ? 0.86 : 0.03) : aHair;`)
      .replace('#include <color_vertex>', '#include <color_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTint;');
  };
  m.customProgramCacheKey = () => 'bp-crowd';
  return gradeLife(m);
}

// --- Pennants -----------------------------------------------------------------------------------

/**
 * Pennant strings: each run is a cord from `a` to `b` (sagging between posts every ~3.5 m) with a
 * pennant every 0.32 m. `n` is the horizontal normal of the fence the run hangs on.
 */
function pennantGeometry(runs) {
  const pos = [];
  const nrm = [];
  const col = [];
  const hang = [];
  const phase = [];
  const fence = [];
  const random = rng(4417);
  const colors = PENNANTS.map(lin);
  const push = (p, n, c, h, ph, f) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); hang.push(h); phase.push(ph); fence.push(f.x, f.z); };
  const cordColor = lin('#3a3a38');
  for (const { a, b, n } of runs) {
    const len = a.distanceTo(b);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const spans = Math.max(1, Math.round(len / 3.5));
    const sagAt = (s) => { const f = (s * spans) % 1; return 0.14 * 4 * f * (1 - f); };
    const at = (s) => a.clone().lerp(b, s).add(new THREE.Vector3(0, -sagAt(s), 0));
    // Cord: a thin ribbon turned to the drone.
    const width = new THREE.Vector3().crossVectors(BACK, dir).normalize().multiplyScalar(0.018);
    const steps = spans * 8;
    for (let k = 0; k < steps; k++) {
      const p0 = at(k / steps);
      const p1 = at((k + 1) / steps);
      const q = [p0.clone().add(width), p0.clone().sub(width), p1.clone().add(width), p1.clone().sub(width)];
      for (const i of [0, 1, 2, 1, 3, 2]) push(q[i], BACK, cordColor, 0, 0, n);
    }
    const count = Math.floor(len / 0.32);
    for (let k = 0; k < count; k++) {
      const s = (k + 0.5) / count;
      const c = colors[k % colors.length];
      const top = at(s);
      const l = top.clone().addScaledVector(dir, -0.11);
      const r = top.clone().addScaledVector(dir, 0.11);
      const tipLen = 0.3;
      const ml = l.clone().lerp(r, 0.25).add(new THREE.Vector3(0, -tipLen * 0.5, 0));
      const mr = l.clone().lerp(r, 0.75).add(new THREE.Vector3(0, -tipLen * 0.5, 0));
      const tip = top.clone().add(new THREE.Vector3(0, -tipLen, 0));
      const ph = random() * 6.2831;
      const tri = [[l, 0], [r, 0], [ml, 0.5], [r, 0], [mr, 0.5], [ml, 0.5], [ml, 0.5], [mr, 0.5], [tip, 1]];
      for (const [p, h] of tri) push(p, n, c, h, ph + s * 9, n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(hang, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  g.setAttribute('aFence', new THREE.Float32BufferAttribute(fence, 2));
  g.computeBoundingSphere();
  return g;
}

function pennantMaterial(sun, uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aHang;
        attribute float aPhase;
        attribute vec2 aFence;
        uniform float uTime;
        uniform vec3 uWind; // blowing towards x, z; strength 0..1`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // Each pennant swings about its cord: pushed off the fence by the wind across it, with a
          // flutter that runs along the string and grows towards the tip.
          float across = dot(uWind.xy, aFence) * uWind.z;
          float flap = sin(uTime * (5.0 + 3.0 * uWind.z) + aPhase) * (0.22 + 0.5 * uWind.z)
                     + sin(uTime * 11.3 + aPhase * 1.7) * 0.12 * uWind.z;
          float a = clamp(across * 1.1 + flap * (0.55 + 0.45 * aHang), -0.15, 1.3); // never into the mesh
          float r = aHang * 0.3;
          transformed.xz += aFence * sin(a) * r;
          transformed.y += (1.0 - cos(a)) * r;
        }`);
  };
  m.customProgramCacheKey = () => 'bp-pennants';
  return gradeLife(m);
}

// --- Scoreboard -----------------------------------------------------------------------------------

const BOARD_W = 2.4;
const BOARD_H = 1.2;
const FONT = "'Switzer', 'Helvetica Neue', Arial, sans-serif";

function drawBoard(ctx2d, s) {
  const { width: W, height: H } = ctx2d.canvas;
  const cream = '#fff3da';
  ctx2d.fillStyle = '#121212';
  ctx2d.fillRect(0, 0, W, H);
  ctx2d.textBaseline = 'middle';
  ctx2d.fillStyle = 'rgba(255, 243, 218, 0.62)';
  ctx2d.font = `500 40px ${FONT}`;
  ctx2d.textAlign = 'left';
  ctx2d.fillText(s.title, 36, 54);
  ctx2d.textAlign = 'right';
  ctx2d.fillText(s.status, W - 36, 54);
  ctx2d.fillStyle = 'rgba(255, 243, 218, 0.18)';
  ctx2d.fillRect(36, 100, W - 72, 2);
  const cols = [478, 548]; // set columns
  const pointX = 680;
  s.rows.forEach((row, i) => {
    const y = 172 + i * 118;
    ctx2d.fillStyle = cream;
    if (row.serving) ctx2d.fillRect(36, y - 8, 16, 16);
    ctx2d.textAlign = 'left';
    ctx2d.font = `600 62px ${FONT}`;
    ctx2d.fillText(row.name, 72, y);
    ctx2d.textAlign = 'center';
    ctx2d.font = `500 62px ${FONT}`;
    row.sets.forEach((g, k) => {
      ctx2d.fillStyle = k < row.sets.length - 1 || s.over ? 'rgba(255, 243, 218, 0.62)' : cream;
      ctx2d.fillText(String(g), cols[k] ?? cols[cols.length - 1], y);
    });
    ctx2d.fillStyle = '#9c441f';
    ctx2d.fillRect(pointX - 56, y - 46, 112, 92);
    ctx2d.fillStyle = cream;
    ctx2d.font = `600 58px ${FONT}`;
    ctx2d.fillText(row.points, pointX, y + 2);
  });
}

// --- Build --------------------------------------------------------------------------------------

/**
 * @param ctx life context (scene, sun, quality)
 * @param court { x, z, y } the show court's centre and surface height
 * @param area  { frontX, z } the lawn strip: front edge of the stands (they run back towards −x)
 */
export function buildStands({ scene, sun, quality }, court, area, { still }) {
  const shared = { uTime: lifeTime, uLookA: { value: new THREE.Vector3(court.x, 1, court.z) }, uLookB: { value: new THREE.Vector3(court.x, 1, court.z) }, uWind: { value: new THREE.Vector3(-1, 0, 0.35) } };

  // World placement of the stands: u back towards −x from the front edge, w along z.
  const yaw = Math.PI / 2; // people face +x (the court)
  const place = (u, y, w) => new THREE.Vector3(area.frontX - u, y, area.z + w);

  const statics = new THREE.Group();
  statics.name = 'tournament_static';
  const { planks, frame } = standGeometry(place);
  const alu = new THREE.MeshStandardMaterial({ color: 0xbfc3c6, metalness: 0.8, roughness: 0.36 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9fa3, metalness: 0.7, roughness: 0.5 });
  const planksMesh = new THREE.Mesh(planks, alu);
  const frameMesh = new THREE.Mesh(frame, steel);
  for (const m of [planksMesh, frameMesh]) { m.castShadow = true; m.receiveShadow = true; statics.add(m); }

  // Seats: rows of 0.5 m places, filled ~75% (fewer on small GPUs), friends sitting together.
  const random = rng(2026);
  const fill = quality === 'low' ? 0.5 : 0.76;
  const seats = [];
  const per = Math.floor((LENGTH - 0.3) / SEAT_PITCH);
  for (let i = 0; i < ROWS; i++) {
    let run = 0;
    for (let k = 0; k < per; k++) {
      run = run > 0 ? run - 1 : random() < fill ? 1 + Math.floor(random() * 4) : -1;
      if (run < 0) { run = 0; continue; }
      const w = -LENGTH / 2 + 0.15 + SEAT_PITCH * (k + 0.5) + (random() - 0.5) * 0.1;
      seats.push({ row: i, w, u: DEPTH * i + 0.55 + (random() - 0.5) * 0.03 });
    }
  }
  const n = seats.length;
  const geo = personGeometry();
  const attr = (size) => new Float32Array(n * size);
  const A = { aShirt: attr(3), aPants: attr(3), aSkin: attr(3), aHair: attr(3), aSeed: attr(3), aClap: attr(1) };
  const crowd = new THREE.InstancedMesh(geo, crowdMaterial(sun, shared), n);
  crowd.name = 'life_crowd';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const proxies = [];
  const people = seats.map((s, k) => {
    const pick = (list) => lin(list[Math.floor(random() * list.length)]);
    const cap = random() < 0.24;
    pick(SHIRTS).toArray(A.aShirt, k * 3);
    pick(PANTS).toArray(A.aPants, k * 3);
    pick(SKIN).toArray(A.aSkin, k * 3);
    (cap ? pick(CAPS) : pick(HAIR)).toArray(A.aHair, k * 3);
    A.aSeed.set([random(), random(), cap ? 1 : 0], k * 3);
    const scale = 0.93 + random() * 0.12;
    const p = place(s.u, seatY(s.row), s.w);
    q.setFromEuler(new THREE.Euler(0, yaw + (random() - 0.5) * 0.3, 0));
    m4.compose(p, q, new THREE.Vector3(scale, scale, scale));
    crowd.setMatrixAt(k, m4);
    for (const g of proxyParts()) proxies.push(g.applyMatrix4(m4));
    return { x: p.x, z: p.z, clap: 0, from: 0, to: 0 };
  });
  for (const [k, v] of Object.entries(A)) {
    const a = new THREE.InstancedBufferAttribute(v, k === 'aClap' ? 1 : 3);
    if (k === 'aClap') a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(k, a);
  }
  crowd.computeBoundingSphere();
  crowd.layers.set(LIFE_LAYER);
  crowd.userData.noAO = true;

  // Their shadows: an invisible stand-in in the static shadow map.
  const proxy = new THREE.Mesh(mergeGeometries(proxies), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  proxy.name = 'tournament_crowd_shadow';
  proxy.castShadow = true;
  proxy.userData.noAO = true;
  statics.add(proxy);

  // Pennants: both end fences of the court (3.6 m) and the boundary fence behind the stands.
  const half = 8.5;
  const top = 3.52;
  const runs = [
    { a: v3(court.x - half, top, court.z - 17.32), b: v3(court.x + half, top, court.z - 17.32), n: v3(0, 0, 1) },
    { a: v3(court.x - half, top, court.z + 17.32), b: v3(court.x + half, top, court.z + 17.32), n: v3(0, 0, -1) },
    { a: v3(area.fenceX + 0.08, top, area.z - LENGTH / 2 - 1.5), b: v3(area.fenceX + 0.08, top, area.z + LENGTH / 2 + 1.5), n: v3(1, 0, 0) },
  ];
  const pennants = new THREE.Mesh(pennantGeometry(runs), pennantMaterial(sun, shared));
  pennants.name = 'life_pennants';
  pennants.layers.set(LIFE_LAYER);
  pennants.userData.noAO = true;

  // Scoreboard: behind the far baseline, right of centre, facing the court (and the drone).
  const bx = court.x + 4.2;
  const bz = court.z - 16.8;
  const legH = 1.0;
  const boardGeo = mergeGeometries([
    new THREE.BoxGeometry(BOARD_W + 0.12, BOARD_H + 0.12, 0.1).translate(bx, court.y + legH + BOARD_H / 2, bz),
    beam(v3(bx - 0.9, court.y, bz - 0.02), v3(bx - 0.9, court.y + legH, bz - 0.02), 0.07),
    beam(v3(bx + 0.9, court.y, bz - 0.02), v3(bx + 0.9, court.y + legH, bz - 0.02), 0.07),
    new THREE.BoxGeometry(0.3, 0.02, 0.3).translate(bx - 0.9, court.y + 0.01, bz - 0.02),
    new THREE.BoxGeometry(0.3, 0.02, 0.3).translate(bx + 0.9, court.y + 0.01, bz - 0.02),
  ]);
  const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ color: 0x2b2c2d, metalness: 0.4, roughness: 0.55 }));
  board.castShadow = true;
  board.receiveShadow = true;
  statics.add(board);
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const ctx2d = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), gradeLife(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(1.7) })));
  face.position.set(bx, court.y + legH + BOARD_H / 2, bz + 0.052);
  face.name = 'life_scoreboard';
  face.layers.set(LIFE_LAYER);
  face.userData.noAO = true;

  const lifeGroup = new THREE.Group();
  lifeGroup.name = 'tournament_life';
  lifeGroup.add(crowd, pennants, face);
  lifeGroup.traverse((o) => o.layers.set(LIFE_LAYER));
  statics.visible = false;
  lifeGroup.visible = false;
  scene.add(statics, lifeGroup);

  let lastScore = null;
  const clapAttr = geo.attributes.aClap;
  const fast = new THREE.Vector3(court.x, 1, court.z);
  const slow = fast.clone();
  const target = fast.clone();

  return {
    count: n,
    /** Stands and flags up (static change), with or without people in them. */
    show(on, seated = true) {
      statics.visible = on;
      lifeGroup.visible = on;
      crowd.visible = on && seated;
      proxy.visible = on && seated;
    },
    score(s) {
      lastScore = s;
      drawBoard(ctx2d, s);
      tex.needsUpdate = true;
    },
    redraw() { if (lastScore) this.score(lastScore); },
    /** Wind blowing towards (x, z), strength 0..1. */
    wind(x, z, k) { shared.uWind.value.set(x, z, still ? 0 : k); },
    /**
     * A round of applause rolling out from `fromZ` along the stands: each person joins after a
     * beat, for a while, or doesn't clap at all.
     */
    applaud(now, level, fromZ) {
      for (const p of people) {
        if (random() > 0.4 + 0.55 * level) continue;
        p.from = now + Math.abs(p.z - fromZ) * 0.022 + random() * 0.35;
        p.to = p.from + (0.9 + random() * 1.4) * (0.6 + level);
      }
    },
    /** Per frame: the look target (the ball, or the court) and the clapping. */
    update(now, dt, ball) {
      if (ball) target.copy(ball);
      else target.lerp(v3(court.x, court.y + 1, court.z), 1 - Math.exp(-dt * 1.2));
      fast.lerp(target, 1 - Math.exp(-dt * 7));
      slow.lerp(target, 1 - Math.exp(-dt * 2.6));
      shared.uLookA.value.copy(fast);
      shared.uLookB.value.copy(slow);
      let any = false;
      people.forEach((p, k) => {
        const want = now >= p.from && now < p.to ? 1 : 0;
        p.clap += (want - p.clap) * (1 - Math.exp(-dt * (want ? 9 : 5)));
        if (p.clap < 0.002) p.clap = 0;
        clapAttr.array[k] = p.clap;
        any ||= p.clap > 0;
      });
      if (any || this.clapping) clapAttr.needsUpdate = true;
      this.clapping = people.reduce((a, p) => a + (p.clap > 0.5 ? 1 : 0), 0);
    },
  };
}
