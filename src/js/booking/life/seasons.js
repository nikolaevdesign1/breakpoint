import * as THREE from 'three';
import { rng } from './shared.js';
import { EXPOSURE } from '../lookdev.js';
import { weatherSky, decorLight } from './sky.js';
import { adorn } from './adorn.js';
import { createSnowCrew } from './snow-crew.js';
import { onSeason } from '../seasons/season.js';
import { createPlacement } from '../seasons/placement.js';
import { createFireworks } from '../seasons/fireworks.js';
import { createSnow } from '../seasons/snow.js';
import { buildWinter } from '../seasons/winter.js';
import { buildGhosts } from '../seasons/halloween.js';
import { buildDeath } from '../seasons/death.js';
import * as D from '../seasons/decor.js';

// Holiday decor on the map (round 8, "seasons"), by the date in Miami or as picked in the top bar
// (seasons/season.js, season-menu.js):
// - Halloween: carved pumpkins (some lit) at the court gates and the clubhouse steps, hay bales,
//   orange string lights along the clubhouse eave;
// - Holidays: warm white lights along the court fences by the main walkway, on the clubhouse and
//   wrapped round the palm trunks, a decorated fir on the lawn by the front door, wrapped gifts;
//   round 10 (row 4): drifts along fences and paths (the courts stay clear), snow on the roofs, a
//   snowman, Santa hats on everyone (life/adorn.js), a crew shoveling the paths (life/snow-crew.js)
//   and warm light in the clubhouse windows by day;
// - July 4th: red, white and blue bunting on the same fences and the eave, small flags along the
//   main walkway and, at night, distant fireworks low along the top of the view.
// The decor is static: it goes into the baked frame and the shadow map (refreshShadows) once,
// when the season changes; each season is built on first use and kept, so switching back is
// instant, and its shaders compile before it shows. After dark the bulbs, the carved faces and
// their halos light up, read from the exposure the clock sets (lookdev/daylight are not touched),
// in a few quantised steps, each one re-bake.

const ORANGE = { glass: '#e9792b', glow: new THREE.Color(1, 0.3, 0.02), gain: 0.45 };
const PURPLE = { glass: '#8a4fd8', glow: new THREE.Color(0.55, 0.18, 1), gain: 0.5 };
const WARM = { glass: '#efe2c4', glow: new THREE.Color(1, 0.7, 0.36), gain: 1 };
const RED = { glass: '#e0312b', glow: new THREE.Color(1, 0.08, 0.04), gain: 0.55 };
const GREEN = { glass: '#2fb85a', glow: new THREE.Color(0.1, 1, 0.25), gain: 0.5 };
const GOLD = { glass: '#f2c24a', glow: new THREE.Color(1, 0.62, 0.12), gain: 0.7 };
const FLAG_COLORS = ['#b22234', '#f2efe6', '#3c3b6e'];
const SPOOKY_COLORS = ['#e8701f', '#161412', '#7a3fc4', '#e8701f', '#161412']; // Halloween pennants
// Round 9 (row 2): the decor has to read from the drone at normal zoom, to someone not looking
// for it. Bulbs are oversized (a C9 is 7 cm) and glow a little by day too, pumpkins are larger and
// many more, a few giant ones mark the walkway ends, pennants are flag-sized.
const BULB_SCALE = 2.8;
const HALO = 1.2; // m, glow card per bulb
const DAY_GLOW = 3.2; // bulb emission by day (night adds to it)
const DAY_HALO = 0.16;
const PUMPKIN_K = 1.6; // every placed pumpkin, against its listed size
const FIR_K = 1.7; // the holiday fir, against its 3.5 m model
const BUNTING = { w: 0.56, l: 0.7 };
const FLAG_K = 2.2;
const NIGHT_STEPS = 6;
const PALMS = [[6.6, -50.4], [12.4, -50.4], [57.85, -49.05], [57.85, -44.95]]; // potted palms by the clubhouse (props)
const TREE_AT = [15.6, -46.2]; // lawn east of the plaza, by the front door

