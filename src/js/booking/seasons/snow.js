import { onTier } from '../perf.js';
import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { part, merge } from '../life/geom.js';

// The shared snow of the winter holidays (row 13, round 11). Two parts, for the Holidays, New Year
// and any other winter-minded pack (`snow: 0…1` in a pack's decor says how wintry):
//
// createSnowfall: the air. Two Points layers on the life layer, wrapped in the vertex shader (nothing
//   moves on the CPU): a far/mid box of small flakes of several sizes, and a near box of big, soft ones
//   close to the lens. Wind gusts and swirls; the intensity drifts between a light fall and a heavy
//   one (slow, smooth); in heavy snow a pale veil rises over the far end of the view.
// buildSnowWorld: the ground. Real drifts and banks (instanced lumpy mounds, bluish where they are
//   in shade), corner piles, the compacted kerb at the courts, snow caps on roofs, fence tops,
//   umpire chairs, masts and the greenhouse, a patchy layer on the paths with trodden lanes left
//   bare, snowmen of several sizes, a snow fort and a hill by the kids' court. Static (baked), and
//   it grows: `grow(k)` thickens it a step at a time over minutes of a season shown.
//   The courts are never touched: it is Miami.

const SNOW = '#f3f6f9';
const SHADE = '#c9dcf0';
const FALL = 1.15;

// ---------------------------------------------------------------------------------------------
// Snowfall

const FAR = { count: 3200, lowCount: 1600, top: 28, size: [0.12, 0.42] };
const NEAR = { count: 170, lowCount: 80, size: [0.3, 0.62] };

