import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { onTier } from '../perf.js';

// Falling bits for the holidays (row 1, round 11): confetti, petals, leaves, hearts, clovers. One
// Points object for the whole map, one draw call: a box of air that follows the drone, each bit
// placed in the vertex shader from its seed (nothing moves on the CPU), tumbling as it falls. The
// shapes come from one small atlas; the preset picks which cells and which colours. A second,
// tiny pool (`burst`) throws a handful of bits from a point: party poppers.

const COUNT = 2200;
const TOP = 22;
const CELLS = 4; // atlas: 4 x 2

/** shape ids: 0 rect, 1 dot, 2 petal, 3 leaf, 4 heart, 5 clover, 6 streamer, 7 star */
export const PRESETS = {
  confetti: { shapes: [0, 0, 1, 6, 7], colors: ['#f2c24a', '#e8e6df', '#c9ced6', '#e0312b', '#3d78e0', '#2fb85a'], fall: 0.9, size: 0.2, flutter: 1, density: 0.7 },
  petals: { shapes: [2], colors: ['#f08aa8', '#e0516f', '#f7c6d2'], fall: 0.7, size: 0.2, flutter: 1.2, density: 0.5 },
  hearts: { shapes: [4], colors: ['#e0312b', '#f06a9a', '#f7c6d2'], fall: -0.55, size: 0.3, flutter: 0.6, density: 0.3 },
  leaves: { shapes: [3], colors: ['#c4501f', '#d9941c', '#9c441f', '#a8571c'], fall: 0.8, size: 0.3, flutter: 1.3, density: 0.45 },
  clovers: { shapes: [5], colors: ['#2fb85a', '#7fd06a', '#f2c24a'], fall: 0.9, size: 0.26, flutter: 1, density: 0.4 },
};

