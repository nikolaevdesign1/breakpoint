import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { box, part, merge } from './geom.js';
import { createWaterSound } from '../sound/drinking-water.js';

// Drinking fountains (round 10, row 36): steel pedestals with a bowl and a spout, one by every
// group of courts, on the footpaths, at the café, the rest zone and the padel courts. They are not
// the decorative fountains by the green court (those stay as they are). Hover shows an annotation
// "Drinking fountain" (club/fountain-label.js listens to `bp-fountain-hover`); a click, or a player
// coming to drink, runs a thin jet into the bowl with a soft trickle of sound.
//
// For the players' and kids' "water" step of their routine (life/players.js, kids.js) the system
// exports `drinkingFountains`, filled when the map's life starts (`bp-fountains-ready` fires):
//   spots            [{ id, x, y, z, face: { x, z }, label }]   face = the way a drinker stands from the pedestal
//   thirst()         visit-rate multiplier: ×2.2 from 90°F, ×1.4 from 84°F, ×0.35 while it rains
//   pick(x, z, { kid, avoid })  the best spot for someone at (x, z): near, and with a short queue
//   reserve(id, who) → { id, slot, x, z }  a place in line (slot 0 is at the spout), who = any object
//   release(who)     leave the line (call it when done or when giving up)
//   drink(id, who, seconds = 3)  runs the jet (and sound); the line moves on when it ends
//   queue(id)        how many wait (the one drinking counts)
// Events: `bp-fountain` { id, on, who } when a jet starts and stops.
// Dev: __bp.lifeDev().fountains.debug() · .drink('f-clay-mid')

/** Spots in world metres: [id, x, z, face angle (rad, 0 = +z)]. On the footpaths beside the courts, a drinker stands on the walkway side. */
const SPOTS = [
  ['f-clay-west', -30.4, -2.6, -Math.PI / 2],
  ['f-clay-mid', 9.6, 5.4, -Math.PI / 2],
  ['f-clay-north', 10.4, -21, -Math.PI / 2],
  ['f-hard-1', 47.9, 6.2, -Math.PI / 2],
  ['f-hard-north', 28.6, -22, Math.PI / 2],
  ['f-grass', 68.6, -12, -Math.PI / 2],
  ['f-padel-spur', 20.2, 50, Math.PI / 2],
  ['f-padel-low', 8, 57.4, 0],
  ['f-cafe', 44, -49.6, Math.PI],
  ['f-rest', -7.2, -47, Math.PI / 2],
];

const LABELS = { 'f-cafe': 'By the café', 'f-rest': 'Rest zone', 'f-padel-spur': 'Padel courts', 'f-padel-low': 'Padel courts' };
const JET = 3; // s
const SIZE = 1.35; // a little over life size: the map is seen from 40 m up
const DROPS = 28;
const G = 9.81;

const STEEL = '#cfcdc7';
const DARK = '#5b5a57';

/** One fountain at the origin, facing +z (the drinker's side): pedestal, cap, bowl, well, spout, button, foot. */
function pedestal() {
  return [
    part(new THREE.CylinderGeometry(0.27, 0.3, 0.05, 20).translate(0, 0.025, 0), DARK),
    box(0.3, 0.74, 0.3, 0, 0.42, 0, STEEL),
    box(0.36, 0.05, 0.36, 0, 0.8, 0, '#a5a39d'),
    part(new THREE.CylinderGeometry(0.22, 0.17, 0.1, 20).translate(0, 0.88, 0.06), '#b9b7b1'),
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 20).translate(0, 0.929, 0.06), '#1f1f1e'),
    box(0.05, 0.05, 0.2, 0, 0.99, -0.07, '#9d9b95'),
    box(0.05, 0.1, 0.05, 0, 0.94, -0.16, '#9d9b95'),
    box(0.07, 0.07, 0.03, 0, 0.62, 0.165, '#f1f0ec'),
  ];
}

function jetMaterial() {
  const m = new THREE.PointsMaterial({ color: 0xe3f0f8, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false });
  return gradeLife(m);
}