function flakeLayer({ count, box, top, size, soft, scene, name }) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uniforms = {
    uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector2(box, box) }, uBaseY: { value: 0 },
    uPx: { value: 800 }, uLevel: { value: 0 }, uHeavy: { value: 0.5 }, uNight: { value: 0 }, uWind: { value: new THREE.Vector2(0.4, 0.15) },
  };
  const mat = new THREE.ShaderMaterial({
    name, uniforms, transparent: true, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uPx, uHeavy, uLevel, uBaseY;
      uniform vec3 uCenter; uniform vec2 uBox, uWind;
      varying float vA; varying float vSoft;
      void main() {
        float speed = ${FALL.toFixed(2)} * (0.7 + 0.6 * aSeed.w) * (0.85 + 0.5 * uHeavy);
        float H = ${top.toFixed(1)};
        vec3 p = vec3(aSeed.x * uBox.x, mod(aSeed.y * H - uTime * speed, H), aSeed.z * uBox.y);
        float sway = uTime * (0.5 + aSeed.w * 0.6) + aSeed.x * 40.0;
        float swirl = sin(p.y * 0.35 + uTime * 0.4 + aSeed.x * 6.0);
        p.x += sin(sway) * (0.7 + 0.6 * uHeavy) + uTime * uWind.x + swirl * 0.8;
        p.z += cos(sway * 0.8) * 0.5 + uTime * uWind.y + swirl * 0.5;
        vec2 lo = uCenter.xz - uBox * 0.5;
        p.xz = lo + mod(p.xz - lo, uBox);
        p.y += uBaseY;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = mix(${size[0].toFixed(2)}, ${size[1].toFixed(2)}, aSeed.w * aSeed.w);
        gl_PointSize = clamp(s * uPx / -mv.z, 1.5, 90.0);
        float keep = step(aSeed.z, 0.25 + 0.75 * uHeavy); // light fall: fewer of them
        vSoft = ${soft.toFixed(2)};
        vA = keep * smoothstep(0.0, 2.0, p.y - uBaseY) * smoothstep(H, H - 4.0, p.y - uBaseY) * uLevel;
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; varying float vA; varying float vSoft;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.5 - vSoft, length(d)) * vA;
        if (a < 0.01) discard;
        vec3 c = mix(vec3(0.97, 0.98, 1.0), vec3(0.62, 0.68, 0.8), uNight);
        gl_FragColor = vec4(c, a * 0.9);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = name;
  points.layers.set(LIFE_LAYER);
  points.frustumCulled = false;
  points.renderOrder = 40;
  points.visible = false;
  points.userData.noAO = true;
  scene.add(points);
  return { points, uniforms };
}

export function createSnowfall({ scene, rig, renderer, quality }) {
  const low = quality === 'low';
  const far = flakeLayer({ count: low ? FAR.lowCount : FAR.count, box: 120, top: FAR.top, size: FAR.size, soft: 0.35, scene, name: 'life_snow' });
  const near = flakeLayer({ count: low ? NEAR.lowCount : NEAR.count, box: 24, top: 14, size: NEAR.size, soft: 0.5, scene, name: 'life_snow_near' });
  // The veil of a heavy fall: one screen quad, strongest at the far (top) end of the view.
  const veilMat = new THREE.ShaderMaterial({
    name: 'SnowVeil', transparent: true, depthWrite: false, depthTest: false, uniforms: { uA: { value: 0 }, uNight: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float uA, uNight; varying vec2 vUv; void main() { float a = uA * smoothstep(0.35, 1.0, vUv.y) * 0.5; vec3 c = mix(vec3(0.86, 0.9, 0.95), vec3(0.3, 0.36, 0.5), uNight); gl_FragColor = vec4(c, a); }',
  });
  // A weaker tier lets fewer flakes fall (perf.js): the first share of each layer's points.
  const layers = [[far, low ? FAR.lowCount : FAR.count], [near, low ? NEAR.lowCount : NEAR.count]];
  onTier((_, b) => layers.forEach(([l, n]) => l.points.geometry.setDrawRange(0, Math.round(n * b.fx))));
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMat);
  veil.name = 'life_snow_veil';
  veil.layers.set(LIFE_LAYER);
  veil.frustumCulled = false;
  veil.renderOrder = 39;
  veil.visible = false;
  veil.userData.noAO = true;
  scene.add(veil);

  const size = new THREE.Vector2();
  let amount = 0; // 0…1 how wintry
  let t0 = performance.now() / 1000;
  let level = 0;
  let heavy = 0.5;
  const dir = new THREE.Vector3();
  return {
    /** 0 off; 1 the Holidays; less: a lighter fall (Miami in February). */
    set(next) { amount = next === true ? 1 : next || 0; },
    /** Current heaviness 0…1 (for tests). */
    heaviness: () => heavy,
    /** True while flakes are on screen. */
    update(night) {
      const now = performance.now() / 1000;
      const target = amount;
      level += Math.sign(target - level) * Math.min(Math.abs(target - level), 0.02);
      const on = level > 0.001;
      far.points.visible = near.points.visible = on;
      veil.visible = on;
      if (!on) return false;
      const t = now - t0;
      if (t > 3600) t0 = now;
      // Light and heavy spells: two slow waves, never all the way off or all the way on.
      heavy = THREE.MathUtils.clamp(0.55 + 0.32 * Math.sin(t / 47) + 0.2 * Math.sin(t / 19 + 1.3), 0.1, 1) * (0.4 + 0.6 * amount);
      const { x, z, dist } = rig.state;
      renderer.getDrawingBufferSize(size);
      const px = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov) / 2));
      const gust = Math.sin(t / 7) * 0.5 + Math.sin(t / 2.9 + 2) * 0.25;
      for (const l of [far, near]) {
        const u = l.uniforms;
        u.uTime.value = t; u.uPx.value = px; u.uNight.value = night; u.uLevel.value = level; u.uHeavy.value = heavy;
        u.uWind.value.set(0.35 + gust * 0.8, 0.12 + gust * 0.25);
      }
      far.uniforms.uCenter.value.set(x, 0, z);
      const w = Math.max(60, dist * 2.4);
      far.uniforms.uBox.value.set(w, w);
      // Near flakes: a box between the lens and the ground it looks at.
      rig.camera.getWorldDirection(dir);
      const cam = rig.camera.position;
      near.uniforms.uCenter.value.set((cam.x + x) / 2, 0, (cam.z + z) / 2);
      near.uniforms.uBaseY.value = Math.max(0, cam.y * 0.45 - 7);
      far.points.renderOrder = 40; near.points.renderOrder = 43;
      veilMat.uniforms.uA.value = Math.max(0, heavy - 0.55) * 2.2 * level;
      veilMat.uniforms.uNight.value = night;
      return true;
    },
  };
}
/** Old name. */
export const createSnow = createSnowfall;

