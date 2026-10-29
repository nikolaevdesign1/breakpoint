import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Look-dev for the booking map: Poly Haven sky (CC0) for ambient light and reflections,
// a warm late-afternoon sun with static shadows, baked lightmaps (sky + bounce, from Blender),
// AgX tone mapping, light haze, and a post stack (GTAO, bulb-only bloom, grade) on capable GPUs.

export const SKY_URL = '/models/sky_512.hdr'; // row 143: ambient + reflections need no more (was the 1K, 1.1 MB)

// Measured from the HDRI (scripts/lookdev): sun azimuth from the sky, lifted to 30° so shadows read.
export const SUN_DIR = new THREE.Vector3(0.7009, 0.5, 0.5086).normalize();
const SUN_COLOR = new THREE.Color(1, 0.807, 0.572);
const SUN_IRRADIANCE = 7.6;
const SKY_CLAMP = 8; // the sun disc is cut out of the sky: the directional light carries it
export const EXPOSURE = 0.47; // row 142: a touch brighter than the first look-dev (0.42)
const HAZE = new THREE.Color(0.5, 0.57, 0.64);
const BLOOM = 0.32; // bulb glow only: a lamp, not a flare (row 138)

/** 'high' gets AO, bloom, grade and MSAA; phones and small GPUs get the plain renderer. */
export function detectQuality() {
  const small = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  return small || weak ? 'low' : 'high';
}

export function setupRenderer(renderer, quality) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1.5));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export function setupAtmosphere(scene) {
  scene.background = HAZE.clone();
  scene.fog = new THREE.FogExp2(HAZE.clone(), 0.0012);
}

/** Directional sun; its shadow camera hugs `area` so the map's texels go where they're seen. */
export function createSun(scene, area, quality) {
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_IRRADIANCE);
  sun.castShadow = true;
  const size = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = quality === 'high' ? 3 : 1;
  sun.userData.area = area;
  // Lights only light the layers they share with the camera: the life pass (lookdev composer) is
  // drawn with the life layer alone, and its cart, cars, birds and balls need the same sun.
  sun.layers.enableAll();
  scene.add(sun, sun.target);
  aimSun(sun, SUN_DIR);
  return sun;
}

/**
 * Points the sun along `dir` (towards the sun) and refits its shadow camera around the area
 * (round 7: the Miami clock moves it a few times a day; the caller redraws the shadow map).
 */
export function aimSun(sun, dir) {
  const { minX, maxX, minZ, maxZ, top } = sun.userData.area;
  const centre = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(dir, 150);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(centre);
  cam.updateMatrixWorld();
  const box = new THREE.Box3();
  for (const x of [minX, maxX]) for (const y of [0, top]) for (const z of [minZ, maxZ]) {
    box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse));
  }
  Object.assign(cam, { left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: Math.max(1, -box.max.z - 5), far: -box.min.z + 5 });
  cam.updateProjectionMatrix();
  sky.uSunDir.value.copy(dir).normalize();
}

/** Sky HDRI → clamped (no sun disc) → PMREM environment. */
export function loadSky(renderer, scene, onProgress) {
  return new Promise((resolve, reject) => {
    new HDRLoader().setDataType(THREE.FloatType).load(SKY_URL, (tex) => {
      const d = tex.image.data;
      for (let i = 0; i < d.length; i++) if (d[i] > SKY_CLAMP) d[i] = SKY_CLAMP;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      tex.dispose();
      resolve();
    }, (e) => e.total && onProgress?.(e.loaded / e.total), reject);
  });
}

/** Per-material touches that the glTF can't carry. */
export function dressMaterial(m) {
  if (m.name === 'mat_stadium_light') {
    m.emissive = new THREE.Color(1, 0.86, 0.62);
    m.emissiveIntensity = 6; // above the bloom threshold, nothing else is
  }
  if (/glass|car_/.test(m.name)) m.envMapIntensity = 1.2;
}

// The still look's grade, shared by the finishing pass and the living things drawn after it.
const GRADE_GLSL = /* glsl */`
  vec3 bpGrade(vec3 c, vec2 uv, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = mix(vec3(l), c, 1.06);                                      // a touch more colour
    g = g + (g - 0.5) * 0.06;                                            // gentle contrast
    g *= mix(vec3(1.0), vec3(1.02, 1.0, 0.97), smoothstep(0.4, 1.0, l)); // warm highlights
    g *= mix(vec3(1.0), vec3(0.97, 0.99, 1.03), 1.0 - smoothstep(0.0, 0.45, l)); // cool shadows
    vec2 d = uv - 0.5;
    g *= 1.0 - dot(d, d) * 0.14;                                         // soft vignette
    return mix(c, clamp(g, 0.0, 1.0), amount);
  }
`;

