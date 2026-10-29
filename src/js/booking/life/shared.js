// Shared bits of the living map (row 95): the render layer of things that move while the camera is
// still, and the clock every life shader reads.

/** Objects on this layer are redrawn over the cached static frame; everything else is baked. */
export const LIFE_LAYER = 3;

/** Seconds since the page started, shared by every life shader (wind, birds, sprites). */
export const lifeTime = { value: 0 };

/** Deterministic random, so placements look the same on every visit. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
