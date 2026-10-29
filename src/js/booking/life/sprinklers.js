import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { clubHours, liveSunDir } from './clock.js';
import { onWeather } from './sky.js';

// Morning sprinklers (round 7, "clublife"): early in the Miami morning (06:00 to 08:30 on the map's
// clock, or ?sprinklers=1) the pop-up rotors on the two grass courts and the lawn strip beside them
// water the grass. Each head throws a jet ~11 m on a ballistic arc that breaks up into drops and
// drifting mist, its nozzle sweeping slowly to and fro over its arc (corner heads a quarter circle,
// edge heads a half, the middle one all round). Where the water lands the grass darkens in patches
// that grow while they run and dry slowly after. When the sun is behind the camera the mist shows a
// faint rainbow: every mist drop is coloured by its angle from the antisolar point, so the bow
// appears exactly where it would (a ring at ~42°), and only where there is mist to carry it.
//
// The spray is one Points mesh whose vertex shader flies every drop from its head (no CPU work per
// drop); wet patches are one disc per head. All on the life layer.

const ON = [6, 8.5]; // Miami hours
const RANGE = 11; // m of throw
const LIFE = 1.7; // s a drop flies
const PER_HEAD = 720; // drops per head (a fifth of them mist)
const WET_IN = 150; // s to soak
const DRY = 600; // s to dry again

/** Heads: [x, z, aim (rad, 0 = +z), half arc (rad; π = full circle), sweep period s]. */
function heads(root) {
  const out = [];
  const a = root.getObjectByName('grass-1_apron');
  const b = root.getObjectByName('grass-2_apron');
  if (!a || !b) return { list: out, y: 0.1 };
  const box = new THREE.Box3().setFromObject(a).union(new THREE.Box3().setFromObject(b));
  const y = box.max.y;
  const x0 = box.min.x + 1.2;
  const x1 = box.max.x - 1.2;
  const xm = (x0 + x1) / 2;
  const z0 = box.min.z + 1.0;
  const z1 = box.max.z - 1.0;
  const zm = (box.min.z + box.max.z) / 2;
  const Q = Math.PI / 4;
  const H = Math.PI / 2;
  // Corners: a quarter circle into the courts. Aim = direction of the middle of the arc.
  out.push([x0, z0, Math.atan2(1, 1), Q, 26], [x1, z0, Math.atan2(-1, 1), Q, 24], [x0, z1, Math.atan2(1, -1), Q, 25], [x1, z1, Math.atan2(-1, -1), Q, 27]);
  // Edges: half circles; the middle of the enclosure: all round.
  out.push([xm, z0, 0, H, 34], [xm, z1, Math.PI, H, 33], [x0, zm, Math.PI / 2, H, 31], [x1, zm, -Math.PI / 2, H, 32], [xm, zm, 0, Math.PI, 40]);
  // The lawn strip outside the west fence: narrow arcs along it.
  out.push([box.min.x - 2.6, zm - 4, Math.PI, 0.5, 18], [box.min.x - 2.6, zm + 4, 0, 0.5, 19]);
  return { list: out, y };
}

const SPRAY_VERT = /* glsl */`
  uniform float uTime;
  uniform float uOn;      // 0..1: heads coming up to pressure / shutting off
  uniform float uScale;   // px per metre at unit depth
  uniform float uGround;
  attribute vec4 aHead;   // x, z, aim, half arc
  attribute vec4 aSeed;   // phase, speed factor, spread, kind (0 drop, 1 mist)
  attribute vec2 aRot;    // sweep period, sweep phase
  varying float vAlpha;
  varying float vKind;
  varying vec3 vWorld;
`;

