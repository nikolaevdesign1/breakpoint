import * as THREE from 'three';
import { LIFE_LAYER, rng } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { liveSunDir } from './clock.js';
import { part, merge, flatShadowMaterial } from './geom.js';
import { dusk } from './dusk.js';
import { glowLights } from './water.js';
import { decorLight } from './sky.js';

// The clubhouse after dark (round 8, "wetnight"). When the sun is down the windows glow warm one
// after another (cards on the life layer over the model's glass, each room its own warmth, a few
// with blinds, two storerooms that stay dark), the light falls on the paving in front of them, and
// the café's deck at the east end (parasols, a sofa, loungers) switches on its string lights. In
// the café windows and on the deck people sit and talk, and a waiter walks between the café door
// and the deck: dark figures against the warm light.
// Closing time (the hours life/places.js shows): the pro shop goes dark at 21:00, the café and the
// changing rooms at 22:00 (the deck empties, its lights go out), the front desk at 23:00; then only
// the lobby and one locker room keep a light on through the night. Off by day (a black storm sky
// counts as dusk).

const PAD = 0.5; // m of glow round a window
const SPILL = 4.4; // m the window light reaches over the paving
// Parts of the building, west to east (x from, open, close): as labelled by life/places.js.
const ZONES = [
  { name: 'changing', x: -99, open: 6, close: 22 },
  { name: 'desk', x: -2, open: 6, close: 23 },
  { name: 'shop', x: 30, open: 8, close: 21 },
  { name: 'cafe', x: 41, open: 7, close: 22 },
];
const SERVICE = 12; // from noon on the deck has guests once it is dark (a storm afternoon too)
const KEEP_ON = [9.5, -17.4]; // x of the two lights left on all night: the lobby, a locker room
const DARK_ROOMS = 2; // storerooms that never light up
const FADE = 0.35; // s: warm lamps come up fast but not at once
const WARM = new THREE.Color(1, 0.66, 0.36);
const BULB = new THREE.Color(1, 0.74, 0.44);

// --- The café deck (metres, model space): the deck is x 51.4…58.6, z -49.8…-44.2, 0.13 m up; a
// white parasol over a table at (53, -46), a red one at (56.5, -46), a sofa along the back. The
// strings run from the clubhouse eave to two poles at the deck's front corners.
const EAVE_Y = 3.02;
const WALL_Z = -51.92;
const POLE_H = 3.2;
const POLES = [[51.7, -44.4], [58.3, -44.4]];
const TOP = POLE_H - 0.06; // strands tie on just under the pole tops (the deck height is added)
const STRANDS = [
  // [x0, y0, z0, x1, y1, z1, sag]
  [51.2, EAVE_Y, WALL_Z, 51.7, TOP, -44.4, 0.26],
  [55.0, EAVE_Y, WALL_Z, 51.7, TOP, -44.4, 0.3],
  [55.0, EAVE_Y, WALL_Z, 58.3, TOP, -44.4, 0.3],
  [58.8, EAVE_Y, WALL_Z, 58.3, TOP, -44.4, 0.26],
  [51.7, TOP, -44.4, 58.3, TOP, -44.4, 0.34],
];
// Guests: seat (x, z), seat height above the deck, the point they face.
const GUESTS = [
  { x: 53.3, z: -49.55, seat: 0.42, look: [53.6, -47] }, // the sofa
  { x: 54.7, z: -49.55, seat: 0.42, look: [54.4, -47] },
  { x: 54.5, z: -47.55, seat: 0.45, look: [54.3, -48.6] }, // by the low table
  { x: 53.0, z: -44.85, seat: 0.45, look: [53, -46] }, // under the white parasol, its front chair
  { x: 56.0, z: -45.0, seat: 0.45, look: [56.5, -46] }, // under the red one
];
// Where the waiter stops by the guests.
const STANDS = [[55.7, -48.2], [54.6, -44.7], [52.0, -46.9]];

const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

