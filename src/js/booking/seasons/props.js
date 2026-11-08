import * as THREE from 'three';
import { part, merge } from '../life/geom.js';
import { pumpkinGeometry } from './decor.js';

// Small procedural props for the spring and autumn holiday packs (Valentine's, St. Patrick's,
// Easter, Thanksgiving; row 1, round 11). Everything is built in code, in metres, vertex-painted
// (life/geom.js `part`), meant to be drawn as instances: one geometry, many spots. Pale vertex
// colours are tinted per instance (`setColorAt`); the ones with fixed colours are not.

/** The spots of every instance of a mesh whose name matches `re`: [{ x, y, z, yaw, sx, sy, sz }]. */
export function instanceSpots(root, re) {
  const out = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isInstancedMesh || !re.test(o.name)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4).premultiply(o.matrixWorld).decompose(p, q, s);
      out.push({ x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z, yaw: new THREE.Euler().setFromQuaternion(q, 'YXZ').y });
    }
  });
  return out;
}

/** A free spot near (x, z) for something `r` m wide, taken from the plan: { x, y, z }, or null. */
export function claim(plan, x, z, r, reach = 0.6) {
  const at = plan.settle(x, z, r, reach);
  if (!at) return null;
  plan.take(at.x, at.z, r);
  return { x: at.x, y: plan.floorY(at.x, at.z), z: at.z };
}

/** Paints a geometry vertex by vertex: `fn(x, y, z)` returns a THREE.Color or [r, g, b]. */
export function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (Array.isArray(v)) c.setRGB(...v); else c.copy(v);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

const solid = (g, hex) => part(g, hex);
const flat = (g) => g.rotateX(-Math.PI / 2); // lie a shape on the ground

/** The usual material of a painted prop. */
export const propMaterial = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, ...extra });

/** A decal lying on the ground: sits just above it and wins the depth fight. */
export const decalMaterial = (extra = {}) => new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...extra,
});

// --- Hearts ---------------------------------------------------------------------------------

function heartShape(k = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5 * k);
  s.bezierCurveTo(-0.15 * k, -0.35 * k, -0.5 * k, -0.1 * k, -0.5 * k, 0.17 * k);
  s.bezierCurveTo(-0.5 * k, 0.42 * k, -0.17 * k, 0.5 * k, 0, 0.27 * k);
  s.bezierCurveTo(0.17 * k, 0.5 * k, 0.5 * k, 0.42 * k, 0.5 * k, 0.17 * k);
  s.bezierCurveTo(0.5 * k, -0.1 * k, 0.15 * k, -0.35 * k, 0, -0.5 * k);
  return s;
}

/** A solid heart 1 m wide, standing, its face to +z (a balloon, a sign); tilt it to the drone with rotateX. */
export function heartSolid(hex = '#ffffff', depth = 0.28) {
  const g = new THREE.ExtrudeGeometry(heartShape(), { depth, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return solid(g, hex);
}

/** A heart lying on the ground, 1 m wide, its tip towards +z (down the screen). */
export const heartFlat = () => flat(new THREE.ShapeGeometry(heartShape(), 10));

/** Points along a heart outline, for beds and strings of lights: [x, y] in -1…1, the lobes at +y. */
export function heartOutline(n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
  }
  return out;
}

// --- Flowers --------------------------------------------------------------------------------

/** A rose seen from above: a dark bud inside five open petals; pale grey, tinted per instance. Sits on y = 0. */
export function roseHead() {
  const parts = [solid(new THREE.IcosahedronGeometry(0.5, 1).scale(0.55, 0.42, 0.55).translate(0, 0.32, 0), '#9c9c9c')];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(solid(new THREE.IcosahedronGeometry(0.5, 1).scale(0.5, 0.26, 0.4).rotateY(-a).translate(Math.cos(a) * 0.32, 0.26, Math.sin(a) * 0.32), '#ffffff'));
  }
  parts.push(solid(new THREE.ConeGeometry(0.16, 0.24, 6).translate(0, 0.08, 0), '#3f7a30')); // calyx
  return merge(parts);
}