// ---------------------------------------------------------------------------------------------
// The ground

function moundGeometry() {
  const g = new THREE.SphereGeometry(0.5, 18, 12);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const white = new THREE.Color(SNOW); const shade = new THREE.Color(SHADE); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const lump = 1 + 0.12 * Math.sin(x * 9 + z * 5) * Math.cos(z * 8 - y * 4) + 0.06 * Math.sin(x * 21 - z * 17);
    p.setXYZ(i, x * lump, Math.max(y, -0.04) * lump, z * lump);
    c.copy(shade).lerp(white, THREE.MathUtils.smoothstep(y, -0.05, 0.38)); // bluish low, white on top
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const snowMat = (extra = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.02, emissive: SNOW, emissiveIntensity: 0.55, ...extra });

/** A skin of snow over upward-facing triangles of the meshes `pick` accepts; `keep(i)` thins it out. */
function skin(root, pick, { lift = 0.07, minNy = 0.3, keep = () => true, mat } = {}) {
  const out = [];
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3();
  let k = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !pick(o)) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    for (let t = 0; t < (idx ? idx.count : pos.count); t += 3, k++) {
      const at = (j, v) => v.fromBufferAttribute(pos, idx ? idx.getX(t + j) : t + j).applyMatrix4(o.matrixWorld);
      at(0, a); at(1, b); at(2, c);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      if (n.y < minNy || !keep(k)) continue;
      out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z);
    }
  });
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat ?? new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
}

/** Snow on top of instanced things (chairs, masts, benches): a lumpy cap at the top of each one's box. */
function caps(root, test, { w = 1.1, h = 0.5, maxW = 1.4 } = {}) {
  const spots = [];
  const m4 = new THREE.Matrix4(); const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isInstancedMesh || !test(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      box.copy(o.geometry.boundingBox).applyMatrix4(m4.premultiply(o.matrixWorld));
      const sx = box.max.x - box.min.x; const sz = box.max.z - box.min.z;
      if (box.max.y < 0.2 || sx > 6 || sz > 6) continue;
      spots.push({ x: (box.min.x + box.max.x) / 2, y: box.max.y - 0.04, z: (box.min.z + box.max.z) / 2, w: Math.min(maxW, Math.max(0.25, sx * w)), d: Math.min(maxW, Math.max(0.25, sz * w)), h });
    }
  });
  return spots;
}

function snowman(sizeK) {
  const ball = (rad, y) => part(new THREE.SphereGeometry(rad, 18, 12).translate(0, y, 0), SNOW);
  const dot = (x, y, z, s = 0.03) => part(new THREE.SphereGeometry(s, 6, 5).translate(x, y, z), '#1d1b19');
  const arm = (side) => part(new THREE.CylinderGeometry(0.015, 0.02, 0.62, 5).rotateZ(side * 1.05).translate(side * 0.4, 0.88, 0), '#5a4331');
  const hat = sizeK > 0.75;
  return merge([
    ball(0.42, 0.4), ball(0.31, 0.98), ball(0.22, 1.42),
    dot(-0.08, 1.46, 0.19), dot(0.08, 1.46, 0.19), dot(0, 1.0, 0.3), dot(0, 0.86, 0.34), dot(0, 0.72, 0.38),
    part(new THREE.ConeGeometry(0.035, 0.24, 8).rotateX(Math.PI / 2).translate(0, 1.4, 0.3), '#d9731c'),
    part(new THREE.TorusGeometry(0.2, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, 1.22, 0), '#9c441f'),
    part(new THREE.BoxGeometry(0.07, 0.3, 0.05).translate(0.17, 1.08, 0.12), '#9c441f'),
    ...(hat ? [part(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14).translate(0, 1.6, 0), '#1d1b19'), part(new THREE.CylinderGeometry(0.15, 0.16, 0.22, 14).translate(0, 1.72, 0), '#1d1b19')] : [part(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 12).translate(0, 1.66, 0), '#36251b')]),
    arm(-1), arm(1),
  ]);
}

