import { netCatch } from './sounds.js';

// Round 9 (row 15): a ball dropped with the ball tap (interact/ball-tap.js) that runs into the net
// is caught by it: a thump and a shiver of the mesh (its own sound), the ball loses its pace, then
// slides down the mesh to the court and dribbles a little way back from it.
//
// Every court's net crosses the middle of its long side: tennis 0.914 m high in the middle and
// 1.07 m at the posts, 0.914 m outside the doubles lines; padel 0.88 m / 0.92 m, 10 m wide.

const NET = {
  tennis: { low: 0.914, post: 1.07, half: 6.4 },
  padel: { low: 0.88, post: 0.92, half: 5 },
};
const NEAR = 1.6; // m: a ball dropped this close to the net is usually aimed at it
const SLIDE = 1.1; // m/s: the mesh holds the ball back as it drops

/** The net of a court plane's box: long axis, middle, half span, heights. */
function netOf(b) {
  if (b.net) return b.net;
  const { min, max } = b.box;
  const alongX = max.x - min.x > max.z - min.z; // the court's long side
  const spec = b.surface === 'padel' ? NET.padel : NET.tennis;
  b.net = { alongX, at: alongX ? (min.x + max.x) / 2 : (min.z + max.z) / 2, mid: alongX ? (min.z + max.z) / 2 : (min.x + max.x) / 2, ...spec };
  return b.net;
}
const across = (n, p) => (n.alongX ? p.x : p.z); // position along the long axis
const lateral = (n, p) => (n.alongX ? p.z : p.x);

/** On a drop close to the net, most balls are sent its way (so the catch is easy to find). */
export function aimAtNet(b) {
  const n = netOf(b);
  const d = n.at - across(n, b.p);
  if (Math.abs(d) > NEAR || Math.abs(lateral(n, b.p) - n.mid) > n.half - 0.3 || Math.random() > 0.75) return;
  // Reaches the net just after the first bounce, low on the mesh (it drops from ~2 m: 0.64 s).
  const pace = Math.min(2.6, Math.max(0.8, Math.abs(d) / (0.5 + Math.random() * 0.1)));
  const side = (Math.random() - 0.5) * 0.6;
  const s = Math.sign(d);
  if (n.alongX) { b.v.x = s * pace; b.v.z = side * pace; } else { b.v.z = s * pace; b.v.x = side * pace; }
}

/**
 * After a physics step (ball-tap.js step): did the ball cross the net plane below the tape?
 * Then it is caught. `prev` is its position before the step, `sound(b, level)` plays where it is.
 */
export function netStep(b, prev, r, sound) {
  const n = netOf(b);
  const a0 = across(n, prev) - n.at;
  const a1 = across(n, b.p) - n.at;
  if (b.netted) {
    // Hanging in the mesh: stays on its side of it, slides down, then rolls a little way off.
    const s = b.netted;
    if (Math.sign(a1) !== s || Math.abs(a1) < r) {
      if (n.alongX) { b.p.x = n.at + s * r; b.v.x = Math.max(0, s * b.v.x) * s; } else { b.p.z = n.at + s * r; b.v.z = Math.max(0, s * b.v.z) * s; }
    }
    if (b.p.y - r - b.y > 0.01 && b.v.y < -SLIDE) b.v.y = -SLIDE;
    return;
  }
  if (a0 === 0 || Math.sign(a0) === Math.sign(a1)) return;
  const off = Math.abs(lateral(n, b.p) - n.mid);
  if (off > n.half) return; // round the post
  const top = n.low + (n.post - n.low) * (off / n.half); // the tape sags to the middle
  if (b.p.y - r - b.y > top) return; // over the tape
  // Caught: back on the side it came from, pace gone into the mesh.
  const s = Math.sign(a0);
  b.netted = s;
  const speed = Math.hypot(b.v.x, b.v.z);
  if (n.alongX) { b.p.x = n.at + s * r; b.v.x = s * speed * 0.12; b.v.z *= 0.2; } else { b.p.z = n.at + s * r; b.v.z = s * speed * 0.12; b.v.x *= 0.2; }
  b.v.y = Math.min(b.v.y, 0) * 0.3;
  b.rolling = false; // it drops again, down the mesh
  b.restAt = 0;
  sound(b, Math.min(1, 0.35 + speed / 4));
}

/** The net's own sound for a ball, level 0..1 (impact and distance), pan −1..1. */
export function playNet(level, pan) { netCatch(level, pan); }