// Round 7 (Miami clock): a display-space balance on top of the grade. `uTint` warms golden hour and
// cools the night; `uNight` turns the darks blue-grey and drains their colour (night vision) while
// lit things (floodlit courts, bulbs) keep theirs. Applied by the finish and by life materials
// drawn straight onto the canvas (uDirect), once either way.
const TONE_GLSL = /* glsl */`
  uniform vec3 uTint;
  uniform float uNight;
  vec3 bpTone(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 night = mix(vec3(l), c, 0.4) * vec3(0.8, 0.92, 1.18);
    c = mix(c, night, uNight * (1.0 - smoothstep(0.08, 0.36, l)));
    return c * uTint;
  }
`;

// Cloud shadow over a world point: soft-edged blobs of a three-octave noise, ~80 m across, cast
// along the sun. Shared by the finish (static frame, from its depth) and the life pass (gradeLife).
const CLOUD_GLSL = /* glsl */`
  uniform vec4 uCloud;
  uniform vec3 uSunDir;
  uniform mat4 uInvViewProj;
  float cHash(vec2 p) { // sine-free hash: cheap, and steady far from the origin
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float cNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + 1.0), f.x), f.y);
  }
  float cloudShade(vec3 p) {
    vec2 q = (p.xz - uSunDir.xz / max(uSunDir.y, 0.1) * p.y + uCloud.xy) / 84.0;
    float n = cNoise(q) * 0.56 + cNoise(q * 2.07 + 5.3) * 0.28 + cNoise(q * 4.3 - 2.1) * 0.16;
    float t = mix(0.6, 0.38, uCloud.z);
    return smoothstep(t, t + 0.09, n);
  }
  // Round 9 (row 26, life/rain-front.js): the dark band of a rain front sweeping over the club.
  // uFront: direction it moves (x, z), its leading edge along that direction (m), strength.
  uniform vec4 uFront;
  float frontShade(vec3 p) {
    vec2 g = p.xz - uSunDir.xz / max(uSunDir.y, 0.1) * p.y;
    float s = dot(g, uFront.xy) - uFront.z; // metres ahead of the edge (+) or under the cloud (-)
    vec2 side = vec2(-uFront.y, uFront.x);
    float rag = (cNoise(vec2(dot(g, side) / 26.0, uFront.z / 60.0)) - 0.5) * 22.0; // a ragged edge
    float body = 1.0 - smoothstep(-15.0, 9.0, s + rag);
    float tex = 0.85 + 0.15 * cNoise(g / 18.0 + uFront.z / 40.0);
    return body * tex * (0.62 + 0.38 * smoothstep(-110.0, -25.0, s)); // darkest just behind the edge
  }
  // Scene-linear colour under the cloud at window point (uv 0…1, depth 0…1). Sunlit surfaces lose
  // the most; what is already in shadow only a little.
  vec3 cloudLight(vec3 c, vec2 uv, float depth, float exposure) {
    if (uCloud.w <= 0.0 && uFront.w <= 0.0) return c;
    vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    float shade = uCloud.w * cloudShade(w.xyz / w.w);
    float lit = smoothstep(0.05, 0.4, dot(c, vec3(0.2126, 0.7152, 0.0722)) * exposure);
    c *= 1.0 - shade * (0.35 + 0.65 * lit);
    if (uFront.w > 0.0) { // round 9 (row 26): rain cloud darkens everything, a little cool, lit or not
      float f = clamp(uFront.w * frontShade(w.xyz / w.w), 0.0, 1.0);
      c *= mix(vec3(1.0), vec3(0.26, 0.3, 0.4), f);
    }
    return c;
  }
`;

/** Grade amount and drawing-buffer size for life materials, drawn straight onto the canvas (uDirect). */
export const lifeGrade = {
  uGrade: { value: 0 }, uGradeRes: { value: new THREE.Vector2(1, 1) },
  uTint: { value: new THREE.Vector3(1, 1, 1) }, uNight: { value: 0 }, uDirect: { value: 0 },
};

