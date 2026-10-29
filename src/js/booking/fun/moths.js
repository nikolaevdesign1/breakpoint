import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { weatherSky } from '../life/sky.js';

// Round 9 (row 30): moths at the floodlights. After dark a few small pale moths flutter round every
// lit lamp head: tight, jittery loops that keep coming back to the light, flickering as their wings
// catch it. Only masts that are on (the lamp glow scene.js writes per head, on the lamp_halos
// instances), none by day. One Points draw of 2 px squares on the life layer, a few hundred at most.

const PER_HEAD = 5;
const SIZE = 2; // px, square: the site's pixel motif

export function createMoths({ scene }, { still }) {
  if (still) return null;
  const heads = []; // { p: Vector3, attr, i }
  const m4 = new THREE.Matrix4();
  scene.traverse((o) => {
    if (o.name !== 'lamp_halos' || !o.isInstancedMesh) return;
    const attr = o.geometry.attributes.aGlow;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      heads.push({ p: new THREE.Vector3().setFromMatrixPosition(m4), attr, i });
    }
  });
  if (!heads.length) return null;

  const n = heads.length * PER_HEAD;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: SIZE, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.name = 'life_moths';
  points.layers.set(LIFE_LAYER);
  points.frustumCulled = false;
  points.userData.noAO = true;
  points.renderOrder = 4;
  scene.add(points);

  // Each moth: its own loop round the lamp (radius, speeds, phases) and a wing-beat flicker.
  const rand = (a, b) => a + Math.random() * (b - a);
  const moths = Array.from({ length: n }, () => ({
    r: rand(0.25, 1.1), w1: rand(1.6, 3.4) * (Math.random() < 0.5 ? -1 : 1), w2: rand(2.2, 4.6), w3: rand(0.5, 1.2),
    p1: rand(0, 6.28), p2: rand(0, 6.28), p3: rand(0, 6.28), dip: rand(0.1, 0.5), beat: rand(14, 22),
  }));
  let shown = 0;

  return {
    name: 'moths',
    tick() {
      const night = weatherSky.day < 0.02;
      if (!night) {
        if (shown) { shown = 0; geo.setDrawRange(0, 0); return true; }
        return false;
      }
      const t = performance.now() / 1000;
      let k = 0;
      for (let hi = 0; hi < heads.length; hi++) {
        const h = heads[hi];
        const glow = h.attr.array[h.i];
        if (glow < 0.5) continue;
        const light = (glow - 0.5) * 2; // they gather as the lamp comes up
        for (let j = 0; j < PER_HEAD; j++) {
          const m = moths[hi * PER_HEAD + j];
          if (j / PER_HEAD > light) break;
          // A loop round the lamp, wobbling in and out, with sudden little darts.
          const a = t * m.w1 + m.p1;
          const r = m.r * (0.75 + 0.25 * Math.sin(t * m.w3 + m.p3)) + 0.12 * Math.sin(t * 9.1 + m.p2);
          pos[k * 3] = h.p.x + Math.cos(a) * r;
          pos[k * 3 + 1] = h.p.y - 0.1 + Math.sin(t * m.w2 + m.p2) * 0.35 - m.dip * (0.5 + 0.5 * Math.sin(t * 0.7 + m.p1));
          pos[k * 3 + 2] = h.p.z + Math.sin(a) * r;
          const flick = 0.45 + 0.55 * Math.abs(Math.sin(t * m.beat + m.p3)); // wings catching the light
          const b = flick * Math.min(1, glow);
          col[k * 3] = b; col[k * 3 + 1] = b * 0.95; col[k * 3 + 2] = b * 0.82;
          k++;
        }
      }
      geo.setDrawRange(0, k);
      if (k) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
      const was = shown;
      shown = k;
      return k > 0 || was > 0;
    },
    debug: () => ({ heads: heads.length, shown }),
  };
}
