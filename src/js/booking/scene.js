import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import gsap from 'gsap';
import { COURTS } from '../shared/availability.js';
import { createCameraRig } from './camera-rig.js';
import { buildImpostors } from './impostors.js';
import { createLife } from './life/index.js';
import { LIFE_LAYER, reducedMotion } from './life/shared.js';
import { RALLY_COURTS } from './life/rallies.js';
import { cursor } from '../site/cursor.js';
import { createIntroFlight } from './intro.js';
import {
  SUN_DIR, detectQuality, setupRenderer, setupAtmosphere, createSun, loadSky, dressMaterial, createComposer,
} from './lookdev.js';
import { loadLightmaps, applyLightmaps } from './lightmaps.js';

const MODEL_URL = '/models/clay_courts.glb';
// edgeX: east of the car park there is only the tree belt; pulled back, the drone may pan less far
// east, so the view never runs out over empty lawn (row 140, camera-rig.js); edgeMinX: the same
// on the west side, ~20 m past the perimeter fence (row 152).
const PAN_BOUNDS = { minX: -30, maxX: 96, edgeX: 101, edgeMinX: -43, minZ: -70, maxZ: 80, edgeMinZ: -92, edgeMaxZ: 102 }; // row 177: ~180 px less empty edge on every side
// Area the static shadow map covers: courts, paths and the tree line around them.
const SHADOW_AREA = { minX: -48, maxX: 118, minZ: -94, maxZ: 92, top: 18 };

// Court overlays: one tinted plane per court (<id>_hl in the GLB) shows its state.
// The tint is drawn after the light pool, so a lit court and an unlit one fade by the same amount
// (row 138). Filtered out = clearly faded; busy at the dock's hour = only a little muted.
const LOOK = {
  idle: { color: 0x02040a, opacity: 0 },
  dim: { color: 0x02040a, opacity: 0.5 },
  busy: { color: 0x0b0d10, opacity: 0.22 },
  // Hover / open: no tint here; the court brightens through its light pool instead.
  hover: { color: 0x02040a, opacity: 0 },
  selected: { color: 0x02040a, opacity: 0 },
};

// Hooks for the page UI (dock, panel, cursor, loader).
// onLifeHover(kind | null): the pointer is over something alive that can be clicked (the cat).
export const sceneEvents = { onHover: null, onSelect: null, onReady: null, onProgress: null, onError: null, onLifeHover: null, lifeStarted: null };

// --- Renderer / scene ------------------------------------------------------

const quality = detectQuality();
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
setupRenderer(renderer, quality);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.autoUpdate = false; // nothing moves: draw the shadows once the model is in
renderer.shadowMap.needsUpdate = true; // allocate the map on the first frame

const scene = new THREE.Scene();
setupAtmosphere(scene);
const sun = createSun(scene, SHADOW_AREA, quality);

// --- Camera ------------------------------------------------------------------

const rig = createCameraRig(canvas, { bounds: PAN_BOUNDS });
const { camera } = rig;

const post = createComposer(renderer, scene, camera, quality, { lifeLayer: LIFE_LAYER });
let life = null; // birds, wind, cars, players, the cat (life/index.js), once the model is in

window.addEventListener('resize', () => {
  rig.resize();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize();
});

// --- Model -------------------------------------------------------------------

const overlays = new Map(); // courtId -> hl mesh
const pools = new Map(); // courtId -> additive light pool over the court
const courtRoots = new Map(); // courtId -> root object
const pickables = [];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Real progress over the three downloads, weighted by size; GPU upload fills the last stretch.
const parts = { model: [0.62, 0], sky: [0.12, 0], lightmaps: [0.06, 0], impostors: [0.14, 0] };
const report = (key, p) => {
  parts[key][1] = Math.max(parts[key][1], Math.min(1, p));
  sceneEvents.onProgress?.(Object.values(parts).reduce((a, [w, v]) => a + w * v, 0));
};
const sky = loadSky(renderer, scene, (p) => report('sky', p)).catch((err) => console.warn('Sky failed, using flat light', err));
const lightmaps = loadLightmaps((p) => report('lightmaps', p)).catch((err) => { console.warn('Lightmaps failed', err); return {}; });

