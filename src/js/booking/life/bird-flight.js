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

/**
 * Row 12: the same line, but with a thermal in it. At `at` s the flock leaves the line, circles `turns`
 * times (radius m, the turn easing in and out over `ramp` s, banking into it) while it rises `rise` m,
 * and carries on along the line where it left it. Birds that follow the leader (a delay each) trace
 * the same circle one behind the other. Same interface as `curve`, plus lift(t) and soar { t1, t2 }.
 */
export function soarCurve({ dir, speed, amp, period, phase = 0, hand = 1, turns = 1, radius = 26, at = 12, rise = 5, ramp = 2.5 }) {
  const base = curve({ dir, speed, amp, period, phase });
  const c = speed / radius; // turn rate when steady
  const hold = (Math.PI * 2 * turns) / c + ramp; // the ramps cost one `ramp` of turning in all
  const t1 = at;
  const t2 = at + hold;
  const h1 = base.yaw(t1);
  const rateOf = (s) => hand * c * Math.min(1, s / ramp, (hold - s) / ramp) * (s > 0 && s < hold ? 1 : 0);
  const DT = 0.05;
  const N = Math.ceil(hold / DT);
  const xs = new Float32Array(N + 2); const zs = new Float32Array(N + 2); const ys = new Float32Array(N + 2);
  const e0 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  base.at(t1, e0);
  xs[0] = e0.x; zs[0] = e0.z; ys[0] = h1;
  for (let k = 0; k <= N; k++) {
    ys[k + 1] = ys[k] + rateOf(k * DT) * DT;
    xs[k + 1] = xs[k] + speed * Math.sin(ys[k]) * DT;
    zs[k + 1] = zs[k] + speed * Math.cos(ys[k]) * DT;
  }
  const sample = (arr, s) => {
    const f = Math.min(N, Math.max(0, s / DT));
    const i = Math.floor(f);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const end = { x: sample(xs, hold), z: sample(zs, hold) };
  const shiftX = end.x - e0.x; const shiftZ = end.z - e0.z;
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  return {
    base: base.base,
    soar: { t1, t2 },
    at(t, out) {
      if (t <= t1) return base.at(t, out);
      if (t < t2) return out.set(sample(xs, t - t1), 0, sample(zs, t - t1));
      base.at(t - hold, out);
      return out.set(out.x + shiftX, 0, out.z + shiftZ);
    },
    yaw: (t) => (t <= t1 ? base.yaw(t) : t < t2 ? sample(ys, t - t1) : base.yaw(t - hold)),
    rate: (t) => (t <= t1 ? base.rate(t) : t < t2 ? rateOf(t - t1) : base.rate(t - hold)),
    bank(t, v = speed) {
      if (t <= t1) return base.bank(t, v);
      if (t < t2) return -Math.atan((v * rateOf(t - t1)) / G);
      return base.bank(t - hold, v);
    },
    /** Height gained in the thermal: up while circling, eased back over the next 14 s. */
    lift: (t) => rise * (smooth(t1, t2, t) - smooth(t2, t2 + 14, t)),
    /** 0..1: how deep in the thermal (for the wings to stop beating and spread). */
    soaring: (t) => smooth(t1 - 0.5, t1 + 2, t) * (1 - smooth(t2 - 2, t2 + 0.5, t)),
    hold,
  };
}
