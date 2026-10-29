import * as THREE from 'three';
import { part, box, merge } from '../life/geom.js';

// Geometry for the holiday decor (round 8, "seasons"), in metres, built in code: no downloads.
// Low-poly but shaped like the real things: ribbed pumpkins with a stem, carved faces on a shell
// that follows the skin, straw bales, C9 string-light bulbs on sagging wire, pennant bunting,
// small stick flags, a fir with ornaments and wrapped gifts. Textures are small canvases.

const rand = (r, a, b) => a + r() * (b - a);

function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// --- Pumpkins ----------------------------------------------------------------------------

const PUMPKIN_H = 0.62; // height / width
const PUMPKIN_LOBES = 10;

/** A pumpkin 1 m across, sitting on y = 0, its front (+z) where a face would be carved. */
export function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(0.5, 28, 16);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color('#d2621b');
  const groove = new THREE.Color('#8c3a10');
  const shoulder = new THREE.Color('#a8571c');
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(2); // unit sphere
    const phi = Math.atan2(v.z, v.x);
    const lobe = Math.abs(Math.sin((PUMPKIN_LOBES / 2) * phi)); // 0 in the grooves
    const k = 0.88 + 0.12 * lobe ** 0.35;
    const a = Math.abs(v.y);
    const y = Math.sign(v.y) * (a - 0.26 * a ** 8); // dimples round the stem and underneath
    pos.setXYZ(i, v.x * 0.5 * k, (y * PUMPKIN_H * 0.5) + PUMPKIN_H * 0.5 - 0.02, v.z * 0.5 * k);
    c.copy(groove).lerp(skin, lobe ** 0.6);
    if (v.y > 0.6) c.lerp(shoulder, (v.y - 0.6) * 1.2);
    if (v.y < -0.3) c.multiplyScalar(1 + (v.y + 0.3) * 0.5); // the underside sits in shade
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const skinPart = g.toNonIndexed();
  skinPart.deleteAttribute('uv');
  const stem = part(new THREE.CylinderGeometry(0.035, 0.055, 0.16, 7).rotateZ(0.18).translate(0.012, PUMPKIN_H - 0.02, 0), '#5a4b2b');
  return merge([skinPart, stem]);
}

/** Carved face: a shell just outside the front of the skin, mapped with the face cut-out (alpha). */
export function pumpkinFaceGeometry() {
  const g = new THREE.SphereGeometry(0.5, 40, 24, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.18, Math.PI * 0.62);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(2);
    const phi = Math.atan2(v.z, v.x);
    const lobe = Math.abs(Math.sin((PUMPKIN_LOBES / 2) * phi));
    const k = (0.88 + 0.12 * lobe ** 0.35) * 1.012;
    const y = v.y * PUMPKIN_H * 0.5 * 1.012 + PUMPKIN_H * 0.5 - 0.02;
    pos.setXYZ(i, v.x * 0.5 * k, y, v.z * 0.5 * k);
    uv.setXY(i, v.x * 0.5 + 0.5, (y - PUMPKIN_H * 0.5) / PUMPKIN_H + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** White = cut: two eyes, a nose and a toothy grin. */
export function faceTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#fff';
    const P = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath(); g.fill(); };
    P([[0.3, 0.42], [0.44, 0.42], [0.38, 0.27]]); // eyes (v grows downwards in the canvas)
    P([[0.56, 0.42], [0.7, 0.42], [0.62, 0.27]]);
    P([[0.47, 0.53], [0.53, 0.53], [0.5, 0.46]]); // nose
    P([[0.26, 0.58], [0.34, 0.62], [0.38, 0.58], [0.42, 0.63], [0.47, 0.6], [0.53, 0.6], [0.58, 0.63], [0.62, 0.58], [0.66, 0.62], [0.74, 0.58],
      [0.68, 0.7], [0.6, 0.75], [0.56, 0.71], [0.5, 0.76], [0.44, 0.71], [0.4, 0.75], [0.32, 0.7]]);
  }, false);
}

// --- Hay bales -------------------------------------------------------------------------

export const BALE = { w: 1.0, h: 0.44, d: 0.5 };

export function baleGeometry() {
  const g = new THREE.BoxGeometry(BALE.w, BALE.h, BALE.d, 1, 1, 1).translate(0, BALE.h / 2, 0);
  return g;
}