loader.load(
  MODEL_URL,
  async (gltf) => {
    performance.mark('bp-glb-parsed');
    report('model', 1);
    const root = gltf.scene;
    applyLightmaps(root, root.userData.lightmaps, await lightmaps);
    await sky;
    performance.mark('bp-sky-lightmaps');
    const textures = new Set();
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = !/greenhouse_glass/.test(child.material?.name); // row 179: sun passes the greenhouse glass
      child.receiveShadow = true;
      if (child.name.endsWith('_hl')) setupOverlay(child);
      for (const m of [child.material].flat()) {
        for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
        if (/leaf|bark/i.test(m.name)) seeThrough(m);
        // Paths lie in the same plane as the court aprons: let the aprons win cleanly.
        if (m.name.startsWith('mat_path')) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 3 });
        if (m.transparent || m.alphaTest > 0 || m.opacity < 1) child.userData.noAO = true;
        dressMaterial(m);
      }
    });

    for (const c of COURTS) {
      const obj = root.getObjectByName(c.id);
      if (obj) courtRoots.set(c.id, obj);
    }
    scene.add(root);
    root.updateMatrixWorld(true);
    setupFloodlights(root);

    const sprites = new THREE.Group();
    sprites.name = 'impostors';
    const spriteTextures = await buildImpostors(sprites, {
      meta: root.userData.impostors,
      props: root.userData.props,
      sunDir: SUN_DIR,
      decorate: seeThrough,
      onProgress: (p) => report('impostors', p),
    }).catch((err) => { console.warn('Impostors failed', err); return []; });
    spriteTextures.forEach((t) => textures.add(t));
    scene.add(sprites);
    performance.mark('bp-impostors');
    shadowOnly = [];
    sprites.traverse((o) => { if (o.userData.shadowOnly) shadowOnly.push(o); });

    // Life lifts the parked cars out of the merged props before the shadow map is first drawn.
    life = createLife({ scene, root, camera, renderer, rig, quality, sunDir: SUN_DIR, refreshShadows, textures, courtSurface, hedge: sprites.userData.hedge ?? [], sun, floodlights });

    // Upload every texture and compile every shader before the first visible frame,
    // so nothing pops in once the loader lifts.
    textures.forEach((t) => renderer.initTexture(t));
    performance.mark('bp-textures-uploaded');
    await renderer.compileAsync(scene, camera).catch(() => {});
    performance.mark('bp-compiled');
    renderer.shadowMap.needsUpdate = true;
    post.motion();
    // Shadows are drawn once; the invisible sun-facing cards have done their job.
    shadowOnly.forEach((o) => { o.visible = false; });
    forceFrames = 2;
    sceneEvents.onProgress?.(1);
    performance.mark('bp-ready');
    sceneEvents.lifeStarted = life.start(); // sprite sheets and the rest load now; the loader waits for the first ones (pages/booking.js)
    sceneEvents.onReady?.();
  },
  (e) => { if (e.lengthComputable && e.total) report('model', e.loaded / e.total * 0.98); },
  (err) => {
    console.error('Failed to load model', err);
    sceneEvents.onError?.(err);
  }
);

// Floodlit court: brightest over the playing area, falling off towards the fence.
let poolTex = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 8, 64, 64, 92);
  r.addColorStop(0, '#fff');
  r.addColorStop(0.55, '#c8c8c8');
  r.addColorStop(1, '#5a5a5a');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
}

