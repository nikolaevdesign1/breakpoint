import * as THREE from 'three';
import { LIFE_LAYER, lifeTime, rng } from './shared.js';
import { weatherSky, skyLight, onWeather } from './sky.js';
import { puddleMaterial, waterUniforms, createReflections, puddleSeeds } from './water.js'; // round 8: puddles mirror the evening

// Rain over the club when it rains in Miami (row 151, weather from booking/weather.js).
// - Streaks: one mesh of thin quads living in a box around the view; the fall is computed in the
//   vertex shader from the shared life clock, so the CPU only moves the box with the camera.
// - Puddles: soft dark mirror patches on paths, aprons and the car park that fill in over the first
//   minute of rain (and dry out slowly after), with rings from drops hitting them.
// - The light goes overcast: weaker sun, a little more haze. That changes the cached static frame,
//   so it steps in a few quantised stages (takeStaticChange) rather than every frame.

const DROPS = { high: 2600, medium: 1600, low: 900 };
const STORM_DROPS = 1.6; // round 7: a thunderstorm draws this many times the streaks of heavy rain
const FALL = 11; // m/s
const STREAK = 0.9; // m
const BOX_H = 26; // m of air the streaks fall through
const PUDDLES = 64;
const WET_IN = 50; // s to fill the puddles
const WET_OUT = 150; // s to dry them (a click to sun dries them at once)
// A click on the weather widget (row 158) is a toy, not a forecast: the rain stops in a couple of
// seconds and the ground is dry at once (onWeather).
const CLICK = { fadeIn: 1.6, fadeOut: 1.2, wetIn: 14 };
const OVERCAST_STEPS = 6;

// Surfaces where water collects: footpaths, the car park and the court aprons.
const WET_SURFACE = /path|asphalt|parking|apron|hardcourt|chill/i;

