import * as THREE from 'three';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { adorn } from '../../life/adorn.js';
import { part, merge } from '../../life/geom.js';

// Cinco de Mayo (round 11, rows 7 and 14), May 1 to 6: papel picado over the walkway and the
// aisles (cut-paper flags in red, green, orange, turquoise, pink and yellow, with their holes
// cut through; they sway in a light breeze on the life layer), bright strings of lights, flowering
// cacti in talavera pots at the doors and the court gates, straw sombreros on the lawn, and
// sombreros on the club's own people (the registry's `staffHat`, calendar.js; guests wear none).
// The music is sound/mariachi.js (the registry's `music`). Respectful and plain: no costumes, no
// caricature, nothing on a face.

const PAPEL = ['#e03a3e', '#2a9d5c', '#f28c28', '#19b5b0', '#e84a8a', '#f2c230', '#7a4fc4', '#f4efe4'];
const TURQUOISE = { glass: '#2ec4b6', glow: new THREE.Color(0.08, 0.85, 0.75), gain: 0.55 };
const ORANGE = { glass: '#f28c28', glow: new THREE.Color(1, 0.42, 0.04), gain: 0.5 };
const CELLS = 4; // cut designs in the atlas
const FLAG = { w: 0.6, l: 0.76 };
const POT_K = 1.5; // cacti and pots against their model size, so they read from the drone
const DOORS = [[-12.3, -50.6], [-7.3, -50.6], [8.05, -50.6], [11.2, -50.6], [13.9, -50.6], [17.0, -50.6], [44.9, -50.6], [49.6, -50.6], [50.2, -50.2]];