/** The court planes carry no UVs: give the pool's copy a 0..1 mapping over its two long axes. */
function planeWithUv(geometry) {
  const g = geometry.clone();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const size = max.clone().sub(min);
  const axes = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]).slice(0, 2);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv[i * 2] = (v[axes[0]] - min[axes[0]]) / size[axes[0]];
    uv[i * 2 + 1] = (v[axes[1]] - min[axes[1]]) / size[axes[1]];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function setupOverlay(mesh) {
  const m = mesh.material.clone();
  m.map = null;
  m.alphaMap = null;
  m.alphaTest = 0;
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  m.color.set(LOOK.idle.color);
  m.opacity = 0;
  mesh.material = m;
  mesh.visible = true;
  mesh.castShadow = false;
  mesh.userData.noAO = true;
  mesh.renderOrder = 3; // over the light pool
  const id = mesh.name.slice(0, -3);
  overlays.set(id, mesh);
  pickables.push(mesh);

  // Light pool: the same plane, drawn over the court as light, not paint. It multiplies what is
  // under it (court × (1 + pool)), in the HDR buffer before tone mapping: the clay, the lines and
  // the shadows all brighten in proportion, nothing turns to a flat white glare (row 138).
  const pool = new THREE.Mesh(planeWithUv(mesh.geometry), new THREE.MeshBasicMaterial({
    color: 0x000000, map: poolTexture(), transparent: true, depthWrite: false, toneMapped: false, fog: false,
    side: THREE.DoubleSide, // the court planes face down in the GLB (their overlay material is double-sided)
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  pool.name = `${id}_pool`;
  pool.position.copy(mesh.position);
  pool.quaternion.copy(mesh.quaternion);
  pool.scale.copy(mesh.scale);
  pool.userData.noAO = true;
  pool.userData.level = { v: 0 };
  pool.visible = false;
  pool.renderOrder = 2;
  mesh.parent.add(pool);
  pools.set(id, pool);
}

// --- See-through foliage ------------------------------------------------------------
// The drone looks across the club, so trees on the near side can hide a selected court.
// Foliage in front of it dissolves into a coarse square dither (the site's pixel motif).

const cut = { value: new THREE.Vector4(0, 0, 0, 0) }; // minX, maxX, frontZ, amount

function seeThrough(material) {
  if (material.userData.seeThrough) return;
  material.userData.seeThrough = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCut = cut;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cutWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutWorld = instanceMatrix * cutWorld;
        #endif
        vCutWorld = (modelMatrix * cutWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uCut;\nvarying vec3 vCutWorld;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uCut.w > 0.0 && vCutWorld.z > uCut.z && vCutWorld.x > uCut.x && vCutWorld.x < uCut.y) {
          vec2 cell = floor(gl_FragCoord.xy / 4.0);
          float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          if (n < uCut.w) discard;
        }`);
  };
  material.customProgramCacheKey = () => 'see-through';
}

function focusCut(id) {
  if (id) {
    const b = courtBox(id);
    cut.value.x = b.minX - 1.5;
    cut.value.y = b.maxX + 1.5;
    cut.value.z = (b.minZ + b.maxZ) / 2;
  }
  gsap.to(cut.value, { w: id ? 1 : 0, duration: 0.9, ease: 'power2.inOut', overwrite: true });
}

// --- Static shadows ------------------------------------------------------------------
// The shadow map is drawn once. When a parked car drives off (or one parks), it is redrawn on the
// next baked frame, with the invisible sun-facing tree cards shown for just that frame.

let shadowOnly = [];
let shadowsPending = false;
function refreshShadows() { shadowsPending = true; }
function drawShadowsNow() {
  shadowOnly.forEach((o) => { o.visible = true; });
  renderer.shadowMap.needsUpdate = true;
}
function shadowsDrawn() {
  shadowOnly.forEach((o) => { o.visible = false; });
  shadowsPending = false;
}

// --- Floodlights -------------------------------------------------------------------
// Bulbs are dark by default; the masts of the court under the pointer (and the open court)
// switch on. Each bulb (instance or vertex) carries an `aGlow` weight that scales its emission.

const POOL_COLOR = new THREE.Color(0xffeedd); // floodlight, a touch warm: a strong tint greys a blue court
const POOL_GAIN = 0.26; // a lit court is up to 1.26× brighter in its middle, ~1.09× at the fence
// Round 7 (life/daylight.js): after dark the frame is darker, so the floodlights gain in step:
// pools multiply a dimmer court, bulbs and halos make up the exposure the night takes away.
const flood = { gain: POOL_GAIN, bulbs: [], halos: [] };
const glow = new Map(); // courtId -> { v }
const lampBatches = []; // { attr, courts: string[][] } one per bulb mesh

/**
 * Each court has its own four masts at the corners of its apron: a lamp belongs to the court whose
 * apron it stands on (or nearest to); between two equally close courts the nearer centre wins.
 */
function courtsNear(x, z) {
  let best = null;
  let bestKey = Infinity;
  for (const c of COURTS) {
    const b = courtBox(c.id);
    const edge = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
    const centre = Math.hypot((b.minX + b.maxX) / 2 - x, (b.minZ + b.maxZ) / 2 - z);
    const key = Math.round(edge * 2) * 1000 + centre; // edge distance in 0.5 m steps, then centre
    if (key < bestKey) { bestKey = key; best = c.id; }
  }
  return [best];
}

function setupFloodlights(root) {
  const bulbs = [];
  root.getObjectByName('lamp_bulb_template')?.removeFromParent(); // export leftover sitting at the origin
  root.traverse((o) => { if (o.isMesh && [o.material].flat().some((m) => m.name === 'mat_stadium_light')) bulbs.push(o); });
  const p = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  for (const mesh of bulbs) {
    const courts = [];
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4.premultiply(mesh.matrixWorld));
        courts.push(courtsNear(p.x, p.z));
      }
      mesh.geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1));
    } else {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        courts.push(courtsNear(p.x, p.z));
      }
      mesh.geometry.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
    }
    lampBatches.push({ attr: mesh.geometry.attributes.aGlow, courts });
    for (const m of [mesh.material].flat()) {
      if (m.name !== 'mat_stadium_light') continue;
      glowMaterial(m);
      if (!flood.bulbs.some((b) => b.m === m)) flood.bulbs.push({ m, base: m.emissiveIntensity });
    }
    if (mesh.isInstancedMesh) addHalos(mesh, courts);
  }
  COURTS.forEach((c) => glow.set(c.id, { v: 0 }));
  alwaysLit.forEach((id) => setLit(id, true));
  clockLit.forEach((id) => setLit(id, true));
}

// Lamp heads face their court, so on the near side of a court the camera only sees their backs.
// A soft glow card in the camera plane at every head shows a lit mast from any side.
const HALO_SIZE = 2.6; // m
const HALO_PEAK = 0.62; // the bulbs bloom on their own: the card only carries the glow round to the back
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,240,214,0.85)');
  r.addColorStop(0.5, 'rgba(255,214,160,0.22)');
  r.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addHalos(lenses, courts) {
  const geo = new THREE.PlaneGeometry(HALO_SIZE, HALO_SIZE);
  geo.rotateX(-rig.pitch); // the drone never turns: face it once
  geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(lenses.count), 1));
  const mat = new THREE.MeshBasicMaterial({ map: haloTexture(), color: 0xffe2b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  flood.halos.push({ m: mat, base: mat.color.clone() });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <opaque_fragment>', `diffuseColor.a *= vGlow * ${HALO_PEAK.toFixed(2)};\n#include <opaque_fragment>`);
  };
  const halos = new THREE.InstancedMesh(geo, mat, lenses.count);
  halos.name = 'lamp_halos';
  halos.renderOrder = 3;
  halos.userData.noAO = true;
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < lenses.count; i++) {
    lenses.getMatrixAt(i, m4);
    p.setFromMatrixPosition(m4.premultiply(lenses.matrixWorld));
    halos.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
  }
  halos.computeBoundingSphere();
  scene.add(halos);
  lampBatches.push({ attr: geo.attributes.aGlow, courts });
}

function glowMaterial(material) {
  if (material.userData.glow) return;
  material.userData.glow = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;');
  };
  material.customProgramCacheKey = () => 'floodlight';
}

