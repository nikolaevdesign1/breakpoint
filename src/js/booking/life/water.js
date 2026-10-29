import * as THREE from 'three';
import { dusk } from './dusk.js';

// Standing water that mirrors the evening (round 8, "wetnight"). The puddles of life/rain.js are
// small, flat and seen from a fixed drone angle, so a real mirror pass would be wasted: each pixel
// reflects the view ray about a rippled normal and looks up
// - the sky of the hour (life/dusk.js): golden at sunset, pink just after, deep blue at dusk, dark at night;
// - the lights: floodlight heads of lit courts, the clubhouse windows, the café's string lights. A
//   light at height H shows in the water where the line from the camera to its mirror image (H
//   below the surface) meets the puddle, so each one is a soft spot at the right place, stretched
//   towards the viewer and broken up by the ripples.
// While it rains, drop rings and a choppy surface scatter the image; when the rain stops the water
// goes mirror calm; the image fades as the puddle dries.

export const MAX_LIGHTS = 48; // lights in the list
const PER_PUDDLE = 4; // the nearest few each puddle can show

/**
 * Lights other systems want mirrored (the clubhouse windows, string lights). Each entry:
 * { pos: Vector3, color: Color, size: m, level: () => 0…1 }.
 */
export const glowLights = [];

export function waterUniforms() {
  return {
    uSkyH: { value: new THREE.Color() },
    uSkyZ: { value: new THREE.Color() },
    uSkySun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDark: { value: 0 },
    uWall: { value: new THREE.Vector4(0, 0, 0, 0) }, // the clubhouse front: x0, x1, z, height (0: none)
    uL: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
    uLC: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  };
}

