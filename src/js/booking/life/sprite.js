import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';

// Flipbook cards shared by the players and the cat (rows 95, 132). Each instance shows two frames of
// an atlas at once and cross-fades between them by the fraction of time between the two, so a
// 24 fps flipbook (or a 12 fps idle) plays as smooth motion at the display rate instead of
// stepping. Frames are trimmed to their alpha, so every frame has its own rect in metres: the card
// covers both and each frame is only sampled inside its own rect.
//
// Body cards stand in the image plane of the drone (it never turns); shadow cards lie on the ground.
// Per instance:  aRect / aRect2  atlas rect of frame A / B: x, y (from the top), w, h
//                aBox  / aBox2   rect in metres: x0, y0, x1, y1 (image plane; on the ground y = −z)
//                aMix            0 → frame A, 1 → frame B

export const PITCH = THREE.MathUtils.degToRad(52);
const UP = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH)); // image-plane up on the ground
const BACK = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)); // towards the camera

/**
 * @param {THREE.Texture} map atlas
 * @param {{ ground?: boolean, shadow?: boolean, slide?: number, lift?: number, strength?: number }} o
 *   slide: metres the body card moves towards the camera so its lower edge clears the ground;
 *   lift: colour gain of the body (sprites hold radiance clipped at 1); strength: shadow opacity.
 */