function writeGlow() {
  for (const { attr, courts } of lampBatches) {
    for (let i = 0; i < courts.length; i++) {
      let v = 0;
      for (const id of courts[i]) v = Math.max(v, glow.get(id).v);
      attr.array[i] = v;
    }
    attr.needsUpdate = true;
  }
}

function writePool(pool) {
  const v = pool.userData.level.v;
  pool.visible = v > 0.001;
  pool.material.color.copy(POOL_COLOR).multiplyScalar(v * flood.gain);
}

function setLit(id, on) {
  const g = glow.get(id);
  if (!g) return;
  if (trial.has(id)) return; // round 9 (row 14, fun/light-test.js): a light test drives this court for now
  // One calm fade, lamps and the light on the court together.
  const pool = pools.get(id);
  const fade = { duration: on ? 0.45 : 0.6, ease: 'power2.out', overwrite: true };
  if (pool) gsap.to(pool.userData.level, { v: on ? 1 : 0, ...fade, onUpdate: () => writePool(pool) });
  gsap.to(g, { v: on ? 1 : 0, ...fade, onUpdate: writeGlow });
}

// Courts with a rally on them keep their floodlights on (row 130); the rest light up on hover and
// while their booking is open.
const alwaysLit = new Set();
// Round 7: the map's hour decides the rest (life/daylight.js): by day the courts with a rally on
// them, after dark every court booked at that hour; free courts stay dark.
const clockLit = new Set(reducedMotion() ? [] : RALLY_COURTS);
// Round 9 (row 31, life/players.js): a court whose last players have gone home stays dark.
const heldDark = new Set();
// Round 9 (row 10, fun/surface-peek.js): the court a surface filter points at while it is hovered.
const peeked = new Set();
// Round 9 (row 14, fun/light-test.js): courts whose lamp level a light test sets directly.
const trial = new Map();
const isLit = (id) => id === hoveredId || id === selectedId || peeked.has(id) || ((alwaysLit.has(id) || clockLit.has(id)) && !heldDark.has(id));

