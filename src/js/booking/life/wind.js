import * as THREE from 'three';
import { lifeTime } from './shared.js';

// Wind in the impostor trees and bushes (row 95.1). The sprites are flat cards, so the sway is a
// shear of the card in its vertex shader: nothing at the trunk base, growing up through the crown.
// The breeze comes off the bay (from +x): trees lean downwind and rock at their own natural
// frequency, gusts roll across the club as a slow travelling wave, and the leaves flutter a little
// harder while a gust passes. Per-instance phase comes from where the tree stands.

/** Round 7: how hard the wind blows (1 = the usual breeze; rain and storms push it up, life/storm.js). */
export const windForce = { value: 1 };

/**
 * Per-vertex sway weight for a card built in its own plane (y up from the base anchor, before it
 * is tilted to face the camera). The part of the picture below the anchor is the near side of the
 * crown, so it moves too.
 */
export function addSwayWeights(geometry, top, bottom) {
  const pos = geometry.attributes.position;
  const w = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y >= 0 ? y / top : (-y / bottom) * 0.6;
    const s = Math.min(1, Math.max(0, (t - 0.08) / 0.7));
    w[i] = s * s * (3 - 2 * s) * (0.55 + 0.45 * Math.min(1, t));
  }
  geometry.setAttribute('aSway', new THREE.BufferAttribute(w, 1));
}

/**
 * Adds the sway to an instanced card material (chained after any existing onBeforeCompile).
 * @param {number} amp  crown displacement in metres at full gust
 */
export function swayMaterial(material, amp, cacheKey) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.();
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uTime = lifeTime;
    shader.uniforms.uSwayAmp = { value: amp };
    shader.uniforms.uWindForce = windForce;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uSwayAmp;
        uniform float uWindForce;
        attribute float aSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 at = vec2(0.0);
          #ifdef USE_INSTANCING
            at = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          #endif
          float ph = fract(sin(dot(at, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
          // Gusts: a slow, irregular wave travelling downwind (towards −x) across the grounds.
          float g = uTime * 0.21 + at.x * 0.024 + at.y * 0.007;
          float gust = clamp(0.5 + 0.42 * sin(g) * sin(g * 0.63 + 1.7) + 0.22 * sin(uTime * 0.067 + at.y * 0.013 + 0.8), 0.05, 1.2);
          // Each tree rocks at its own frequency (≈0.4–0.55 Hz) around a lean that follows the gust.
          float f = 2.5 + fract(ph * 1.37) * 0.9;
          float rock = sin(uTime * f + ph) * (0.25 + 0.55 * gust) + gust * 0.9;
          // Leaf flutter: small, fast, varies across the crown.
          float flutter = sin(uTime * 7.1 + position.x * 2.9 + position.y * 2.1 + ph) * 0.16
                        + sin(uTime * 10.7 + position.y * 4.3 - position.x * 1.7) * 0.09;
          float d = uSwayAmp * aSway * uWindForce * (rock + flutter * (0.4 + gust) * (0.4 + 0.6 * uWindForce));
          transformed.x -= d;
          transformed.y -= abs(d) * 0.08;
        }`);
  };
  material.customProgramCacheKey = () => `${prevKey ?? ''}|sway`;
}
