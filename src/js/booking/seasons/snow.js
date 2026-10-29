import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';

// Row 36 (round 9): a light snowfall over the club in the holiday season. It is Miami, so it never
// settles: sparse flakes drift down through a box of air that follows the drone (wrapped in the
// vertex shader, nothing is moved on the CPU), on the life layer, so they fall in front of a still
// frame and hide behind roofs and fences by its depth. One draw call.

const COUNT = 1600;
const TOP = 26; // m of air the flakes fall through
const FALL = 1.15; // m/s, slow and floaty

export function createSnow({ scene, rig, renderer }) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT * 4; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)); // unused: the shader places them
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector2(120, 120) },
    uPx: { value: 800 },
    uLevel: { value: 0 },
    uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'Snow',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform vec2 uBox;
      uniform float uPx;
      varying float vA;
      void main() {
        float speed = ${FALL.toFixed(2)} * (0.7 + 0.6 * aSeed.w);
        vec3 p = vec3(aSeed.x * uBox.x, mod(aSeed.y * ${TOP.toFixed(1)} - uTime * speed, ${TOP.toFixed(1)}), aSeed.z * uBox.y);
        float sway = uTime * (0.5 + aSeed.w * 0.6) + aSeed.x * 40.0;
        p.x += sin(sway) * 0.7 + uTime * 0.35; // a slow breeze from the east-south-east
        p.z += cos(sway * 0.8) * 0.5 + uTime * 0.12;
        vec2 lo = uCenter.xz - uBox * 0.5;
        p.xz = lo + mod(p.xz - lo, uBox);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.18 + aSeed.w * 0.2; // m across
        gl_PointSize = max(1.5, size * uPx / -mv.z);
        vA = smoothstep(0.0, 2.0, p.y) * smoothstep(${TOP.toFixed(1)}, ${(TOP - 4).toFixed(1)}, p.y); // fade in at the top, out at the ground
      }`,
    fragmentShader: /* glsl */`
      uniform float uLevel;
      uniform float uNight;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.15, length(d)) * vA * uLevel;
        if (a < 0.01) discard;
        vec3 c = mix(vec3(0.97, 0.98, 1.0), vec3(0.62, 0.68, 0.8), uNight);
        gl_FragColor = vec4(c, a * 0.9);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'life_snow';
  points.layers.set(LIFE_LAYER);
  points.frustumCulled = false;
  points.renderOrder = 40;
  points.visible = false;
  points.userData.noAO = true;
  scene.add(points);

  const size = new THREE.Vector2();
  let on = false;
  let t0 = performance.now() / 1000;

  return {
    set(next) { on = next; },
    /** Returns true while flakes are on screen (fading in, falling or fading out). */
    update(night) {
      const now = performance.now() / 1000;
      const target = on ? 1 : 0;
      const lvl = uniforms.uLevel.value;
      uniforms.uLevel.value = lvl + Math.sign(target - lvl) * Math.min(Math.abs(target - lvl), 0.02);
      points.visible = uniforms.uLevel.value > 0.001;
      if (!points.visible) return false;
      const { x, z, dist } = rig.state;
      uniforms.uTime.value = now - t0;
      if (uniforms.uTime.value > 3600) t0 = now; // keep the float precise
      uniforms.uCenter.value.set(x, 0, z);
      const w = Math.max(60, dist * 2.4);
      uniforms.uBox.value.set(w, w);
      renderer.getDrawingBufferSize(size);
      uniforms.uPx.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov) / 2));
      uniforms.uNight.value = night;
      return true;
    },
  };
}