/** Hooks for life/daylight.js (passed in the life context). */
const floodlights = {
  /** Courts lit for their bookings at the map's hour. */
  setLit(ids) {
    const next = new Set(ids);
    const changed = [...new Set([...clockLit, ...next])].filter((id) => clockLit.has(id) !== next.has(id));
    clockLit.clear();
    next.forEach((id) => clockLit.add(id));
    changed.forEach((id) => setLit(id, isLit(id)));
  },
  /** Round 9: keep a court's lights off (its players have left) until released. */
  hold(id, dark) {
    if (dark) heldDark.add(id); else heldDark.delete(id);
    setLit(id, isLit(id));
  },
  /** k ≥ 1: how much brighter the lights read against the night (1 by day). */
  setBoost(k) {
    flood.gain = (1 + POOL_GAIN) * k * 1.3 - 1;
    flood.gain = Math.max(POOL_GAIN, flood.gain);
    pools.forEach(writePool);
    flood.bulbs.forEach(({ m, base }) => { m.emissiveIntensity = base * Math.min(k, 3); });
    flood.halos.forEach(({ m, base }) => m.color.copy(base).multiplyScalar(Math.min(k * 1.3, 4)));
  },
  lit: () => [...clockLit],
  /** Round 9 (row 14): set a court's lamps and pool to `v` (0..1) directly; null hands them back. */
  test(id, v) {
    const g = glow.get(id);
    if (!g) return;
    if (v == null) { trial.delete(id); setLit(id, isLit(id)); return; }
    trial.set(id, v);
    const pool = pools.get(id);
    gsap.killTweensOf(g);
    g.v = v;
    writeGlow();
    if (pool) { gsap.killTweensOf(pool.userData.level); pool.userData.level.v = v; writePool(pool); }
  },
  /** Round 9 (row 14): is this court lit anyway (booked, a rally, hovered, open)? */
  isLit: (id) => isLit(id),
};

// --- Court states ----------------------------------------------------------------

const dimmed = new Set();
const busy = new Set(); // dimmed only because they are booked at the dock's hour
let hoveredId = null;
let selectedId = null;

function lookFor(id) {
  if (id === selectedId) return LOOK.selected;
  if (id === hoveredId) return LOOK.hover;
  if (dimmed.has(id)) return busy.has(id) ? LOOK.busy : LOOK.dim;
  return LOOK.idle;
}

function refresh(id) {
  const mesh = overlays.get(id);
  if (!mesh) return;
  const look = lookFor(id);
  const color = new THREE.Color(look.color);
  gsap.to(mesh.material.color, { r: color.r, g: color.g, b: color.b, duration: 0.35, ease: 'power2.out', overwrite: true });
  gsap.to(mesh.material, { opacity: look.opacity, duration: 0.35, ease: 'power2.out', overwrite: true });
}

// Crossing a path between two courts briefly points at nothing: hold the light on the court just
// left for a moment, so it doesn't blink off and on as the pointer moves along.
const HOVER_HOLD = 0.22; // s
let hoverOff = null;

function setHover(id) {
  if (id === null && hoveredId !== null && !selectedId) {
    if (!hoverOff) hoverOff = gsap.delayedCall(HOVER_HOLD, () => { hoverOff = null; applyHover(null); });
    return;
  }
  hoverOff?.kill();
  hoverOff = null;
  applyHover(id);
}

function applyHover(id) {
  if (id === hoveredId) return;
  const prev = hoveredId;
  hoveredId = id;
  if (prev) { refresh(prev); setLit(prev, isLit(prev)); }
  if (id) { refresh(id); setLit(id, true); }
}

