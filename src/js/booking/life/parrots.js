import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { ambientBus } from '../ambient.js';
import { builder, loft, wingStrip, birdMaterial, shadowMaterial } from './birds.js';
import { liveSunDir } from './clock.js';
import { curve, stroke } from './bird-flight.js';

// Monk parakeets (round 7, "clublife"): the green parrots that nest in Miami's palms and light
// poles cross the club now and then in a loose, noisy flock, flying fast and straight on quick,
// shallow beats, each bird on its own rhythm. Real size (29 cm, half of it the long pointed tail;
// 48 cm across the wings), bright green above, grey face and breast, blue flight feathers. Their
// harsh "kwee-kwee" chatter is synthesised (no audio files) and goes through the ambient sound bed,
// so it follows the sound toggle; louder when the flock passes near the middle of the view.
// Geometry and wing folding come from life/birds.js. Round 10: the flock banks round a curving line,
// every bird leans into the turn and takes its beat from its own place in the flock; a few wear other
// colours (a lighter green, a lemon-yellow one, a blue one: escaped pets mix in with the monks).

const ALT = [7, 12];
const FIRST = [26, 50]; // s after the map shows
const EVERY = [60, 130];
const SPEED = 12.5; // m/s
const MAX = 16;
const rand = (a, b) => a + Math.random() * (b - a);

function parakeetGeometry() {
  const b = builder();
  const green = '#4f9437'; const belly = '#a6ad98'; const grey = '#bfc2b6'; const tail = '#3f7c3c'; const bill = '#e3c39c';
  loft(b, [
    [-0.165, 0.0, 0.0, 0.0, tail, tail],
    [-0.1, 0.017, 0.006, 0.0, tail, '#5f8f4a'],
    [-0.05, 0.024, 0.016, 0.0, green, belly],
    [-0.01, 0.032, 0.03, 0.002, green, belly],
    [0.035, 0.034, 0.033, 0.006, green, grey],
    [0.07, 0.027, 0.028, 0.012, grey, grey],
    [0.1, 0.021, 0.022, 0.014, grey, grey],
    [0.112, 0.013, 0.014, 0.008, bill, bill],
    [0.128, 0.0, 0.0, 0.0, bill, bill],
  ], 7);
  const up = '#4c9a39'; const cov = '#5aa242'; const blue = '#2f5d93'; const under = '#7c9a83';
  for (const side of [-1, 1]) {
    // Narrow, pointed wings: the hand is long and blue.
    wingStrip(b, side, 0.025, 0.24, 0.085, [
      [0.0, 0.035, -0.045, 0.0, cov, under],
      [0.35, 0.04, -0.05, 0.0, up, under],
      [0.58, 0.032, -0.046, 0.0, up, under],
      [0.76, 0.02, -0.04, -0.004, blue, blue],
      [1.0, -0.012, -0.026, -0.01, blue, blue],
    ]);
  }
  return b.geometry();
}

/** One squawk: a buzzy, rising-then-falling call (harsh with a fast vibrato), often doubled. */
function squawk(bus, when, level, pan) {
  const { ctx, out } = bus;
  const dur = rand(0.07, 0.15);
  const f0 = rand(2300, 3300);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * rand(0.78, 0.92), when);
  o.frequency.linearRampToValueAtTime(f0 * rand(1.05, 1.22), when + dur * 0.35);
  o.frequency.linearRampToValueAtTime(f0 * rand(0.72, 0.88), when + dur);
  const fm = ctx.createOscillator();
  fm.frequency.value = rand(55, 90);
  const fmg = ctx.createGain();
  fmg.gain.value = rand(160, 380);
  fm.connect(fmg).connect(o.frequency);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = f0 * 1.15;
  band.Q.value = 2.2;
  const far = ctx.createBiquadFilter();
  far.type = 'lowpass';
  far.frequency.value = 3200 + 3000 * Math.min(1, level * 8); // distance softens the edge
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(level, when + 0.012);
  g.gain.exponentialRampToValueAtTime(level * 0.6, when + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(band).connect(far).connect(g).connect(p).connect(out);
  o.start(when);
  fm.start(when);
  o.stop(when + dur + 0.02);
  fm.stop(when + dur + 0.02);
}