/** Window rectangles from the clubhouse glass: [x0, x1, y0, y1] per pane (doors start at the floor). */
function windowRects(glass) {
  glass.updateWorldMatrix(true, false);
  const pos = glass.geometry.attributes.position;
  const idx = glass.geometry.index?.array ?? [...Array(pos.count).keys()];
  const v = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i < pos.count; i++) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(glass.matrixWorld).clone());
  const rects = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [pts[idx[t]], pts[idx[t + 1]], pts[idx[t + 2]]];
    const x0 = Math.min(...tri.map((p) => p.x));
    const x1 = Math.max(...tri.map((p) => p.x));
    const key = `${x0.toFixed(1)}|${x1.toFixed(1)}`;
    const r = rects.get(key) ?? [x0, x1, Infinity, -Infinity];
    r[2] = Math.min(r[2], ...tri.map((p) => p.y));
    r[3] = Math.max(r[3], ...tri.map((p) => p.y));
    rects.set(key, r);
  }
  return [...rects.values()].filter((r) => r[1] - r[0] > 0.4 && r[3] - r[2] > 0.6).sort((a, b) => a[0] - b[0]);
}

// --- Window cards: the lit room seen through the glass, glow round the frame ---

function windowMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      attribute vec4 aWin;  // level, warmth, seed, kind
      attribute vec2 aSize; // pane width, height (m)
      varying vec2 vP;
      varying vec4 vWin;
      varying vec2 vSize;
      void main() {
        vec2 full = aSize + ${(PAD * 2).toFixed(2)};
        vP = position.xy * full;
        vWin = aWin;
        vSize = aSize;
        vec4 w = modelMatrix * instanceMatrix * vec4(position.xy * full, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vP;
      varying vec4 vWin;
      varying vec2 vSize;
      float h1(float n) { return fract(sin(n) * 43758.5453); }
      float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      void main() {
        float lv = vWin.x;
        if (lv <= 0.002) discard;
        float kind = vWin.w;
        vec2 hs = vSize * 0.5;
        float d = sdBox(vP, hs);
        float aa = fwidth(d) + 1e-4;
        float inside = smoothstep(aa, -aa, d);
        vec3 warm = mix(vec3(1.0, 0.55, 0.24), vec3(1.0, 0.76, 0.48), vWin.y);
        if (kind > 3.5) warm = vec3(0.82, 0.88, 0.92); // the office: a cooler tube light

        // The room: brighter towards the ceiling, a lamp somewhere along it, darker furniture low down.
        float yy = (vP.y + hs.y) / (2.0 * hs.y);
        float lampX = (h1(vWin.z * 7.1) - 0.5) * vSize.x * 0.7;
        float pool = 0.5 + 0.65 * exp(-pow((vP.x - lampX) / (0.45 + 0.5 * h1(vWin.z * 3.3)), 2.0));
        vec3 room = warm * pool * (0.62 + 0.5 * yy) * mix(0.55, 1.0, smoothstep(0.0, 0.3, yy));
        if (kind > 1.5 && kind < 2.5) room *= 0.66 + 0.34 * step(0.42, fract(vP.y * 11.0)); // blinds
        if (kind > 2.5 && kind < 3.5) room *= 1.0 + 0.3 * (1.0 - yy); // a lobby: lit to the floor
        room *= 1.0 - 0.75 * smoothstep(0.035, 0.015, abs(vP.x)) * step(1.6, vSize.x); // mullion

        // People inside the café: a seated guest or two, now and then someone crossing the room.
        float sil = 0.0;
        if (kind > 0.5 && kind < 1.5) {
          for (int j = 0; j < 2; j++) {
            float sp = vWin.z * 13.0 + float(j) * 5.7;
            bool walking = j == 1 && h1(sp) > 0.45;
            float px = walking ? sin(uTime * 0.09 + sp) * hs.x * 1.1
                               : (h1(sp + 1.3) - 0.5) * vSize.x * 0.7 + sin(uTime * 0.13 + sp) * 0.08;
            float hy = walking ? -hs.y + 0.66 + abs(sin(uTime * 1.6 + sp)) * 0.015
                               : -hs.y + 0.26 + sin(uTime * 0.37 + sp) * 0.02;
            float head = length((vP - vec2(px, hy)) * vec2(1.0, 0.86)) - 0.105;
            float body = sdBox(vP - vec2(px, hy - 0.36), vec2(0.17, 0.2)) - 0.07;
            sil = max(sil, smoothstep(aa, -aa, min(head, body)));
          }
        }
        room = mix(room, vec3(0.07, 0.045, 0.03), sil * 0.92);

        float a = inside * min(1.0, lv * 1.15) * 0.96;
        float g = exp(-max(d, 0.0) * 4.5) * (1.0 - inside) * 0.26 * lv; // the glow the bloom would add
        gl_FragColor = vec4(room * lv * a + warm * g, a);
      }`,
  });
}

// --- Light on the paving: in front of each window, and under the terrace strings ---
// Two passes: one brightens what is there (the paving's own texture shows through), one adds a
// little warm colour.

function spillMaterial(uniforms, pass, terrace) {
  const blend = pass === 0
    ? { blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor }
    : { blending: THREE.AdditiveBlending };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    ...blend,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
    vertexShader: /* glsl */`
      ${terrace ? '' : 'attribute vec4 aSpill; // level, warmth, half width, reach'}
      varying vec3 vW;
      varying vec2 vL;
      varying vec4 vS;
      void main() {
        ${terrace ? 'vS = vec4(0.0);' : 'vS = aSpill;'}
        vL = position.xz;
        vec4 w = modelMatrix * ${terrace ? '' : 'instanceMatrix *'} vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain, uStrings;
      uniform vec4 uSeg[${STRANDS.length}];
      varying vec3 vW;
      varying vec2 vL;
      varying vec4 vS;
      void main() {
        vec3 tone;
        float f;
        ${terrace ? `
        f = 0.0;
        for (int i = 0; i < ${STRANDS.length}; i++) {
          vec2 a = uSeg[i].xy, b = uSeg[i].zw, p = vW.xz;
          vec2 ab = b - a;
          float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(p - a - ab * t);
          f += exp(-d * d / 2.4);
        }
        f = min(f, 1.6) * 0.55 * uStrings * smoothstep(0.5, 0.3, abs(vL.x)) * smoothstep(0.5, 0.3, abs(vL.y));
        tone = vec3(1.0, 0.72, 0.42);` : `
        float lv = vS.x;
        float z = vL.y + 0.5; // 0 at the wall … 1 at the far end
        float hw = vS.z + z * vS.w * 0.42;
        float across = smoothstep(hw + 0.7, hw - 0.3, abs(vL.x * (2.0 * vS.z + 3.0 + vS.w * 0.84)));
        f = lv * across * pow(1.0 - z, 1.8) * smoothstep(0.0, 0.08, z) * 1.4;
        tone = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.78, 0.52), vS.y);`}
        if (f <= 0.002) discard;
        ${pass === 0 ? 'gl_FragColor = vec4(tone * f * uGain, 1.0);' : 'gl_FragColor = vec4(tone * f * 0.15 * uGain, 1.0);'}
      }`,
  });
}

// --- String-light bulbs: small camera-facing glows ---

function bulbMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uStrings;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float r = length(vUv);
        float core = smoothstep(0.22, 0.05, r);
        float halo = exp(-r * r * 7.0) * 0.5;
        float v = (core + halo) * uStrings * (0.85 + 0.3 * vSeed);
        if (v <= 0.003) discard;
        gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.95, 0.85), core * 0.6) * v, 1.0);
      }`,
  });
}

