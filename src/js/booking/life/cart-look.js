import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gradeLife, lifeGrade, sky } from '../lookdev.js';
import { weatherSky } from './sky.js';
import { part, box, merge } from './geom.js';

// How the golf cart looks (round 8): its model, its light and its shadow. life/cart.js drives it.
//
// Model: public/models/life/cart.glb (scripts/life/build_cart.py, Blender, real size), loaded after
// the map is up. Body, driver and cargo are merged into one mesh painted per vertex (colour,
// roughness, metalness), the windshield is its own see-through mesh, and each wheel is a mesh of
// its own around its axle so it can spin and steer. If the file can't be had, a simple procedural
// cart stands in.
//
// Light: the scene's sun and its static shadow map (both passes), the clouds and the grade from
// gradeLife (lookdev.js); the cart adds only its own roof's shade over the seat and the driver.
//
// Shadow: one decal on the ground. The cart is flattened along the sun into a small offscreen mask
// (white where any part of it blocks the sun: each pixel counts once, however many parts overlap),
// the mask is blurred as it is read, and a mesh draped over the real ground heights (paths, grass,
// courts) multiplies the frame by the shadow's colour there: no darker blotches where parts overlap,
// nothing floating over the grass, none under a cloud's shadow. A soft contact shadow under the body
// and the tyres comes with it, in the same pass. Its colour follows the sun and the sky light, fitted
// to the baked shadows of the poles on the paths.

const MODEL_URL = '/models/life/cart.glb';
export const ROOF_Y = 1.74;

// Shadow colour (linear multiplier) from the sun and the sky light: k = sky / (sky + R·sun·sin(elev)).
// R is fitted to the baked shadows of the poles and benches on the paths at midday.
const R = new THREE.Vector3(0.224, 0.2, 0.216);
const NIGHT_FLOOR = 0.02;

// --- Model ------------------------------------------------------------------------------------

/** A geometry with float position + normal, the transform applied, painted (linear colour, rough, metal). */
function painted(mesh, color, rough, metal) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(src.attributes.position, i);
    pos.set([v.x, v.y, v.z], i * 3);
    if (src.attributes.normal) { v.fromBufferAttribute(src.attributes.normal, i); nor.set([v.x, v.y, v.z], i * 3); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (src.index) g.setIndex(Array.from(src.index.array));
  if (!src.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(mesh.matrixWorld);
  return paint(g, color, rough, metal);
}

function paint(g, color, rough, metal) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const rm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    rm[i * 2] = rough; rm[i * 2 + 1] = metal;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
  return g;
}

/** → { body, glass, wheels: [{ geo, centre, front }] } in cart space (x left, y up, z forward). */
export async function loadCartModel() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL_URL);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const groups = new Map(); // node name → geometries
  let glass = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    let node = o;
    while (node && !/^(cart_body|cart_driver|cart_glass|wheel_[fr][lr])$/.test(node.name)) node = node.parent;
    const key = node?.name ?? 'cart_body';
    const m = o.material;
    if (key === 'cart_glass' || m.transparent) {
      glass = painted(o, m.color, m.roughness, m.metalness);
      return;
    }
    const c = m.color.clone();
    if (m.emissive && m.emissiveIntensity > 0) c.add(m.emissive.clone().multiplyScalar(0.15)); // lamp lenses: a touch brighter
    const g = painted(o, c, m.roughness, m.metalness);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  const body = mergeGeometries([...(groups.get('cart_body') ?? []), ...(groups.get('cart_driver') ?? [])]);
  if (!body) throw new Error('cart model: no body');
  const wheels = [];
  for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const list = groups.get(name);
    if (!list) throw new Error(`cart model: no ${name}`);
    const geo = mergeGeometries(list);
    geo.computeBoundingBox();
    const centre = geo.boundingBox.getCenter(new THREE.Vector3());
    centre.x = Math.sign(centre.x) * Math.round(Math.abs(centre.x) * 50) / 50; // the hubcap bulges out: the axle is the tyre's middle
    geo.translate(-centre.x, -centre.y, -centre.z);
    wheels.push({ geo, centre, front: name[6] === 'f' });
  }
  body.computeBoundingSphere();
  return { body, glass, wheels, source: 'glb' };
}

