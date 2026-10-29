import * as THREE from 'three';
import { LIFE_LAYER, lifeTime } from './shared.js';
import { liveSunDir } from './clock.js';
import { onWeather, weatherSky } from './sky.js';
import { windForce } from './wind.js';
import { gradeLife } from '../lookdev.js';

// The club flag (round 8, "arrival"): a white flagpole by the clubhouse entrance with a plain
// flag in the club colours (Malibu Sun with a Rich Red band, no text, no logo) that streams in the
// real Miami wind from the weather (`bp-weather` windDir, speed in mph): hanging limp in a calm,
// lifting and rippling in a breeze, streaming and snapping at the fly end in a strong wind or a
// storm. The cloth is shaped in its vertex shader on the life layer, with a faint shadow laid
// along the sun on the ground; the pole is static geometry, added once (one re-bake and one
// shadow-map redraw). Reduced motion: the flag holds its shape for the current wind, no ripples.

// On the lawn corner by the clubhouse entrance (door x ≈ 9, palm planters at x ≈ 6 and 12): clear of
// the paving, the planters, the benches and the floodlight masts (raycast + screenshot checks, round 8).
export const FLAG_SPOT = { x: 12.8, z: -47.4 };

const POLE = 8.6; // m
const L = 2.4; // fly length, m (5 × 8 ft)
const H = 1.5;
const SEG = [28, 12];
const CREAM = new THREE.Color('#FFF3DA'); // Malibu Sun field, Rich Red band across the middle third
const RED = new THREE.Color('#9C441F');

// Cloth: p.x 0…L along the fly from the hoist, p.y 0…−H down from the top edge.
const FLAG_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uWind;  // 0 calm … 1 streaming
  uniform float uPhase; // wave phase, integrated on the CPU (speed follows the wind)
  uniform float uMove;  // 0 with reduced motion
  vec3 flagShape(vec2 p) {
    float u = p.x / ${L.toFixed(2)};
    float w = uWind;
    // Droop: a calm flag hangs nearly down the pole; the wind lifts it towards level. Sags more at the fly end.
    float droop = mix(1.32, 0.06, smoothstep(0.0, 1.0, w)) * (0.82 + 0.3 * u);
    vec3 q = vec3(p.x * cos(droop), p.y - p.x * sin(droop), 0.0);
    // Ripples run from the hoist to the fly: longer and slower in a breeze, short and quick in a gale.
    float k = 6.2832 / mix(2.6, 1.15, w);
    float ph = uPhase * uMove;
    float amp = mix(0.06, 0.2, w) * (0.15 + 0.85 * u);
    float wave = sin(k * p.x - ph) + 0.4 * sin(2.2 * k * p.x - ph * 1.6 + p.y * 2.4);
    q.z = amp * wave;
    q.x -= abs(wave) * amp * 0.25 * u; // a rippled cloth reaches a little less far
    // Calm: soft vertical folds that sway slowly.
    q.z += (1.0 - w) * 0.1 * sin(p.x * 6.0 + uTime * 0.7 * uMove) * u;
    // Gale: the fly end snaps.
    q.z += w * w * 0.07 * sin(uTime * 24.0 * uMove + p.y * 8.0 + p.x * 3.0) * smoothstep(0.6, 1.0, u);
    return q;
  }
`;

function flagGeometry() {
  return new THREE.PlaneGeometry(L, H, ...SEG).translate(L / 2, -H / 2, 0);
}

/** Three stripes, cream / red / cream, crisp at any distance (nearest filtering along v). */
function bandTexture() {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 3;
  const g = c.getContext('2d');
  [CREAM, RED, CREAM].forEach((col, i) => { g.fillStyle = `#${col.getHexString()}`; g.fillRect(0, i, 1, 1); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function clothMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLAG_GLSL}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 fp0 = flagShape(position.xy);
        vec3 fdx = flagShape(position.xy + vec2(0.03, 0.0)) - fp0;
        vec3 fdy = flagShape(position.xy + vec2(0.0, 0.03)) - fp0;
        vec3 objectNormal = normalize(cross(fdx, fdy));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = fp0;');
  };
  m.customProgramCacheKey = () => 'life-flag';
  return gradeLife(m);
}

function shadowMaterial(u, sunDir, ground) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, { uSun: { value: sunDir }, uGround: { value: ground } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLAG_GLSL}\nuniform vec3 uSun;\nuniform float uGround;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = flagShape(position.xy);')
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        wp.xyz -= uSun * ((wp.y - uGround) / max(uSun.y, 0.15));
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'life-flag-shadow';
  return m;
}

/**
 * The pole's shadow: a ribbon turned square to the sun and laid along it on the ground. A 10 cm
 * pole is about one texel of the club's shadow map, which blurs it away; this keeps it crisp.
 */
function poleShadow(sunDir, ground) {
  const g = new THREE.PlaneGeometry(1, POLE, 1, 1).translate(0, POLE / 2, 0);
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSun: { value: sunDir }, uGround: { value: ground } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSun;\nuniform float uGround;')
      .replace('#include <begin_vertex>', `
        vec3 side = normalize(vec3(-uSun.z, 0.0, uSun.x) + vec3(1e-4, 0.0, 0.0));
        float h = position.y / ${POLE.toFixed(1)};
        vec3 transformed = vec3(0.0, position.y, 0.0) + side * position.x * mix(0.13, 0.08, h);`)
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        wp.xyz -= uSun * ((wp.y - uGround) / max(uSun.y, 0.15));
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'flagpole-shadow';
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'flagpole_shadow';
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  return mesh;
}

