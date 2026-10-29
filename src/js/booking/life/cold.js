import * as THREE from 'three';
import { LIFE_LAYER, rng, lifeTime } from './shared.js';
import { gradeLife, lifeGrade } from '../lookdev.js';
import { COURTS } from '../../shared/availability.js';
import { courtFrame, furniture } from './keeper.js';
import { box, merge, part } from './geom.js';
import { onChill } from '../seasons/chill.js';
import { adorn } from './adorn.js';

// Cold at the club (round 10, row 5): while seasons/chill.js says it is cold (below ~60°F in
// Miami, or the Holidays decor), gas patio heaters stand by the benches of every court, each with
// an orange glow on its emitter and on the ground round it and a slow rise of warm haze, and the
// people on the map wear jackets (life/adorn.js). The heater bodies are static, so they go into
// the baked frame and the shadow map once when it turns cold; the glow and the haze are drawn on
// the life layer every frame (display-space, additive: they brighten a little after dark).

const FADE = 2.5; // s for the glow and the haze to come up
const HAZE = 9; // particles per heater
const RISE = 2.2; // m the haze climbs
const H = 2.25; // m, a patio heater

/** A stainless patio heater on its own origin: weighted base, pole, burner head and reflector dish. */
function heaterGeometry() {
  const steel = '#b7bbbf';
  return merge([
    part(new THREE.CylinderGeometry(0.34, 0.38, 0.07, 16).translate(0, 0.035, 0), '#3b3d3f'),
    part(new THREE.CylinderGeometry(0.2, 0.3, 0.12, 16).translate(0, 0.13, 0), '#25272a'),
    part(new THREE.CylinderGeometry(0.06, 0.07, H - 0.55, 10).translate(0, 0.19 + (H - 0.55) / 2, 0), steel),
    part(new THREE.CylinderGeometry(0.12, 0.1, 0.34, 12).translate(0, H - 0.52, 0), '#d8dadc'), // the cylinder under the dish
    part(new THREE.CylinderGeometry(0.78, 0.1, 0.4, 20, 1, true).translate(0, H - 0.1, 0), steel), // reflector, wide at the top
    box(0.1, 0.12, 0.08, 0.26, 0.55, 0, '#8d9094'), // control box on the pole side
  ]);
}
/** The burner under the dish: a small glowing ring. */
const emitterGeometry = () => new THREE.CylinderGeometry(0.26, 0.26, 0.06, 14).translate(0, H - 0.3, 0);

function glowMaterial(uniforms, ground) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv * 2.0 - 1.0;
        mat4 m = modelMatrix * instanceMatrix;
        vSeed = fract(sin(m[3].x * 12.9898 + m[3].z * 78.233) * 43758.5453);
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uLevel, uTime, uNight;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float r = length(vUv);
        float flick = 0.9 + 0.1 * sin(uTime * 7.0 + vSeed * 40.0) * sin(uTime * 3.1 + vSeed * 9.0);
        float g = exp(-r * r * ${ground ? '3.2' : '5.5'}) * (1.0 - smoothstep(0.85, 1.0, r));
        float k = ${ground ? '0.22' : '0.5'} * (1.0 + 1.2 * uNight) * uLevel * flick;
        if (g * k < 0.002) discard;
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.18) * g * k, 1.0);
      }`,
  });
}

function hazeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; // heater x, z, phase, size
      uniform float uTime, uPx, uLevel;
      varying float vA;
      void main() {
        float t = fract(uTime * (0.18 + 0.08 * fract(aSeed.z * 7.3)) + aSeed.z);
        vec3 p = vec3(aSeed.x + sin(uTime * 0.7 + aSeed.z * 20.0) * 0.18 * t, ${(H - 0.1).toFixed(2)} + t * ${RISE.toFixed(1)}, aSeed.y + cos(uTime * 0.6 + aSeed.z * 11.0) * 0.14 * t);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, (0.35 + t * 0.9) * aSeed.w * uPx / -mv.z);
        vA = sin(t * 3.1416) * uLevel;
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * 0.16;
        if (a < 0.003) discard;
        gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.7), vec3(1.0, 0.6, 0.3), uNight), a);
      }`,
  });
}