export const drinkingFountains = {
  ready: false, spots: [], thirst: () => 1, pick: () => null, reserve: () => null, release() {}, drink() {}, queue: () => 0,
};

export function createDrinkingFountains(ctx) {
  const { scene, root, camera, rig, refreshShadows } = ctx;
  const play = createWaterSound({ rig });

  // Ground height under each spot (paths are not quite at 0).
  const down = new THREE.Vector3(0, -1, 0);
  const ray = new THREE.Raycaster(new THREE.Vector3(), down, 0, 80);
  const spots = SPOTS.map(([id, x, z, a]) => {
    ray.set(new THREE.Vector3(x, 40, z), down);
    const hit = root ? ray.intersectObject(root, true).find((h) => h.object.visible) : null;
    return { id, x, y: hit ? hit.point.y : 0, z, a, face: { x: Math.sin(a), z: Math.cos(a) }, label: LABELS[id] ?? 'Drinking fountain', jet: 0, line: [] };
  });

  // The pedestals: one merged mesh, in the cached frame and the shadow map.
  const parts = [];
  for (const s of spots) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.a), new THREE.Vector3(SIZE, SIZE, SIZE));
    for (const g of pedestal()) { g.applyMatrix4(m); parts.push(g); }
  }
  const body = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 }));
  body.name = 'drinking_fountains';
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  let staticDirty = true;
  refreshShadows?.();

  // The jets: one Points object on the life layer, drops flying in a low arc from each spout into its bowl.
  const pos = new Float32Array(spots.length * DROPS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const jets = new THREE.Points(geo, jetMaterial());
  jets.layers.set(LIFE_LAYER);
  jets.frustumCulled = false;
  jets.userData.noAO = true;
  jets.name = 'drinking_jets';
  scene.add(jets);

  // --- Heat and rain: how often anyone comes to drink -------------------------------------------
  let temp = 84;
  let wet = false;
  document.addEventListener('bp-weather', (e) => { if (typeof e.detail?.temp === 'number') temp = e.detail.temp; wet = (e.detail?.rain ?? 0) > 0; });
  const thirst = () => (wet ? 0.35 : temp >= 90 ? 2.2 : temp >= 84 ? 1.4 : 1);

  // --- A jet ------------------------------------------------------------------------------------
  const byId = (id) => spots.find((s) => s.id === id);
  let active = 0;

  function drink(id, who = null, seconds = JET) {
    const s = byId(id);
    if (!s) return;
    if (!s.jet) active++;
    s.jet = s.total = seconds;
    s.who = who;
    play(s.x, s.z, seconds);
    document.dispatchEvent(new CustomEvent('bp-fountain', { detail: { id, on: true, who } }));
  }

  function endJet(s) {
    s.jet = 0;
    if (s.who) release(s.who); // the next in line steps up
    s.who = null;
    active--;
    document.dispatchEvent(new CustomEvent('bp-fountain', { detail: { id: s.id, on: false } }));
  }

  // --- The line ---------------------------------------------------------------------------------
  const slotAt = (s, k) => {
    const side = { x: -s.face.z, z: s.face.x }; // the line curls sideways, along the walkway
    const sign = k % 2 ? 1 : -1;
    const d = 0.75 + Math.ceil(k / 2) * 0.62;
    return k === 0 ? { x: s.x + s.face.x * 0.75, z: s.z + s.face.z * 0.75 } : { x: s.x + s.face.x * 0.75 + side.x * sign * d * 0.8, z: s.z + s.face.z * 0.75 + side.z * sign * d * 0.8 };
  };
  const place = (s, who) => ({ id: s.id, slot: s.line.indexOf(who), ...slotAt(s, Math.max(0, s.line.indexOf(who))) });

  function reserve(id, who) {
    const s = byId(id);
    if (!s || !who) return null;
    if (!s.line.includes(who)) s.line.push(who);
    return place(s, who);
  }
  function release(who) {
    for (const s of spots) {
      const i = s.line.indexOf(who);
      if (i >= 0) s.line.splice(i, 1);
    }
  }

  Object.assign(drinkingFountains, {
    ready: true,
    spots: spots.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, face: s.face, label: s.label })),
    thirst,
    queue: (id) => byId(id)?.line.length ?? 0,
    reserve,
    release,
    drink: (id, who, seconds) => drink(id, who, seconds),
    pick(x, z, { kid = false, avoid = [] } = {}) {
      let best = null;
      let score = Infinity;
      for (const s of spots) {
        if (avoid.includes(s.id)) continue;
        const d = Math.hypot(s.x - x, s.z - z) + s.line.length * 9 + (kid && /grass|cafe/.test(s.id) ? 20 : 0);
        if (d < score) { score = d; best = s; }
      }
      return best && { id: best.id, x: best.x, z: best.z, face: best.face, distance: Math.hypot(best.x - x, best.z - z), queue: best.line.length };
    },
  });
  document.dispatchEvent(new CustomEvent('bp-fountains-ready'));

  // --- Pointer: hover shows the label (club/fountain-label.js), a click runs the jet ----------------
  const v = new THREE.Vector3();
  function near(x, y, touch) {
    let best = null;
    let bd = touch ? 34 : 24;
    for (const s of spots) {
      v.set(s.x, s.y + 0.8, s.z).project(camera);
      if (v.z > 1) continue;
      const d = Math.hypot((v.x + 1) / 2 * innerWidth - x, (1 - v.y) / 2 * innerHeight - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  let hovered = null;
  const hover = (s, touch = false) => {
    if (s === hovered) return;
    hovered = s;
    document.dispatchEvent(new CustomEvent('bp-fountain-hover', { detail: s ? { id: s.id, x: s.x, y: s.y, z: s.z, label: s.label, touch } : null }));
  };

  let clock = 0;
  const posAttr = geo.attributes.position;
  return {
    name: 'fountains',
    tick(t, dt) {
      if (!active) { if (geo.drawRange.count) { geo.setDrawRange(0, 0); return true; } return false; }
      const step = Math.min(dt || 0.016, 0.1);
      clock += step;
      let n = 0;
      for (const s of spots) {
        if (!s.jet) continue;
        s.jet -= step;
        if (s.jet <= 0) { endJet(s); continue; }
        const fade = Math.min(1, s.jet / 0.3, (s.total - s.jet) / 0.3);
        for (let i = 0; i < DROPS; i++) {
          // Each drop leaves the spout in turn and falls back into the bowl: a low, lively arc.
          const age = (clock * 1.6 + i / DROPS) % 1; // 0…1 of its flight
          const T = 0.55;
          const tt = age * T;
          const h = 0.1 + (age * 0.2) * 1; // reach towards the drinker
          const y = 0.99 + 1.45 * tt - 0.5 * G * tt * tt * 0.5;
          const x = s.x + s.face.x * (-0.12 + h) * SIZE + (i % 3 - 1) * 0.005;
          const z = s.z + s.face.z * (-0.12 + h) * SIZE;
          const o = n * 3;
          pos[o] = x; pos[o + 1] = s.y + y * SIZE * (0.4 + 0.6 * fade); pos[o + 2] = z;
          n++;
        }
      }
      geo.setDrawRange(0, n);
      posAttr.needsUpdate = true;
      return true;
    },
    takeStaticChange() { const c = staticDirty; staticDirty = false; return c; },
    pick(x, y, touch) {
      const s = near(x, y, touch);
      hover(s, touch);
      return s ? `fountain:${s.id}` : null;
    },
    click(x, y, touch) {
      const s = near(x, y, touch);
      if (!s) return false;
      drink(s.id);
      hover(s, touch);
      if (touch) setTimeout(() => hover(null), 3200);
      return true;
    },
    label: () => null, // the annotation (club/fountain-label.js) is the label
    debug: () => ({ spots: spots.map((s) => [s.id, +s.x.toFixed(1), +s.z.toFixed(1), s.jet > 0, s.line.length]), thirst: thirst(), temp, wet }),
    drink,
    byId,
  };
}