// Halloween. Pumpkins: x, z, size (m across), lit, yaw (deg); bales: x, z, yaw (deg).
const GATES = [[-19, 1], [19, 1], [57, 1], [0, -1], [38, -1]]; // gate x, fence side (z = ±2.1)
const DOOR_PUMPKINS = [
  [-12.3, -50.95, 0.66, true, 8], [-12.85, -50.3, 0.46, false, -20], [-7.3, -50.95, 0.62, true, -6], [-6.75, -50.35, 0.42, false, 30],
  [8.05, -50.95, 0.6, true, 4], [11.2, -50.95, 0.5, false, 12], [13.5, -50.6, 0.66, true, -8], [17.0, -50.95, 0.48, false, 24],
  [44.9, -50.95, 0.64, true, 6], [44.3, -50.35, 0.44, false, -14], [49.6, -50.95, 0.66, true, -4], [50.2, -50.35, 0.4, false, 18],
];
const GIANTS = [[-41.5, 3.4, 1.5, 20], [-41.5, -3.4, 1.3, 8], [-34.5, 3.3, 0.9, -12], [-34.5, -3.3, 1.0, 24], [4.2, -47.6, 1.4, 4], [33.5, -47.6, 1.3, -6]];
const BALES = [[16.1, -51.45, 0], [52.0, -51.45, 0], [-31.7, 3.25, 90], [-31.7, -3.25, 90]];
const BALE_PUMPKINS = [[0, 0.56, true, 0], [1, 0.5, true, 10], [2, 0.6, true, -6], [3, 0.52, false, 20]]; // bale index, size, lit, yaw