function sprayMaterial(uniforms) {
  const m = new THREE.PointsMaterial({ color: 0xffffff, transparent: true, depthWrite: false, sizeAttenuation: false, size: 1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SPRAY_VERT}`)
      .replace('#include <begin_vertex>', `
        float age = fract(uTime / ${LIFE.toFixed(2)} + aSeed.x) * ${LIFE.toFixed(2)};
        float te = uTime - age; // when this drop left the nozzle
        float sw = fract(te / aRot.x + aRot.y);
        float ang = aHead.w > 3.0
          ? aHead.z + sw * 6.2832
          : aHead.z + aHead.w * (2.0 * abs(sw * 2.0 - 1.0) - 1.0); // to and fro over the arc
        vec2 dir = vec2(sin(ang), cos(ang));
        vec2 side = vec2(dir.y, -dir.x);
        float mist = aSeed.w;
        float el = 0.4 + (aSeed.z - 0.5) * 0.12;
        float v = ${(Math.sqrt((RANGE * 9.81) / Math.sin(0.8)) * 1.1).toFixed(2)} * aSeed.y;
        float k = mix(0.25, 1.6, mist) + aSeed.z * 0.3; // drag: mist slows and drifts
        float h = v * cos(el) * (1.0 - exp(-k * age)) / k;
        float y = 0.12 + v * sin(el) * (1.0 - exp(-k * age)) / k - mix(4.9, 1.2, mist) * age * age;
        float spread = (aSeed.z - 0.5) * age * mix(0.9, 2.4, mist) + (aSeed.y - 1.0) * 3.0 * mist;
        vec3 transformed = vec3(aHead.x + dir.x * h + side.x * spread, uGround + max(y, 0.0), aHead.y + dir.y * h + side.y * spread);
        vAlpha = uOn * step(0.0, y) * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(${(LIFE * 0.75).toFixed(2)}, ${LIFE.toFixed(2)}, age));
        vAlpha *= mist > 0.5 ? 0.13 : 0.42;
        // the jet is still a solid stream for its first metres
        vAlpha *= mist > 0.5 ? smoothstep(2.0, 6.0, h) : 1.0;
        vKind = mist;
        vWorld = transformed;`)
      .replace('gl_PointSize = size;', 'gl_PointSize = max(1.5, (mist > 0.5 ? 0.6 : 0.11) * uScale / -mvPosition.z);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSun;
        uniform float uBow;
        varying float vAlpha;
        varying float vKind;
        varying vec3 vWorld;
        vec3 bpSpectrum(float t) { // 0 violet … 1 red
          return clamp(vec3(abs(t * 6.0 - 3.0) - 1.0, 2.0 - abs(t * 6.0 - 2.0), 2.0 - abs(t * 6.0 - 4.0)), 0.0, 1.0).bgr;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 pc = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(pc, pc);
        if (r2 > 1.0) discard;
        float soft = vKind > 0.5 ? exp(-r2 * 2.5) : 1.0 - r2 * r2;
        diffuseColor.rgb = vec3(0.86, 0.9, 0.94);
        diffuseColor.a = vAlpha * soft;
        // Rainbow: angle between this drop and the antisolar point, as seen from the camera.
        vec3 view = normalize(vWorld - cameraPosition);
        vec3 anti = -normalize(uSun);
        float deg = degrees(acos(clamp(dot(view, anti), -1.0, 1.0)));
        float t = (deg - 40.4) / 2.0;
        float band = smoothstep(-0.15, 0.1, t) * (1.0 - smoothstep(0.9, 1.15, t));
        float bow = band * uBow * step(0.5, vKind) * step(0.03, uSun.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, bpSpectrum(clamp(t, 0.0, 1.0)) * 1.1, bow * 0.85);
        diffuseColor.a *= 1.0 + bow * 1.6;`)
      .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\n#include <dithering_fragment>');
  };
  m.customProgramCacheKey = () => 'life-sprinkler-spray';
  return gradeLife(m);
}