/** The round 7 procedural cart: stands in when the model can't be loaded. */
export function fallbackCartModel() {
  const WHITE = '#e9e8e3';
  const DARK = '#262626';
  const SEAT = '#3d3a35';
  const p = [];
  p.push(box(1.08, 0.12, 2.3, 0, 0.3, -0.05, WHITE));
  p.push(box(1.12, 0.5, 0.7, 0, 0.55, 0.85, WHITE)); // cowl
  p.push(box(1.2, 0.1, 0.1, 0, 0.27, 1.22, DARK));
  p.push(box(1.1, 0.36, 0.62, 0, 0.56, -0.25, WHITE));
  p.push(box(1.06, 0.1, 0.56, 0, 0.79, -0.23, SEAT));
  p.push(box(1.06, 0.46, 0.09, 0, 1.06, -0.56, SEAT));
  p.push(box(1.2, 0.06, 1.7, 0, ROOF_Y + 0.03, 0.05, WHITE));
  for (const x of [-0.54, 0.54]) for (const z of [0.66, -0.7]) p.push(box(0.035, ROOF_Y - 0.6, 0.035, x, 0.6 + (ROOF_Y - 0.6) / 2, z, DARK));
  p.push(box(1.1, 0.24, 0.56, 0, 0.82, -0.92, '#646544')); // cargo
  p.push(box(0.36, 0.5, 0.24, 0.27, 1.12, -0.36, '#646544'), box(0.18, 0.2, 0.18, 0.27, 1.52, -0.32, '#9a6a4f')); // driver
  const body = merge(p);
  const flat = (g) => { const c = g.attributes.color; const out = paint(g, new THREE.Color(), 0.5, 0); out.setAttribute('color', c); return out; };
  const wheel = () => {
    const tyre = part(new THREE.CylinderGeometry(0.229, 0.229, 0.19, 18).rotateZ(Math.PI / 2), '#1c1c1c');
    const hub = part(new THREE.CylinderGeometry(0.1, 0.1, 0.195, 12).rotateZ(Math.PI / 2), '#a9adb0');
    return flat(merge([tyre, hub]));
  };
  const wheels = [[0.47, 0.8, true], [-0.47, 0.8, true], [0.47, -0.84, false], [-0.47, -0.84, false]]
    .map(([x, z, front]) => ({ geo: wheel(), centre: new THREE.Vector3(x, 0.229, z), front }));
  return { body: flat(body), glass: null, wheels, source: 'fallback' };
}

// --- Light ------------------------------------------------------------------------------------

/** The cart's own roof: 1 in the sun, 0 where the canopy shades p (soft edged). */
const CANOPY_GLSL = /* glsl */`
  uniform mat4 uCartInv;
  uniform vec3 uSunW;
  float bpCanopy(vec3 wp) {
    vec3 p = (uCartInv * vec4(wp, 1.0)).xyz;
    vec3 s = normalize(mat3(uCartInv) * uSunW);
    if (p.y > ${(ROOF_Y - 0.03).toFixed(2)} || s.y < 0.03) return 1.0;
    vec2 q = p.xz + s.xz * (${ROOF_Y.toFixed(2)} - p.y) / s.y;
    vec2 d = abs(q - vec2(0.0, 0.05)) - vec2(0.6, 0.88);
    return smoothstep(-0.05, 0.07, max(d.x, d.y));
  }
`;

/** The finish pass's cloud shadows, for the decal (it isn't graded through gradeLife). */
const SHADE_GLSL = /* glsl */`
  uniform vec4 uBpCloud;
  uniform vec3 uBpCloudSun;
  // The finish pass's cloud shadows (lookdev.js): how much of the sun a cloud takes at p, 0…1.
  float bpHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float bpNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(bpHash(i), bpHash(i + vec2(1.0, 0.0)), f.x), mix(bpHash(i + vec2(0.0, 1.0)), bpHash(i + 1.0), f.x), f.y);
  }
  float bpCloudShade(vec3 p) {
    if (uBpCloud.w <= 0.0) return 0.0;
    vec2 q = (p.xz - uBpCloudSun.xz / max(uBpCloudSun.y, 0.1) * p.y + uBpCloud.xy) / 84.0;
    float n = bpNoise(q) * 0.56 + bpNoise(q * 2.07 + 5.3) * 0.28 + bpNoise(q * 4.3 - 2.1) * 0.16;
    float t = mix(0.6, 0.38, uBpCloud.z);
    return smoothstep(t, t + 0.09, n) * uBpCloud.w;
  }
`;