/** Courts that should fade back: filtered out, or (`busyIds`, a softer tint) booked at that hour. */
export function setDimmed(ids, busyIds = []) {
  dimmed.clear();
  busy.clear();
  ids.forEach((id) => dimmed.add(id));
  busyIds.forEach((id) => busy.add(id));
  COURTS.forEach((c) => refresh(c.id));
}

/** Court with the open panel glows. */
export function setSelected(id) {
  focusCut(id);
  const prev = selectedId;
  selectedId = id;
  if (id) setHover(null); // the open court is the only lit one
  if (prev) { refresh(prev); setLit(prev, isLit(prev)); }
  if (id) { refresh(id); setLit(id, true); }
}

// --- Hooks for the interaction modules (round 7, src/js/booking/interact) -------------------

/** A court booked on this visit keeps its floodlights on, like a court with a rally on it. */
/** Round 9 (row 10, fun/surface-peek.js): light one court while its surface filter is hovered (null: none). */
export function peekCourt(id) {
  const prev = [...peeked];
  peeked.clear();
  if (id) peeked.add(id);
  prev.filter((p) => p !== id).forEach((p) => setLit(p, isLit(p)));
  if (id) setLit(id, isLit(id));
}

export function highlightBooked(id) {
  alwaysLit.add(id);
  setLit(id, true);
}

/** Screen rectangle of a court's apron in the current view (the coach card pins itself to it). */
export function courtScreenRect(id) {
  const b = courtBox(id);
  const pts = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ]].map(([x, z]) => rig.screenOf(x, z));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** Redraws the view and hands over the canvas in the same task, while its drawing buffer still holds the frame (postcard). */
export function captureFrame(use) {
  if (stillDone) post.life(stillAmount);
  else post.motion();
  return use(canvas);
}

/** Ground rectangle of a court (its apron), read from the model. */
function courtBox(id) {
  const obj = overlays.get(id) || courtRoots.get(id);
  if (obj) {
    const b = new THREE.Box3().setFromObject(obj);
    return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
  }
  const c = COURTS.find((court) => court.id === id);
  return { minX: c.x - 8.5, maxX: c.x + 8.5, minZ: c.z - 17.5, maxZ: c.z + 17.5 };
}

/** Centre and playing-surface height of a court, for the rallies on the map. */
function courtSurface(id) {
  const plane = overlays.get(id);
  if (!plane) return null;
  const { x, z } = courtCenter(id);
  return { id, x, z, y: new THREE.Box3().setFromObject(plane).max.y };
}

/** Ground centre of a court. */
export function courtCenter(id) {
  const b = courtBox(id);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** Bring one court into view, centred in the screen area not covered by `inset`. */
export function focusCourt(id, inset, pad = 1.45, duration) {
  rig.frame(courtBox(id), { inset, pad, duration });
}

/** Ground rectangle around a set of courts. */
function courtsBox(courts) {
  const boxes = courts.map((c) => courtBox(c.id));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

/** Frame a set of courts. */
export function frameCourts(courts, inset, duration) {
  if (!courts.length) return;
  rig.frame(courtsBox(courts), { inset, pad: 1.08, duration });
}

/** Round 10 (booking/club): DOM marks pinned to the ground follow the view; `frameGround` flies to a box that is not a court (the café). */
export const onViewChange = (fn) => rig.onChange(fn);
export const groundToScreen = (x, z) => rig.screenOf(x, z);
export const isFlying = () => !!rig.flying?.();
export const frameGround = (box, duration, inset) => rig.frame(box, { inset, pad: 1.3, duration });

/** Round 8 (intro.js): the first visit opens with a flight over the club, settling where frameCourts(COURTS) would; null when it doesn't play. */
export function introFlight() {
  return createIntroFlight(rig, rig.frame(courtsBox(COURTS), { pad: 1.08, dry: true }));
}

/** Current camera view, to come back to after a court has been opened. */
export function saveView() {
  const { x, z, dist } = rig.state;
  return { x, z, dist };
}

/** Pull back out to a saved view. */
export function restoreView(view, duration = 1.6) {
  rig.flyTo(view, { duration });
}

/** Opening shot: start high over the whole grounds (the page then settles onto the courts). */
export function introCamera() {
  rig.frame({ minX: -40, maxX: 110, minZ: -60, maxZ: 85 }, { pad: 1.05, duration: 0 });
}

// --- Picking ---------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.name.slice(0, -3) : null;
}

// Something alive under the pointer (the cat) wins over the court it stands on.
let lifeHover = null;
function setLifeHover(kind) {
  if (kind === lifeHover) return;
  lifeHover = kind;
  canvas.style.cursor = kind ? 'pointer' : '';
  sceneEvents.onLifeHover?.(kind);
  if (kind) cursor().setLabel(life.label(kind));
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const alive = life?.pick(e.clientX, e.clientY) ?? null;
  if (alive) {
    setHover(null);
    if (!lifeHover) sceneEvents.onHover?.(null, e);
    setLifeHover(alive);
    return;
  }
  setLifeHover(null);
  const id = pickAt(e.clientX, e.clientY);
  setHover(id);
  sceneEvents.onHover?.(id, e);
});
canvas.addEventListener('pointerleave', () => { setLifeHover(null); setHover(null); sceneEvents.onHover?.(null); });