/** Straw: short strokes, mostly lengthwise, with two strands of twine. */
export function strawTexture(seedRand) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#a7843f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = seedRand() * w;
      const y = seedRand() * h;
      const a = (seedRand() - 0.5) * 0.7;
      const l = 5 + seedRand() * 16;
      const tone = seedRand();
      g.strokeStyle = tone > 0.75 ? '#dcc07a' : tone > 0.4 ? '#bf9c55' : tone > 0.12 ? '#8a6c34' : '#5e4c29';
      g.lineWidth = seedRand() > 0.8 ? 2 : 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.fillStyle = 'rgba(82, 64, 36, 0.9)';
    g.fillRect(w * 0.27, 0, 3, h);
    g.fillRect(w * 0.71, 0, 3, h);
  });
}

// --- String lights and bunting -------------------------------------------------------------

/**
 * Points of a strand hung between `anchors` ([x, y, z]), sagging `sag` m mid-span, one every
 * `step` m along it. Returns { points, wire } (wire: line segment pairs, flat xyz).
 */
export function hangStrand(anchors, { sag = 0.3, step = 0.5, drop = 0 } = {}) {
  const points = [];
  const wire = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  let carry = 0;
  for (let s = 0; s < anchors.length - 1; s++) {
    a.set(...anchors[s]);
    b.set(...anchors[s + 1]);
    const span = a.distanceTo(b);
    const n = Math.max(4, Math.ceil(span / 0.25));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      p.lerpVectors(a, b, t);
      p.y -= sag * 4 * t * (1 - t) * Math.min(1, span / 3);
      if (prev) wire.push(...prev, p.x, p.y, p.z);
      prev = [p.x, p.y, p.z];
    }
    // Bulbs (or pennants) evenly along the span, continuing the spacing across anchors.
    for (let d = carry; d < span; d += step) {
      const t = d / span;
      p.lerpVectors(a, b, t);
      p.y -= sag * 4 * t * (1 - t) * Math.min(1, span / 3) + drop;
      const tan = new THREE.Vector3().subVectors(b, a).normalize();
      tan.y -= sag * 4 * (1 - 2 * t) * Math.min(1, span / 3) / span;
      points.push({ p: p.clone(), tan: tan.normalize() });
      carry = d + step - span;
    }
  }
  return { points, wire };
}

/** Pennants under a strand: triangles in the plane of the wire, colours cycling. */
export function buntingGeometry(points, colors, { w = 0.26, l = 0.34 } = {}) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  points.forEach(({ p, tan }, i) => {
    c.set(colors[i % colors.length]);
    const half = tan.clone().multiplyScalar(w / 2);
    const tip = p.clone().add(new THREE.Vector3(0, -l, 0)).addScaledVector(tan, 0.01);
    const a = p.clone().sub(half);
    const b = p.clone().add(half);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A C9-style bulb: a short, pointed glass drop, 1 unit = real size. */
export function bulbGeometry() {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.075), new THREE.Vector2(0.024, -0.05), new THREE.Vector2(0.031, -0.02),
    new THREE.Vector2(0.014, 0.012),
  ], 6);
}

/** Soft round glow for the halo cards (bulbs, lit pumpkins on the ground). */
export function glowTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    r.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}

/** Light on the ground (multiplied into it, like the court pools): bright middle, black edge. */
export function poolTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, '#fff');
    r.addColorStop(0.3, '#8a8a8a');
    r.addColorStop(0.65, '#262626');
    r.addColorStop(1, '#000');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  }, false);
}

// --- Flags -----------------------------------------------------------------------------------

export const FLAG = { w: 0.46, h: 0.3, pole: 1.05 };

/** Flag cloth on the pole's +x side, top edge at the pole top, with a gentle static ripple. */
export function flagGeometry() {
  const g = new THREE.PlaneGeometry(FLAG.w, FLAG.h, 10, 1).translate(FLAG.w / 2 + 0.008, FLAG.pole - FLAG.h / 2 - 0.02, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / FLAG.w;
    pos.setZ(i, Math.sin(u * Math.PI * 2.2) * 0.035 * u);
    pos.setY(i, pos.getY(i) - u * u * 0.03); // the fly end droops a little
  }
  g.computeVertexNormals();
  return g;
}