export function createSeasons(ctx, { still }) {
  const { scene, root, camera, renderer, rig, refreshShadows } = ctx;
  const r = rng(0x5ea5);
  let placement = null;
  const built = new Map(); // season -> { group, glow(level, boost) }
  let shown = null; // season on the map
  let want = null; // season asked for
  let pending = null;
  let staticDirty = false;
  let night = -1; // quantised level the decor shows
  let boost = 1;
  let lastPoll = -1;
  let fireworks = null;
  let nextVolley = 0;
  let volley = 0;
  const shared = {}; // textures and geometries reused by every season

  const once = (k, make) => (shared[k] ??= make());
  const glowTex = () => once('glow', D.glowTexture);

  // --- Pieces --------------------------------------------------------------------------------

  /** The fence boxes of the clay and hard courts (their `_hl` meshes). */
  function courtBoxes() {
    const out = [];
    root.traverse((o) => { if (o.isMesh && /^(clay|hard)-\d_hl$/.test(o.name)) out.push(new THREE.Box3().setFromObject(o)); });
    return out;
  }

  /** Fences along the main walkway (z ≈ ±2.1): x from, x to, z, the walkway side (−1 / +1). */
  function walkwayFences() {
    return courtBoxes().map((b) => {
      const north = b.min.z + b.max.z > 0;
      return { x0: b.min.x, x1: b.max.x, z: north ? b.min.z : b.max.z, side: north ? -1 : 1 };
    }).sort((a, b) => a.z - b.z || a.x0 - b.x0);
  }

  /** Strands of anchors: every walkway fence (post tops, 3.5 m up) and the clubhouse eave. */
  function strands({ fences = true, eave = true, y = 3.5, out = 0.16 } = {}) {
    const list = [];
    if (fences) {
      for (const f of walkwayFences()) {
        const z = f.z + f.side * out; // on hooks just in front of the chain link, clear of the gate headers
        const n = 4;
        list.push({ anchors: Array.from({ length: n + 1 }, (_, k) => [f.x0 + 0.1 + ((f.x1 - f.x0 - 0.2) * k) / n, y, z]), sag: 0.26 });
      }
    }
    if (eave) {
      const x0 = -24.6;
      const x1 = 59.6;
      const n = 24;
      list.push({ anchors: Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, 3.14 + (y - 3.5) * 0.5, -51.42]), sag: 0.3 });
    }
    return list;
  }

  /** Pennant bunting along `sets` of strands, colours cycling, with its wire. */
  function bunting(group, sets, colors, { step = 0.62, size = BUNTING } = {}) {
    const pos = [];
    const wire = [];
    for (const st of sets) {
      const h = D.hangStrand(st.anchors, { sag: st.sag + 0.05, step });
      pos.push(D.buntingGeometry(h.points, colors, size));
      wire.push(...h.wire);
    }
    const mesh = new THREE.Mesh(D.merge(pos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    mesh.userData.noAO = true;
    group.add(mesh);
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const line = new THREE.LineSegments(w, new THREE.LineBasicMaterial({ color: 0x2a2926 }));
    line.userData.noAO = true;
    group.add(line);
  }

  /** Bulbs, wire and glow cards for a set of strands. */
  function lights(group, sets, tint, glowList, { halo: haloK = 1 } = {}) {
    const bulbs = [];
    const wire = [];
    for (const s of sets) {
      if (s.points) { bulbs.push(...s.points); wire.push(...s.wire); continue; }
      const h = D.hangStrand(s.anchors, { sag: s.sag, step: s.step ?? 0.5 });
      bulbs.push(...h.points);
      wire.push(...h.wire);
    }
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const line = new THREE.LineSegments(w, new THREE.LineBasicMaterial({ color: 0x1c1b19 }));
    line.userData.noAO = true;
    group.add(line);

    const glass = new THREE.MeshStandardMaterial({ color: tint.glass, roughness: 0.25, metalness: 0, emissive: tint.glow, emissiveIntensity: 0 });
    const bulb = new THREE.InstancedMesh(once('bulb', D.bulbGeometry), glass, bulbs.length);
    const haloGeo = once('haloGeo', () => new THREE.PlaneGeometry(HALO, HALO).rotateX(-rig.pitch));
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const halo = new THREE.InstancedMesh(haloGeo, haloMat, bulbs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3().setScalar(BULB_SCALE);
    bulbs.forEach(({ p }, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      m4.compose(p, q, sc);
      bulb.setMatrixAt(i, m4);
      halo.setMatrixAt(i, m4.makeScale(haloK, haloK, haloK).setPosition(p.x, p.y - 0.05, p.z));
    });
    for (const m of [bulb, halo]) { m.userData.noAO = true; m.computeBoundingSphere(); group.add(m); }
    halo.renderOrder = 3;
    glowList.push((level, k) => {
      glass.emissiveIntensity = (DAY_GLOW * (1 - level) + level * 3.4 * k) * tint.gain;
      haloMat.color.copy(tint.glow).multiplyScalar(Math.max(DAY_HALO * (1 - level), level * 0.5) * haloK * Math.min(k, 3));
    });
    return bulbs.length;
  }

  /** Pumpkins (instanced), carved faces on the lit ones and a pool of candle light before them. */
  function pumpkins(group, list, glowList) {
    const geo = once('pumpkin', D.pumpkinGeometry);
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, skin, list.length);
    const lit = list.filter((p) => p.lit);
    const faceMat = new THREE.MeshBasicMaterial({ map: once('faceTex', D.faceTexture), alphaTest: 0.5, color: 0x120804 });
    const faces = new THREE.InstancedMesh(once('face', D.pumpkinFaceGeometry), faceMat, Math.max(1, lit.length));
    const poolMat = new THREE.MeshBasicMaterial({
      map: once('poolTex', D.poolTexture), color: 0x000000, transparent: true, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const pools = new THREE.InstancedMesh(once('poolGeo', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), poolMat, Math.max(1, lit.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let f = 0;
    list.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.08, THREE.MathUtils.degToRad(p.yaw), (r() - 0.5) * 0.08));
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.size, p.size * (0.92 + r() * 0.16), p.size));
      mesh.setMatrixAt(i, m4);
      c.setHSL(0.03 + r() * 0.025, 0.9, 0.5 + r() * 0.1).lerp(new THREE.Color(1, 1, 1), 0.55);
      mesh.setColorAt(i, c);
      if (p.lit) {
        faces.setMatrixAt(f, m4);
        const s = 0.9 + p.size * 1.6;
        const yaw = THREE.MathUtils.degToRad(p.yaw);
        pools.setMatrixAt(f, new THREE.Matrix4().makeScale(s, 1, s).setPosition(p.x + Math.sin(yaw) * p.size * 0.5, p.ground + 0.012, p.z + Math.cos(yaw) * p.size * 0.5));
        f++;
      }
    });
    faces.count = pools.count = lit.length;
    mesh.castShadow = mesh.receiveShadow = true;
    faces.userData.noAO = pools.userData.noAO = true;
    pools.visible = false;
    pools.renderOrder = 2;
    for (const m of [mesh, faces, pools]) { m.computeBoundingSphere(); group.add(m); }
    const hot = new THREE.Color(1, 0.5, 0.12);
    const day = new THREE.Color(1, 0.62, 0.16); // by day the carved faces show a lit candle too
    glowList.push((level, k) => {
      faceMat.color.copy(day).lerp(hot.clone().multiplyScalar(4 * k), level);
      pools.visible = level > 0;
      poolMat.color.setRGB(1, 0.46, 0.12).multiplyScalar(level * 0.7 * k);
    });
  }

  // --- Seasons -------------------------------------------------------------------------------

  function buildHalloween(plan) {
    const group = new THREE.Group();
    const glow = [];
    const list = [];
    const add = (x, z, size, lit, yaw, y, k = PUMPKIN_K) => {
      size *= k;
      if (y === undefined) {
        const at = plan.settle(x, z, size * 0.5, 0.6);
        if (!at) return;
        plan.take(at.x, at.z, size * 0.5);
        ({ x, z } = at);
        y = plan.floorY(x, z);
      }
      list.push({ x, z, y, ground: y, size, lit, yaw });
    };

    // Hay bales first: pumpkins sit on them.
    const bales = [];
    for (const [x, z, yaw] of BALES) {
      const rad = THREE.MathUtils.degToRad(yaw);
      const half = [Math.abs(Math.cos(rad)) * D.BALE.w / 2 + Math.abs(Math.sin(rad)) * D.BALE.d / 2, Math.abs(Math.sin(rad)) * D.BALE.w / 2 + Math.abs(Math.cos(rad)) * D.BALE.d / 2];
      if (!plan.free(x, z, Math.min(...half)) || !plan.free(x + half[0] * 0.8, z, 0.12) || !plan.free(x - half[0] * 0.8, z, 0.12)) continue;
      plan.take(x, z, Math.max(...half));
      bales.push({ x, z, yaw: rad, y: plan.floorY(x, z) });
    }
    const straw = once('straw', () => D.strawTexture(rng(0xba1e)));
    const baleMesh = new THREE.InstancedMesh(once('bale', D.baleGeometry), new THREE.MeshStandardMaterial({ map: straw, roughness: 0.95 }), Math.max(1, bales.length));
    const m4 = new THREE.Matrix4();
    bales.forEach((b, i) => {
      baleMesh.setMatrixAt(i, m4.makeRotationY(b.yaw + (r() - 0.5) * 0.08).setPosition(b.x, b.y, b.z));
      baleMesh.setColorAt(i, new THREE.Color().setScalar(0.88 + r() * 0.16));
    });
    baleMesh.count = bales.length;
    baleMesh.castShadow = baleMesh.receiveShadow = true;
    baleMesh.computeBoundingSphere();
    group.add(baleMesh);
    for (const [k, size, lit, yaw] of BALE_PUMPKINS) {
      const b = bales[k];
      const off = k % 2 ? -0.2 : 0.2; // off centre along the bale
      if (b) add(b.x + Math.cos(b.yaw) * off, b.z - Math.sin(b.yaw) * off, size, lit, yaw, b.y + D.BALE.h);
    }

    // Court gates on the main walkway: a pair beside each gate, on the walkway side.
    GATES.forEach(([gx, side], i) => {
      const z = side * 1.62;
      // Carved faces turn towards the drone (+z), a little aside.
      add(gx - 1.4, z, 0.64 + (i % 2) * 0.08, true, side > 0 ? 24 : 10);
      add(gx + 1.35, z, 0.56, true, side > 0 ? -28 : -16);
      add(gx - 2.3, z + side * 0.06, 0.42, false, 30);
      add(gx + 2.25, z + side * 0.04, 0.4, i % 2 === 1, -24);
    });
    // Row 2: a pumpkin patch along both sides of the main walkway, every few metres, by the fences.
    for (const f of walkwayFences()) {
      for (let x = f.x0 + 3; x < f.x1 - 2; x += 4.6) {
        if (GATES.some(([gx]) => Math.abs(gx - x) < 3.2)) continue;
        const k = Math.round(x * 7) & 3;
        add(x, f.z + f.side * 0.55, 0.42 + k * 0.06, k !== 2, f.side > 0 ? 18 - k * 10 : 8 + k * 6);
      }
    }
    // Giant pumpkins mark the walkway's street end and the plaza before the clubhouse.
    for (const [x, z, size, yaw] of GIANTS) add(x, z, size, true, yaw, undefined, 1);
    for (const [x, z, size, lit, yaw] of DOOR_PUMPKINS) add(x, z, size, lit, yaw);
    pumpkins(group, list, glow);
    lights(group, strands({ fences: false }), ORANGE, glow);
    // Row 2: orange and purple strands on the walkway fences, spooky pennants just below them.
    const fence = strands({ eave: false });
    lights(group, fence.filter((_, i) => i % 2 === 0), ORANGE, glow);
    lights(group, fence.filter((_, i) => i % 2 === 1), PURPLE, glow);
    bunting(group, strands({ y: 2.9, out: 0.2 }), SPOOKY_COLORS);
    // Row 35: ghosts, sheets, cobwebs, spiders. Row 64: Death walks in the groundskeeper's place.
    const parts = [buildGhosts({ ctx, plan, fences: courtBoxes() }), buildDeath({ ctx })];
    group.add(...parts.map((x) => x.group));
    const live = {
      update: (...a) => parts.reduce((on, x) => x.update(...a) || on, false),
      pick: (x, y) => parts.map((o) => o.pick(x, y)).find(Boolean) ?? null,
      click: (x, y) => parts.some((o) => o.click(x, y)),
      label: (k) => parts.map((o) => o.label(k)).find(Boolean) ?? null,
      off: () => parts.forEach((o) => o.off?.()),
      place: (...a) => parts[0].place(...a),
      park: (x, z) => parts[0].park(x, z),
      debug: () => ({ ...parts[0].debug(), death: parts[1].debug() }),
    };
    return { group, glow, live };
  }

  function buildHolidays(plan) {
    const group = new THREE.Group();
    const glow = [];
    const sets = strands();
    const wraps = []; // palms and the fir: dense strands, softer halos
    // Palm trunks: a tight spiral from the pot to the crown.
    for (const [x, z] of PALMS) {
      const points = [];
      const wire = [];
      const turns = 6.5;
      const n = 46;
      let prev = null;
      for (let i = 0; i <= n * 3; i++) {
        const t = i / (n * 3);
        const a = t * turns * Math.PI * 2;
        const p = new THREE.Vector3(x + Math.cos(a) * 0.13, 0.74 + t * 1.12, z + Math.sin(a) * 0.13);
        if (prev) wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
        if (i % 5 === 0) points.push({ p: p.clone().add(new THREE.Vector3(Math.cos(a) * 0.02, 0.04, Math.sin(a) * 0.02)) });
      }
      wraps.push({ points, wire });
    }
    // The fir, with a spiral of lights, baubles and a star.
    const [tx, tz] = TREE_AT;
    // Row 2: the fir is built at its model size round its own origin, then scaled up as a whole.
    const firGroup = new THREE.Group();
    firGroup.position.set(tx, plan.floorY(tx, tz), tz);
    firGroup.scale.setScalar(FIR_K);
    group.add(firGroup);
    const fir = new THREE.Mesh(D.firGeometry(rng(0xf1a)), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    fir.castShadow = fir.receiveShadow = true;
    firGroup.add(fir);
    plan.take(tx, tz, D.TREE.radius * FIR_K);
    {
      const points = [];
      const wire = [];
      let prev = null;
      const turns = 7;
      const n = 420;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = D.TREE.base + 0.12 + t * (D.TREE.height - D.TREE.base - 0.45);
        const a = t * turns * Math.PI * 2;
        const rad = D.treeRadius(y) * 1.02 + 0.05;
        const p = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);
        if (prev) wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
        if (i % 5 === 0) points.push({ p });
      }
      lights(firGroup, [{ points, wire }], WARM, glow, { halo: 0.42 / FIR_K });
      const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.6 }), 34);
      const colors = ['#9b1c1c', '#c9a243', '#b9b6ad', '#9b1c1c', '#1d4f7a'];
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < balls.count; i++) {
        const y = D.TREE.base + 0.3 + r() * (D.TREE.height - D.TREE.base - 0.9);
        const a = r() * Math.PI * 2;
        const rad = D.treeRadius(y) * 1.06 + 0.04;
        balls.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * rad, y - 0.08, Math.sin(a) * rad));
        balls.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      }
      balls.castShadow = true;
      balls.computeBoundingSphere();
      firGroup.add(balls);
      const starMat = new THREE.MeshStandardMaterial({ color: '#d8b04a', roughness: 0.3, metalness: 0.7, emissive: new THREE.Color(1, 0.78, 0.36), emissiveIntensity: 0 });
      const star = new THREE.Mesh(D.starGeometry(), starMat);
      star.position.set(0, D.TREE.height + 0.02, 0);
      firGroup.add(star);
      glow.push((level, k) => { starMat.emissiveIntensity = 0.25 + level * 3.2 * k; });
    }
    // Gifts: under the fir, on the side the drone sees, and a few by the front door.
    const spots = [];
    const gift = (x, z, s, yaw) => {
      const at = plan.settle(x, z, s * 0.7, 0.5);
      if (!at) return;
      plan.take(at.x, at.z, s * 0.7);
      spots.push([at.x, at.z, s, yaw, plan.floorY(at.x, at.z)]);
    };
    [[-0.9, 1.0, 0.42, 0.3], [0.1, 1.35, 0.36, -0.4], [1.0, 0.95, 0.46, 0.9], [-1.45, 0.25, 0.32, 0.2], [1.5, 0.15, 0.3, -0.7], [0.55, 1.7, 0.26, 0.5], [-0.4, 1.75, 0.3, 1.2]]
      .forEach(([dx, dz, s, yaw]) => gift(tx + dx * FIR_K, tz + dz * FIR_K, s * 1.5, yaw));
    [[14.1, -51.2, 0.36, 0.2], [14.65, -50.8, 0.28, -0.5], [13.6, -50.75, 0.24, 0.8], [8.0, -51.0, 0.32, -0.2]].forEach(([x, z, s, yaw]) => gift(x, z, s, yaw));
    const gifts = new THREE.Mesh(D.giftsGeometry(spots, r), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    gifts.castShadow = gifts.receiveShadow = true;
    group.add(gifts);
    // Row 2: the walkway fences in red, green and gold, the clubhouse eave warm white.
    const fences = sets.slice(0, -1);
    [RED, GREEN, GOLD].forEach((tint, k) => lights(group, fences.filter((_, i) => i % 3 === k), tint, glow));
    lights(group, sets.slice(-1), WARM, glow);
    lights(group, wraps, WARM, glow, { halo: 0.42 });
    group.add(buildWinter({ root, plan, fences: walkwayFences(), courts: courtBoxes(), gaps: GATES.map(([x]) => x), at: [20.5, -47.2], r }));
    return { group, glow, snow: true, hats: true, crew: true, windows: true };
  }

  function buildJuly4(plan) {
    const group = new THREE.Group();
    const glow = [];
    // Bunting on the walkway fences and along the eave (row 2: flag-sized pennants).
    bunting(group, strands(), FLAG_COLORS);
    lights(group, strands({ y: 3.75, eave: false }), WARM, glow); // and a strand of lights above, lit by day too

    // Small flags along the main walkway: mid-way along each court fence, and on the lawn edges of
    // the walkway's west end, where the club opens onto the street.
    const spots = [];
    for (const f of walkwayFences()) for (const t of [0.15, 0.38, 0.62, 0.85]) spots.push([f.x0 + (f.x1 - f.x0) * t, f.z + f.side * 0.4]);
    for (let x = -48; x <= -34; x += 3.5) spots.push([x, 2.6], [x, -2.6]);
    const ok = [];
    for (const [x, z] of spots) {
      const at = plan.settle(x, z, 0.08, 0.5);
      if (!at) continue;
      plan.take(at.x, at.z, 0.3);
      ok.push([at.x, plan.floorY(at.x, at.z), at.z]);
    }
    const flagMat = new THREE.MeshStandardMaterial({ map: once('flagTex', D.flagTexture), roughness: 0.75, side: THREE.DoubleSide });
    const cloth = new THREE.InstancedMesh(once('flag', D.flagGeometry), flagMat, ok.length);
    const poles = new THREE.InstancedMesh(once('flagPole', D.flagPoleGeometry), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), ok.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(FLAG_K, FLAG_K, FLAG_K);
    ok.forEach(([x, y, z], i) => {
      q.setFromEuler(new THREE.Euler(0, (r() - 0.5) * 0.5 + (z > 0 ? 0.25 : -0.25), (r() - 0.5) * 0.08));
      m4.compose(new THREE.Vector3(x, y, z), q, one);
      cloth.setMatrixAt(i, m4);
      poles.setMatrixAt(i, m4);
    });
    cloth.castShadow = poles.castShadow = true;
    cloth.userData.noAO = poles.userData.noAO = true;
    for (const m of [cloth, poles]) { m.computeBoundingSphere(); group.add(m); }
    return { group, glow, fireworks: true };
  }

  const BUILD = { halloween: buildHalloween, holidays: buildHolidays, july4: buildJuly4 };

  // --- Switching ---------------------------------------------------------------------------------

  async function show(season) {
    want = season;
    if (pending) return;
    while (want !== shown) {
      const next = want;
      let entry = next ? built.get(next) : null;
      if (next && !entry) {
        placement ??= createPlacement(root);
        const plan = placement.fork();
        entry = BUILD[next](plan);
        plan.restore();
        entry.group.name = `seasons_${next}`;
        entry.group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
        entry.group.updateMatrixWorld(true);
        built.set(next, entry);
        pending = renderer.compileAsync(entry.group, camera, scene).catch(() => {});
        await pending;
        pending = null;
        if (want !== next) continue;
      }
      if (shown) { built.get(shown).live?.off?.(); scene.remove(built.get(shown).group); }
      shown = next;
      if (entry) {
        scene.add(entry.group);
        const n = readNight(); // lit as the hour is, from its first frame
        night = n.level;
        boost = n.k;
        entry.glow.forEach((fn) => fn(night, boost));
      }
      dress(entry);
      if (!entry?.fireworks) fireworks?.clear();
      refreshShadows();
      staticDirty = true;
    }
  }

  // Row 4: what goes with the decor besides the model's own objects: hats on the people, the snow
  // crew, warm clubhouse windows by day.
  let crew = null;
  let hats = false;
  function dress(entry) {
    decorLight.windows = entry?.windows ? 0.85 : 0;
    if (entry?.hats || hats) adorn(ctx).set({ hats: !!entry?.hats });
    hats = !!entry?.hats;
    if (entry?.crew) crew ??= createSnowCrew(ctx, { still });
    crew?.set(!!entry?.crew);
  }

  onSeason((season) => { show(season); });

  // Row 36: light snow while the holiday decor is up (not with reduced motion).
  let snow = null;

  // Night level from the exposure the clock sets: 0 by day, 1 after dusk.
  function readNight() {
    const ratio = renderer.toneMappingExposure / EXPOSURE;
    const level = THREE.MathUtils.clamp((0.84 - ratio) / 0.26, 0, 1);
    return { level: Math.round(level * NIGHT_STEPS) / NIGHT_STEPS, k: Math.min(1 / Math.max(ratio, 0.2), 4) };
  }

  if (import.meta.env.DEV) {
    window.__bp ??= {};
    window.__bp.seasons = {
      shown: () => shown,
      night: () => night,
      ghosts: () => built.get('halloween')?.live?.debug(),
      placeGhost: (i, x, z) => built.get('halloween')?.live?.place(i, x, z),
      park: (x, z) => built.get('halloween')?.live?.park(x, z),
      burst: (sx, sy) => { fireworks?.launch(performance.now() / 1000, sx, sy); },
      built: () => [...built.keys()],
    };
  }

  return {
    name: 'seasons',
    tick(t, dt) {
      const entry = shown ? built.get(shown) : null;
      let alive = entry?.live ? entry.live.update(t, dt, Math.max(night, 0)) : false;
      if (hats) alive = adorn(ctx).tick(t) || alive;
      if (crew) alive = crew.tick(t) || alive;
      if (entry?.snow && !still) snow ??= createSnow(ctx);
      if (snow) {
        snow.set(!!entry?.snow && !document.body.classList.contains('hud-open'));
        alive = snow.update(night < 0 ? 0 : night) || alive;
      }
      if (!entry) return alive;
      if (t - lastPoll > 0.25 && !(weatherSky.flash > 0)) {
        lastPoll = t;
        const n = readNight();
        if (n.level !== night || Math.abs(n.k - boost) > 0.25) {
          night = n.level;
          boost = n.k;
          entry.glow.forEach((fn) => fn(night, boost));
          staticDirty = true;
        }
      }
      if (!entry.fireworks || still) return alive;
      const now = performance.now() / 1000;
      fireworks ??= createFireworks({ scene, camera, pitch: rig.pitch });
      const dark = night >= 0.66 && !document.body.classList.contains('hud-open');
      if (dark && now > nextVolley) {
        if (volley === 0) volley = 2 + Math.floor(Math.random() * 3);
        fireworks.launch(now);
        volley--;
        nextVolley = now + (volley > 0 ? 0.7 + Math.random() * 1.4 : 14 + Math.random() * 18);
      }
      if (!dark && !fireworks.active()) nextVolley = Math.max(nextVolley, now + 2.5); // the first volley a moment after dark
      return fireworks.update(now) || alive;
    },
    pick: (x, y) => (shown ? built.get(shown)?.live?.pick(x, y) ?? null : null),
    click: (x, y) => (shown ? built.get(shown)?.live?.click(x, y) ?? false : false),
    label: (kind) => (shown ? built.get(shown)?.live?.label(kind) ?? null : null),
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    debug: () => ({ shown, night, boost: +boost.toFixed(2), built: [...built.keys()], snow: !!snow, crew: crew?.debug() }),
  };
}