/** The hat the staff wear: a straw sombrero, broad brim, a red-white-green trim at its edge, seen from the drone. */
function drawSombrero(g, size) {
  const k = size / 128;
  g.scale(k, k);
  const cx = 64; const cy = 91;
  g.fillStyle = 'rgba(0, 0, 0, 0.18)'; // the shade it throws on the head
  g.beginPath(); g.ellipse(cx, cy + 3, 62, 36, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d9b46c'; // brim
  g.beginPath(); g.ellipse(cx, cy, 62, 36, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c99e55'; // straw, a darker ring inside
  g.beginPath(); g.ellipse(cx, cy, 44, 24, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; // the trim along the edge: red, white, green
  const trim = ['#c4261d', '#f4efe4', '#1f9d55'];
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2; const a1 = ((i + 1.05) / 36) * Math.PI * 2;
    g.strokeStyle = trim[i % 3];
    g.beginPath(); g.ellipse(cx, cy, 59, 33, 0, a0, a1); g.stroke();
  }
  g.fillStyle = '#e2bf78'; // crown
  g.beginPath(); g.moveTo(cx - 22, cy + 2); g.lineTo(cx - 20, cy - 34); g.quadraticCurveTo(cx, cy - 82, cx + 20, cy - 34); g.lineTo(cx + 22, cy + 2); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0, 0, 0, 0.14)';
  g.beginPath(); g.moveTo(cx + 6, cy - 50); g.quadraticCurveTo(cx + 16, cy - 40, cx + 20, cy - 34); g.lineTo(cx + 22, cy + 2); g.lineTo(cx + 8, cy + 2); g.closePath(); g.fill();
  g.fillStyle = '#c4261d'; // hat band
  g.fillRect(cx - 22, cy - 14, 44, 9);
  g.fillStyle = '#f4efe4';
  for (let i = 0; i < 5; i++) g.fillRect(cx - 18 + i * 9, cy - 12, 4, 5);
  g.fillStyle = '#1f9d55';
  g.fillRect(cx - 22, cy - 5, 44, 3);
}

/** Four cut designs in a row, white on clear: a sheet with a scalloped bottom edge and holes cut through it. */
function atlas() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * CELLS; c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < CELLS; i++) {
    g.save();
    g.translate(i * S, 0);
    g.fillStyle = '#fff';
    g.beginPath(); // a sheet: a header band, then the body with a scalloped bottom
    g.moveTo(6, 4); g.lineTo(S - 6, 4); g.lineTo(S - 6, S - 20);
    for (let k = 0; k < 6; k++) g.quadraticCurveTo(S - 6 - (k + 0.5) * ((S - 12) / 6), S - 2, S - 6 - (k + 1) * ((S - 12) / 6), S - 20);
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    const cut = (draw) => { g.beginPath(); draw(); g.fill(); };
    const cx = S / 2;
    cut(() => g.rect(14, 14, S - 28, 4)); // the header stripe
    if (i === 0) { // a flower
      for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2; cut(() => g.ellipse(cx + Math.cos(a) * 20, 62 + Math.sin(a) * 20, 8, 5, a, 0, Math.PI * 2)); }
      cut(() => g.arc(cx, 62, 6, 0, Math.PI * 2));
      for (let k = 0; k < 6; k++) cut(() => g.arc(14 + k * 20, 100, 4, 0, Math.PI * 2));
    } else if (i === 1) { // diamonds and a bird shape
      for (const [x, y, r] of [[cx, 46, 18], [cx - 30, 78, 10], [cx + 30, 78, 10], [cx, 92, 8]]) cut(() => { g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y); g.closePath(); });
      for (let k = 0; k < 5; k++) cut(() => g.arc(20 + k * 22, 28, 3, 0, Math.PI * 2));
    } else if (i === 2) { // a sun
      cut(() => g.arc(cx, 58, 14, 0, Math.PI * 2));
      for (let p = 0; p < 12; p++) { const a = (p / 12) * Math.PI * 2; cut(() => { g.moveTo(cx + Math.cos(a - 0.12) * 22, 58 + Math.sin(a - 0.12) * 22); g.lineTo(cx + Math.cos(a) * 36, 58 + Math.sin(a) * 36); g.lineTo(cx + Math.cos(a + 0.12) * 22, 58 + Math.sin(a + 0.12) * 22); g.closePath(); }); }
    } else { // stripes of small hearts and dots
      for (let row = 0; row < 3; row++) for (let k = 0; k < 5; k++) cut(() => g.arc(20 + k * 22 + (row % 2) * 11, 40 + row * 22, 5, 0, Math.PI * 2));
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One quad per flag under each strand: position, uv (its design in the atlas), colour, aHang (0 at the wire, 1 at the hem). */
function papelGeometry(strands, D, r) {
  const pos = []; const uv = []; const col = []; const hang = [];
  const c = new THREE.Color();
  let n = 0;
  const wire = [];
  for (const st of strands) {
    const h = D.hangStrand(st.anchors, { sag: st.sag + 0.05, step: 0.58 });
    wire.push(...h.wire);
    for (const { p, tan } of h.points) {
      c.set(PAPEL[(n * 3 + Math.floor(r() * 2)) % PAPEL.length]);
      const cell = (n + Math.floor(r() * 2)) % CELLS;
      const a = p.clone().addScaledVector(tan, -FLAG.w / 2);
      const b = p.clone().addScaledVector(tan, FLAG.w / 2);
      const q = [a, b, new THREE.Vector3(b.x, b.y - FLAG.l, b.z), new THREE.Vector3(a.x, a.y - FLAG.l, a.z)];
      const u0 = cell / CELLS; const u1 = (cell + 1) / CELLS;
      const quv = [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(q[k].x, q[k].y, q[k].z); uv.push(...quv[k]); col.push(c.r, c.g, c.b); hang.push(k < 2 ? 0 : 1);
      }
      n++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(hang, 1));
  g.computeBoundingSphere();
  return { geo: g, wire, count: n };
}

// --- Cacti ---------------------------------------------------------------------------------

const GREEN = '#4f8a4a';
const GREEN2 = '#3f7a4e';
const POT = '#b8582f';

function potParts(rad) {
  return [
    part(new THREE.CylinderGeometry(rad, rad * 0.72, 0.34, 12).translate(0, 0.17, 0), POT),
    part(new THREE.CylinderGeometry(rad * 1.06, rad * 1.06, 0.05, 12).translate(0, 0.34, 0), '#8f4323'),
    part(new THREE.CylinderGeometry(rad * 0.93, rad * 0.9, 0.05, 12).translate(0, 0.19, 0), '#2ea8a2'), // talavera band
    part(new THREE.CylinderGeometry(rad * 0.86, rad * 0.86, 0.03, 12).translate(0, 0.33, 0), '#3b2a1f'), // soil
  ];
}
const bloom = (x, y, z, hex, s = 0.045) => part(new THREE.SphereGeometry(s, 6, 4).translate(x, y, z), hex);

function saguaro() {
  const L = [...potParts(0.24)];
  const arm = (side, y0, h) => {
    L.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 8).rotateZ(Math.PI / 2).translate(side * 0.18, y0, 0), GREEN2));
    L.push(part(new THREE.CylinderGeometry(0.055, 0.06, h, 8).translate(side * 0.3, y0 + h / 2, 0), GREEN2));
    L.push(part(new THREE.SphereGeometry(0.055, 8, 6).translate(side * 0.3, y0 + h, 0), GREEN2));
    L.push(bloom(side * 0.3, y0 + h + 0.05, 0, '#f06a9a'));
  };
  L.push(part(new THREE.CylinderGeometry(0.14, 0.15, 1.1, 10).translate(0, 0.9, 0), GREEN));
  L.push(part(new THREE.SphereGeometry(0.14, 10, 8).translate(0, 1.45, 0), GREEN));
  for (const dx of [-0.05, 0.05]) L.push(part(new THREE.BoxGeometry(0.014, 1.0, 0.3).translate(dx, 0.9, 0), '#356a3f')); // ribs
  arm(-1, 0.85, 0.42);
  arm(1, 0.7, 0.34);
  L.push(bloom(0, 1.56, 0, '#f06a9a', 0.06), bloom(0.04, 1.54, 0.04, '#f4efe4', 0.04));
  return merge(L);
}

