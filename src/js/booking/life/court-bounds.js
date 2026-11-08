// Row 19: where a player may stand. One table of limits shared by the planners (players.js,
// player-routine.js, lessons, kids) and by the automatic check (players.simulate, scripts/life-bounds.mjs).
// Court-relative metres: dx along the net, dz from the net towards a baseline.
//
//   tennis: a baseline is 11.885 m from the net; up to 3.5 m behind it, 8.6 m either side of the
//   centre (the doubles line is 5.485; the benches and the walkway round the net post stand at
//   6.4 to 7.7). Leaving the court is done through the gate in the back fence only (|dx| ≤ GATE),
//   by a player with `out` set; the net is not walked through (|dx| < NET_X).

export const BOUNDS = {
  x: 8.6,
  z: 15.4,
  gate: 1.8, // half-width of the gate funnel in the back fence
  fence: 17.42, // the back fence from the net
  side: 8.9, // the side fence from the centre line (the strip between two courts starts here)
  netX: 6.7, // the net and its posts, half-length
  net: 0.4, // half-thickness kept clear on either side
  apart: 0.8, // two people keep at least this far from each other
  soft: 0.7, // soft push-back starts this far inside a limit
};

/** Is (x, z) inside the playable area of court c (margin m widens it)? */
export const inCourt = (c, x, z, m = 0) => Math.abs(x - c.x) <= BOUNDS.x + m && Math.abs(z - c.z) <= BOUNDS.z + m;

/**
 * Pushes `p` back into the court (soft near the limit, hard at it), keeps it on its side of the
 * net and away from `others`. Returns how far it had to be moved (m, before any correction).
 * A player with `out` (fetching a ball, a drink on the footpath, leaving) is only kept out of the
 * fences and the net.
 */
export function confine(c, p, others, dt) {
  const B = BOUNDS;
  let over = 0;
  if (!p.out) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const ex = Math.max(0, Math.abs(dx) - B.x);
    const ez = Math.max(0, Math.abs(dz) - B.z);
    over = Math.max(ex, ez);
    // soft: inside the margin an outward velocity is eased off, so the body slows before the limit
    const sx = Math.sign(dx);
    const sz = Math.sign(dz);
    const ix = Math.abs(dx) - (B.x - B.soft);
    const iz = Math.abs(dz) - (B.z - B.soft);
    if (ix > 0 && p.vx * sx > 0) p.vx *= Math.max(0, 1 - (ix / B.soft) * Math.min(1, dt * 10));
    if (iz > 0 && p.vz * sz > 0) p.vz *= Math.max(0, 1 - (iz / B.soft) * Math.min(1, dt * 10));
    if (ex > 0) { p.x = c.x + sx * B.x; if (p.vx * sx > 0) p.vx = 0; }
    if (ez > 0) { p.z = c.z + sz * B.z; if (p.vz * sz > 0) p.vz = 0; }
  } else {
    // out: not through the back fence outside the gate, not through the side fences
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const adz = Math.abs(dz);
    if (adz > B.z && adz < B.fence && Math.abs(dx) > B.gate && Math.abs(dx) < B.side - 0.15) {
      // in the fence band outside the gate: back to the nearer side of it
      p.z = c.z + Math.sign(dz) * (adz < (B.z + B.fence) / 2 ? B.z : B.fence + 0.02);
      over = 0.5; p.why = 'fence';
    }
    if (adz <= B.z && Math.abs(dx) > B.x && Math.abs(dx) < B.side - 0.15) {
      p.x = c.x + Math.sign(dx) * (Math.abs(dx) < (B.x + B.side) / 2 ? B.x : B.side - 0.1);
      over = 0.5; p.why = 'side';
    }
  }
  // the net
  const side = Math.sign(p.z - c.z) || 1;
  if (p.side && side !== p.side && Math.abs(p.x - c.x) < B.netX) {
    p.z = c.z + p.side * B.net;
    if (p.vz * p.side < 0) p.vz = 0;
    over = Math.max(over, 0.5); p.why = 'net';
  } else if (Math.abs(p.x - c.x) < B.netX && Math.abs(p.z - c.z) < B.net) {
    p.z = c.z + (p.side || side) * B.net;
  } else {
    p.side = side;
  }
  // people
  apart(p, others, dt);
  return over;
}

/**
 * Keeps `p` at least `min` m from each of `others` (a soft push, both give way). Used by the tennis
 * players, the padel foursome and the kids' group.
 */
export function apart(p, others, dt, min = BOUNDS.apart) {
  for (const q of others) {
    if (q === p || q.gone) continue;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    const nx = d > 1e-3 ? dx / d : 1;
    const nz = d > 1e-3 ? dz / d : 0;
    const k = (min - d) * Math.min(1, dt * 8) * 0.5;
    p.x += nx * k; p.z += nz * k;
    q.x -= nx * k; q.z -= nz * k;
  }
}

/**
 * The independent check, strictly the published limits: returns a list of violations of a sampled
 * state ({ out, x, z } per player, court-relative), empty when all is well.
 */
export function violations(players, min = BOUNDS.apart) {
  const B = BOUNDS;
  const e = 0.03;
  const bad = [];
  players.forEach((p, i) => {
    const adx = Math.abs(p.dx);
    const adz = Math.abs(p.dz);
    if (!p.out && (adx > B.x + e || adz > B.z + e)) bad.push(`bounds p${i} ${p.dx.toFixed(2)},${p.dz.toFixed(2)}`);
    if (p.out && adz > B.z + e && adz < B.fence && adx > B.gate + e && adx < B.side) bad.push(`fence p${i} ${p.dx.toFixed(2)},${p.dz.toFixed(2)}`);
    if (p.out && adz <= B.z && adx > B.x + e && adx < B.side - 0.15 - e) bad.push(`side-fence p${i} ${p.dx.toFixed(2)},${p.dz.toFixed(2)}`);
    if (adx < B.netX && adz < B.net - e) bad.push(`net p${i} ${p.dx.toFixed(2)},${p.dz.toFixed(2)}`);
  });
  if (players.length > 1) {
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const d = Math.hypot(players[i].dx - players[j].dx, players[i].dz - players[j].dz);
      if (d < min - 0.12) bad.push(`overlap p${i}-p${j} ${d.toFixed(2)}`);
    }
  }
  return bad;
}