export function createCold(ctx, { still }) {
  const { scene, root, camera, renderer, rig, refreshShadows } = ctx;
  const props = furniture(scene);
  const r = rng(0xc01d);

  // --- Where they stand: beside the bench and chair cluster of every court, off the furniture ---
  const spots = [];
  const near = (x, z, d) => props.some(([px, pz]) => Math.hypot(px - x, pz - z) < d) || spots.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < d);
  for (const { id, type } of COURTS) {
    if (type === 'grass') continue;
    const cf = type === 'padel' ? null : courtFrame(root, id, props);
    const play = root.getObjectByName(id);
    if (!cf && !play) continue;
    const b = new THREE.Box3().setFromObject(play);
    const at = cf
      ? (u, w) => cf.world(u, w)
      : (u, w) => new THREE.Vector3((b.min.x + b.max.x) / 2 + u, b.max.y, (b.min.z + b.max.z) / 2 + w);
    const W = cf ? cf.W : (b.max.x - b.min.x) / 2 + 1.6;
    for (const side of [-1, 1]) {
      for (const w of cf ? [1.6, 3.2, -1.6, 4.8] : [0, 2.4, -2.4]) {
        const p = at(side * (W - 1.1), w);
        const q = cf?.inside ? cf.inside(p.x, p.z) : true;
        if (!q || near(p.x, p.z, 1.3)) continue;
        spots.push([p.x, p.y, p.z]);
        break;
      }
    }
  }
  if (!spots.length) return null;

  const m4 = new THREE.Matrix4();
  const group = new THREE.Group();
  group.name = 'cold_heaters';
  const body = new THREE.InstancedMesh(heaterGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), spots.length);
  spots.forEach(([x, y, z], i) => body.setMatrixAt(i, m4.makeRotationY(r() * Math.PI * 2).setPosition(x, y, z)));
  body.castShadow = true;
  body.computeBoundingSphere();
  group.add(body);
  group.visible = false;
  scene.add(group);

  // --- Glow and haze on the life layer ---
  const uniforms = { uTime: lifeTime, uLevel: { value: 0 }, uNight: { value: 0 }, uPx: { value: 800 } };
  const live = (mesh, order) => { mesh.frustumCulled = false; mesh.layers.set(LIFE_LAYER); mesh.userData.noAO = true; mesh.renderOrder = order; mesh.visible = false; scene.add(mesh); return mesh; };
  const emitter = live(new THREE.InstancedMesh(emitterGeometry(), gradeLife(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.62, 0.2), toneMapped: false })), spots.length), 4);
  const halo = live(new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-rig.pitch), glowMaterial(uniforms, false), spots.length), 5);
  const pool = live(new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), glowMaterial(uniforms, true), spots.length), 1);
  const seed = new Float32Array(spots.length * HAZE * 4);
  spots.forEach(([x, y, z], i) => {
    emitter.setMatrixAt(i, m4.makeTranslation(x, y, z));
    halo.setMatrixAt(i, m4.makeTranslation(x, y + H - 0.32, z));
    pool.setMatrixAt(i, m4.makeTranslation(x, y + 0.03, z));
    for (let k = 0; k < HAZE; k++) seed.set([x, z, r(), 0.8 + r() * 0.6], (i * HAZE + k) * 4);
  });
  const hazeGeo = new THREE.BufferGeometry();
  hazeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spots.length * HAZE * 3), 3));
  hazeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  hazeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const haze = live(new THREE.Points(hazeGeo, hazeMaterial(uniforms)), 6);

  const people = adorn(ctx);
  let cold = false;
  let level = 0;
  let staticDirty = false;
  const size = new THREE.Vector2();
  onChill((on) => {
    cold = on;
    people.set({ jackets: on });
    group.visible = on;
    refreshShadows();
    staticDirty = true;
    if (on) renderer.compileAsync(scene, camera).catch(() => {});
  });

  return {
    name: 'cold',
    tick(t, dt) {
      const lit = people.tick(t);
      level += Math.sign((cold ? 1 : 0) - level) * Math.min(Math.abs((cold ? 1 : 0) - level), Math.min(dt, 0.1) / FADE);
      const show = level > 0.002;
      for (const m of [emitter, halo, pool, haze]) m.visible = show;
      if (!show) return lit;
      uniforms.uLevel.value = level;
      uniforms.uNight.value = lifeGrade.uNight.value;
      renderer.getDrawingBufferSize(size);
      uniforms.uPx.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      return !still || lit;
    },
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    debug: () => ({ cold, level: +level.toFixed(2), heaters: spots.length, dressed: people.on?.() }),
  };
}