const PATHS = /^paths$/;
const ROOFS = /roof/;
const FENCE = /_fence_mesh/;

/**
 * The winter ground. `amount` 0…1 scales the drifts and the number of figures (Miami in February
 * wants a little). Returns { group, grow(k) } with k 0…1 the depth of the snow.
 */
export function buildSnowWorld({ root, plan, fences, courts, gaps, at, r, amount = 1, quality = 'high' }) {
  const group = new THREE.Group();
  const grow = [];
  const rnd = (a, b) => a + r() * (b - a);

  // --- Drifts, banks, piles: one instanced mesh, grown by scaling.
  const spots = []; // { x, z, y, w, h, d, yaw }
  const add = (x, z, w, h, d, yaw, clear = 0.3) => {
    if (!plan.free(x, z, Math.min(w, d) * clear)) return;
    spots.push({ x, z, y: plan.floorY(x, z) - 0.05, w, h, d, yaw });
  };
  const ridge = ([x0, z0, x1, z1, k = 1, tall = 1]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const along = -Math.atan2(z1 - z0, x1 - x0);
    const n = Math.max(1, Math.floor(len / (0.8 / Math.max(0.6, amount))));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (r() - 0.5) * 0.6) / n;
      const bump = 0.55 + 0.9 * Math.pow(Math.abs(Math.sin(t * 9.1 + r())), 2); // long banks swell and dip
      add(x0 + (x1 - x0) * t + (r() - 0.5) * 0.4, z0 + (z1 - z0) * t + (r() - 0.5) * 0.4, (1.8 + r() * 1.2) * k, (0.35 + 0.5 * bump * tall) * k * amount, (1.0 + r() * 0.8) * k, along + (r() - 0.5) * 0.5);
    }
  };
  const lines = [];
  for (const f of fences) {
    const cuts = [f.x0, ...gaps.filter((g) => g > f.x0 && g < f.x1).flatMap((g) => [g - 2.1, g + 2.1]), f.x1];
    for (let i = 0; i < cuts.length; i += 2) lines.push([cuts[i], f.z + f.side * 0.75, cuts[i + 1], f.z + f.side * 0.75, 1.15, 1.1]);
  }
  for (const b of courts) {
    const north = b.min.z + b.max.z > 0;
    const far = north ? b.max.z + 0.9 : b.min.z - 0.9;
    lines.push([b.min.x, far, b.max.x, far, 1.1, 1], [b.min.x - 0.9, b.min.z, b.min.x - 0.9, b.max.z, 1, 1], [b.max.x + 0.9, b.min.z, b.max.x + 0.9, b.max.z, 1, 1]);
    // Corner piles: the biggest heaps, where the shovels end up.
    for (const cx of [b.min.x - 1, b.max.x + 1]) for (const cz of [b.min.z - 1, b.max.z + 1]) add(cx, cz, rnd(1.8, 2.5), rnd(0.6, 1.0) * amount, rnd(1.5, 2), r() * 3, 0.2);
  }
  lines.push([-24, -50.1, 59, -50.1, 1, 1]); // the clubhouse front
  lines.forEach(ridge);
  // High heaps at the gates of the walkway and beside the benches / masts we know of.
  for (const g of gaps) for (const s of [-1, 1]) for (const side of [-1, 1]) add(g + side * 3.1, s * 1.9, rnd(1.6, 2.2), rnd(0.8, 1.2) * amount, rnd(1.2, 1.6), r() * 3, 0.2);
  // A hill and a fort by the kids' court (clay-5, west edge).
  const hill = plan.settle(-2, -41, 2.2, 3);
  if (hill) { plan.take(hill.x, hill.z, 2.2); spots.push({ x: hill.x, z: hill.z, y: plan.floorY(hill.x, hill.z) - 0.05, w: 5.2, h: 1.9 * amount, d: 3.6, yaw: 0.3, fixed: true }); }
  const fort = plan.settle(8, -41.5, 2, 3);
  if (fort) {
    plan.take(fort.x, fort.z, 2);
    for (let i = 0; i < 7; i++) { const a = -2.4 + i * 0.7; spots.push({ x: fort.x + Math.cos(a) * 1.7, z: fort.z + Math.sin(a) * 1.7, y: plan.floorY(fort.x, fort.z) - 0.05, w: 1.5, h: 0.95 * amount, d: 1.2, yaw: -a, fixed: true }); }
  }

  const drifts = new THREE.InstancedMesh(moundGeometry(), snowMat(), Math.max(1, spots.length));
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0);
  const apply = (k) => {
    spots.forEach((d, i) => {
      const s = 0.45 + 0.55 * k;
      m4.compose(new THREE.Vector3(d.x, d.y, d.z), q.setFromAxisAngle(up, d.yaw), new THREE.Vector3(d.w * (0.8 + 0.2 * k), d.h * 2 * s, d.d * (0.8 + 0.2 * k)));
      drifts.setMatrixAt(i, m4);
    });
    drifts.instanceMatrix.needsUpdate = true;
  };
  apply(0);
  drifts.count = spots.length;
  drifts.receiveShadow = true;
  drifts.castShadow = true;
  drifts.computeBoundingSphere();
  drifts.name = 'snow_drifts';
  group.add(drifts);
  grow.push((k) => { apply(k); drifts.computeBoundingSphere(); });

  // --- The compacted kerb at the courts: a low, flat, grey-blue lip.
  const kerbs = [];
  for (const b of courts) {
    const north = b.min.z + b.max.z > 0;
    const z = north ? b.max.z + 0.35 : b.min.z - 0.35;
    for (let x = b.min.x + 0.6; x < b.max.x; x += 1.1) kerbs.push({ x, z, y: plan.floorY(x, z) - 0.02 });
  }
  if (kerbs.length) {
    const kerb = new THREE.InstancedMesh(moundGeometry(), new THREE.MeshStandardMaterial({ color: '#dbe5ef', vertexColors: false, roughness: 0.7 }), kerbs.length);
    kerbs.forEach((k, i) => kerb.setMatrixAt(i, m4.compose(new THREE.Vector3(k.x, k.y, k.z), q.identity(), new THREE.Vector3(1.4, 0.18, 0.55))));
    kerb.receiveShadow = true; kerb.computeBoundingSphere(); kerb.name = 'snow_kerb';
    group.add(kerb);
  }

  // --- Skins on what stands: roofs, fence tops, the shed, the pergola, half the greenhouse glass.
  const roofs = skin(root, (o) => ROOFS.test(o.name) || [o.material].flat().some((m) => ROOFS.test(m?.name ?? '')), { lift: 0.08 });
  if (roofs) { roofs.receiveShadow = true; roofs.name = 'snow_roofs'; group.add(roofs); }
  const tops = skin(root, (o) => FENCE.test(o.name) || /pergola|shed_mesh/.test(o.name), { lift: 0.05, minNy: 0.6, keep: (i) => (i * 2654435761 >>> 0) % 100 < 70 });
  if (tops) { tops.receiveShadow = true; tops.name = 'snow_tops'; group.add(tops); }
  const glass = skin(root, (o) => /garden_glass/.test(o.name), { lift: 0.05, keep: (i) => (i * 2246822519 >>> 0) % 100 < 45 });
  if (glass) { glass.name = 'snow_greenhouse'; group.add(glass); }

  // --- Caps on chairs, masts, trees.
  const capSpots = [...caps(root, (o) => /umpire_chair/.test(o.name), { w: 1, h: 0.28, maxW: 1.1 }), ...caps(root, (o) => /flood_pole/.test(o.name), { w: 1.4, h: 0.22, maxW: 0.7 })];
  root.traverse((o) => {
    if (!o.isInstancedMesh || !/^impostor_tree/.test(o.name)) return;
    const mm = new THREE.Matrix4(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, mm); mm.premultiply(o.matrixWorld); mm.decompose(p, q, s);
      const h = Math.min(s.y * 0.9, 12);
      for (let j = 0; j < 3; j++) capSpots.push({ x: p.x + (r() - 0.5) * s.x * 0.35, y: p.y + h * (0.7 + r() * 0.25), z: p.z + (r() - 0.5) * 0.6, w: s.x * 0.22, d: s.x * 0.18, h: 0.2 });
    }
  });
  if (capSpots.length) {
    const cap = new THREE.InstancedMesh(moundGeometry(), snowMat(), capSpots.length);
    capSpots.forEach((c, i) => cap.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, c.y, c.z), q.identity(), new THREE.Vector3(c.w, c.h * 2, c.d))));
    cap.castShadow = cap.receiveShadow = true; cap.computeBoundingSphere(); cap.name = 'snow_caps';
    group.add(cap);
  }

  // --- A layer on the paths, patchy, thicker over the winter; the trodden lanes stay bare.
  const patch = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = 0.5 + 0.28 * Math.sin(x * 0.19 + Math.sin(y * 0.11) * 2) + 0.22 * Math.sin(y * 0.23 - x * 0.07) + (r() - 0.5) * 0.3;
      const o = (y * 128 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, v * 255)); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const pathSnow = skin(root, (o) => PATHS.test(o.name), { lift: 0.025, minNy: 0.8 });
  if (pathSnow) {
    const pos = pathSnow.geometry.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) * 0.12; uv[i * 2 + 1] = pos.getZ(i) * 0.12; }
    pathSnow.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    pathSnow.material = new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.85, alphaMap: patch, alphaTest: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    pathSnow.receiveShadow = true; pathSnow.name = 'snow_paths';
    group.add(pathSnow);
    grow.push((k) => { pathSnow.material.alphaTest = 0.78 - 0.4 * k * amount; });
  }

  // --- Snowmen of several sizes, on lawns, away from everything standing.
  const men = [];
  const sizes = [1.6, 0.9, 1.25, 0.6, 1.0, 1.9, 0.75].slice(0, Math.max(2, Math.round(7 * amount)));
  const cand = [at, [14, -44], [-30, -46], [58, -44], [-18, -46], [2, -46], [40, -46], [48, -45]];
  sizes.forEach((sz, i) => {
    const c = cand[i % cand.length];
    const spot = plan.settle(c[0], c[1], 0.5 * sz, 4);
    if (!spot) return;
    plan.take(spot.x, spot.z, 0.5 * sz);
    men.push({ x: spot.x, z: spot.z, y: plan.floorY(spot.x, spot.z), sz, yaw: rnd(-0.6, 0.6) });
  });
  const manGeo = snowman(1);
  const manSmall = snowman(0.5);
  const manMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  men.forEach((m, i) => {
    const mesh = new THREE.Mesh(i % 2 ? manSmall : manGeo, manMat);
    mesh.position.set(m.x, m.y, m.z); mesh.rotation.y = m.yaw; mesh.scale.setScalar(m.sz);
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'snow_man';
    group.add(mesh);
  });

  // --- Light tracks: pairs of dark prints from the gates, a few metres in.
  const prints = [];
  for (const g of gaps.slice(0, 4)) {
    const sgn = g > 20 ? 1 : -1;
    for (let k = 0; k < 9; k++) prints.push({ x: g + (k % 2 ? 0.14 : -0.14) + (r() - 0.5) * 0.06, z: sgn * (2.5 + k * 0.62) });
  }
  if (prints.length && quality !== 'low') {
    const pm = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 8).rotateX(-Math.PI / 2).scale(1, 1, 1.7), new THREE.MeshBasicMaterial({ color: '#aab9cb', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), prints.length);
    prints.forEach((p, i) => pm.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, plan.floorY(p.x, p.z) + 0.035, p.z), q.identity(), new THREE.Vector3(1, 1, 1))));
    pm.computeBoundingSphere(); pm.name = 'snow_prints'; pm.userData.noAO = true;
    group.add(pm);
  }

  group.name = 'snow_world';
  return { group, grow: (k) => grow.forEach((fn) => fn(k)), drifts: spots.length, caps: capSpots.length, men: men.length };
}
