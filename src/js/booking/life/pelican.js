import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { pelicanGeometry, birdMaterial, shadowMaterial } from './birds.js';
import { liveSunDir } from './clock.js';
import { curve, envelope, stroke } from './bird-flight.js';

// A lone brown pelican (round 7, "clublife"), rarely: it glides slowly along the edge of the view,
// low over the trees, wings held flat and long (2 m across), riding the air off the bay with only
// a few deep, unhurried beats now and then, banking a little as it drifts. Geometry and wing
// folding from life/birds.js (whose pelican flocks cross the middle of the map instead).

const FIRST = [70, 120]; // s after the map shows
const EVERY = [200, 380];
const SPEED = 8.2; // m/s: slow, near stalling, as pelicans glide
const ALT = [9, 14];
const rand = (a, b) => a + Math.random() * (b - a);

export function createPelican(ctx, { still }) {
  if (still) return null;
  const { scene, rig } = ctx;
  const sun = liveSunDir(ctx);
  const geo = pelicanGeometry();
  geo.setAttribute('aFold', new THREE.InstancedBufferAttribute(new Float32Array(2), 2).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geo, gradeLife(birdMaterial()), 1);
  const shadeMat = shadowMaterial(sun.dir, 0.3);
  const base = shadeMat.onBeforeCompile;
  shadeMat.onBeforeCompile = (shader, r) => { base(shader, r); shader.uniforms.uSun.value = sun.dir; };
  const shadow = new THREE.InstancedMesh(geo, shadeMat, 1);
  for (const o of [mesh, shadow]) {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.visible = false;
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  mesh.name = 'life_pelican_glide';
  shadow.name = 'life_pelican_glide_shadow';
  shadow.renderOrder = 1;
  scene.add(mesh, shadow);
  const fold = geo.attributes.aFold;

  let fly = null; // { a, b, t0, duration, beats: [start times] }
  let next = performance.now() / 1000 + rand(...FIRST);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const off = new THREE.Vector3();

  /** A line along one edge of the view (top, left or right), a little inside it, off screen to off screen. */
  function launch(edge) {
    const w = innerWidth;
    const h = innerHeight;
    const which = edge ?? ['top', 'left', 'right', 'top'][Math.floor(Math.random() * 4)];
    const inset = 0.14;
    const [sa, sb] = {
      top: [[-0.3 * w, h * inset], [1.3 * w, h * inset]],
      left: [[w * inset, -0.3 * h], [w * inset * 1.4, 1.2 * h]],
      right: [[w * (1 - inset), -0.3 * h], [w * (1 - inset * 1.4), 1.2 * h]],
    }[which];
    const alt = rand(...ALT);
    // The bird is up in the air: put it where the ray through that screen point is at its height.
    const cam = ctx.camera.position;
    const atAlt = (px, py) => {
      const g = rig.groundAt(px, py);
      if (!g) return null;
      const k = (cam.y - alt) / cam.y;
      return new THREE.Vector3(cam.x + (g.x - cam.x) * k, alt, cam.z + (g.z - cam.z) * k);
    };
    let a = atAlt(sa[0], sa[1]);
    let b = atAlt(sb[0], sb[1]);
    if (!a || !b) return false;
    if (Math.random() < 0.5) [a, b] = [b, a];
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    a.addScaledVector(dir, -25);
    b.addScaledVector(dir, 25);
    const duration = (len + 50) / SPEED;
    // Two or three short bouts of a few deep beats over the whole glide.
    const beats = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => rand(0.1, 0.9) * duration).sort((x, y) => x - y);
    // Round 10: it follows a lazy S round the straight line and leans into every turn.
    const path = curve({ dir, speed: SPEED, amp: rand(4, 9) * (Math.random() < 0.5 ? -1 : 1), period: rand(24, 38), phase: rand(0, 6.28) });
    fly = { a, b, dir, path, yaw: Math.atan2(dir.x, dir.z), t0: performance.now() / 1000, duration, beats, drift: rand(0, 6.28) };
    mesh.visible = shadow.visible = true;
    return true;
  }

  function foldAt(t) {
    const bout = fly.beats.find((s) => t >= s && t < s + 2.6);
    if (bout == null) return [0.02 + 0.03 * Math.sin(t * 0.6 + fly.drift), -0.08 + 0.04 * Math.sin(t * 0.43 + fly.drift), 0]; // flat glide, the hand trimming in the air
    const local = t - bout;
    const env = envelope(local, 2.6, 0.4);
    const ph = local * 1.3 * Math.PI * 2; // ~3 slow beats
    return [0.02 + env * 0.5 * stroke(ph), -0.08 + env * (-0.4 * 0.5 * (1 - Math.cos(ph - 0.9)) + 0.1), -env * Math.cos(ph)];
  }

  return {
    name: 'pelican',
    tick() {
      const now = performance.now() / 1000;
      if (!fly) {
        if (now > next && !launch()) next = now + 30;
        if (!fly) return false;
      }
      sun.update();
      const t = now - fly.t0;
      if (t > fly.duration) {
        mesh.visible = shadow.visible = false;
        fly = null;
        next = now + rand(...EVERY);
        return false;
      }
      const u = t / fly.duration;
      const { path } = fly;
      p.lerpVectors(fly.a, fly.b, u);
      path.at(t, off).addScaledVector(fly.dir, -SPEED * t); // the sideways swing only
      p.add(off);
      // A sink on the glide, a lift and a heave on each bout of beats.
      const [s, w, heave] = foldAt(t);
      p.y += Math.sin(t * 0.15 + fly.drift) * 1.2 + heave * 0.12;
      e.set(-0.03 - heave * 0.04 + Math.cos(t * 0.15 + fly.drift) * 0.02, path.yaw(t), path.bank(t), 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, one);
      mesh.setMatrixAt(0, m4);
      shadow.setMatrixAt(0, m4);
      fold.setXY(0, s, w);
      mesh.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
      fold.needsUpdate = true;
      return true;
    },
    debug: () => (fly ? { t: +(performance.now() / 1000 - fly.t0).toFixed(1), of: +fly.duration.toFixed(0) } : { next: +(next - performance.now() / 1000).toFixed(0) }),
    /** Dev: one glide now along `edge` ('top' | 'left' | 'right'), `at` 0..1 of the way along. */
    trigger(edge, at = 0) {
      if (!launch(edge)) return false;
      fly.t0 -= at * fly.duration;
      return true;
    },
  };
}