canvas.addEventListener('click', (e) => {
  if (rig.wasDrag()) return;
  // Touch has no hover: a tap near the cat counts too.
  if (life?.click(e.clientX, e.clientY, e.pointerType !== 'mouse')) {
    setLifeHover(null);
    sceneEvents.onHover?.(null, e);
    return;
  }
  const id = pickAt(e.clientX, e.clientY);
  if (id) sceneEvents.onSelect?.(id);
});

// --- Render loop -----------------------------------------------------------------

// Draw only when something changes; an idle map costs nothing.
// While the camera moves, frames are plain forward renders of everything. Once the view has been
// still for a moment, the effect stack (AO, bloom, grade) fades in over a few frames on a baked
// copy of the static world. From then on only the life layer (wind in the trees, birds, a car on
// the move, players, the cat) is redrawn over that cached frame, at LIFE_HZ: a fraction of a full
// frame. Anything that changes the static picture (hover light, overlays, a car parking) re-bakes.
const STILL_DELAY = 0.15; // s of stillness before effects come back
const STILL_FADE = 0.3;
const LIFE_HZ = 60; // players, the cat and cars move at the display rate (row 132)
let lastView = '';
let forceFrames = 2;
let stillSince = 0;
let stillDone = true;
let stillAmount = 1;
let lastLife = -1;

// Resolution follows frame time while moving: drop when frames run long, climb back when smooth.
// Big and Retina screens are capped by a pixel budget, not just by DPR: a 27" display at 1.5×
// would push 3–4× the pixels of a laptop for no visible gain on a moving map.
const PIXEL_BUDGET = 3.2e6;
const res = { ema: 16, slow: 0, fast: 0, wait: 0, moving: false };
function resolutionRange() {
  const fit = Math.sqrt(PIXEL_BUDGET / (innerWidth * innerHeight));
  res.max = Math.max(0.75, Math.min(window.devicePixelRatio, 1.5, fit));
  res.min = Math.min(res.max, Math.max(0.75, res.max * 0.7));
}
resolutionRange();
res.cur = res.max;
renderer.setPixelRatio(res.cur);
window.addEventListener('resize', () => {
  resolutionRange();
  res.cur = Math.min(Math.max(res.cur, res.min), res.max);
  renderer.setPixelRatio(res.cur);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize();
});
function adaptResolution(deltaMs) {
  if (!res.moving) { res.moving = true; return; } // the first frame after a pause has a stale delta
  res.ema += (Math.min(deltaMs, 100) - res.ema) * 0.15;
  if (res.wait > 0) { res.wait--; return; }
  res.slow = res.ema > 20 ? res.slow + 1 : 0;
  res.fast = res.ema < 13 ? res.fast + 1 : 0;
  let next = res.cur;
  if (res.slow > 6 && res.cur > res.min) next = Math.max(res.min, res.cur - 0.2);
  else if (res.fast > 120 && res.cur < res.max) next = Math.min(res.max, res.cur + 0.2);
  if (next === res.cur) return;
  res.cur = next;
  res.slow = res.fast = 0;
  res.wait = 30;
  renderer.setPixelRatio(next);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize();
}

window.addEventListener('resize', () => { forceFrames = 2; });

function bake(amount) {
  if (shadowsPending) drawShadowsNow();
  post.bake(amount);
  if (shadowsPending) shadowsDrawn();
  post.life(amount);
  stillAmount = amount;
}