function nopal() {
  const L = [...potParts(0.26)];
  const pad = (x, y, z, sx, sy, rz) => {
    const g = new THREE.SphereGeometry(0.18, 10, 8).scale(sx, sy, 0.28).rotateZ(rz).translate(x, y, z);
    L.push(part(g, GREEN2));
    L.push(bloom(x + Math.sin(rz) * 0.1, y + 0.17 * sy, z + 0.04, '#e0316b', 0.05));
    L.push(bloom(x - 0.08, y + 0.03, z + 0.05, '#f2c230', 0.03));
  };
  pad(0, 0.58, 0, 1, 1.2, 0);
  pad(-0.2, 0.9, 0, 0.9, 1.1, 0.5);
  pad(0.2, 0.95, 0, 0.9, 1.1, -0.45);
  pad(0.02, 1.0, 0.02, 0.85, 1.05, 0.08);
  pad(-0.3, 1.2, 0, 0.7, 0.9, 0.9);
  return merge(L);
}

function barrel() {
  const L = [...potParts(0.28)];
  L.push(part(new THREE.SphereGeometry(0.3, 12, 9).scale(1, 0.95, 1).translate(0, 0.55, 0), '#5a9a52'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    L.push(part(new THREE.BoxGeometry(0.02, 0.5, 0.05).rotateY(-a).translate(Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3), '#3f7a4e'));
    L.push(bloom(Math.cos(a) * 0.14, 0.86, Math.sin(a) * 0.14, i % 2 ? '#f2c230' : '#f28c28', 0.05));
  }
  return merge(L);
}

function sombreroProp() {
  const profile = [[0, 0.3], [0.06, 0.29], [0.11, 0.2], [0.15, 0.08], [0.17, 0.03], [0.34, 0.015], [0.5, 0.05], [0.56, 0.09], [0.56, 0.11], [0.5, 0.07], [0.34, 0.03], [0.17, 0.06], [0.12, 0.2], [0.08, 0.28], [0, 0.31]];
  const hat = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  return merge([
    part(hat, '#d9b46c'),
    part(new THREE.CylinderGeometry(0.157, 0.17, 0.06, 18, 1, true).translate(0, 0.08, 0), '#c4261d'),
    part(new THREE.TorusGeometry(0.55, 0.014, 5, 24).rotateX(Math.PI / 2).translate(0, 0.095, 0), '#1f9d55'),
  ]);
}

export default function build(kit) {
  const { ctx, plan, flags, lights, strands, walkwayFences, TINTS, scatter, D, r, once, still } = kit;
  const group = new THREE.Group();
  const glow = [];

  // Hat for the staff (life/adorn.js draws it over the club's own people; calendar.js `staffHat`).
  adorn(ctx).defineHat('sombrero', drawSombrero, { size: 128, w: 0.84, h: 0.6, rise: -0.2, sway: 0.07 });

  // --- Lights: warm bright strings in the festival colours -------------------------------------
  const fence = strands({ eave: false, y: 3.78 });
  lights(group, fence.filter((_, i) => i % 3 === 0), TINTS.RED, glow);
  lights(group, fence.filter((_, i) => i % 3 === 1), TINTS.GREEN, glow);
  lights(group, fence.filter((_, i) => i % 3 === 2), ORANGE, glow);
  lights(group, strands({ fences: false, y: 3.9 }), TURQUOISE, glow);

  // --- Papel picado --------------------------------------------------------------------------
  const sets = strands({ y: 3.3, out: 0.2 });
  // Over the main walkway at each aisle between the courts, wall to wall.
  const south = walkwayFences().filter((f) => f.z > 0);
  for (let i = 0; i + 1 < south.length; i++) {
    const gap = south[i + 1].x0 - south[i].x1;
    if (gap < 0.8 || gap > 6) continue;
    const x = (south[i].x1 + south[i + 1].x0) / 2;
    sets.push({ anchors: [[x, 3.7, -2.3], [x, 3.7, 2.3]], sag: 0.34 });
  }
  const paper = papelGeometry(sets, D, r);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(paper.wire, 3));
  const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2926 }));
  wire.userData.noAO = true;
  group.add(wire);

  const uT = { value: 0 };
  const mat = new THREE.MeshBasicMaterial({ map: atlas(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uT = uT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHang;\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = sin(uT * 1.7 + position.x * 0.8 + position.z * 0.6);
        transformed.x += sw * 0.07 * aHang;
        transformed.z += cos(uT * 1.3 + position.x * 0.7 + position.z * 0.9) * 0.09 * aHang;
        transformed.y += (1.0 - cos(sw * 0.12)) * 0.4 * aHang;`);
  };
  mat.customProgramCacheKey = () => 'papel-picado';
  gradeLife(mat);
  const sheets = new THREE.Mesh(paper.geo, mat);
  sheets.layers.set(LIFE_LAYER);
  sheets.frustumCulled = false;
  sheets.userData.noAO = true;
  const live = new THREE.Group();
  live.name = 'cinco_live';
  live.add(sheets);

  // --- Cacti in talavera pots -------------------------------------------------------------------
  const geos = once('cinco-cacti', () => [saguaro(), nopal(), barrel()]);
  const cactusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const kinds = [[], [], []];
  let k = 0;
  const put = (x, z, jitter = 0) => {
    const at = plan.settle(x, z, 0.34, 0.9);
    if (!at) return;
    plan.take(at.x, at.z, 0.4);
    kinds[k++ % 3].push([at.x, plan.floorY(at.x, at.z), at.z, jitter + (r() - 0.5) * 0.6, POT_K * (0.9 + r() * 0.25)]);
  };
  for (const [x, z] of DOORS) put(x, z);
  for (const [gx, side] of kit.GATES) { put(gx - 1.3, side * 1.75); put(gx + 1.3, side * 1.75); }
  [-38, -33].forEach((x) => { put(x, 2.8); put(x, -2.8); }); // the west end, where the club opens onto the street
  kinds.forEach((spots, i) => { if (spots.length) scatter(group, geos[i], cactusMat, spots); });

  // Straw sombreros left on the lawn and by the doors, as decor.
  const hats = [];
  [[-9.8, -49.2], [14.2, -49.4], [47.2, -49.2], [3.8, -47.4], [28, -46.6], [-20, -47.6]].forEach(([x, z]) => {
    const at = plan.settle(x, z, 0.6, 1.2);
    if (!at) return;
    plan.take(at.x, at.z, 0.6);
    hats.push([at.x, plan.floorY(at.x, at.z) + 0.02, at.z, r() * Math.PI * 2, 1.1]);
  });
  if (hats.length) scatter(group, once('cinco-hat', sombreroProp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), hats);

  // --- Life: the sheets sway ---------------------------------------------------------------------
  const api = {
    update(t, dt, night) {
      if (!live.parent) ctx.scene.add(live);
      if (!still) uT.value = t;
      mat.color.setScalar(0.92 - 0.3 * night); // lit paper by day, dim away from the strings at night
      return !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { ctx.scene.remove(live); },
  };

  return {
    group, glow, live: api,
    particles: { kind: 'confetti', colors: ['#e03a3e', '#2a9d5c', '#f28c28', '#19b5b0', '#e84a8a', '#f2c230'], density: 0.2 },
    accent: { tint: [1.04, 1.0, 0.95] },
  };
}
