// Round 10 (row 2): the shared motion of the flocks. A flock follows a gently curving line (an S
// across the view, not a ruler), every bird turns with it and leans into the turn the way a real
// wing does (the bank follows the turn rate: tan(bank) = v * rate / g), pitches with its climb, and
// rides a slow swell of its own so the flock spreads over several heights.

const G = 9.81;

/**
 * A curved line along `dir` at `speed`: lateral swing `amp` m, one swing per `period` s.
 * at(t, out) puts the flock's centre at t (relative to the origin), yaw/rate give the heading and
 * its change, bank(t, v) the lean of a bird flying v m/s.
 */
export function curve({ dir, speed, amp, period, phase = 0 }) {
  const w = (Math.PI * 2) / period;
  const base = Math.atan2(dir.x, dir.z);
  const yawAt = (t) => base + Math.atan2(amp * w * Math.cos(w * t + phase), speed); // heading, rad
  return {
    base,
    at(t, out) {
      const lat = amp * Math.sin(w * t + phase);
      return out.set(dir.x * speed * t + dir.z * lat, 0, dir.z * speed * t - dir.x * lat);
    },
    yaw: yawAt,
    rate: (t) => (yawAt(t + 0.1) - yawAt(t - 0.1)) / 0.2,
    bank: (t, v = speed) => -Math.atan((v * (yawAt(t + 0.1) - yawAt(t - 0.1))) / 0.2 / G),
  };
}

/** Smooth 0..1..0 envelope of a bout of `len` s: eases in over `ease`, out over `ease`. */
export const envelope = (local, len, ease) => Math.max(0, Math.min(1, local / ease, (len - local) / ease));

/** A wing beat that is not a sine: a long power downstroke, a quick folded upstroke. [-1..1] */
export function stroke(ph) {
  return Math.sin(ph + 0.38 * Math.sin(ph) - 0.12 * Math.sin(2 * ph));
}