gsap.ticker.add((time, deltaMs) => {
  const alive = life?.tick(time, deltaMs / 1000) ?? false;
  const s = rig.state;
  const view = `${s.x.toFixed(3)}|${s.z.toFixed(3)}|${s.dist.toFixed(3)}|${innerWidth}x${innerHeight}`;
  if (view !== lastView || forceFrames > 0) {
    lastView = view;
    forceFrames--;
    stillSince = time;
    stillDone = false;
    adaptResolution(deltaMs);
    if (shadowsPending) drawShadowsNow();
    post.motion();
    if (shadowsPending) shadowsDrawn();
    return;
  }
  res.moving = false;
  // Hover fades, lights, the foliage cut and parking cars change the static picture: re-bake it
  // with whatever effects are already on, so the bloom of the bulbs never blinks out.
  const fading = gsap.isTweening(cut.value) || [...glow.values()].some((g) => gsap.isTweening(g))
    || [...pools.values()].some((m) => gsap.isTweening(m.userData.level))
    || [...overlays.values()].some((m) => gsap.isTweening(m.material) || gsap.isTweening(m.material.color));
  const dirty = fading || shadowsPending || (life?.takeStaticChange() ?? false);
  if (!stillDone) {
    if (!post.hasStill) { bake(1); stillDone = true; return; }
    const t = (time - stillSince - STILL_DELAY) / STILL_FADE;
    if (t < 0) { if (dirty || alive) post.motion(); return; }
    bake(1 - (1 - Math.min(1, t)) ** 2);
    stillDone = t >= 1;
    lastLife = time;
    return;
  }
  if (dirty) { bake(stillAmount); lastLife = time; return; }
  if (alive && time - lastLife >= 1 / LIFE_HZ - 0.004) {
    lastLife = time;
    post.life(stillAmount);
  }
});

// Dev-only hooks for the headless checks (stripped from production builds).
if (import.meta.env.DEV) {
  window.__bp = {
    view: () => ({ x: rig.state.x, z: rig.state.z, dist: rig.state.dist }),
    screenOf(id) {
      const { x, z } = courtCenter(id);
      return rig.screenOf(x, z);
    },
    groundAt: (x, y) => rig.groundAt(x, y),
    rigScreen: (x, z) => rig.screenOf(x, z),
    fly: (x, z, dist) => rig.flyTo({ x, z, dist }, { duration: 0 }),
    center: (id) => courtBox(id),
    scene, renderer, post, camera,
    rig, // round 8: rig.cinematic for the intro flight checks
    lamps: () => lampBatches.map((b) => ({ n: b.courts.length, courts: [...new Set(b.courts.flat())].length, first: b.courts.slice(0, 6) })),
    bulbs: () => { const out = []; scene.traverse((o) => { if (o.isMesh && [o.material].flat().some((m) => m.name === 'mat_stadium_light')) out.push({ name: o.name, inst: !!o.isInstancedMesh, count: o.count, verts: o.geometry.attributes.position.count, glow: !!o.geometry.attributes.aGlow }); }); return out; },
    // GPU-synchronised cost of a frame: render n times, forcing completion with a 1px readback.
    bench(n = 40, fn = () => { post.bake(1); post.life(1); }, wiggle = true) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      if (!wiggle) post.bake(1);
      fn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        if (wiggle) {
          camera.position.x += (i % 2 ? -1 : 1) * 0.05;
          camera.updateMatrixWorld();
        }
        fn();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      forceFrames = 2;
      return +((performance.now() - t0) / n).toFixed(2);
    },
    benchPlain(n = 40) { return this.bench(n, () => post.motion()); },
    benchStill(n = 40) { return this.bench(n, () => { post.bake(1); post.life(1); }); },
    // A still-camera frame with ambient life: cached world + life layer + output.
    benchLife(n = 40) { return this.bench(n, () => post.life(1), false); },
    life: () => life?.debug(),
    lit: (id, on) => setLit(id, on),
    pools: () => [...pools].map(([id, p]) => [id, +p.userData.level.v.toFixed(2), p.visible]),
    lifeDev: () => life?.dev,
    info: () => {
      renderer.info.autoReset = false;
      renderer.info.reset();
      renderer.render(scene, camera); // beauty pass only, without post
      const r = { ...renderer.info.render, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
      renderer.info.autoReset = true;
      forceFrames = 2;
      return r;
    },
  };
}