function wetMaterial(uniforms, aim, half) {
  // Multiplied over the frame (a darker, greener grass), not painted on: the night balance and the
  // tone curve would lift a painted dark colour. Untouched by the grade for the same reason.
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = uniforms.uWet;
    shader.uniforms.uAim = { value: aim };
    shader.uniforms.uHalf = { value: half };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWet;
        uniform float uAim;
        uniform float uHalf;
        varying vec2 vLocal;
        float bpNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
          float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
          float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
          float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float r = length(vLocal) / ${RANGE.toFixed(1)};
        float a = atan(vLocal.x, vLocal.y) - uAim;
        a = atan(sin(a), cos(a));
        float arc = uHalf > 3.0 ? 1.0 : 1.0 - smoothstep(uHalf - 0.08, uHalf + 0.12, abs(a));
        // The watered area darkens as a whole, its edge ragged where the throw varies; inside it a
        // faint unevenness (the grass takes water up unevenly), never blotches.
        float n = bpNoise(vLocal * 0.45) * 0.65 + bpNoise(vLocal * 1.7) * 0.35;
        float rn = r + (n - 0.5) * 0.16;
        float cover = smoothstep(1.04, 0.9, rn) * smoothstep(0.03, 0.2, r) * arc;
        float wet = cover * smoothstep(0.0, 1.0, uWet * 1.4 - (1.0 - rn) * 0.4) * (0.82 + 0.18 * n);
        diffuseColor.rgb = mix(vec3(1.0), vec3(0.6, 0.68, 0.56), wet);
        diffuseColor.a = 1.0;`);
  };
  m.customProgramCacheKey = () => 'life-sprinkler-wet';
  return m;
}

/**
 * The rainbow: the mist hanging over a head's throw as a thin layer ~1.2 m up; each pixel of it
 * takes the colour of its angle from the antisolar point (primary bow 40.5°–42.5°, red outside),
 * thinned by where the mist is (the outer part of the throw, drifting), so the bow shows only as
 * arcs where the ring crosses the spray.
 */
function bowMaterial(uniforms, aim, half) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSun: uniforms.uSun, uOn: uniforms.uOn, uTime: uniforms.uTime, uAim: { value: aim }, uHalf: { value: half } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying vec2 vL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;\nvL = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSun;
        uniform float uOn;
        uniform float uTime;
        uniform float uAim;
        uniform float uHalf;
        varying vec3 vW;
        varying vec2 vL;
        float bpN(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
          float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
          float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
          float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 view = normalize(vW - cameraPosition);
        float deg = degrees(acos(clamp(dot(view, -normalize(uSun)), -1.0, 1.0)));
        float t = (deg - 40.5) / 2.0; // 0 violet … 1 red
        float band = smoothstep(-0.2, 0.15, t) * (1.0 - smoothstep(0.85, 1.2, t));
        float r = length(vL) / ${RANGE.toFixed(1)};
        float a = atan(vL.x, vL.y) - uAim;
        a = atan(sin(a), cos(a));
        float arc = uHalf > 3.0 ? 1.0 : 1.0 - smoothstep(uHalf - 0.1, uHalf + 0.2, abs(a));
        float mist = smoothstep(0.25, 0.6, r) * (1.0 - smoothstep(0.85, 1.05, r)) * arc;
        mist *= 0.55 + 0.45 * bpN(vL * 0.8 + vec2(uTime * 0.25, uTime * 0.1));
        vec3 spec = clamp(vec3(abs(t * 6.0 - 3.0) - 1.0, 2.0 - abs(t * 6.0 - 2.0), 2.0 - abs(t * 6.0 - 4.0)), 0.0, 1.0).bgr;
        diffuseColor.rgb = spec * 1.2;
        diffuseColor.a = band * mist * uOn * 0.22 * step(0.03, normalize(uSun).y);`);
  };
  m.customProgramCacheKey = () => 'life-sprinkler-bow';
  return gradeLife(m);
}