/**
 * Light that the Miami clock and the weather steer without re-rendering the club (round 7):
 * cloud shadows drifting over the cached frame (offset x, z in metres, coverage, strength) and the
 * sun direction they fall along. The finish reconstructs each pixel's ground point from the
 * cached depth, so roofs, tree crowns and courts all take the same shadow.
 */
export const sky = {
  uCloud: { value: new THREE.Vector4(0, 0, 0.3, 0) },
  uSunDir: { value: SUN_DIR.clone() },
  uInvViewProj: { value: new THREE.Matrix4() },
  uFront: { value: new THREE.Vector4(1, 0, 0, 0) }, // round 9 (row 26): life/rain-front.js
};

/**
 * Gives a life-layer material the same light as the cached frame it is drawn over: three.js fogs
 * after tone mapping, the static world before it (in the HDR buffer the finish tone maps), so the
 * fog moves ahead of the tone mapping; the cloud shadows the finish lays on the static world fall
 * on it too; then the same grade and balance.
 */
export function gradeLife(material) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, lifeGrade, sky);
    const fs = shader.fragmentShader;
    const fog = fs.includes('#include <fog_fragment>') ? '#include <fog_fragment>' : '';
    shader.fragmentShader = (fog && fs.includes('#include <tonemapping_fragment>') ? fs.replace(fog, '') : fs)
      .replace('#include <tonemapping_fragment>', `${fog}
        #if defined( TONE_MAPPING )
        if (uDirect > 0.5) gl_FragColor.rgb = cloudLight(gl_FragColor.rgb, gl_FragCoord.xy / uGradeRes, gl_FragCoord.z, toneMappingExposure);
        #endif
        #include <tonemapping_fragment>`)
      .replace('#include <common>', `#include <common>\nuniform float uGrade;\nuniform vec2 uGradeRes;\nuniform float uDirect;\n${GRADE_GLSL}\n${TONE_GLSL}\n${CLOUD_GLSL}`)
      .replace('#include <dithering_fragment>', material.premultipliedAlpha
        // premultiplied output (life sprites): grade the straight colour
        ? `#include <dithering_fragment>
        { vec3 bpC = bpGrade(gl_FragColor.rgb / max(gl_FragColor.a, 1e-4), gl_FragCoord.xy / uGradeRes, uGrade);
          if (uDirect > 0.5) bpC = bpTone(bpC);
          gl_FragColor.rgb = bpC * gl_FragColor.a; }`
        : `#include <dithering_fragment>
        gl_FragColor.rgb = bpGrade(gl_FragColor.rgb, gl_FragCoord.xy / uGradeRes, uGrade);
        if (uDirect > 0.5) gl_FragColor.rgb = bpTone(gl_FragColor.rgb);`);
  };
  material.customProgramCacheKey = () => `${prevKey}|grade${material.premultipliedAlpha ? '-pm' : ''}`;
  return material;
}

/**
 * Puts the cached frame on the canvas: tone mapping (AgX) and sRGB, then the grade, and the cached depth, so living things drawn next hide behind fences, nets and
 * buildings exactly as in a full render.
 */
function finishMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Finish',
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, toneMappingExposure: { value: EXPOSURE }, amount: { value: 1 },
      uTint: lifeGrade.uTint, uNight: lifeGrade.uNight, ...sky,
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform float amount;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      ${GRADE_GLSL}
      ${TONE_GLSL}
      ${CLOUD_GLSL}
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float depth = texture2D(tDepth, vUv).r;
        if (depth < 1.0) c.rgb = cloudLight(c.rgb, vUv, depth, toneMappingExposure);
        c.rgb = AgXToneMapping(c.rgb);
        c = sRGBTransferOETF(c);
        gl_FragColor = vec4(bpTone(bpGrade(c.rgb, vUv, amount)), 1.0);
        gl_FragDepth = depth;
      }`,
    toneMapped: false, // tone mapped here, once
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  });
}

/**
 * Three ways to draw a frame. The static world (everything outside the life layer) always goes
 * through the same HDR buffer and finish (tone mapping, cloud shadows, grade), and the life layer
 * is always drawn after it, straight onto the canvas and graded in its own shaders (gradeLife), so
 * a moving view and a still one show the same light (row 138, round 7); only the soft effects
 * (AO, the bulb bloom when the still frame takes it over) fade in once the camera settles.
 * - `motion`: the static world finished straight from the scene buffer, then the life layer:
 *   used while the camera moves;
 * - `bake(amount)`: once the camera has settled, the static world is drawn with the effect stack
 *   (half-res GTAO, bulb bloom) faded in by `amount`, and cached together with its depth;
 * - `life()`: the cached frame goes onto the canvas (tone mapped, graded, with its depth) and only
 *   the life layer (swaying trees, birds, cars on the move, players, the cat) is drawn over it.
 *   While the camera is still this is all a frame costs, so ambient motion keeps running without
 *   re-rendering the club or its AO.
 * The 'low' tier has no AO, bloom or grade but caches the same way.
 * Objects flagged `userData.noAO` (fences, nets, glass, overlays) stay out of the AO depth pass.
 */
export function createComposer(renderer, scene, camera, quality, { lifeLayer }) {
  const high = quality === 'high';
  const grade = high ? 1 : 0;
  const allLayers = () => { camera.layers.enableAll(); };

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depthTexture = new THREE.DepthTexture(size.x, size.y);
  const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture });
  const cacheRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });

  const copy = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false }));
  copy.material.uniforms.tDiffuse.value = sceneRT.texture;

  const finish = new FullScreenQuad(finishMaterial());
  finish.material.uniforms.tDiffuse.value = cacheRT.texture;
  finish.material.uniforms.tDepth.value = depthTexture; // resolved from the multisampled scene
  finish.material.uniforms.amount.value = grade;
  const live = new FullScreenQuad(finishMaterial()); // the same finish, straight from the scene buffer
  live.material.uniforms.tDiffuse.value = sceneRT.texture;
  live.material.uniforms.tDepth.value = depthTexture;
  live.material.uniforms.amount.value = grade;
  let gtao = null;
  let bloom = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 8, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 6 });
    const setGtaoSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => setGtaoSize(Math.round(w / 2), Math.round(h / 2)); // AO is soft: half res is plenty
    const hideFromAO = gtao._overrideVisibility;
    gtao._overrideVisibility = function () {
      hideFromAO.call(this);
      scene.traverse((o) => {
        if (o.isMesh && o.visible && o.userData.noAO) { o.visible = false; this._visibilityCache.push(o); }
      });
    };
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM, 0.35, 4.0);
  }

  const staticLayers = () => { camera.layers.enableAll(); camera.layers.disable(lifeLayer); };

  // The life layer over a finished static frame (its depth is on the canvas): graded in its own
  // shaders. No clear: a colour background would force one (WebGLBackground), so it steps aside.
  function drawLife() {
    const { autoClear } = renderer;
    const { background } = scene;
    renderer.autoClear = false;
    scene.background = null;
    camera.layers.set(lifeLayer);
    lifeGrade.uGrade.value = grade;
    lifeGrade.uDirect.value = 1; // straight onto the canvas: the balance and the clouds are theirs to apply
    renderer.getDrawingBufferSize(lifeGrade.uGradeRes.value);
    renderer.render(scene, camera);
    scene.background = background;
    renderer.autoClear = autoClear;
    allLayers();
  }

  // Ground points for the cloud shadows come from the depth, through this camera.
  const cloudView = () => {
    if (sky.uCloud.value.w <= 0 && sky.uFront.value.w <= 0) return;
    camera.updateMatrixWorld();
    sky.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
  };

  return {
    hasStill: high,
    motion() {
      staticLayers();
      cloudView();
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      live.material.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(null);
      live.render(renderer);
      drawLife();
    },
    bake(amount = 1) {
      staticLayers();
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      if (high) {
        gtao.blendIntensity = 0.6 * amount; // contact shadows, not a darker picture when the camera stops
        gtao.render(renderer, cacheRT, sceneRT); // copies the frame into the cache, AO blended on
        bloom.strength = BLOOM * amount;
        bloom.render(renderer, null, cacheRT, 0, false); // adds the bulb glow in place
      } else {
        renderer.setRenderTarget(cacheRT);
        copy.render(renderer);
      }
      allLayers();
    },
    life() {
      finish.material.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      cloudView();
      renderer.setRenderTarget(null);
      finish.render(renderer);
      drawLife();
    },
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      sceneRT.setSize(s.x, s.y);
      cacheRT.setSize(s.x, s.y);
      gtao?.setSize(s.x, s.y);
      bloom?.setSize(s.x, s.y);
    },
  };
}