/** A bouquet lying on a bench: a paper cone and a head of roses; `palette`: head colours. */
export function bouquetGeometry(palette, paper = '#f3e9e1') {
  const parts = [];
  const cone = new THREE.ConeGeometry(0.2, 0.66, 8, 1, true).rotateZ(Math.PI / 2).translate(-0.2, 0.2, 0); // tip at -x, mouth at +x
  parts.push(solid(cone, paper));
  const heads = [[0.18, 0.26, 0], [0.12, 0.3, 0.16], [0.12, 0.3, -0.16], [0.02, 0.28, 0.1], [0.02, 0.28, -0.1], [0.24, 0.2, 0.08], [0.24, 0.2, -0.08]];
  heads.forEach(([x, y, z], i) => {
    parts.push(solid(new THREE.IcosahedronGeometry(0.5, 1).scale(0.26, 0.2, 0.26).translate(x, y + 0.04, z), palette[i % palette.length]));
    parts.push(solid(new THREE.IcosahedronGeometry(0.5, 0).scale(0.12, 0.08, 0.12).translate(x, y + 0.1, z), '#7a1620'));
  });
  parts.push(solid(new THREE.IcosahedronGeometry(0.5, 0).scale(0.22, 0.05, 0.1).translate(0.3, 0.14, 0.2), '#3f7a30'));
  parts.push(solid(new THREE.IcosahedronGeometry(0.5, 0).scale(0.22, 0.05, 0.1).translate(0.3, 0.14, -0.2), '#3f7a30'));
  parts.push(solid(new THREE.TorusGeometry(0.13, 0.015, 5, 14).rotateY(Math.PI / 2).translate(0.0, 0.2, 0), '#d9a0a8')); // ribbon
  return merge(parts);
}

/** A stem with two leaf blades, 0.5 m tall, to scale per flower. */
export function stemGeometry() {
  return merge([
    solid(new THREE.CylinderGeometry(0.012, 0.018, 0.5, 5).translate(0, 0.25, 0), '#4d8a3a'),
    solid(new THREE.ConeGeometry(0.05, 0.34, 4).scale(1, 1, 0.25).rotateZ(0.3).translate(0.05, 0.17, 0), '#3f7a30'),
    solid(new THREE.ConeGeometry(0.05, 0.3, 4).scale(1, 1, 0.25).rotateZ(-0.3).translate(-0.05, 0.15, 0), '#468433'),
  ]);
}

/** A tulip cup on top of a 0.5 m stem (same matrix as the stem); pale, tinted per instance. */
export function tulipHead() {
  const prof = [[0, 0], [0.05, 0.015], [0.085, 0.07], [0.08, 0.13], [0.05, 0.17], [0.02, 0.15], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y));
  return paint(new THREE.LatheGeometry(prof, 8).translate(0, 0.5, 0), (x, y) => { const k = 0.86 + 0.14 * ((y - 0.5) / 0.17); return [k, k, k]; });
}

/** A daffodil: six pale petals round a deeper trumpet, on the top of a 0.5 m stem. */
export function daffodilHead() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(solid(new THREE.ConeGeometry(0.045, 0.14, 3).scale(1, 1, 0.3).rotateZ(Math.PI / 2 + 0.2).rotateY((i / 6) * Math.PI * 2).translate(0, 0.52, 0), '#ffffff'));
  parts.push(solid(new THREE.CylinderGeometry(0.06, 0.035, 0.1, 8, 1, true).translate(0, 0.56, 0), '#e3a655'));
  return merge(parts);
}

/** A raised bed: a timber frame round dark soil, `list`: [x, y, z, w, d, yaw]; one geometry for all. */
export function bedGeometry(list) {
  const parts = [];
  for (const [x, y, z, w, d, yaw] of list) {
    const bed = [
      solid(new THREE.BoxGeometry(w, 0.1, d - 0.12).translate(0, 0.06, 0), '#3c2a1c'),
      solid(new THREE.BoxGeometry(w, 0.2, 0.08).translate(0, 0.1, d / 2 - 0.04), '#7a5a3a'),
      solid(new THREE.BoxGeometry(w, 0.2, 0.08).translate(0, 0.1, -d / 2 + 0.04), '#7a5a3a'),
      solid(new THREE.BoxGeometry(0.08, 0.2, d).translate(w / 2 - 0.04, 0.1, 0), '#6a4c30'),
      solid(new THREE.BoxGeometry(0.08, 0.2, d).translate(-w / 2 + 0.04, 0.1, 0), '#6a4c30'),
    ];
    for (const b of bed) { b.rotateY(yaw).translate(x, y, z); parts.push(b); }
  }
  return merge(parts);
}

// --- Easter ---------------------------------------------------------------------------------