export function createParrots(ctx, { still }) {
  if (still) return null;
  const { scene, rig, camera } = ctx;
  const sun = liveSunDir(ctx);
  const geo = parakeetGeometry();
  geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geo, gradeLife(birdMaterial()), MAX);
  const shadeMat = shadowMaterial(sun.dir, 0.22);
  const base = shadeMat.onBeforeCompile;
  shadeMat.onBeforeCompile = (shader, r) => { base(shader, r); shader.uniforms.uSun.value = sun.dir; }; // follows the daylight's sun
  const shadow = new THREE.InstancedMesh(geo, shadeMat, MAX);
  for (const o of [mesh, shadow]) {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.visible = false;
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  mesh.name = 'life_parakeets';
  shadow.name = 'life_parakeets_shadow';
  shadow.renderOrder = 1;
  scene.add(mesh, shadow);
  const fold = geo.attributes.aFold;
  // Plumage tints (multiply the vertex colours): mostly the usual green, now and then another.
  const TINTS = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1.12, 1.08, 0.9], [1.7, 1.55, 0.5], [0.55, 0.9, 1.9], [1.4, 0.7, 0.6]];
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.Color();

  let flock = null;
  let next = performance.now() / 1000 + rand(...FIRST);
  let nextCall = 0;
  let calls = 0; // squawks played (dev check)
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const slot = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function launch(lateral = rand(-12, 12)) {
    const { x, z } = rig.state;
    const ang = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const reach = 130;
    const alt = rand(...ALT);
    // Seen from the drone a bird sits higher on screen than the ground below it: the flock's line
    // passes where the ray through the middle of the view is at its height.
    const cam = camera.position;
    const k = (cam.y - alt) / cam.y;
    const mid = new THREE.Vector3(cam.x + (x - cam.x) * k, alt, cam.z + (z - cam.z) * k);
    const origin = mid.addScaledVector(side, lateral).addScaledVector(dir, -reach);
    const n = 9 + Math.floor(Math.random() * (MAX - 8));
    const birds = Array.from({ length: n }, () => ({
      off: new THREE.Vector3().addScaledVector(side, rand(-5, 5)).addScaledVector(dir, rand(-7, 7)).setY(rand(-1.5, 1.5)),
      phase: rand(0, 1),
      beat: rand(8.5, 10.5), // Hz
      drift: rand(0, 6.28),
      gap: rand(0.6, 2.2), // s between the short glides
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      pace: rand(0.97, 1.03),
    }));
    const path = curve({ dir, speed: SPEED, amp: rand(6, 14) * (Math.random() < 0.5 ? -1 : 1), period: rand(14, 22), phase: rand(0, 6.28) });
    birds.forEach((b, i) => { tint.setRGB(...b.tint); mesh.setColorAt(i, tint); });
    mesh.instanceColor.needsUpdate = true;
    flock = { birds, origin, dir, side, path, yaw: path.base, t0: performance.now() / 1000, duration: (reach * 2 + 20) / SPEED };
    mesh.count = shadow.count = n;
    mesh.visible = shadow.visible = true;
  }

  /** Quick shallow beats with a brief closed-wing bound every second or two (a parakeet's flight). */
  function foldAt(b, t) {
    const cycle = t + b.phase * b.gap;
    const local = cycle % b.gap;
    if (local < 0.12) return [0.05, -0.55]; // wings tucked for a moment
    const ph = (t + b.phase) * b.beat * Math.PI * 2;
    return [0.1 + 0.62 * stroke(ph), -0.25 * (1 - Math.cos(ph - 0.8))];
  }

  function chatter(now) {
    if (now < nextCall) return;
    nextCall = now + rand(0.05, 0.28);
    const bus = ambientBus();
    if (!bus) return;
    // How near the flock is to what the visitor is looking at.
    const v = rig.state;
    const d = Math.hypot(mid.x - v.x, mid.z - v.z);
    const level = THREE.MathUtils.clamp(1 - d / 85, 0, 1) * THREE.MathUtils.clamp(45 / v.dist, 0.4, 1.2) * 0.05;
    if (level < 0.003) return;
    const s = rig.screenOf(mid.x, mid.z);
    const pan = THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.85, 0.85) + rand(-0.15, 0.15);
    const when = bus.ctx.currentTime + 0.01;
    squawk(bus, when, level * rand(0.5, 1), pan);
    calls++;
    if (Math.random() < 0.55) squawk(bus, when + rand(0.13, 0.2), level * rand(0.5, 1), pan);
  }

  return {
    name: 'parrots',
    tick() {
      const now = performance.now() / 1000;
      if (!flock) {
        if (now > next) launch();
        else return false;
      }
      sun.update();
      const t = now - flock.t0;
      if (t > flock.duration) {
        mesh.visible = shadow.visible = false;
        flock = null;
        next = now + rand(...EVERY);
        return false;
      }
      mid.set(0, 0, 0);
      const { path } = flock;
      path.at(t, centre);
      const yaw = path.yaw(t);
      const bank = path.bank(t);
      flock.birds.forEach((b, i) => {
        // Slot in the flock, swung round with its heading; each bird weaves a little; the bound dips it.
        slot.copy(b.off).applyAxisAngle(UP, yaw - flock.yaw);
        p.copy(flock.origin).add(centre).add(slot);
        p.addScaledVector(flock.dir, (b.pace - 1) * t * SPEED);
        p.addScaledVector(flock.side, Math.sin(t * 0.9 + b.drift) * 1.2);
        p.y += Math.sin(t * 1.7 + b.drift) * 0.35;
        const [s, w] = foldAt(b, t);
        e.set(-0.06, yaw + Math.sin(t * 0.9 + b.drift) * 0.1, bank + Math.cos(t * 0.9 + b.drift) * 0.14, 'YXZ');
        q.setFromEuler(e);
        m4.compose(p, q, one);
        mesh.setMatrixAt(i, m4);
        shadow.setMatrixAt(i, m4);
        fold.setXY(i, s, w);
        mid.add(p);
      });
      mid.divideScalar(flock.birds.length);
      mesh.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
      fold.needsUpdate = true;
      chatter(now);
      return true;
    },
    debug: () => (flock ? { calls, bus: !!ambientBus(), n: flock.birds.length, t: +(performance.now() / 1000 - flock.t0).toFixed(1), at: [+mid.x.toFixed(0), +mid.z.toFixed(0)] } : { next: +(next - performance.now() / 1000).toFixed(0) }),
    /** Dev: send a flock over now; `at` seconds into its crossing (mid-way ≈ 11). */
    trigger(at = 0, lateral) {
      launch(lateral);
      flock.t0 -= at;
    },
  };
}
