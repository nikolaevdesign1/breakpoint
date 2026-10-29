import { loadAtlas, framePair, mirrored } from '../life/sprite.js';

// Round 10, row 65: the Halloween sprites (ghosts.webp, death.webp: scripts/life/render_ghosts.py,
// render_death.py) come down only when the decor is first built.

const url = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;
const cache = {};

/** { data, bodyTex, shadowTex? } of one sprite set, once. */
export function loadHaunt(name, quality, { shadow = false } = {}) {
  cache[name] ??= Promise.all([
    fetch(`/models/life/${name}.json`).then((r) => r.json()),
    loadAtlas(url(name, quality)),
    shadow ? loadAtlas(url(`${name}-shadow`, quality)) : null,
  ]).then(([data, bodyTex, shadowTex]) => ({ data, bodyTex, shadowTex }));
  return cache[name];
}

/** The pair of atlas frames (and the blend) for `list` at `seconds` of a looping clip. */
export function framesAt(data, list, seconds, fps) {
  const of = (e) => (e[2] ? mirrored(data.body[e[0]]) : data.body[e[0]]);
  const [i, j, t] = framePair(list.length, fps, seconds, true);
  return [of(list[i]), of(list[j]), t];
}

export const headingIndex = (heading, n = 8) => ((Math.round((heading / (Math.PI * 2)) * n) % n) + n) % n;
export const TAU = Math.PI * 2;