export function flagPoleGeometry() {
  return merge([
    part(new THREE.CylinderGeometry(0.008, 0.009, FLAG.pole, 6).translate(0, FLAG.pole / 2, 0), '#d8d4c8'),
    part(new THREE.SphereGeometry(0.014, 6, 4).translate(0, FLAG.pole + 0.008, 0), '#c9a54a'),
  ]);
}

/** Stars and stripes, small: 13 stripes, the blue canton with a grid of white dots. */
export function flagTexture() {
  return canvasTexture(128, 84, (g, w, h) => {
    const s = h / 13;
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#b22234'; g.fillRect(0, i * s, w, s + 1); }
    g.fillStyle = '#3c3b6e';
    g.fillRect(0, 0, w * 0.4, s * 7);
    g.fillStyle = '#f2efe6';
    for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) {
      g.fillRect((k + (r % 2 ? 1 : 0.5)) * (w * 0.4 / 6.2) - 1, (r + 0.6) * (s * 7 / 9.6) - 1, 2, 2);
    }
  });
}

// --- Holidays: the fir and the gifts ---------------------------------------------------------------

export const TREE = { height: 3.5, radius: 1.25, base: 0.42 };

/** Cone radius of the fir at height y (for lights and ornaments on its surface). */
export const treeRadius = (y) => TREE.radius * THREE.MathUtils.clamp(1 - (y - TREE.base) / (TREE.height - TREE.base), 0, 1);

export function firGeometry(r) {
  const parts = [];
  // Pot and trunk.
  parts.push(part(new THREE.CylinderGeometry(0.34, 0.28, 0.4, 10).translate(0, 0.2, 0), '#2a2522'));
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6).translate(0, 0.5, 0), '#4a3524'));
  // Five tiers of boughs, each a cone a little wider than the shape so the tiers overlap.
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const y0 = TREE.base + i * ((TREE.height - TREE.base - 0.3) / tiers);
    const h = 1.05 - i * 0.08;
    const rad = treeRadius(y0) * 1.12 + 0.08;
    const cone = new THREE.ConeGeometry(rad, h, 11, 2).translate(0, y0 + h / 2, 0).rotateY(i * 0.7);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) { // ragged bough tips
      const x = p.getX(k);
      const z = p.getZ(k);
      const d = Math.hypot(x, z);
      if (d > 0.05) { const f = 1 + (r() - 0.5) * 0.16; p.setX(k, x * f); p.setZ(k, z * f); p.setY(k, p.getY(k) + (r() - 0.5) * 0.05); }
    }
    parts.push(part(cone, i % 2 ? '#1d3a26' : '#21422b'));
  }
  return merge(parts);
}

export function starGeometry() {
  return new THREE.OctahedronGeometry(0.13, 0).scale(1, 1.25, 0.45);
}

const GIFT_COLORS = [['#9e1d1b', '#d9b45a'], ['#1f5a3a', '#e9e5da'], ['#d6b65c', '#9e1d1b'], ['#ebe8df', '#a3241f'], ['#23324f', '#d9b45a'], ['#6f1f2e', '#e9e5da']];

/** Wrapped boxes standing at `spots` [x, z, size, yaw, (y)], merged into one geometry. */
export function giftsGeometry(spots, r) {
  const parts = [];
  spots.forEach(([x, z, s, yaw = 0, y = 0], i) => {
    const [paper, ribbon] = GIFT_COLORS[i % GIFT_COLORS.length];
    const w = s * rand(r, 0.85, 1.2);
    const d = s * rand(r, 0.8, 1.1);
    const h = s * rand(r, 0.6, 1.0);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const add = (geo, hex) => parts.push(part(geo.applyMatrix4(m), hex));
    add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), paper);
    add(new THREE.BoxGeometry(w + 0.012, h + 0.012, 0.045).translate(0, h / 2, 0), ribbon);
    add(new THREE.BoxGeometry(0.045, h + 0.012, d + 0.012).translate(0, h / 2, 0), ribbon);
    add(new THREE.TorusGeometry(0.035, 0.012, 4, 8).rotateY(0.6).translate(-0.03, h + 0.03, 0), ribbon);
    add(new THREE.TorusGeometry(0.035, 0.012, 4, 8).rotateY(-0.6).translate(0.03, h + 0.03, 0), ribbon);
  });
  return merge(parts);
}

export { box, part, merge };