/** An egg 0.3 m long on y = 0, pale with two darker bands; tinted per instance. */
export function eggGeometry() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    pts.push(new THREE.Vector2(Math.sin(t) * 0.5 * (1 - 0.16 * Math.cos(t)), 0.5 - Math.cos(t) * 0.5));
  }
  const g = new THREE.LatheGeometry(pts, 12).scale(0.3, 0.3, 0.3);
  return paint(g, (x, y) => {
    const h = y / 0.3;
    const band = (h > 0.3 && h < 0.42) || (h > 0.62 && h < 0.7) ? 0.7 : 1;
    const dots = ((Math.floor((x + 1) * 90) + Math.floor(h * 14)) % 5 === 0) && h > 0.44 && h < 0.6 ? 0.82 : 1;
    return [band * dots, band * dots, band * dots];
  });
}

/** A wicker basket with a handle, 0.5 m across; fixed colours. */
export function basketGeometry() {
  return merge([
    solid(new THREE.CylinderGeometry(0.3, 0.22, 0.26, 12, 1, true).translate(0, 0.14, 0), '#b8884a'),
    solid(new THREE.CircleGeometry(0.22, 12).rotateX(-Math.PI / 2).translate(0, 0.03, 0), '#8a6234'),
    solid(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 12).translate(0, 0.27, 0), '#a67738'),
    solid(new THREE.TorusGeometry(0.28, 0.018, 5, 14, Math.PI).translate(0, 0.27, 0), '#8a6234'),
  ]);
}

/** A pastel bow, flat, its face to +z, 0.5 m across; tinted per instance. */
export function bowGeometry() {
  const wing = (s) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(s * 0.26, 0.15); sh.lineTo(s * 0.26, -0.15); sh.closePath();
    return new THREE.ShapeGeometry(sh);
  };
  return merge([
    paint(wing(1), () => [1, 1, 1]), paint(wing(-1), () => [1, 1, 1]),
    solid(new THREE.CircleGeometry(0.05, 8), '#d6d0c8'),
    solid(new THREE.PlaneGeometry(0.07, 0.3).rotateZ(0.25).translate(-0.04, -0.2, 0), '#e8e4dd'),
    solid(new THREE.PlaneGeometry(0.07, 0.3).rotateZ(-0.25).translate(0.04, -0.2, 0), '#e8e4dd'),
  ]);
}

// --- St. Patrick's ----------------------------------------------------------------------------

/** A shamrock lying on the ground: three heart leaves round a point and a short stem; 1 m across. */
export function shamrockFlat() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.ShapeGeometry(heartShape(0.46), 8).translate(0, 0.2, 0).rotateZ((k * Math.PI * 2) / 3 + Math.PI / 6);
    parts.push(g);
  }
  const stem = new THREE.Shape();
  stem.moveTo(-0.025, 0); stem.lineTo(0.025, 0); stem.lineTo(0.05, -0.34); stem.lineTo(0.0, -0.4); stem.closePath();
  parts.push(new THREE.ShapeGeometry(stem));
  const g = flat(merge(parts.map((p) => paint(p, () => [1, 1, 1]))));
  return g;
}

/** An iron cauldron 1 m across with a heap of gold coins in it; fixed colours. */
export function cauldronGeometry() {
  const prof = [[0, 0.05], [0.22, 0.04], [0.42, 0.18], [0.5, 0.38], [0.46, 0.56], [0.5, 0.6], [0.5, 0.66], [0.44, 0.64], [0.4, 0.56]].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [
    solid(new THREE.LatheGeometry(prof, 14), '#262523'),
    solid(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.52, 0), '#e0a92a'),
    solid(new THREE.TorusGeometry(0.46, 0.025, 5, 16, Math.PI).rotateZ(0).translate(0, 0.66, 0), '#1c1b19'),
  ];
  for (const a of [0.5, 2.6, 4.7]) parts.push(solid(new THREE.CylinderGeometry(0.05, 0.035, 0.14, 5).translate(Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3), '#1c1b19'));
  return merge(parts);
}

/** A gold coin standing a little on its edge, 0.2 m across. */
export const coinGeometry = () => solid(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10).rotateX(0.5), '#f0b92c');

// --- Thanksgiving ---------------------------------------------------------------------------