/** Uniforms the cart's materials share; `update()` once per frame. */
export function cartLight({ sun, scene }, sunDir) {
  const U = {
    uBpCloud: sky.uCloud,
    uBpCloudSun: sky.uSunDir,
    uCartInv: { value: new THREE.Matrix4() },
    uSunW: { value: sunDir },
    uShadowK: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uDirect: lifeGrade.uDirect,
  };
  return {
    U,
    update(cart) {
      U.uCartInv.value.copy(cart.matrixWorld).invert();
      // Shadow colour: the sky light keeps what the sun loses.
      const amb = Math.max(0.05, scene.environmentIntensity ?? 1);
      const e = Math.max(0, sunDir.y);
      const c = sun ? sun.color : new THREE.Color(1, 0.8, 0.6);
      const I = sun ? sun.intensity : 7.6 * weatherSky.sun;
      const k = (r, ch) => amb / (amb + r * ch * I * e + NIGHT_FLOOR);
      U.uShadowK.value.set(k(R.x, c.r), k(R.y, c.g), k(R.z, c.b));
    },
  };
}

/** The cart's paint: per-vertex colour, roughness and metalness; the sun cut where the roof shades. */
export function cartMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;\nvarying vec3 vBpWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= bpCanopy( vBpWorld );',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vRM;\nvarying vec3 vBpWorld;\n${CANOPY_GLSL}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;')
      .replace('#include <lights_fragment_begin>', lights);
  };
  m.customProgramCacheKey = () => 'life-cart-paint';
  return gradeLife(m);
}

export function glassMaterial() {
  return gradeLife(new THREE.MeshStandardMaterial({ color: 0xdce6e8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
}

// --- Shadow -----------------------------------------------------------------------------------

/** Ground heights of the flat static surfaces (paths, grass, courts) on a 0.5 m grid. */
export function groundHeights(root, bounds, base) {
  const CELL = 0.5;
  const x0 = bounds.minX; const z0 = bounds.minZ;
  const nx = Math.ceil((bounds.maxX - x0) / CELL);
  const nz = Math.ceil((bounds.maxZ - z0) / CELL);
  const h = new Float32Array(nx * nz).fill(-Infinity);
  const box = new THREE.Box3();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const nrm = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || o.name.startsWith('life_') || /_(hl|pool|glow)$/.test(o.name)) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    box.setFromObject(o);
    if (box.max.y - box.min.y > 0.15 || box.max.y > 0.35 || box.min.y < -0.3) return;
    if ((box.max.x - box.min.x) * (box.max.z - box.min.z) < 2) return;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
      nrm.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0]));
      if (Math.abs(nrm.y) < 0.9 * nrm.length()) continue; // walls, kerb faces
      const ymax = Math.max(v[0].y, v[1].y, v[2].y);
      const i0 = Math.max(0, Math.floor((Math.min(v[0].x, v[1].x, v[2].x) - x0) / CELL));
      const i1 = Math.min(nx - 1, Math.floor((Math.max(v[0].x, v[1].x, v[2].x) - x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(v[0].z, v[1].z, v[2].z) - z0) / CELL));
      const j1 = Math.min(nz - 1, Math.floor((Math.max(v[0].z, v[1].z, v[2].z) - z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * CELL; const pz = z0 + (j + 0.5) * CELL;
          const d = (a, b) => (px - b.x) * (a.z - b.z) - (a.x - b.x) * (pz - b.z);
          const d1 = d(v[0], v[1]); const d2 = d(v[1], v[2]); const d3 = d(v[2], v[0]);
          if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
          const k = j * nx + i;
          if (ymax > h[k]) h[k] = ymax;
        }
      }
    }
  });
  // A cell takes the highest surface around it, so the decal never dips under a kerb or a court.
  const out = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let m = -Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di; const b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < nz) m = Math.max(m, h[b * nx + a]);
      }
      out[j * nx + i] = Number.isFinite(m) ? m : base;
    }
  }
  return (x, z) => {
    const i = Math.floor((x - x0) / CELL); const j = Math.floor((z - z0) / CELL);
    return i >= 0 && j >= 0 && i < nx && j < nz ? out[j * nx + i] : base;
  };
}