function streakGeometry(count, random) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 4 * 3);
  const seed = new Float32Array(count * 4 * 4);
  const corner = new Float32Array(count * 4 * 2);
  const index = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [random(), random(), random(), random()];
    for (let k = 0; k < 4; k++) {
      seed.set(s, (i * 4 + k) * 4);
      corner.set([k % 2 ? 1 : -1, k < 2 ? 0 : 1], (i * 4 + k) * 2);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

function streakMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;   // x, z in the box, phase, visibility threshold
      attribute vec2 aCorner; // ±1 across, 0/1 along
      uniform float uTime, uAmount, uBox, uWindX, uWindZ, uLight;
      uniform vec3 uCentre;
      varying float vAlong, vFade;
      void main() {
        float h = mod(aSeed.z * ${BOX_H.toFixed(1)} - uTime * ${FALL.toFixed(1)}, ${BOX_H.toFixed(1)});
        vec3 p = uCentre + vec3((aSeed.x - 0.5) * uBox, h, (aSeed.y - 0.5) * uBox);
        vec3 dir = normalize(vec3(uWindX, -1.0, uWindZ));
        p += dir * (-aCorner.y * ${STREAK.toFixed(2)});
        vec4 view = viewMatrix * vec4(p, 1.0);
        view.x += aCorner.x * 0.012 * (1.0 + -view.z * 0.004); // a hair wide, a touch wider far away
        gl_Position = projectionMatrix * view;
        vAlong = aCorner.y;
        vFade = step(aSeed.w, uAmount) * smoothstep(0.0, 2.0, h) * smoothstep(${BOX_H.toFixed(1)}, ${(BOX_H - 4).toFixed(1)}, h);
      }`,
    fragmentShader: /* glsl */`
      uniform float uLight;
      varying float vAlong, vFade;
      void main() {
        if (vFade <= 0.0) discard;
        float a = vFade * 0.32 * (0.25 + 0.75 * vAlong);
        gl_FragColor = vec4(vec3(0.82, 0.86, 0.9) * uLight, a);
      }`,
  });
}

export function createRain({ scene, root, rig, camera, quality, renderer }, { still }) {
  const random = rng(20261014);
  const uniforms = {
    uTime: lifeTime, uAmount: { value: 0 }, uBox: { value: 60 }, uCentre: { value: new THREE.Vector3() },
    uWindX: { value: 0.08 }, uWindZ: { value: 0.04 }, uWet: { value: 0 }, uRain: { value: 0 }, uLight: skyLight,
    ...waterUniforms(),
  };

  // --- Streaks ---
  const streaks = new THREE.Mesh(streakGeometry(Math.round((DROPS[quality] ?? DROPS.medium) * STORM_DROPS), random), streakMaterial(uniforms));
  let heavy = 1 / STORM_DROPS; // share of the streaks drawn at full rain: all of them in a storm
  streaks.name = 'life_rain';
  streaks.frustumCulled = false;
  streaks.renderOrder = 5;
  streaks.visible = false;
  streaks.userData.noAO = true;
  streaks.layers.set(LIFE_LAYER);

  // --- Puddles: drop rays onto the model and keep the hits that land on paved surfaces ---
  const caster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && !/_hl|_pool/.test(o.name)) meshes.push(o); });
  const spots = [];
  const tryAt = (x, z) => {
    caster.set(new THREE.Vector3(x, 30, z), down);
    const hit = caster.intersectObjects(meshes, false)[0];
    if (!hit) return false;
    const mat = [hit.object.material].flat()[hit.face?.materialIndex ?? 0];
    if (!WET_SURFACE.test(hit.object.name) && !WET_SURFACE.test(mat?.name ?? '')) return false;
    if (hit.point.y > 0.4) return false; // roofs, tables
    spots.push([x, hit.point.y, z]);
    return true;
  };
  scene.add(streaks);
  let puddles = null; // built in the background (row 48): ~4000 rays against the model used to freeze the first seconds for 1.4 s
  let reflections = null;
  const buildPuddles = () => {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const shape = new Float32Array(Math.max(1, spots.length) * 4);
    const mesh = new THREE.InstancedMesh(quad, puddleMaterial(uniforms), Math.max(1, spots.length));
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, y, z], i) => {
      const size = 0.9 + random() * 2.4;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI);
      m4.compose(new THREE.Vector3(x, y + 0.012, z), q, new THREE.Vector3(size * (1 + random() * 0.8), 1, size));
      mesh.setMatrixAt(i, m4);
      shape.set([random(), 1 + random() * 0.6, 0, size], i * 4);
    });
    mesh.geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    mesh.count = spots.length;
    mesh.name = 'life_puddles';
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.userData.noAO = true;
    mesh.layers.set(LIFE_LAYER);
    mesh.computeBoundingSphere();
    scene.add(mesh);
    reflections = createReflections(scene, camera, mesh, uniforms);
    puddles = mesh;
    renderer?.compileAsync(scene, camera).catch(() => {}); // the first rain should not stall on shaders
  };
  // Round 8: first a few where lights will show in them (in front of masts and the clubhouse).
  // Then random spots; the same seeded sequence as ever, now a few rays per frame.
  const seeds = puddleSeeds(scene, random);
  let seeded = 0;
  let tries = 0;
  const search = () => {
    const end = performance.now() + 6;
    while (seeds.length) {
      if (tryAt(...seeds.shift())) seeded++;
      if (performance.now() > end) { requestAnimationFrame(search); return; }
    }
    while (tries < 4000 && spots.length < PUDDLES + seeded) {
      tryAt(-40 + random() * 150, -95 + random() * 175);
      tries++;
      if (performance.now() > end) { requestAnimationFrame(search); return; }
    }
    buildPuddles();
  };
  requestAnimationFrame(search);

  // --- Overcast light ---
  // Round 7: life/daylight.js composes it with the Miami clock (weaker sun, more haze, less sky).
  let overcastStep = 0;
  let staticDirty = false;
  function applyOvercast(step) {
    weatherSky.overcast = step / OVERCAST_STEPS;
    weatherSky.changed = true;
    staticDirty = true;
  }

  // --- State ---
  let target = 0; // rain intensity asked for by the weather
  let amount = 0;
  let wet = 0;
  let manual = false; // last change came from a click on the widget
  onWeather((detail) => { // round 7: also the weather announced before the rain system started
    target = detail.rain ?? 0;
    manual = !!detail.manual;
    if (manual && target === 0) wet = 0; // a click to sun wipes the ground at once: puddles, film, rim (the sky clears in a moment)
    const storm = (detail.code ?? 0) >= 95; // round 7: heavier, more slanted rain in a thunderstorm
    heavy = storm ? 1 : 1 / STORM_DROPS;
    const speed = Math.min(1, (detail.wind ?? 6) / 20) * (storm ? 2.2 : 1) + (storm ? 0.3 : 0);
    const a = THREE.MathUtils.degToRad((detail.windDir ?? 30) + 180); // where the wind blows to
    uniforms.uWindX.value = Math.sin(a) * 0.35 * speed;
    uniforms.uWindZ.value = -Math.cos(a) * 0.35 * speed;
  });

  return {
    name: 'rain',
    tick(t, dt) {
      if (target === 0 && amount === 0 && wet === 0) return false;
      const step = Math.min(dt, 0.1);
      const tau = target > amount ? (manual ? CLICK.fadeIn : 6) : (manual ? CLICK.fadeOut : 10);
      amount += (target - amount) * Math.min(1, step / tau);
      if (amount < 0.01 && target === 0) amount = 0;
      wet = target > 0
        ? Math.min(1, wet + step / (manual ? CLICK.wetIn : WET_IN) * (0.4 + target))
        : Math.max(0, wet - step / WET_OUT);

      const want = Math.round(Math.max(amount, target > 0 ? 1 : 0) * OVERCAST_STEPS * Math.min(1, amount * 3));
      if (want !== overcastStep) { overcastStep = want; applyOvercast(want); }

      const s = rig.state;
      uniforms.uCentre.value.set(s.x, 0, s.z);
      uniforms.uBox.value = Math.max(40, s.dist * 1.4);
      uniforms.uAmount.value = still ? 0 : amount * heavy;
      uniforms.uWet.value = wet;
      uniforms.uRain.value = still ? 0 : amount;
      streaks.visible = amount > 0.003 && !still;
      if (puddles) {
        puddles.visible = wet > 0.002;
        if (puddles.visible) reflections.update();
      }
      return streaks.visible || (!!puddles?.visible && amount > 0.003);
    },
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    debug: () => ({ target, amount: +amount.toFixed(2), wet: +wet.toFixed(2), puddles: puddles?.count ?? 0, overcast: overcastStep, mirror: reflections?.debug() }),
    /** Dev: soak (or dry) the ground at once, for previews. */
    setWet(v) { wet = THREE.MathUtils.clamp(v, 0, 1); },
  };
}
