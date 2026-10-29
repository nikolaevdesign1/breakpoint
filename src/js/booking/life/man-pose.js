import { writeFrame, hideFrame, framePair, mirrored } from './sprite.js';

/**
 * Writes the keeper's flipbook into slot `slot` of `body` and `shadow`: `clip` at `seconds`, seen
 * from `heading` (rad, 0 = away from the drone), standing at (x, y, z), the body card `scale` times its size. `data` is keeper.assets.data.
 */
export function poseMan(data, body, shadow, slot, clip, heading, seconds, x, y, z, scale = 1) {
  const H8 = data.headings;
  const c = data.clips[clip];
  const fps = c.fps ?? data.fps;
  const hf = ((((heading / (Math.PI * 2)) * H8) % H8) + H8) % H8;
  const frames = data.frames[clip][Math.round(hf) % H8];
  const of = (e) => (e[2] ? mirrored(data.body[e[0]]) : data.body[e[0]]);
  const [i, j, ft] = framePair(frames.length, fps, seconds, c.loop);
  writeFrame(body, slot, of(frames[i]), of(frames[j]), ft, x, y, z, scale);
  const [si, sj, st] = framePair(frames.length, fps, seconds, c.loop, data.shadowEvery ?? 1);
  const s0 = frames[si][1];
  const s1 = frames[sj][1];
  if (s0 >= 0) writeFrame(shadow, slot, data.shadow[s0], data.shadow[s1 >= 0 ? s1 : s0], st, x, y + 0.004, z);
  else hideFrame(shadow, slot);
}