const FLATTEN_VS = /* glsl */`
  uniform vec3 uSun;
  uniform float uGround;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 s = normalize(uSun);
    s.y = max(s.y, 0.1);
    wp.xz -= s.xz * (wp.y - uGround) / s.y;
    wp.y = uGround;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

// Injected into three's ShadowMaterial: getShadowMask() is the static shadow map exactly as the
// baked frame has it (1 in the sun), so the cart's shadow never darkens a shadow twice.
const DECAL_PARS = /* glsl */`
  uniform sampler2D uMask;
  uniform mat4 uMaskVP;
  uniform float uBlur;
  uniform float uGround;
  uniform vec3 uShadowK;
  uniform float uDirect;
  uniform float uAO;
  varying vec3 vBpWorld;
  ${CANOPY_GLSL}
  ${SHADE_GLSL}
`;
const DECAL_MAIN = /* glsl */`
  {
    vec3 s = normalize(uSunW);
    s.y = max(s.y, 0.1);
    vec3 p = vBpWorld;
    vec2 g = p.xz - s.xz * (p.y - uGround) / s.y; // along the sun onto the mask's plane
    vec4 c = uMaskVP * vec4(g.x, uGround, g.y, 1.0);
    vec2 uv = c.xy * 0.5 + 0.5;
    // Soft edge: a 12-tap disc around the point (the static shadows are PCF-soft too).
    const vec2 D[12] = vec2[12](vec2(0.0, 0.0), vec2(0.53, 0.0), vec2(-0.26, 0.46), vec2(-0.26, -0.46),
      vec2(1.0, 0.0), vec2(0.5, 0.87), vec2(-0.5, 0.87), vec2(-1.0, 0.0), vec2(-0.5, -0.87), vec2(0.5, -0.87),
      vec2(0.0, 0.62), vec2(0.0, -0.62));
    float m = 0.0;
    for (int i = 0; i < 12; i++) m += texture2D(uMask, uv + D[i] * uBlur).r;
    m /= 12.0;
    vec2 edge = smoothstep(vec2(0.0), vec2(0.02), uv) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - uv);
    m *= edge.x * edge.y;
    float sunLit = getShadowMask() * (1.0 - min(1.0, bpCloudShade(p) * 2.2));
    vec3 k = mix(vec3(1.0), uShadowK, m * sunLit);
    // Contact shadow: soft under the floor pan, darker under each tyre.
    vec3 lp = (uCartInv * vec4(p, 1.0)).xyz;
    float body = length(max(abs(lp.xz - vec2(0.0, -0.02)) - vec2(0.42, 1.0), 0.0));
    float ao = 0.42 * (1.0 - smoothstep(0.0, 0.32, body));
    const vec2 W[4] = vec2[4](vec2(0.47, 0.8), vec2(-0.47, 0.8), vec2(0.47, -0.84), vec2(-0.47, -0.84));
    for (int i = 0; i < 4; i++) {
      float e = length((lp.xz - W[i]) / vec2(0.13, 0.24));
      ao = max(ao, 0.7 * (1.0 - smoothstep(0.25, 1.0, e)));
    }
    k *= 1.0 - ao * uAO;
    if (uDirect > 0.5) k = pow(k, vec3(1.0 / 2.2)); // straight onto the display: its encoding, not linear light
    gl_FragColor = vec4(k, 1.0);
  }