export function createSprinklers(ctx, { still }) {
  const { scene, root, renderer, camera } = ctx;
  const { list, y } = heads(root);
  if (!list.length) return null;
  const preview = new URLSearchParams(location.search).get('sprinklers') === '1';
  const sun = liveSunDir(ctx);
  const uniforms = {
    uTime: { value: 0 },
    uOn: { value: 0 },
    uScale: { value: 600 },
    uGround: { value: y },
    uSun: { value: sun.dir },
    uBow: { value: 1 },
    uWet: { value: 0 },
  };

  // Spray: PER_HEAD drops for every head.
  const n = list.length * PER_HEAD;
  const pos = new Float32Array(n * 3);
  const head = new Float32Array(n * 4);
  const seed = new Float32Array(n * 4);
  const rot = new Float32Array(n * 2);
  list.forEach(([x, z, aim, half, period], h) => {
    const phase = Math.random();
    for (let i = 0; i < PER_HEAD; i++) {
      const k = h * PER_HEAD + i;
      pos.set([x, y, z], k * 3);
      head.set([x, z, aim, half], k * 4);
      const mist = i % 5 === 0 ? 1 : 0;
      seed.set([Math.random(), 0.8 + Math.random() * 0.25, Math.random(), mist], k * 4);
      rot.set([period, phase], k * 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aHead', new THREE.BufferAttribute(head, 4));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 2));
  const spray = new THREE.Points(geo, sprayMaterial(uniforms));
  spray.name = 'life_sprinkler_spray';
  spray.renderOrder = 3;

  // Wet patches: a disc per head.
  const disc = new THREE.RingGeometry(RANGE * 0.1, RANGE * 1.06, 48, 1).rotateX(-Math.PI / 2);
  const wet = new THREE.Group();
  wet.name = 'life_sprinkler_wet';
  list.forEach(([x, z, aim, half]) => {
    const m = new THREE.Mesh(disc, wetMaterial(uniforms, aim, half));
    m.position.set(x, y + 0.012, z);
    m.renderOrder = 1;
    wet.add(m);
  });
  const bows = new THREE.Group();
  bows.name = 'life_sprinkler_bow';
  list.forEach(([x, z, aim, half]) => {
    const m = new THREE.Mesh(disc, bowMaterial(uniforms, aim, half));
    m.position.set(x, y + 1.2, z);
    m.renderOrder = 4;
    bows.add(m);
  });
  for (const o of [spray, wet, ...wet.children, bows, ...bows.children]) {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.userData.noAO = true;
  }
  spray.visible = false;
  wet.visible = false;
  bows.visible = false;
  scene.add(wet, spray, bows);

  // A head's bow layer is drawn only when the bow ring can cross its throw from where the camera is.
  let bowCheck = 0;
  const probe = new THREE.Vector3();
  const anti = new THREE.Vector3();
  function cullBows(t) {
    bowCheck = t + 0.25;
    anti.copy(sun.dir).normalize().negate();
    const up = sun.dir.y > 0.03;
    bows.children.forEach((m, i) => {
      let near = false;
      if (up) {
        for (let k = 0; k < 12 && !near; k++) {
          const a = (k / 12) * Math.PI * 2;
          const r = (k % 2 ? 0.45 : 0.85) * RANGE;
          probe.set(m.position.x + Math.sin(a) * r, m.position.y, m.position.z + Math.cos(a) * r).sub(camera.position).normalize();
          const deg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(probe.dot(anti), -1, 1)));
          near = deg > 36 && deg < 47;
        }
      }
      m.visible = near;
    });
  }

  let forced = preview ? true : null; // dev / preview override
  let raining = false; // nobody waters in the rain, real or clicked (row 176): beats every override
  onWeather((w) => {
    const was = raining;
    raining = (w.rain ?? 0) > 0;
    if (was && !raining && w.manual) wetness = 0; // a click to sun: the rain-soaked grass is dry at once
  });
  let on = 0; // pressure 0..1
  let wetness = 0;
  let last = performance.now() / 1000;
  const size = new THREE.Vector2();
  return {
    name: 'sprinklers',
    tick() {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      const h = clubHours();
      const want = !raining && (forced ?? (h >= ON[0] && h < ON[1]));
      on = THREE.MathUtils.clamp(on + (want ? dt / 2.5 : -dt / 1.5), 0, 1);
      wetness = THREE.MathUtils.clamp(wetness + (want ? dt / WET_IN : -dt / DRY), 0, 1);
      if (!want && on === 0 && wetness === 0) {
        spray.visible = wet.visible = bows.visible = false;
        return false;
      }
      sun.update();
      renderer.getDrawingBufferSize(size);
      uniforms.uScale.value = (size.y / 2) * camera.projectionMatrix.elements[5];
      uniforms.uTime.value = still ? 0.6 : t;
      uniforms.uOn.value = on;
      uniforms.uWet.value = wetness;
      spray.visible = bows.visible = on > 0;
      if (on > 0 && t > bowCheck) cullBows(t);
      wet.visible = wetness > 0;
      return on > 0 && !still;
    },
    debug: () => ({ heads: list.length, on: +on.toFixed(2), wet: +wetness.toFixed(2), forced }),
    /** Dev: true / false forces them, null follows the clock; `soak` 0..1 sets the wet patches. */
    set(v = true, soak) {
      forced = v;
      if (soak != null) wetness = soak;
      if (v) on = Math.max(on, 0.99);
    },
  };
}
