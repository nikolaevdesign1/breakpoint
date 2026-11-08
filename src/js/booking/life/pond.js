import * as THREE from 'three';
import { LIFE_LAYER, lifeTime } from './shared.js';
import { dusk } from './dusk.js';

// Row 12: the one open water on the grounds, a small natural pond on the free lawn in the north-east
// corner (nothing else stands within 8 m of it). Pelicans land on it, swim, dip and bathe in it and
// run across it to take off (life/bird-rest.js); the surface answers with rings. The water is a flat
// ellipse with a warped edge on the life layer: dark water that deepens towards the middle, the sky
// of the hour mirrored in it (life/dusk.js, the same sky as the rain puddles) and a ring for every
// landing, paddle and splash.

export const POND = { x: 91, z: -71, rx: 6.6, rz: 4.5, y: 0.0 };
const MAX_RIPPLES = 12;
const LIFE = 3.2; // s a ring lives

const frag = /* glsl */`
  uniform float uTime, uDark, uN; // uN: rings alive
  uniform vec3 uSkyH, uSkyZ, uSkySun, uSunDir;
  uniform vec4 uRip[${MAX_RIPPLES}]; // x, z, age (s, -1 unused), strength
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }
  void main() {
    vec2 q = vUv;
    if (dot(q, q) > 1.04) discard; // the corners of the quad: the edge never reaches them, skip the noise
    vec2 w = q + (vec2(noise(q * 2.3 + 3.0), noise(q * 2.3 - 5.0)) - 0.5) * 0.3;
    float r = length(w) + (noise(w * 5.0) - 0.5) * 0.1;
    float body = smoothstep(0.84, 0.8, r);
    float rim = smoothstep(0.93, 0.8, r) * (1.0 - body); // wet earth round the water
    if (body + rim < 0.003) discard;
    float depth = smoothstep(0.82, 0.25, r);

    // Slope: a breath of wind on the surface and a ring for every disturbance.
    vec2 wp = vWorld.xz * 1.7 + vec2(uTime * 0.35, uTime * 0.27);
    const float E = 0.08;
    float n0 = noise(wp);
    vec2 slope = vec2(noise(wp + vec2(E, 0.0)) - n0, noise(wp + vec2(0.0, E)) - n0) / E * 0.012; // forward differences: three lookups, not four
    float foam = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (float(i) >= uN) break; // a calm pond pays nothing for the rings
      vec4 rp = uRip[i];
      if (rp.z < 0.0) continue;
      vec2 dv = vWorld.xz - rp.xy;
      float d = length(dv) + 1e-4;
      float front = rp.z * (0.9 + 0.25 * rp.w);
      float x = (d - front) / (0.16 + 0.05 * rp.w);
      float fade = (1.0 - rp.z / ${LIFE.toFixed(1)}) * min(1.0, rp.w);
      float ring = exp(-x * x) * fade;
      slope += dv / d * (-2.0 * x * exp(-x * x)) * fade * 0.16;
      foam += ring * smoothstep(0.9, 1.9, rp.w) * 0.22 + exp(-d * d * 4.0) * smoothstep(0.6, 0.0, rp.z) * smoothstep(1.2, 1.9, rp.w) * 0.25;
    }
    vec3 nrm = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 V = normalize(vWorld - cameraPosition);
    vec3 R = reflect(V, nrm);
    float F = 0.1 + 0.9 * pow(1.0 - max(dot(-V, nrm), 0.0), 4.0);
    vec3 sky = mix(uSkyH, uSkyZ, smoothstep(0.0, 0.9, R.y));
    sky += uSkySun * pow(max(dot(R, uSunDir), 0.0), 18.0);
    sky = pow(sky, vec3(2.2)); // the sky colours are display values; the output is linear
    vec3 shallow = vec3(0.05, 0.07, 0.04); // dark olive at the edge
    vec3 deep = vec3(0.012, 0.04, 0.045);
    vec3 col = mix(shallow, deep, depth);
    col *= 1.0 - 0.8 * uDark;
    col = mix(col, sky, clamp(0.12 + 0.55 * F, 0.0, 0.7)) + foam * vec3(0.6, 0.65, 0.65) * (1.0 - 0.6 * uDark);
    vec3 mud = vec3(0.02, 0.015, 0.01) * (1.0 - 0.7 * uDark);
    col = mix(mud, col, body);
    gl_FragColor = vec4(col, max(body, rim * 0.55));
  }`;

export function createPond({ scene }) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1, 0));
  const uniforms = {
    uTime: lifeTime,
    uDark: { value: 0 },
    uN: { value: 0 },
    uSkyH: { value: new THREE.Color() },
    uSkyZ: { value: new THREE.Color() },
    uSkySun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uRip: { value: rip },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv * 2.0 - 1.0; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: frag,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life_pond';
  mesh.position.set(POND.x, POND.y + 0.02, POND.z);
  mesh.scale.set(POND.rx * 2 * 1.25, 1, POND.rz * 2 * 1.25);
  mesh.layers.set(LIFE_LAYER);
  mesh.frustumCulled = true; // off screen it costs nothing
  mesh.renderOrder = 1;
  mesh.userData.noAO = true;
  scene.add(mesh);

  const live = []; // { x, z, t0, s }
  let alive = false;
  const nowS = () => performance.now() / 1000;

  /** Is (x, z) on the water, `m` m inside its edge? */
  const inside = (x, z, m = 0) => ((x - POND.x) / (POND.rx - m)) ** 2 + ((z - POND.z) / (POND.rz - m)) ** 2 <= 1;

  return {
    mesh,
    inside,
    /** A ring from (x, z); strength 0.3 a paddle, 1 a step, 1.8 a landing or a splash. */
    ripple(x, z, s = 1) {
      if (live.length >= MAX_RIPPLES) live.shift();
      live.push({ x, z, t0: nowS(), s });
    },
    /** Frames needed while rings are on the water. */
    tick() {
      const t = nowS();
      const d = dusk();
      uniforms.uDark.value = d.dark;
      uniforms.uSkyH.value.copy(d.skyH);
      uniforms.uSkyZ.value.copy(d.skyZ);
      uniforms.uSkySun.value.copy(d.skySun);
      uniforms.uSunDir.value.copy(d.sunDir);
      for (let i = live.length - 1; i >= 0; i--) if (t - live[i].t0 > LIFE) live.splice(i, 1);
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const l = live[i];
        if (l) rip[i].set(l.x, l.z, t - l.t0, l.s); else rip[i].z = -1;
      }
      uniforms.uN.value = live.length;
      const was = alive;
      alive = live.length > 0;
      return alive || was;
    },
    count: () => live.length,
  };
}