export function spriteMaterial(map, { ground = false, shadow = false, slide = 0.48, lift = 1.45, strength = 0.6 } = {}) {
  // Row 149: atlases are uploaded premultiplied (loadAtlas), so filtering and mips never pull the
  // black of empty texels into a frame's edge, and bodies blend their soft edges instead of an
  // alpha-test cut-out: no dark fringe, no halo. Back-to-front order comes from the instance order.
  const m = new THREE.MeshBasicMaterial({
    map,
    color: shadow ? 0x000000 : new THREE.Color().setScalar(lift),
    transparent: true,
    premultipliedAlpha: !shadow,
    opacity: shadow ? strength : 1,
    alphaTest: shadow ? 0 : 0.01,
    depthWrite: !shadow,
    polygonOffset: shadow,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uUp = { value: UP };
    shader.uniforms.uBack = { value: BACK.clone().multiplyScalar(slide) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aRect;
        attribute vec4 aRect2;
        attribute vec4 aBox;
        attribute vec4 aBox2;
        attribute float aMix;
        uniform vec3 uUp;
        uniform vec3 uBack;
        varying vec2 vP;
        varying vec4 vRA;
        varying vec4 vRB;
        varying vec4 vBA;
        varying vec4 vBB;
        varying float vMix;`)
      .replace('#include <begin_vertex>', `
        vec4 U = vec4(min(aBox.xy, aBox2.xy), max(aBox.zw, aBox2.zw));
        vec2 P = vec2(mix(U.x, U.z, uv.x), mix(U.y, U.w, uv.y));
        vP = P; vRA = aRect; vRB = aRect2; vBA = aBox; vBB = aBox2; vMix = aMix;
        vec3 transformed = ${ground ? 'vec3(P.x, 0.0, -P.y)' : 'vec3(P.x, 0.0, 0.0) + uUp * P.y + uBack'};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vP;
        varying vec4 vRA;
        varying vec4 vRB;
        varying vec4 vBA;
        varying vec4 vBB;
        varying float vMix;`)
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
        vec4 bpFrame(vec4 r, vec4 b) {
          // No early returns: texture lookups in divergent branches get garbage derivatives, a wild
          // mip level and a line of neighbouring frames along the card's edge.
          vec2 q = (vP - b.xy) / max(b.zw - b.xy, vec2(1e-5));
          float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
          if (r.z < 0.0) { q.x = 1.0 - q.x; r.z = -r.z; } // a mirrored frame (see mirrored())
          // A texel inside the frame's own rect: never a line of the neighbouring frame.
          vec2 ts = 1.0 / vec2(textureSize(map, 0));
          vec2 lo = vec2(r.x, 1.0 - r.y - r.w) + ts;
          vec2 hi = vec2(r.x + r.z, 1.0 - r.y) - ts;
          return texture2D(map, clamp(vec2(r.x + q.x * r.z, 1.0 - (r.y + (1.0 - q.y) * r.w)), lo, hi)) * inside;
        }`)
      .replace('#include <map_fragment>', `
        vec4 fA = bpFrame(vRA, vBA);
        vec4 fB = bpFrame(vRB, vBB);
        // Row 149: the sharper frames would show a double exposure through a linear cross-fade on
        // fast limbs; the blend happens in the middle of the interval, each frame holds at its ends.
        float mixAB = smoothstep(0.22, 0.78, vMix);
        float fa = mix(fA.a, fB.a, mixAB);
        vec3 fc = mix(fA.rgb, fB.rgb, mixAB) / max(fa, 1e-4); // premultiplied samples → straight colour
        diffuseColor *= vec4(fc, fa);`);
  };
  m.customProgramCacheKey = () => `life-flipbook-${ground}-${shadow}`;
  return shadow ? m : gradeLife(m);
}

// Row 48: atlases go to the GPU one per frame, as they arrive (life/systems.js hands over the renderer):
// together they are ~60 MB of pixels, and uploaded in the same frame they were a visible hitch.
let uploader = null;
let turn = Promise.resolve();
let pending = 0; // atlases asked for and not yet on the GPU
let idleWaiters = [];
export function setAtlasRenderer(renderer) { uploader = renderer; }
const settle = () => { if (--pending <= 0) { pending = 0; idleWaiters.splice(0).forEach((r) => r()); } };
/** Resolves once every atlas asked for so far is on the GPU (the loader waits for the first ones). */
export const atlasesIdle = () => (pending ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve());
function upload(tex) {
  if (!uploader) { settle(); return tex; }
  const run = turn.then(() => new Promise((resolve) => requestAnimationFrame(resolve))).then(() => { uploader.initTexture(tex); settle(); return tex; });
  turn = run.catch(() => {});
  return run;
}

// Row 48: a 36-megapixel atlas used to cost ~300 ms of main-thread time to decode on first use and
// ~300 ms more for the premultiplied, flipped upload. createImageBitmap does both off the main
// thread (premultiplied and flipped on arrival), so the upload is a plain copy (~35 ms). Safari
// ignores some of these options, so it keeps the old path.
const BITMAP_OK = typeof createImageBitmap === 'function'
  && !/iPhone|iPad|iPod/.test(navigator.userAgent)
  && !(/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(navigator.userAgent));

/** A flipbook atlas: sRGB, premultiplied on upload (see spriteMaterial). */
export function loadAtlas(url, { mipmaps = true } = {}) {
  pending++;
  return loadAtlasNow(url, { mipmaps }).catch((err) => { settle(); throw err; });
}
function loadAtlasNow(url, { mipmaps }) {
  const finish = (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = mipmaps;
    if (!mipmaps) tex.minFilter = THREE.LinearFilter;
    return tex;
  };
  if (BITMAP_OK) {
    return fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status} ${url}`))))
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'premultiply', imageOrientation: 'flipY', colorSpaceConversion: 'none' }))
      .then((bitmap) => {
        const tex = new THREE.Texture(bitmap);
        tex.flipY = false; // already flipped
        tex.premultiplyAlpha = false; // already premultiplied
        tex.needsUpdate = true;
        tex.onUpdate = () => { bitmap.close?.(); tex.onUpdate = null; }; // the GPU has it: free the 100+ MB of pixels in RAM
        return upload(finish(tex));
      });
  }
  return new THREE.TextureLoader().loadAsync(url).then((tex) => {
    tex.premultiplyAlpha = true;
    return upload(finish(tex));
  });
}

/** Instanced flipbook cards on the life layer. */
export function spriteMesh(map, count, opts) {
  const geo = new THREE.PlaneGeometry(1, 1);
  for (const [name, size] of [['aRect', 4], ['aRect2', 4], ['aBox', 4], ['aBox2', 4], ['aMix', 1]]) {
    geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage));
  }
  const mesh = new THREE.InstancedMesh(geo, spriteMaterial(map, opts), count);
  mesh.frustumCulled = false;
  mesh.layers.set(LIFE_LAYER);
  mesh.userData.noAO = true;
  mesh.userData.ground = !!opts?.ground;
  mesh.userData.flip = { slide: opts?.slide ?? 0.48 }; // life/adorn.js: hats and jackets ride on the bodies
  mesh.renderOrder = opts?.shadow ? 1 : 2; // shadows on the ground first, bodies blended over them
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/**
 * Writes instance `slot`: frames `a` and `b` (entries of the atlas json: [u, v, w, h, x0, y0, x1, y1],
 * metres times `scale`), blended by `t`, standing at (x, y, z).
 */
const m4 = new THREE.Matrix4();
export function writeFrame(mesh, slot, a, b, t, x, y, z, scale = 1) {
  const at = mesh.geometry.attributes;
  const ground = mesh.userData.ground;
  const box = (attr, f) => (ground
    ? attr.setXYZW(slot, f[4] * scale, -f[7] * scale, f[6] * scale, -f[5] * scale) // ground rects are x0, z0, x1, z1
    : attr.setXYZW(slot, f[4] * scale, f[5] * scale, f[6] * scale, f[7] * scale));
  at.aRect.setXYZW(slot, a[0], a[1], a[2], a[3]);
  at.aRect2.setXYZW(slot, b[0], b[1], b[2], b[3]);
  box(at.aBox, a);
  box(at.aBox2, b);
  at.aMix.setX(slot, t);
  mesh.setMatrixAt(slot, m4.makeTranslation(x, y, z));
}

/**
 * The left-right mirror image of an atlas frame: same pixels, sampled flipped (negative width), its
 * rect in metres mirrored about the base point. Cached per frame.
 */
const mirrors = new WeakMap();
export function mirrored(f) {
  let m = mirrors.get(f);
  if (!m) {
    m = [f[0], f[1], -f[2], f[3], -f[6], f[5], -f[4], f[7]];
    mirrors.set(f, m);
  }
  return m;
}

/** Hides instance `slot`. */
export function hideFrame(mesh, slot) {
  mesh.setMatrixAt(slot, m4.makeScale(0, 0, 0));
}

/** Flags every per-instance buffer for upload after a round of writeFrame calls. */
export function flush(mesh) {
  const at = mesh.geometry.attributes;
  for (const k of ['aRect', 'aRect2', 'aBox', 'aBox2', 'aMix']) at[k].needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Which two frames of a clip to show at `seconds` into it, and how far between them.
 * Looping clips wrap; one-shot clips hold their last frame. `step` > 1: only every step-th frame
 * exists (the shadows), blended over the gap.
 */
export function framePair(count, fps, seconds, loop, step = 1) {
  const f = (seconds * fps) / step;
  const n = Math.ceil(count / step);
  let i = Math.floor(f);
  let t = f - i;
  let j;
  if (loop) {
    i = ((i % n) + n) % n;
    j = (i + 1) % n;
  } else {
    if (i >= n - 1) { i = n - 1; t = 0; }
    if (i < 0) { i = 0; t = 0; }
    j = Math.min(n - 1, i + 1);
  }
  return [Math.min(count - 1, i * step), Math.min(count - 1, j * step), t];
}
