import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { glowTexture } from './decor.js';

// Distant fireworks for July 4th nights (round 8, "seasons"). Now and then a short volley: a shell
// climbs, bursts into a sphere of stars that slow, sag and burn out, with a soft flash of colour
// around it. They sit low along the top edge of the view, far off and small, drawn on the life
// layer over the cached frame (additive, no depth: they are always beyond the club). Each burst
// sends `bp-firework` so ambient.js can play a muffled boom a moment later (sound toggle applies).

const PALETTE = [
  [1.0, 0.24, 0.2], // red
  [0.95, 0.92, 0.86], // white
  [0.3, 0.45, 1.0], // blue
  [1.0, 0.72, 0.3], // gold
];
const MAX = 1024; // instances: stars, their trails, shells, flashes
const rand = (a, b) => a + Math.random() * (b - a);

export function createFireworks({ scene, camera, pitch }) {
  const dot = glowTexture();
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-pitch); // the drone never turns: face it once
  const mat = new THREE.MeshBasicMaterial({
    map: dot, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'life_fireworks';
  mesh.layers.set(LIFE_LAYER);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.count = 0;
  mesh.userData.noAO = true;
  scene.add(mesh);

  const bursts = []; // { at, origin, R, color, color2, stars, shellFrom, rise }
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** A shell over the far edge of the view: screen point (sx, sy) in 0…1. */
  function launch(now, sx = rand(0.12, 0.88), sy = rand(0.04, 0.11)) {
    ndc.set(sx * 2 - 1, 1 - sy * 2);
    raycaster.setFromCamera(ndc, camera);
    const { origin: o, direction: d } = raycaster.ray;
    const ground = d.y < -1e-3 ? -o.y / d.y : 400;
    const dist = ground * 1.15; // a little beyond the ground there: far off, past the trees
    const at = o.clone().addScaledVector(d, dist);
    const R = dist * rand(0.026, 0.036);
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const color2 = Math.random() < 0.35 ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : color;
    const n = Math.round(rand(56, 80));
    const stars = [];
    for (let i = 0; i < n; i++) {
      // Even-ish sphere (golden spiral) with a little scatter, flattened a touch.
      const k = (i + 0.5) / n;
      const phi = Math.acos(1 - 2 * k);
      const th = Math.PI * (1 + Math.sqrt(5)) * i;
      const v = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi) * 0.9, Math.sin(phi) * Math.sin(th)).multiplyScalar(R * rand(2.1, 2.5));
      stars.push({ v, life: rand(1.5, 2.3), tw: Math.random() < 0.5, col: Math.random() < 0.5 ? color : color2 });
    }
    const rise = rand(0.9, 1.3);
    bursts.push({ at: now + rise, origin: at, R, color, stars, rise, from: at.clone().add(new THREE.Vector3(0, -R * 3.2, 0)), sx, power: rand(0.55, 1), sent: false });
  }

  function put(i, pos, size, rgb, k) {
    if (i >= MAX) return i;
    m4.makeScale(size, size, size).setPosition(pos);
    mesh.setMatrixAt(i, m4);
    c.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    mesh.setColorAt(i, c);
    return i + 1;
  }

  function update(now) {
    let i = 0;
    for (let b = bursts.length - 1; b >= 0; b--) {
      const f = bursts[b];
      const t = now - f.at;
      if (t < 0) {
        // The shell climbing, a faint spark with a short tail.
        const u = 1 - (f.at - now) / f.rise;
        if (u < 0) continue;
        const e = 1 - (1 - u) ** 2;
        p.lerpVectors(f.from, f.origin, e);
        i = put(i, p, f.R * 0.16, [1, 0.78, 0.5], 1.2);
        p.lerpVectors(f.from, f.origin, Math.max(0, e - 0.06));
        i = put(i, p, f.R * 0.12, [1, 0.6, 0.3], 0.45);
        continue;
      }
      if (!f.sent) {
        f.sent = true;
        document.dispatchEvent(new CustomEvent('bp-firework', { detail: { delay: rand(0.7, 1.3), power: f.power, pan: (f.sx * 2 - 1) * 0.7 } }));
      }
      // Flash: a soft wash of colour round the burst, gone in under a second.
      const fl = Math.max(0, 1 - t / 0.8) ** 2;
      if (fl > 0) i = put(i, f.origin, f.R * 7, f.color, 0.3 * fl);
      let alive = false;
      for (const s of f.stars) {
        if (t > s.life) continue;
        alive = true;
        // Fast out, quickly slowed by the air, then sagging.
        const drag = 2.4;
        const travel = (1 - Math.exp(-drag * t)) / drag;
        p.copy(f.origin).addScaledVector(s.v, travel);
        p.y -= 0.5 * f.R * 0.55 * t * t;
        let k = (1 - t / s.life) ** 1.4;
        if (s.tw && t > s.life * 0.55) k *= Math.random() < 0.5 ? 1.4 : 0.2; // the stars crackle as they go
        i = put(i, p, f.R * 0.2, s.col, 1.5 * k);
        // A short streak behind each star: two fading samples further back along its path.
        for (const [lag, size, dim] of [[0.07, 0.15, 0.55], [0.16, 0.12, 0.25]]) {
          const tb = Math.max(0, t - lag);
          p.copy(f.origin).addScaledVector(s.v, (1 - Math.exp(-drag * tb)) / drag);
          p.y -= 0.5 * f.R * 0.55 * tb * tb;
          i = put(i, p, f.R * size, s.col, dim * k);
        }
      }
      if (!alive && fl <= 0) bursts.splice(b, 1);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return bursts.length > 0;
  }

  return {
    launch,
    update,
    active: () => bursts.length > 0,
    clear() { bursts.length = 0; mesh.count = 0; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); dot.dispose(); },
  };
}
