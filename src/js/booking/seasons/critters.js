import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { PITCH } from '../life/sprite.js';

// Small animals walking the grounds for the holiday packs (round 11: Easter bunnies, Thanksgiving
// turkeys). Each one is a card in the drone's image plane (like the hats of life/adorn.js) with a
// few canvas-drawn poses, a soft contact shadow, and a wander: pick a free spot near a region,
// walk or hop there, stand a while. They live on the life layer, cost a few draw calls, and are
// built only while their holiday is on. Hover names them; a click startles them.

const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PITCH);
const UP = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));
const rand = (a, b) => a + Math.random() * (b - a);

/** A CanvasTexture drawn by `draw(g, w, h)`, sRGB. */
export function drawTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let shadowTex = null;
const shadowMap = () => (shadowTex ??= drawTexture(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(0,0,0,0.55)');
  r.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, w, w);
}));

/**
 * A herd of walkers. `def`: { frames: [CanvasTexture…], w, h (m), count, speed (m/s), hop (bool),
 * tints, regions: [[x0, z0, x1, z1]…], reach (m a leg may be), label, gait (poses by phase),
 * peck (pose while standing, optional) }. `plan` is the placement plan (free ground, floor height).
 */
export function createHerd(ctx, plan, def, { still = false } = {}) {
  const { scene, camera } = ctx;
  const group = new THREE.Group();
  group.name = `herd_${def.label}`;
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const list = [];

  const free = (x, z) => plan.free(x, z, 0.3);
  const spot = (reach, from) => {
    for (let k = 0; k < 14; k++) {
      const [x0, z0, x1, z1] = def.regions[Math.floor(Math.random() * def.regions.length)];
      const x = rand(x0, x1); const z = rand(z0, z1);
      if (from && Math.hypot(x - from.x, z - from.z) > reach) continue;
      if (!free(x, z)) continue;
      // the way there must be clear too
      let ok = true;
      if (from) for (let s = 1; s < 6 && ok; s++) ok = free(from.x + ((x - from.x) * s) / 6, from.z + ((z - from.z) * s) / 6);
      if (ok) return { x, z };
    }
    return null;
  };

  for (let i = 0; i < def.count; i++) {
    const s0 = spot(1e9) ?? { x: def.regions[0][0], z: def.regions[0][1] };
    const mat = gradeLife(new THREE.MeshBasicMaterial({ map: def.frames[0], transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(def.tints?.[i % def.tints.length] ?? 0xffffff).multiplyScalar(def.gain ?? 1.2) }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.quaternion.copy(TILT);
    mesh.layers.set(LIFE_LAYER);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.userData.noAO = true;
    const shadow = new THREE.Mesh(shadowGeo, gradeLife(new THREE.MeshBasicMaterial({ map: shadowMap(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.5 })));
    shadow.layers.set(LIFE_LAYER);
    shadow.frustumCulled = false;
    shadow.renderOrder = 3;
    shadow.userData.noAO = true;
    group.add(shadow, mesh);
    list.push({ mesh, shadow, mat, x: s0.x, z: s0.z, y: plan.floorY(s0.x, s0.z), tx: s0.x, tz: s0.z, ty: 0, dir: Math.random() < 0.5 ? 1 : -1, wait: rand(0.5, 4), ph: rand(0, 6), fast: 0, jump: 0 });
  }

  const aim = (c, from) => {
    const t = spot(c.fast > 0 ? def.reach * 2.2 : def.reach, from ?? c);
    if (!t) { c.wait = rand(1, 3); return; }
    c.tx = t.x; c.tz = t.z; c.ty = plan.floorY(t.x, t.z);
    c.dir = t.x >= c.x ? 1 : -1;
    c.wait = 0;
  };

  const place = (c, lift = 0) => {
    c.mesh.position.set(c.x, c.y + lift, c.z);
    c.mesh.scale.set(def.w * c.dir, def.h, 1);
    c.shadow.position.set(c.x, c.y + 0.03, c.z);
    const s = def.w * (1 - Math.min(0.5, lift * 0.8));
    c.shadow.scale.set(s * 0.9, 1, s * 0.5);
    c.shadow.material.opacity = Math.max(0.15, 0.5 - lift);
  };
  for (const c of list) place(c);

  const v = new THREE.Vector3();
  const hit = (x, y) => {
    let best = null; let bestD = Infinity;
    for (const c of list) {
      v.set(c.x, c.y, c.z).addScaledVector(UP, def.h * 0.5);
      v.project(camera);
      const sx = ((v.x + 1) / 2) * innerWidth; const sy = ((1 - v.y) / 2) * innerHeight;
      const e = new THREE.Vector3(c.x + def.w * 0.5, c.y, c.z).project(camera);
      const rad = Math.max(26, Math.abs(((e.x + 1) / 2) * innerWidth - sx) * 1.3);
      const d = Math.hypot(sx - x, (sy - y) * 0.75);
      if (d < rad && d < bestD) { best = c; bestD = d; }
    }
    return best;
  };

  return {
    group,
    list,
    update(t, dt) {
      if (!group.parent) scene.add(group);
      for (const c of list) {
        if (still) continue;
        if (c.fast > 0) c.fast -= dt;
        if (c.wait > 0) {
          c.wait -= dt;
          if (c.wait <= 0) aim(c);
          c.ph = 0;
          c.mat.map = def.peck && Math.sin(t * 2 + c.x) > 0.55 ? def.frames[def.peck] : def.frames[0];
          place(c, 0);
          continue;
        }
        const d = Math.hypot(c.tx - c.x, c.tz - c.z);
        const speed = def.speed * (c.fast > 0 ? 2.4 : 1);
        const step = speed * dt;
        if (d <= step) { c.x = c.tx; c.z = c.tz; c.y = c.ty; c.wait = c.fast > 0 ? 0.2 : rand(1.5, 6); if (c.fast > 0 && c.fast < 0.1) c.fast = 0; place(c, 0); continue; }
        c.x += ((c.tx - c.x) / d) * step; c.z += ((c.tz - c.z) / d) * step;
        c.y += (c.ty - c.y) * Math.min(1, dt * 3);
        c.ph += dt * (def.hop ? 6.2 : 7) * (c.fast > 0 ? 1.4 : 1);
        c.dir = c.tx >= c.x ? 1 : -1;
        let lift = 0;
        if (def.hop) {
          const s = Math.sin(c.ph);
          lift = Math.max(0, s) * def.hop;
          c.mat.map = def.frames[s > 0.1 ? 1 : 0];
        } else {
          lift = Math.abs(Math.sin(c.ph)) * 0.05 * def.h;
          c.mat.map = def.frames[Math.floor(c.ph / Math.PI) % 2];
        }
        place(c, lift);
      }
      return !still;
    },
    pick: (x, y) => (hit(x, y) ? def.label : null),
    click(x, y) {
      const c = hit(x, y);
      if (!c) return false;
      if (still) return true;
      c.fast = 2.6; c.wait = 0; aim(c);
      return true;
    },
    off() { scene.remove(group); },
    debug: () => list.map((c) => [+c.x.toFixed(1), +c.z.toFixed(1)]),
  };
}