// --- People: dark low-poly figures, a warm rim from the lights round them ---

function personMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    toneMapped: false,
    vertexShader: /* glsl */`
      attribute float aTone;
      varying vec3 vN;
      varying vec3 vW;
      varying float vTone;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vN = normalize(mat3(m) * normal);
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz;
        vTone = aTone;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFade;
      uniform vec3 uWarm;
      varying vec3 vN;
      varying vec3 vW;
      varying float vTone;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        vec3 base = vec3(0.03, 0.027, 0.025) * (0.7 + 0.8 * vTone);
        float rim = pow(1.0 - abs(dot(n, v)), 3.0);
        float top = max(n.y, 0.0);
        vec3 col = base + uWarm * (0.06 * top + 0.09 * rim);
        gl_FragColor = vec4(col * uFade, uFade);
      }`,
  });
}

function catenary([x0, y0, z0, x1, y1, z1, sag], step) {
  const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
  const n = Math.max(2, Math.round(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new THREE.Vector3(lerp(x0, x1, t), lerp(y0, y1, t) - sag * 4 * t * (1 - t), lerp(z0, z1, t)));
  }
  return out;
}

export function createClubhouse({ scene, root, rig, sun, sunDir, quality }, { still }) {
  const glass = root.getObjectByName('clubhouse_mesh001_2');
  const wall = root.getObjectByName('clubhouse_mesh001');
  if (!glass || !wall) return null;
  const random = rng(20261015);
  const wallZ = new THREE.Box3().setFromObject(wall).max.z;
  const cardZ = wallZ + 0.045;

  // Ground height in front of the clubhouse.
  const caster = new THREE.Raycaster();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && /path|asphalt|chill|apron/i.test(o.name)) meshes.push(o); });
  const groundAt = (x, z) => {
    caster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const y = caster.intersectObjects(meshes, false)[0]?.point.y;
    return y != null && y < 0.5 ? y : 0.015;
  };

  // --- Rooms ---
  const rects = windowRects(glass);
  const mid = (r) => (r[0] + r[1]) / 2;
  const zoneOf = (x) => ZONES.reduce((z, n) => (x >= n.x ? n : z), ZONES[0]);
  const keepers = KEEP_ON.map((x) => rects.reduce((b, r, i) => (Math.abs(mid(r) - x) < Math.abs(mid(rects[b]) - x) ? i : b), 0));
  const plain = rects.map((r, i) => i).filter((i) => !keepers.includes(i) && rects[i][2] > 0.3 && zoneOf(mid(rects[i])).name !== 'cafe');
  const storerooms = new Set();
  while (storerooms.size < Math.min(DARK_ROOMS, plain.length)) storerooms.add(plain[Math.floor(random() * plain.length)]);
  const rooms = rects.map((r, i) => {
    const cx = mid(r);
    const zone = zoneOf(cx);
    const door = r[2] < 0.3;
    const cafe = zone.name === 'cafe' && !door;
    const office = zone.name === 'desk' && !door && random() < 0.4;
    const kind = cafe ? 1 : door ? 3 : office ? 4 : random() < 0.3 ? 2 : 0;
    return {
      r, cx, w: r[1] - r[0], h: r[3] - r[2], cy: (r[2] + r[3]) / 2, door, cafe, kind,
      keep: keepers.includes(i), dead: storerooms.has(i),
      warmth: random(), seed: random() * 100,
      on: -2 + random() * 5, // sun elevation (°) at which this room's light goes on
      open: zone.open + random() * 0.4, close: zone.close + random() * 0.5, // its hours, a few minutes apart
      level: 0,
    };
  });

  const life = (o) => {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.userData.noAO = true;
    return o;
  };

  const uni = { uTime: { value: 0 } };
  const quad = new THREE.PlaneGeometry(1, 1);
  const cards = life(new THREE.InstancedMesh(quad.clone(), windowMaterial(uni), rooms.length));
  cards.name = 'life_club_windows';
  const winAttr = new THREE.InstancedBufferAttribute(new Float32Array(rooms.length * 4), 4);
  const sizeAttr = new THREE.InstancedBufferAttribute(new Float32Array(rooms.length * 2), 2);
  cards.geometry.setAttribute('aWin', winAttr);
  cards.geometry.setAttribute('aSize', sizeAttr);
  const m4 = new THREE.Matrix4();
  rooms.forEach((room, i) => {
    cards.setMatrixAt(i, m4.makeTranslation(room.cx, room.cy, cardZ));
    sizeAttr.setXY(i, room.w, room.h);
    winAttr.setXYZW(i, 0, room.warmth, room.seed, room.kind);
  });
  cards.renderOrder = 2;

  // Light on the paving in front of the windows.
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const spillAttr = new THREE.InstancedBufferAttribute(new Float32Array(rooms.length * 4), 4);
  const spillGeo = flat.clone();
  spillGeo.setAttribute('aSpill', spillAttr);
  const spillUni = { uGain: { value: 1 }, uStrings: { value: 0 }, uSeg: { value: [] } };
  const spills = [0, 1].map((pass) => {
    const m = life(new THREE.InstancedMesh(spillGeo, spillMaterial(spillUni, pass, false), rooms.length));
    m.name = `life_club_spill${pass}`;
    m.renderOrder = 1;
    return m;
  });
  rooms.forEach((room, i) => {
    const reach = room.door ? SPILL + 0.8 : SPILL;
    const half = room.w / 2 + (room.door ? 0.2 : 0);
    const width = half * 2 + 3 + reach * 0.84;
    const y = groundAt(room.cx, wallZ + 1.2) + 0.01;
    m4.compose(new THREE.Vector3(room.cx, y, wallZ + reach / 2), new THREE.Quaternion(), new THREE.Vector3(width, 1, reach));
    spills.forEach((s) => s.setMatrixAt(i, m4));
    spillAttr.setXYZW(i, 0, room.warmth, half, reach);
  });

  // --- The café deck ---
  const terrace = new THREE.Group();
  terrace.name = 'life_cafe_terrace';
  const deckY = groundAt(55, -47);
  const lift = (s) => [s[0], s[1] + (s[2] > -44.6 ? deckY : 0), s[2], s[3], s[4] + deckY, s[5], s[6]]; // poles stand on the deck
  const strands = STRANDS.map(lift);
  // Wires and bulbs.
  const wire = [];
  const bulbs = [];
  strands.forEach((s) => {
    const pts = catenary(s, 0.25);
    for (let i = 1; i < pts.length; i++) wire.push(pts[i - 1], pts[i]);
    catenary(s, 0.56).forEach((p, i, all) => { if (i > 0 && i < all.length - 1) bulbs.push(p.clone().setY(p.y - 0.06)); });
  });
  const wires = life(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x1c1c1c })));
  terrace.add(wires);
  const bulbUni = { uStrings: { value: 0 }, uColor: { value: BULB } };
  const bulbGeo = new THREE.PlaneGeometry(0.44, 0.44).rotateX(-rig.pitch);
  bulbGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(bulbs.map(() => random())), 1));
  const bulbMesh = life(new THREE.InstancedMesh(bulbGeo, bulbMaterial(bulbUni), bulbs.length));
  bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  bulbMesh.renderOrder = 4;
  terrace.add(bulbMesh);

  // Two slim poles at the deck's front corners, with flat shadows along the sun.
  const sunLive = liveSunDir({ sun, sunDir });
  const propMat = gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
  const poleGeo = merge(POLES.flatMap(([x, z]) => [
    part(new THREE.CylinderGeometry(0.035, 0.045, POLE_H, 8).translate(x, deckY + POLE_H / 2, z), '#202020'),
    part(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 12).translate(x, deckY + 0.03, z), '#2a2a2a'),
  ]));
  const poles = life(new THREE.Mesh(poleGeo, propMat));
  const shadows = life(new THREE.Mesh(poleGeo, flatShadowMaterial(sunLive.dir, deckY + 0.004, 0.3)));
  shadows.renderOrder = 1;
  terrace.add(poles, shadows);

  // Light under the strings, on the deck and the grass round it.
  spillUni.uSeg.value = strands.map(([x0, , z0, x1, , z1]) => new THREE.Vector4(x0, z0, x1, z1));
  const terraceGeo = flat.clone();
  const terraceSpill = [0, 1].map((pass) => {
    const m = life(new THREE.Mesh(terraceGeo, spillMaterial(spillUni, pass, true)));
    m.scale.set(11, 1, 9.6);
    m.position.set(55, deckY + 0.008, -47.4);
    m.renderOrder = 1;
    return m;
  });
  terrace.add(...terraceSpill);

  // --- People ---
  const boxGeo = new THREE.CapsuleGeometry(0.36, 0.28, 3, 8); // limbs and torsos: rounded, not boxes (1 m tall, 0.72 wide)
  const headGeo = new THREE.SphereGeometry(1, 10, 8);
  const personUni = { uFade: { value: 0 }, uWarm: { value: WARM } };
  const pMat = personMaterial(personUni);
  const SEATED_BOXES = 4;
  const WAITER_BOXES = 5;
  const boxes = life(new THREE.InstancedMesh(boxGeo, pMat, GUESTS.length * SEATED_BOXES + WAITER_BOXES));
  const heads = life(new THREE.InstancedMesh(headGeo, pMat, GUESTS.length + 2));
  boxes.name = 'life_cafe_people';
  heads.name = 'life_cafe_heads';
  boxes.geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(boxes.count).map(() => random()), 1));
  heads.geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(heads.count).map(() => random() * 0.4), 1));
  boxes.renderOrder = 3;
  heads.renderOrder = 3;
  terrace.add(boxes, heads);

  const guests = GUESTS.map((g) => ({
    ...g, yaw: Math.atan2(g.look[0] - g.x, g.look[1] - g.z), seed: random() * 50, drink: 8 + random() * 14,
  }));

  // Placing a part: base (position, yaw) · pivot (position, rotation x then y) · offset · scale.
  const B = new THREE.Matrix4();
  const P = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const e = new THREE.Euler();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function put(mesh, i, px, py, pz, rx, ry, ox, oy, oz, sx, sy, sz) {
    P.makeRotationFromEuler(e.set(rx, ry, 0, 'YXZ')).setPosition(px, py, pz);
    tmp.makeScale(sx, sy, sz).setPosition(ox, oy, oz);
    mesh.setMatrixAt(i, m4.multiplyMatrices(B, P).multiply(tmp));
  }

  const groundAt0 = groundAt(48, wallZ + 1);
  // The waiter: café door → the deck → back, a pause by the guests, a while inside.
  const cafeDoor = rooms.filter((r) => r.door).reduce((b, r) => (Math.abs(r.cx - 47.5) < Math.abs(b.cx - 47.5) ? r : b), rooms[0]);
  const doorPt = new THREE.Vector2(cafeDoor.cx, wallZ + 0.3);
  const via = [new THREE.Vector2(50.4, wallZ + 1.5), new THREE.Vector2(51.9, -49.0)];
  const waiter = { leg: [], d: 0, wait: 4, at: 'door', x: doorPt.x, z: doorPt.y, yaw: 0, phase: 0, face: 0 };
  function planWaiter() {
    const [sx, sz] = STANDS[Math.floor(random() * STANDS.length)];
    const out = [doorPt, ...via, new THREE.Vector2(sx, sz)];
    // Facing the nearest guest once there.
    const g = guests.reduce((b, q) => (Math.hypot(q.x - sx, q.z - sz) < Math.hypot(b.x - sx, b.z - sz) ? q : b), guests[0]);
    waiter.face = Math.atan2(g.x - sx, g.z - sz);
    return waiter.at === 'door' ? out : out.reverse();
  }
  function stepWaiter(dt) {
    if (waiter.wait > 0) { waiter.wait -= dt; if (waiter.wait <= 0) { waiter.leg = planWaiter(); waiter.d = 0; } return; }
    const L = waiter.leg;
    let d = (waiter.d += dt * 1.05);
    for (let i = 1; i < L.length; i++) {
      const seg = L[i - 1].distanceTo(L[i]);
      if (d <= seg) {
        const t = d / seg;
        waiter.x = lerp(L[i - 1].x, L[i].x, t);
        waiter.z = lerp(L[i - 1].y, L[i].y, t);
        const want = Math.atan2(L[i].x - L[i - 1].x, L[i].y - L[i - 1].y);
        waiter.yaw += Math.atan2(Math.sin(want - waiter.yaw), Math.cos(want - waiter.yaw)) * Math.min(1, dt * 6);
        waiter.phase += dt * 1.05 / 0.36;
        return;
      }
      d -= seg;
    }
    const end = L[L.length - 1];
    waiter.x = end.x; waiter.z = end.y;
    waiter.at = waiter.at === 'door' ? 'table' : 'door';
    waiter.wait = waiter.at === 'door' ? 6 + random() * 8 : 4 + random() * 4;
    if (waiter.at === 'table') waiter.yaw = waiter.face; // facing the guests
  }

  function posePeople(t) {
    guests.forEach((g, k) => {
      B.makeRotationY(g.yaw).setPosition(g.x, deckY + g.seat - 0.47, g.z);
      const lean = 0.08 + Math.sin(t * 0.31 + g.seed) * 0.07;
      const turn = Math.sin(t * 0.19 + g.seed * 1.7) * 0.45;
      const sip = Math.max(0, Math.sin((t + g.seed * 3) * (Math.PI * 2) / g.drink)) ** 12; // now and then a glass to the lips
      const i = k * SEATED_BOXES;
      put(boxes, i, 0, 0.5, 0.02, 0, 0, 0, 0, 0.2, 0.36, 0.13, 0.42); // thighs
      put(boxes, i + 1, 0, 0.27, 0.4, 0, 0, 0, 0, 0, 0.3, 0.46, 0.12); // shins
      put(boxes, i + 2, 0, 0.5, -0.04, lean, 0, 0, 0.29, 0, 0.38, 0.56, 0.22); // torso
      put(boxes, i + 3, 0.16, 0.98 - lean * 0.2, 0.06 + lean * 0.3, 0.55 - sip * 1.2, 0, 0, 0, 0.17, 0.085, 0.085, 0.36); // forearm to the table
      put(heads, k, 0, 0.5, -0.04, lean, turn, 0, 0.68, 0.02, 0.105, 0.12, 0.11);
    });
    const hidden = waiter.at === 'door' && waiter.wait > 0; // inside
    const base = GUESTS.length * SEATED_BOXES;
    if (hidden) {
      for (let j = 0; j < WAITER_BOXES; j++) boxes.setMatrixAt(base + j, zero);
      heads.setMatrixAt(GUESTS.length, zero);
      heads.setMatrixAt(GUESTS.length + 1, zero);
    } else {
      const walking = waiter.wait <= 0;
      const sw = walking ? Math.sin(waiter.phase * Math.PI) * 0.42 : 0;
      const bob = walking ? Math.abs(Math.cos(waiter.phase * Math.PI)) * 0.03 : 0;
      B.makeRotationY(waiter.yaw).setPosition(waiter.x, (waiter.x > 51.4 && waiter.z > -49.8 ? deckY : groundAt0) + bob, waiter.z);
      put(boxes, base, -0.1, 0.9, 0, sw, 0, 0, -0.43, 0, 0.13, 0.86, 0.14); // legs
      put(boxes, base + 1, 0.1, 0.9, 0, -sw, 0, 0, -0.43, 0, 0.13, 0.86, 0.14);
      put(boxes, base + 2, 0, 0.9, 0, 0, 0, 0, 0.32, 0, 0.4, 0.64, 0.23); // torso
      put(boxes, base + 3, -0.24, 1.48, 0, -sw * 0.8, 0, 0, -0.3, 0, 0.09, 0.62, 0.09); // free arm swings
      put(boxes, base + 4, 0.24, 1.48, 0, -1.25, 0, 0, -0.16, 0.0, 0.09, 0.36, 0.09); // tray arm, bent forward
      put(heads, GUESTS.length, 0, 1.66, 0, 0, 0, 0, 0, 0, 0.11, 0.125, 0.115);
      put(heads, GUESTS.length + 1, 0.24, 1.3, 0.34, 0, 0, 0, 0, 0, 0.2, 0.012, 0.2); // the tray
    }
    boxes.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  posePeople(0);

  scene.add(cards, ...spills, terrace);

  const cafe = { level: 0 }; // the terrace: string lights and guests

  // Puddles mirror the rooms and the strings (life/water.js).
  rooms.forEach((room) => glowLights.push({
    pos: new THREE.Vector3(room.cx, room.cy, wallZ + 0.1), color: WARM, size: Math.min(room.w, 2.4) * 0.4, gain: 1.1, level: () => room.level,
  }));
  STRANDS.forEach((s) => {
    const pts = catenary(s, 1);
    glowLights.push({ pos: pts[Math.floor(pts.length / 2)], color: BULB, size: 0.9, gain: 0.8, level: () => cafe.level });
  });

  // --- State ---
  let lastWrite = -1;
  let moving = false;

  function update(dt) {
    const d = dusk();
    const hrs = d.hours;
    const elev = d.elevation;
    const storm = d.dark > 0 && elev > 3 ? d.dark : 0; // a black storm sky by day
    const k = Math.min(1, dt / FADE);
    moving = false;
    rooms.forEach((room, i) => {
      const dark = Math.max(smooth(-elev, -room.on - 2, -room.on + 2), storm * 0.9, decorLight.windows);
      const hours = room.keep ? (hrs >= room.open && hrs < room.close ? 1 : 0.55) : (hrs >= room.open && hrs < room.close ? 1 : 0);
      const want = room.dead ? 0 : dark * hours;
      const next = Math.abs(want - room.level) < 0.003 ? want : room.level + (want - room.level) * k;
      if (next !== room.level) moving = true;
      room.level = next;
    });
    const close = ZONES.find((z) => z.name === 'cafe').close;
    const serve = Math.max(smooth(-elev, -2, 3), storm * 0.9) * (hrs >= SERVICE && hrs < close ? 1 : 0);
    const nextCafe = Math.abs(serve - cafe.level) < 0.003 ? serve : cafe.level + (serve - cafe.level) * Math.min(1, dt / 0.8);
    if (nextCafe !== cafe.level) moving = true;
    cafe.level = nextCafe;
  }

  function write() {
    rooms.forEach((room, i) => { winAttr.setX(i, room.level); spillAttr.setX(i, room.level); });
    winAttr.needsUpdate = true;
    spillAttr.needsUpdate = true;
    const any = rooms.some((r) => r.level > 0.003);
    cards.visible = any;
    spills.forEach((s) => { s.visible = any; });
    bulbUni.uStrings.value = cafe.level;
    spillUni.uStrings.value = cafe.level;
    bulbMesh.visible = cafe.level > 0.003;
    terraceSpill.forEach((s) => { s.visible = cafe.level > 0.003; });
    personUni.uFade.value = smooth(cafe.level, 0.15, 0.85);
    boxes.visible = heads.visible = personUni.uFade.value > 0.003;
    // The night frame is ~5× darker than the day: the spill gains to match.
    spillUni.uGain.value = lerp(0.35, 1, dusk().dark);
  }

  update(10); // start where the clock is, no fade on load
  write();

  return {
    name: 'clubhouse',
    tick(t, dt) {
      const step = Math.min(dt, 0.1);
      if (!still) uni.uTime.value = t;
      update(step);
      if (moving || t - lastWrite > 1) { lastWrite = t; write(); }
      const people = boxes.visible;
      if (people && !still) {
        stepWaiter(step);
        posePeople(t);
      }
      sunLive.update();
      return moving || (people && !still) || (cards.visible && !still && rooms.some((r) => r.cafe && r.level > 0.01));
    },
    debug: () => ({
      rooms: rooms.length,
      lit: rooms.filter((r) => r.level > 0.5).length,
      cafe: +cafe.level.toFixed(2),
      waiter: { at: waiter.at, x: +waiter.x.toFixed(1), z: +waiter.z.toFixed(1), wait: +waiter.wait.toFixed(1) },
    }),
  };
}