function atlas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  const at = (i, draw) => { g.save(); g.translate((i % CELLS) * 64 + 32, Math.floor(i / CELLS) * 64 + 32); draw(); g.restore(); };
  at(0, () => g.fillRect(-14, -8, 28, 16));
  at(1, () => { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); });
  at(2, () => { g.beginPath(); g.moveTo(0, -22); g.bezierCurveTo(22, -8, 14, 18, 0, 24); g.bezierCurveTo(-14, 18, -22, -8, 0, -22); g.fill(); });
  at(3, () => { g.beginPath(); g.moveTo(0, -24); g.bezierCurveTo(24, -12, 20, 14, 0, 24); g.bezierCurveTo(-20, 14, -24, -12, 0, -24); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 24); g.stroke(); });
  at(4, () => { g.beginPath(); g.moveTo(0, 20); g.bezierCurveTo(-34, -4, -16, -26, 0, -10); g.bezierCurveTo(16, -26, 34, -4, 0, 20); g.fill(); });
  at(5, () => { for (const [x, y] of [[0, -10], [-10, 5], [10, 5]]) { g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); } g.fillRect(-1.5, 4, 3, 20); });
  at(6, () => g.fillRect(-26, -3, 52, 6));
  at(7, () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const r = i % 2 ? 9 : 22; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } g.closePath(); g.fill(); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createParticles({ scene, rig, renderer }) {
  const tex = atlas();
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector2(100, 100) }, uPx: { value: 800 },
    uLevel: { value: 0 }, uNight: { value: 0 }, uMap: { value: tex },
    uColors: { value: Array.from({ length: 8 }, () => new THREE.Color()) }, uNColors: { value: 1 },
    uShapes: { value: new Float32Array(8) }, uNShapes: { value: 1 },
    uFall: { value: 1 }, uSize: { value: 0.2 }, uFlutter: { value: 1 }, uDensity: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'HolidayBits', uniforms, transparent: true, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uPx, uFall, uSize, uFlutter, uDensity, uLevel;
      uniform vec3 uCenter; uniform vec2 uBox;
      uniform vec3 uColors[8]; uniform float uNColors;
      uniform float uShapes[8]; uniform float uNShapes;
      varying float vA; varying vec3 vC; varying float vShape; varying float vSpin; varying float vFlip;
      void main() {
        float h = fract(aSeed.w * 7.31 + aSeed.x * 3.17);
        float speed = uFall * (0.7 + 0.6 * aSeed.w);
        float y = aSeed.y * ${TOP.toFixed(1)} - uTime * speed;
        y = speed >= 0.0 ? mod(y, ${TOP.toFixed(1)}) : mod(y, ${TOP.toFixed(1)});
        vec3 p = vec3(aSeed.x * uBox.x, y, aSeed.z * uBox.y);
        float ph = uTime * (0.6 + aSeed.w) * uFlutter + aSeed.x * 40.0;
        p.x += sin(ph) * 0.9 + uTime * 0.3; p.z += cos(ph * 0.8) * 0.7;
        vec2 lo = uCenter.xz - uBox * 0.5; p.xz = lo + mod(p.xz - lo, uBox);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, uSize * (0.7 + 0.6 * h) * uPx / -mv.z);
        vShape = uShapes[int(floor(h * uNShapes))];
        vC = uColors[int(floor(fract(aSeed.x * 91.7) * uNColors))];
        vSpin = uTime * (1.5 + 3.0 * aSeed.z) + aSeed.y * 20.0;
        vFlip = 0.35 + 0.65 * abs(cos(uTime * (1.0 + aSeed.w * 2.0) * uFlutter + aSeed.y * 30.0));
        vA = step(aSeed.z, uDensity) * smoothstep(0.0, 1.5, p.y) * smoothstep(${TOP.toFixed(1)}, ${(TOP - 3).toFixed(1)}, p.y) * uLevel;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uNight;
      varying float vA; varying vec3 vC; varying float vShape; varying float vSpin; varying float vFlip;
      void main() {
        if (vA < 0.01) discard;
        vec2 d = gl_PointCoord - 0.5;
        float c = cos(vSpin), s = sin(vSpin);
        d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
        d.y /= vFlip;
        vec2 uv = d + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
        float cx = mod(vShape, ${CELLS.toFixed(1)}); float cy = floor(vShape / ${CELLS.toFixed(1)});
        float a = texture2D(uMap, vec2((cx + uv.x) / ${CELLS.toFixed(1)}, 1.0 - (cy + 1.0 - uv.y) / 2.0)).a;
        if (a < 0.3) discard;
        gl_FragColor = vec4(vC * mix(1.0, 0.55, uNight), vA);
      }`,
  });
  onTier((_, b) => geo.setDrawRange(0, Math.round(COUNT * b.fx))); // a weaker tier throws fewer bits (perf.js)
  const points = new THREE.Points(geo, mat);
  points.name = 'life_holiday_bits';
  points.layers.set(LIFE_LAYER);
  points.frustumCulled = false;
  points.renderOrder = 41;
  points.visible = false;
  points.userData.noAO = true;
  scene.add(points);

  // Party poppers: a small CPU pool of bits flung from a point.
  const BURST = 480;
  const bgeo = new THREE.BufferGeometry();
  const bpos = new Float32Array(BURST * 3);
  const bcol = new Float32Array(BURST * 3);
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  bgeo.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  bgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const bmat = new THREE.PointsMaterial({ size: 0.16, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, map: tex });
  const bpoints = new THREE.Points(bgeo, bmat);
  bpoints.name = 'life_holiday_burst';
  bpoints.layers.set(LIFE_LAYER);
  bpoints.frustumCulled = false;
  bpoints.renderOrder = 42;
  bpoints.visible = false;
  bpoints.userData.noAO = true;
  scene.add(bpoints);
  const bits = []; // { x, y, z, vx, vy, vz, life }
  const tmp = new THREE.Color();
  let burstColors = PRESETS.confetti.colors;

  const size = new THREE.Vector2();
  let preset = null;
  let t0 = performance.now() / 1000;
  let last = t0;
  return {
    /** A preset name or object (see PRESETS), or null for none. */
    set(next) {
      const p = typeof next === 'string' ? PRESETS[next] : next;
      preset = p ? { ...PRESETS.confetti, ...p } : null;
      if (!preset) return;
      burstColors = preset.colors;
      preset.colors.slice(0, 8).forEach((c, i) => uniforms.uColors.value[i].set(c));
      uniforms.uNColors.value = Math.min(8, preset.colors.length);
      preset.shapes.slice(0, 8).forEach((s, i) => { uniforms.uShapes.value[i] = s; });
      uniforms.uNShapes.value = Math.min(8, preset.shapes.length);
      uniforms.uFall.value = preset.fall; uniforms.uSize.value = preset.size;
      uniforms.uFlutter.value = preset.flutter; uniforms.uDensity.value = preset.density;
    },
    /** A popper: `n` bits flung up and out from a world point. */
    burst(x, y, z, n = 90) {
      for (let i = 0; i < n && bits.length < BURST; i++) {
        const a = Math.random() * Math.PI * 2; const up = 3 + Math.random() * 5; const out = Math.random() * 3.2;
        bits.push({ x, y, z, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, life: 2.2 + Math.random() * 1.6, c: burstColors[i % burstColors.length] });
      }
    },
    /** True while anything is on screen. */
    update(night) {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last); last = now;
      const target = preset ? 1 : 0;
      const l = uniforms.uLevel.value;
      uniforms.uLevel.value = l + Math.sign(target - l) * Math.min(Math.abs(target - l), dt / 1.5);
      points.visible = uniforms.uLevel.value > 0.001;
      if (points.visible) {
        const { x, z, dist } = rig.state;
        uniforms.uTime.value = now - t0;
        if (uniforms.uTime.value > 3600) t0 = now;
        uniforms.uCenter.value.set(x, 0, z);
        const w = Math.max(50, dist * 2.2);
        uniforms.uBox.value.set(w, w);
        renderer.getDrawingBufferSize(size);
        uniforms.uPx.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov) / 2));
        uniforms.uNight.value = night;
      }
      let n = 0;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) { bits.splice(i, 1); continue; }
        b.vy -= 5.5 * dt; b.vx *= 1 - 1.2 * dt; b.vz *= 1 - 1.2 * dt;
        if (b.vy < -0.9) b.vy = -0.9;
        b.x += b.vx * dt; b.y = Math.max(0.05, b.y + b.vy * dt); b.z += b.vz * dt;
      }
      for (const b of bits) {
        bpos[n * 3] = b.x; bpos[n * 3 + 1] = b.y; bpos[n * 3 + 2] = b.z;
        tmp.set(b.c); bcol[n * 3] = tmp.r; bcol[n * 3 + 1] = tmp.g; bcol[n * 3 + 2] = tmp.b;
        n++;
      }
      bgeo.setDrawRange(0, n);
      bgeo.attributes.position.needsUpdate = bgeo.attributes.color.needsUpdate = true;
      bpoints.visible = n > 0;
      return points.visible || n > 0;
    },
  };
}
