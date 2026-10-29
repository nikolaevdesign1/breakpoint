import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { dusk } from './dusk.js';

// Row 179: a faint warm grow light in the orchid house after dark (the east greenhouse of the
// kitchen garden, scripts/lookdev/garden.py). Six lamp bars over the staging benches, the misted
// glass catching their light (a life-layer copy of the model's greenhouse glass, the panes of that
// house only), light on the benches and the path inside and a little on the gravel round it.
// On from dusk until 23:00, fading in and out like the clubhouse rooms. Nothing by day.

const HOUSE = { x: 60, z: -75, hw: 1.8, hl: 3.0 }; // model space (Blender 60, 75)
const ON = 16; // the lamps are on from dusk …
const OFF = 23; // … until 23:00
const FADE = 0.6; // s
const TONE = new THREE.Color(1, 0.64, 0.34);
const LAMPS = [-1.9, 0, 1.9].flatMap((d) => [-1.06, 1.06].map((x) => [HOUSE.x + x, 2.24, HOUSE.z + d]));
const smooth = THREE.MathUtils.smoothstep;

function life(o) {
  o.layers.set(LIFE_LAYER);
  o.frustumCulled = false;
  o.userData.noAO = true;
  return o;
}

/** The house's panes glowing: brighter where the glass is misted, towards the lamps under the roof. */
function glassMaterial(uniforms, map) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uMap: { value: map } },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vW;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uLevel, uGain;
      uniform vec3 uTone;
      uniform vec4 uHouse; // x, z, half width, half length
      varying vec3 vW;
      varying vec2 vUv;
      void main() {
        vec2 d = abs(vW.xz - uHouse.xy) - uHouse.zw;
        if (max(d.x, d.y) > 0.3) discard; // the other house
        float a = texture2D(uMap, vUv).a;
        float mist = smoothstep(0.14, 0.5, a);
        float high = smoothstep(0.5, 2.6, vW.y);
        float f = uLevel * uGain * (0.14 + 0.66 * mist) * (0.45 + 0.55 * high);
        if (f <= 0.002) discard;
        gl_FragColor = vec4(uTone * f, 1.0);
      }`,
  });
}

/** Light on a flat surface: pass 0 brightens what is there (dst · (1 + f)), pass 1 adds a little haze. */
function spillMaterial(uniforms, pass, outside) {
  const blend = pass === 0
    ? { blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor }
    : { blending: THREE.AdditiveBlending };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: blend.blending,
    blendSrc: blend.blendSrc,
    blendDst: blend.blendDst,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uLevel, uGain;
      uniform vec3 uTone;
      uniform vec4 uHouse;
      varying vec3 vW;
      void main() {
        vec2 d = abs(vW.xz - uHouse.xy) - uHouse.zw;
        float out_ = length(max(d, 0.0)); // metres outside the footprint
        ${outside
    ? 'if (out_ <= 0.0) discard; float f = exp(-out_ * 1.5) * 0.5;'
    : 'float f = smoothstep(0.3, -0.4, max(d.x, d.y)) * (0.75 + 0.25 * cos(vW.z * 1.65));'}
        f *= uLevel * uGain;
        if (f <= 0.002) discard;
        ${pass === 0 ? 'gl_FragColor = vec4(uTone * f * 3.0, 1.0);' : 'gl_FragColor = vec4(uTone * f * 0.05, 1.0);'}
      }`,
  });
}

/** A lamp bar seen from the drone: a warm line with a soft halo (camera-facing card). */
function lampMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uLevel;
      uniform vec3 uTone;
      varying vec2 vUv;
      void main() {
        vec2 q = vec2(max(abs(vUv.x) - 0.62, 0.0) * 2.6, vUv.y);
        float r = length(q);
        float core = smoothstep(0.24, 0.08, r);
        float halo = exp(-r * r * 5.0) * 0.4;
        float v = (core + halo) * uLevel;
        if (v <= 0.003) discard;
        gl_FragColor = vec4(mix(uTone, vec3(1.0, 0.93, 0.8), core * 0.7) * v, 1.0);
      }`,
  });
}

export function createGreenhouse({ scene, root, rig }, { still }) {
  let glass = null;
  root.traverse((o) => { if (!glass && o.isMesh && o.material?.name === 'mat_greenhouse_glass') glass = o; });
  if (!glass) return null;

  const uni = {
    uLevel: { value: 0 },
    uGain: { value: 1 },
    uTone: { value: TONE },
    uHouse: { value: new THREE.Vector4(HOUSE.x, HOUSE.z, HOUSE.hw, HOUSE.hl) },
  };
  const group = new THREE.Group();
  group.name = 'life_greenhouse_light';

  glass.updateWorldMatrix(true, false);
  const panes = life(new THREE.Mesh(glass.geometry, glassMaterial(uni, glass.material.map)));
  panes.matrixAutoUpdate = false;
  panes.matrix.copy(glass.matrixWorld);
  panes.renderOrder = 3;

  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const plane = (pass, outside, x, y, z, w, d) => {
    const m = life(new THREE.Mesh(flat, spillMaterial(uni, pass, outside)));
    m.position.set(x, y, z);
    m.scale.set(w, 1, d);
    m.renderOrder = 1;
    return m;
  };
  const spills = [0, 1].flatMap((pass) => [
    plane(pass, true, HOUSE.x, 0.016, HOUSE.z, 9, 11), // the gravel round the house
    plane(pass, false, HOUSE.x, 0.074, HOUSE.z, 3.5, 5.9), // the path and the gravel inside
    plane(pass, false, HOUSE.x - 1.11, 0.805, HOUSE.z - 0.08, 1.16, 5.3), // the bench tops
    plane(pass, false, HOUSE.x + 1.11, 0.805, HOUSE.z - 0.08, 1.16, 5.3),
  ]);

  const card = new THREE.PlaneGeometry(1.1, 0.34).rotateX(-rig.pitch);
  const lamps = life(new THREE.InstancedMesh(card, lampMaterial(uni), LAMPS.length));
  const m4 = new THREE.Matrix4();
  LAMPS.forEach(([x, y, z], i) => lamps.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  lamps.renderOrder = 4;

  group.add(panes, ...spills, lamps);
  group.visible = false;
  scene.add(group);

  let level = 0;
  let lastWrite = -1;

  function target() {
    const d = dusk();
    const h = d.hours;
    return smooth(-d.elevation, -1, 4) * (h >= ON && h < OFF ? 1 : 0);
  }

  function write() {
    uni.uLevel.value = level;
    uni.uGain.value = THREE.MathUtils.lerp(0.5, 1, dusk().dark); // a dusk frame is brighter: less light shows
    group.visible = level > 0.003;
  }

  level = target();
  write();

  return {
    name: 'greenhouse',
    tick(t, dt) {
      const want = target();
      const k = still ? 1 : Math.min(1, Math.min(dt, 0.1) / FADE);
      const next = Math.abs(want - level) < 0.003 ? want : level + (want - level) * k;
      const moving = next !== level;
      level = next;
      if (moving || t - lastWrite > 1) { lastWrite = t; write(); }
      return moving;
    },
    debug: () => ({ level: +level.toFixed(2), lamps: LAMPS.length }),
  };
}