export function puddleMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    // Premultiplied: the film darkens what is under it, the reflection adds on top.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      attribute vec4 aShape; // seed, stretch, unused, size
      attribute vec4 aLights; // indices into the light list (-1: none)
      varying vec2 vUv;
      varying vec4 vShape;
      varying vec3 vWorld;
      varying vec4 vLights;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vShape = aShape;
        vLights = aLights;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uWet, uRain, uLight, uDark;
      uniform vec3 uSkyH, uSkyZ, uSkySun, uSunDir;
      uniform vec4 uWall;
      uniform vec4 uL[${MAX_LIGHTS}];
      uniform vec4 uLC[${MAX_LIGHTS}];
      varying vec4 vLights;
      varying vec2 vUv;
      varying vec4 vShape;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
      }
      void main() {
        vec2 q = vUv;
        // Outline: a squashed blob with its edge warped at two scales, so no two puddles share a
        // shape. It grows as the ground gets wetter and stays crisp: standing water has a hard edge.
        vec2 w = q + (vec2(noise(q * 2.1 + vShape.x * 31.0), noise(q * 2.1 - vShape.x * 17.0)) - 0.5) * 0.55;
        float n = noise(w * 4.0 + vShape.x * 9.0) * 0.6 + noise(w * 9.0 - vShape.x * 5.0) * 0.25;
        float r = length(w * vec2(1.0, vShape.y)) + (n - 0.42) * 0.42;
        float edge = 0.3 + 0.6 * uWet;
        float aa = fwidth(r) * 1.2 + 0.008;
        float body = smoothstep(edge, edge - aa, r);
        float depth = smoothstep(edge, edge - 0.32, r); // shallow at the edge, deeper inside
        float rim = smoothstep(edge + 0.14, edge, r) * (1.0 - body); // damp ground round the water
        if (body + rim <= 0.002) discard;

        // Surface slope: rings where drops land, a choppy skin while it rains, a breath of wind after.
        vec2 slope = vec2(0.0);
        float rings = 0.0;
        if (uRain > 0.001) {
          vec2 cellUv = q * 3.2 * vShape.w;
          vec2 cell = floor(cellUv);
          for (int i = 0; i < 4; i++) {
            vec2 c = cell + vec2(float(i - (i / 2) * 2), float(i / 2)) - 0.5;
            float h = hash(c + vShape.x);
            float t = fract(uTime * 0.9 + h * 7.0);
            vec2 o = c + vec2(hash(c + 3.1), hash(c + 7.7));
            vec2 dv = cellUv - o;
            float d = length(dv) + 1e-4;
            float x = (d - t * 0.7) / 0.05;
            float live = (1.0 - t) * step(h, 0.85);
            rings += exp(-x * x) * live;
            slope += dv / d * (-2.0 * x * exp(-x * x)) * live * 0.09 * uRain; // the ring's wave front
          }
        }
        vec2 wp = vWorld.xz * 2.3 + vec2(uTime * 0.6, uTime * 0.45);
        const float E = 0.08;
        vec2 grad = vec2(noise(wp + vec2(E, 0.0)) - noise(wp - vec2(E, 0.0)), noise(wp + vec2(0.0, E)) - noise(wp - vec2(0.0, E))) / (2.0 * E);
        slope += grad * (0.004 + 0.08 * uRain);
        vec3 nrm = normalize(vec3(-slope.x, 1.0, -slope.y));

        // Mirror: the view ray about the surface, into the sky of the hour.
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 R = reflect(V, nrm);
        float up = clamp(R.y, 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - max(dot(-V, nrm), 0.0), 5.0);
        vec3 sky = mix(uSkyH, uSkyZ, smoothstep(0.55, 0.95, up)); // ripples tilt it between the two
        sky += uSkySun * pow(max(dot(R, uSunDir), 0.0), 3.0);
        sky *= 0.55 + 0.45 * smoothstep(0.15, 0.6, up); // rooflines and crowns hide the low sky
        // The clubhouse front stands between some puddles and the sky: they mirror its brick.
        if (uWall.w > 0.0 && R.z < -0.01) {
          float t = (uWall.z - vWorld.z) / R.z;
          vec3 hit = vWorld + R * t;
          if (t > 0.0 && hit.y < uWall.w && hit.x > uWall.x && hit.x < uWall.y) sky = vec3(0.05, 0.035, 0.03) * (0.4 + 0.6 * uLight);
        }
        vec3 refl = sky * (0.62 + 2.0 * F) * mix(0.45, 1.0, uLight);
        // A film of dust and pollen: the mirror is never even; darker at the meniscus.
        refl *= (0.8 + 0.4 * noise(vWorld.xz * 0.9 + vShape.x * 40.0)) * mix(0.55, 1.0, smoothstep(0.0, 0.1, edge - r));

        // Lights: where each one's mirror image meets the water, shifted by the ripples. A
        // floodlight (size < 0) also mirrors its mast: a dark line from its foot to the head's image.
        vec3 glow = vec3(0.0);
        float pole = 0.0;
        vec2 P = vWorld.xz;
        float glint = smoothstep(0.52, 0.85, noise(P * 7.0 + vec2(uTime * 2.1, -uTime * 1.7)) * 0.7 + rings * 0.6);
        float h0 = vWorld.y;
        vec2 C = cameraPosition.xz;
        for (int i = 0; i < ${PER_PUDDLE}; i++) {
          if (vLights[i] < 0.0) break;
          int li = int(vLights[i] + 0.5);
          vec4 L = uL[li];
          vec4 LC = uLC[li];
          float H = L.y - h0;
          float s = (cameraPosition.y - h0) / (cameraPosition.y - h0 + H);
          vec2 X = C + (L.xz - C) * s;
          vec2 d = P - X - nrm.xz * H * 0.35;
          vec2 fwd = normalize(X - C + 1e-4);
          float a = dot(d, fwd);
          float b = d.x * fwd.y - d.y * fwd.x;
          float rs = abs(LC.w) * s;
          float ra = rs * (1.6 + 4.0 * uRain);
          float k = (b * b) / (rs * rs) + (a * a) / (ra * ra);
          // Calm: a clean image and a faint bloom. Rain: a column of broken glints.
          float img = exp(-k) * mix(1.0, 0.3 + 1.6 * glint, uRain);
          glow += LC.rgb * L.w * (img + 0.035 * exp(-k * 0.3));
          if (LC.w < 0.0) {
            vec2 seg = X - L.xz;
            float t = clamp(dot(P - L.xz, seg) / dot(seg, seg), 0.0, 1.0);
            float dd = length(P - nrm.xz * H * 0.35 * t - (L.xz + seg * t));
            pole = max(pole, smoothstep(0.1, 0.04, dd) * step(0.04, t));
          }
        }
        refl *= 1.0 - 0.85 * pole;

        // Water film: the ground under it goes deeper (clay stays red, only darker), the
        // reflection on top, fainter where the water is only a skin. The damp rim only darkens.
        float mirror = body * smoothstep(0.05, 0.45, uWet) * (0.6 + 0.4 * depth);
        float film = (0.42 + 0.36 * depth) * body * uWet + rim * uWet * 0.22;
        vec3 col = vec3(0.01, 0.013, 0.016) * film + (refl + glow) * mirror;
        col += rings * uRain * 0.1 * (sky + 0.04) * body;
        gl_FragColor = vec4(col, min(film, 0.85));
      }`,
  });
}

/**
 * Keeps the reflection uniforms up to date: the sky of the hour, and for every puddle the few
 * lights whose mirror image falls on or near it (floodlight heads of lit courts, read from
 * scene.js's halo cards; everything in glowLights).
 */
export function createReflections(scene, camera, puddles, uniforms) {
  let heads = null; // { pos: Vector3[], attr }
  const findHeads = () => {
    const halos = scene.getObjectByName('lamp_halos');
    const attr = halos?.geometry.attributes.aGlow;
    if (!halos || !attr) return null;
    const m4 = new THREE.Matrix4();
    const pos = [];
    for (let i = 0; i < halos.count; i++) {
      halos.getMatrixAt(i, m4);
      pos.push(new THREE.Vector3().setFromMatrixPosition(m4.premultiply(halos.matrixWorld)));
    }
    return { pos, attr };
  };

  // Puddle centres and reach (half their largest extent at full wetness).
  const spots = [];
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < puddles.count; i++) {
    puddles.getMatrixAt(i, m4);
    m4.decompose(p, q, sc);
    spots.push({ x: p.x, y: p.y, z: p.z, r: Math.max(sc.x, sc.z) * 0.5 });
  }
  const index = new Float32Array(Math.max(1, puddles.count) * PER_PUDDLE).fill(-1);
  const attr = new THREE.InstancedBufferAttribute(index, PER_PUDDLE);
  puddles.geometry.setAttribute('aLights', attr);

  const house = scene.getObjectByName('clubhouse_mesh001');
  if (house) {
    const b = new THREE.Box3().setFromObject(house);
    uniforms.uWall.value.set(b.min.x, b.max.x, b.max.z, 4.6); // eave and roof slope seen in the water
  }
  const FLOOD = new THREE.Color(1, 0.93, 0.8);
  const list = [];
  const best = new Array(PER_PUDDLE);
  const bestScore = new Float32Array(PER_PUDDLE);
  return {
    update() {
      const d = dusk();
      uniforms.uSkyH.value.copy(d.skyH);
      uniforms.uSkyZ.value.copy(d.skyZ);
      uniforms.uSkySun.value.copy(d.skySun);
      uniforms.uSunDir.value.copy(d.sunDir);
      uniforms.uDark.value = d.dark;

      heads ??= findHeads();
      list.length = 0;
      const night = THREE.MathUtils.smoothstep(d.dark, 0.05, 0.6); // a lit mast by day is lost in the sky
      if (heads && night > 0) {
        heads.pos.forEach((pos, i) => {
          const v = heads.attr.array[i] * night;
          if (v > 0.02 && list.length < MAX_LIGHTS) list.push({ pos, c: FLOOD, w: v * 1.6, size: -0.38 }); // < 0: on a mast
        });
      }
      for (const g of glowLights) {
        const v = g.level();
        if (v > 0.02 && list.length < MAX_LIGHTS) list.push({ pos: g.pos, c: g.color, w: v * (g.gain ?? 1), size: g.size });
      }
      list.forEach((l, i) => {
        uniforms.uL.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.w);
        uniforms.uLC.value[i].set(l.c.r, l.c.g, l.c.b, l.size);
      });

      // Per puddle: the lights whose image (camera → mirror point, cut by the water plane) is close.
      const C = camera.position;
      let changed = false;
      spots.forEach((s, k) => {
        bestScore.fill(0);
        best.fill(-1);
        list.forEach((l, i) => {
          const H = l.pos.y - s.y;
          const f = (C.y - s.y) / (C.y - s.y + H);
          const x = C.x + (l.pos.x - C.x) * f;
          const z = C.z + (l.pos.z - C.z) * f;
          const gap = Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
          const size = Math.abs(l.size);
          const score = l.w / (1 + (gap * gap) / (size * size * 9));
          if (gap > size * 8 || score <= bestScore[PER_PUDDLE - 1]) return;
          let j = PER_PUDDLE - 1;
          while (j > 0 && score > bestScore[j - 1]) { bestScore[j] = bestScore[j - 1]; best[j] = best[j - 1]; j--; }
          bestScore[j] = score;
          best[j] = i;
        });
        for (let j = 0; j < PER_PUDDLE; j++) {
          if (index[k * PER_PUDDLE + j] !== best[j]) { index[k * PER_PUDDLE + j] = best[j]; changed = true; }
        }
      });
      if (changed) attr.needsUpdate = true;
    },
    debug: () => ({ lights: list.length, used: [...new Set(index)].filter((i) => i >= 0).length }),
  };
}

/**
 * Where puddles will catch a light (rain.js tries these first, on paved ground only): a few metres
 * in front of the floodlight masts (towards the camera, where a head's mirror image falls) and
 * along the clubhouse front.
 */
export function puddleSeeds(scene, random) {
  const out = [];
  const halos = scene.getObjectByName('lamp_halos');
  if (halos) {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < halos.count; i++) {
      if (random() > 0.45) continue;
      halos.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4.premultiply(halos.matrixWorld));
      out.push([p.x + (random() - 0.5) * 3, p.z + 4.5 + random() * 4]);
    }
  }
  const glass = scene.getObjectByName('clubhouse_mesh001_2');
  if (glass) {
    const b = new THREE.Box3().setFromObject(glass);
    for (let i = 0; i < 5; i++) out.push([b.min.x + random() * (b.max.x - b.min.x), b.max.z + 1.4 + random() * 1.4]);
    out.push([2.6, -40.8], [-5.8, -39.4]); // the café terrace
  }
  return out;
}