`;

/**
 * The cart's ground shadow. `heightAt(x, z)`: ground under a point; `ground`: the mask's plane
 * (the paths). Call `update(cart, parts)` when the cart or the sun moved; `parts`: meshes casting.
 */
export function createCartShadow({ renderer, quality }, U, heightAt, ground) {
  const SIZE = quality === 'low' ? 128 : 256;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.name = 'life_cart_shadow_mask';
  const maskScene = new THREE.Scene();
  maskScene.matrixWorldAutoUpdate = false;
  const maskCam = new THREE.OrthographicCamera(-4, 4, 4, -4, 1, 400);
  maskCam.up.set(0, 0, -1);
  const flatMat = new THREE.ShaderMaterial({
    uniforms: { uSun: U.uSunW, uGround: { value: ground } },
    vertexShader: FLATTEN_VS,
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  });
  const proxies = [];

  const N = 28;
  const geo = new THREE.PlaneGeometry(1, 1, N, N).rotateX(-Math.PI / 2);
  const grid = geo.attributes.position.array.slice(); // unit square, for the drape
  const decalU = {
    ...U,
    uMask: { value: rt.texture },
    uMaskVP: { value: new THREE.Matrix4() },
    uBlur: { value: 3 / SIZE },
    uGround: { value: ground },
    uAO: { value: 1 },
  };
  const mat = new THREE.ShadowMaterial({
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6,
    toneMapped: false,
    fog: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, decalU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBpWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECAL_PARS}`)
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', DECAL_MAIN)
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '')
      .replace('#include <fog_fragment>', '')
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  mat.customProgramCacheKey = () => 'life-cart-shadow-decal';
  const decal = new THREE.Mesh(geo, mat);
  decal.name = 'life_golf_cart_shadow';
  decal.frustumCulled = false;
  decal.renderOrder = 1;
  decal.userData.noAO = true;
  // getShadowMask() (the static shadow map, so a shadow never darkens a shadow) is off for now: in the
  // cached-frame pass the map read back as acne on the paths (row 174 check). One flag turns it on.
  decal.receiveShadow = false;

  const prevClear = new THREE.Color();
  let lastKey = '';
  const VP = decalU.uMaskVP.value;

  function setParts(parts) {
    for (const p of proxies) maskScene.remove(p);
    proxies.length = 0;
    for (const src of parts) {
      const m = new THREE.Mesh(src.geometry, flatMat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.userData.src = src;
      proxies.push(m);
      maskScene.add(m);
    }
  }

  return {
    decal,
    rt,
    setParts,
    /** Redraws the mask and drapes the decal (when the cart or the sun moved). */
    update(cart) {
      const s = U.uSunW.value;
      const sy = Math.max(0.1, s.y);
      const reach = Math.hypot(s.x, s.z) / sy; // shadow metres per metre of height
      const half = Math.ceil((1.5 + reach * ROOF_Y * 0.5 + 0.5) * 2) / 2; // quantised: the mask's scale changes rarely
      const texel = (2 * half) / SIZE;
      const cx = Math.round((cart.position.x - (s.x / sy) * ROOF_Y * 0.5) / texel) * texel;
      const cz = Math.round((cart.position.z - (s.z / sy) * ROOF_Y * 0.5) / texel) * texel;
      const key = `${cart.position.x.toFixed(3)},${cart.position.z.toFixed(3)},${cart.rotation.y.toFixed(3)},${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)},${proxies.map((p) => p.userData.src.matrixWorld.elements[0].toFixed(3) + p.userData.src.matrixWorld.elements[2].toFixed(3)).join('')}`;
      if (key === lastKey) return false;
      lastKey = key;

      // Mask: the cart flattened along the sun, seen from straight above.
      Object.assign(maskCam, { left: -half, right: half, top: half, bottom: -half });
      maskCam.position.set(cx, 200, cz);
      maskCam.lookAt(cx, 0, cz);
      maskCam.updateProjectionMatrix();
      maskCam.updateMatrixWorld();
      VP.multiplyMatrices(maskCam.projectionMatrix, maskCam.matrixWorldInverse);
      flatMat.uniforms.uGround.value = ground;
      for (const p of proxies) p.matrixWorld.copy(p.userData.src.matrixWorld);
      const prevRT = renderer.getRenderTarget();
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      const prevAuto = renderer.autoClear;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = false;
      renderer.clear(true, false, false);
      renderer.render(maskScene, maskCam);
      renderer.setRenderTarget(prevRT);
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;

      // Drape: the decal follows the ground under it (paths, grass, court edges).
      const pos = geo.attributes.position;
      const a = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x = cx + grid[i * 3] * 2 * half;
        const z = cz + grid[i * 3 + 2] * 2 * half;
        a[i * 3] = x;
        a[i * 3 + 1] = heightAt(x, z) + 0.006;
        a[i * 3 + 2] = z;
      }
      pos.needsUpdate = true;
      return true;
    },
    dispose() { rt.dispose(); geo.dispose(); mat.dispose(); flatMat.dispose(); },
  };
}