/** The Halloween pumpkin repainted pale: tint it per instance (cream, tan, buff, soft orange). */
export function pumpkinPale() {
  const g = pumpkinGeometry();
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) {
    const k = Math.min(1.25, ((col.getX(i) + col.getY(i) + col.getZ(i)) / 3) / 0.5);
    col.setXYZ(i, k, k * 0.97, k * 0.9);
  }
  return g;
}

/** A cornstalk shock: leaning stalks tied with raffia, two ears peeking out of the husk; 1.5 m tall. */
export function cornShock() {
  const parts = [];
  const tall = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const lean = 0.2 + (i % 3) * 0.04;
    const h = tall * (0.82 + (i % 4) * 0.06);
    const g = new THREE.ConeGeometry(0.04, h, 4).translate(0, h / 2, 0).rotateZ(-lean).rotateY(a).translate(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    parts.push(solid(g, i % 2 ? '#b8a05a' : '#a88f4a'));
    // a leaf blade swinging out near the top
    parts.push(solid(new THREE.ConeGeometry(0.05, 0.5, 3).scale(1, 1, 0.2).rotateZ(-1.1).rotateY(a + 0.3).translate(Math.cos(a) * 0.18, h * 0.78, Math.sin(a) * 0.18), '#9aa456'));
  }
  parts.push(solid(new THREE.TorusGeometry(0.15, 0.02, 5, 12).rotateX(Math.PI / 2).translate(0, tall * 0.55, 0), '#c4521c'));
  for (const [x, z, y] of [[0.14, 0.12, 0.9], [-0.15, 0.1, 0.78]]) {
    parts.push(solid(new THREE.CapsuleGeometry(0.05, 0.2, 3, 6).rotateZ(0.2).translate(x, y, z), '#e8b83a'));
    parts.push(solid(new THREE.ConeGeometry(0.07, 0.24, 5).rotateZ(Math.PI).translate(x, y - 0.14, z), '#8f9a4a'));
  }
  return merge(parts);
}

/** A flat autumn leaf, 1 m long, pointing down the screen, lying on the ground; tinted per instance. */
export function leafFlat() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.34, -0.26, 0.3, 0.2, 0, 0.5);
  s.bezierCurveTo(-0.3, 0.2, -0.34, -0.26, 0, -0.5);
  return flat(paint(new THREE.ShapeGeometry(s, 6), (x, y) => { const k = 0.8 + 0.2 * Math.abs(Math.sin(x * 12 + y * 3)); return [k, k, k]; }));
}

/** A roast turkey on a platter, 0.9 m long, +x forward; fixed colours. */
export function roastTurkey() {
  const parts = [
    solid(new THREE.CylinderGeometry(0.5, 0.48, 0.05, 14).scale(1, 1, 0.7).translate(0, 0.025, 0), '#e8e4dc'),
    solid(new THREE.SphereGeometry(0.36, 14, 9).scale(1.15, 0.78, 0.8).translate(0, 0.32, 0), '#a8571c'),
    solid(new THREE.SphereGeometry(0.2, 8, 6).scale(1, 0.7, 0.8).translate(0.3, 0.45, 0), '#b8661f'),
  ];
  for (const z of [-0.25, 0.25]) {
    parts.push(solid(new THREE.CapsuleGeometry(0.075, 0.16, 3, 7).rotateZ(Math.PI / 2 - 0.5).translate(-0.12, 0.2, z), '#8f4a18'));
    parts.push(solid(new THREE.CylinderGeometry(0.022, 0.03, 0.12, 5).rotateZ(Math.PI / 2).translate(-0.34, 0.12, z), '#f3ecd8'));
  }
  return merge(parts);
}

/** A small round dish (a pie, a bowl): `hex` filling, 0.3 m across. */
export const dishGeometry = (hex) => merge([
  solid(new THREE.CylinderGeometry(0.17, 0.15, 0.04, 12).translate(0, 0.02, 0), '#e8e4dc'),
  solid(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 12).translate(0, 0.06, 0), hex),
]);

/** A table 2.2 x 0.9 m with a cloth, 0.75 m high, centred on its footprint. */
export const tableGeometry = () => merge([
  solid(new THREE.BoxGeometry(2.2, 0.06, 0.9).translate(0, 0.75, 0), '#7a5a3a'),
  solid(new THREE.BoxGeometry(2.0, 0.02, 0.7).translate(0, 0.79, 0), '#c4521c'),
  ...[[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]].map(([x, z]) => solid(new THREE.BoxGeometry(0.07, 0.72, 0.07).translate(x, 0.36, z), '#5c4026')),
]);