function poleMesh() {
  const metal = new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.38, metalness: 0.55 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.95 });
  const g = new THREE.Group();
  g.name = 'flagpole';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, POLE, 14).translate(0, POLE / 2, 0), metal);
  const truck = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10).translate(0, POLE + 0.06, 0), metal);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 20).translate(0, 0.08, 0), concrete);
  for (const m of [shaft, truck, base]) { m.castShadow = m !== shaft; m.receiveShadow = true; g.add(m); }
  return g;
}

/** mph → 0…1 how far the flag streams (a flag lifts from ~4 mph, streams by ~22). */
const streamOf = (mph, storm) => Math.max(storm ? 0.9 : 0, Math.min(1, Math.max(0, (mph - 2.5) / 20)) ** 0.75);

export function createFlag(ctx, { still }) {
  const { scene, root } = ctx;
  const spot = FLAG_SPOT;

  // Ground height at the foot of the pole (paths and lawn are not quite at 0).
  const ray = new THREE.Raycaster(new THREE.Vector3(spot.x, 40, spot.z), new THREE.Vector3(0, -1, 0), 0, 80);
  const hit = root ? ray.intersectObject(root, true).find((h) => h.object.visible) : null;
  const y0 = hit ? hit.point.y : 0;

  const sun = liveSunDir(ctx);
  sun.update();
  const pole = poleMesh();
  pole.position.set(spot.x, y0, spot.z);
  const poleShade = poleShadow(sun.dir, y0 + 0.03);
  poleShade.position.copy(pole.position);
  scene.add(pole, poleShade);
  pole.updateMatrixWorld(true);
  let staticDirty = true; // the pole joins the cached frame once
  ctx.refreshShadows?.();
  let sunKey = '';

  const u = {
    uTime: lifeTime,
    uWind: { value: 0.3 },
    uPhase: { value: 0 },
    uMove: { value: still ? 0 : 1 },
  };
  const geo = flagGeometry();
  const cloth = new THREE.Mesh(geo, clothMaterial(u));
  const shadow = new THREE.Mesh(geo, shadowMaterial(u, sun.dir, y0 + 0.04));
  const flag = new THREE.Group();
  flag.name = 'life_flag';
  flag.position.set(spot.x, y0 + POLE - 0.22, spot.z);
  for (const m of [cloth, shadow]) {
    m.layers.set(LIFE_LAYER);
    m.frustumCulled = false;
    m.userData.noAO = true;
    flag.add(m);
  }
  cloth.name = 'life_flag_cloth';
  shadow.name = 'life_flag_shadow';
  shadow.renderOrder = 1;
  scene.add(flag);

  // Wind: the weather's speed and direction (where it comes from, degrees), defaults to the trade wind.
  const want = { stream: streamOf(9, false), yaw: 0 };
  let yaw = null;
  const yawFor = (from) => {
    const to = THREE.MathUtils.degToRad(from + 180); // x east, z south
    return Math.PI / 2 - to; // rotation.y that turns the fly (+x) to (sin to, 0, −cos to)
  };
  want.yaw = yawFor(110);
  let storm = false;
  onWeather((d) => {
    storm = (d.code ?? 0) >= 95;
    want.stream = streamOf(d.wind ?? 9, storm);
    if (typeof d.windDir === 'number') want.yaw = yawFor(d.windDir);
  });

  let wind = want.stream;
  let lastShape = '';

  return {
    name: 'flag',
    tick(t, dt) {
      const step = Math.min(dt || 0.016, 0.1);
      sun.update();
      const k = `${sun.dir.x.toFixed(3)}|${sun.dir.z.toFixed(3)}`;
      if (k !== sunKey) { sunKey = k; staticDirty = true; } // the pole's shadow turns with the sun (a few bands a day)
      poleShade.material.opacity = 0.36 * Math.min(1, (weatherSky.sun ?? 1) * 1.2) * (weatherSky.day ?? 1);
      poleShade.visible = poleShade.material.opacity > 0.01;
      shadow.material.opacity = 0.32 * Math.min(1, (weatherSky.sun ?? 1) * 1.2) * (weatherSky.day ?? 1);
      shadow.visible = shadow.material.opacity > 0.01;
      // Gusts: the speed breathes around the reported one; harder in rain and storms (wind.js).
      const gust = still ? 1 : 0.82 + 0.22 * Math.sin(t * 0.37) * Math.sin(t * 0.61 + 1.3) + 0.12 * Math.sin(t * 1.7 + 0.4);
      const target = Math.min(1, want.stream * gust * (0.85 + 0.15 * windForce.value));
      wind += (target - wind) * Math.min(1, step * 1.5);
      u.uWind.value = wind;
      u.uPhase.value += step * (2.2 + 9 * wind);
      // The flag swings round with the wind; it wanders a little more when there is less of it.
      if (yaw === null) yaw = want.yaw;
      let d = want.yaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, step * 0.8);
      flag.rotation.y = yaw + (still ? 0 : Math.sin(t * 0.43) * Math.sin(t * 0.17 + 2) * (0.22 - 0.14 * wind));
      if (still) {
        const k = `${wind.toFixed(2)}|${flag.rotation.y.toFixed(2)}`;
        if (k !== lastShape) { lastShape = k; staticDirty = true; }
        return false;
      }
      return true;
    },
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    debug: () => ({ wind: +wind.toFixed(2), want: +want.stream.toFixed(2), yaw: +THREE.MathUtils.radToDeg(flag.rotation.y).toFixed(0), at: [spot.x, +y0.toFixed(2), spot.z] }),
    /** Dev: force a wind (mph, from degrees); no arguments: back to the weather. */
    set(mph, from) {
      if (mph == null) return;
      want.stream = streamOf(mph, storm);
      if (from != null) want.yaw = yawFor(from);
    },
  };
}
