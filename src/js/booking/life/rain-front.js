import { sky } from '../lookdev.js';

// The rain front (round 9, row 26). Before real rain reaches the map (and when a click on the
// weather asks for rain), booking/weather.js holds the rain back for a few seconds and sends
// `bp-rain-front`. A dark band of cloud then sweeps over the club with the wind: a ragged leading
// edge, darkest just behind it, its shadow on courts, roofs and trees alike (drawn by the finish
// pass from the cached depth, lookdev.js `sky.uFront`, so the static frame is never redrawn). The
// edge passes the middle of the view just before the first drops; once the rain's grey sky has
// come in, the band fades into it.

const STRENGTH = { day: 0.95, storm: 1 };
const AT_CENTRE = 0.5; // share of the hold before the edge crosses the middle of the view (it covers the view by the first drops)
const HOLD_AFTER = { manual: 2.6, live: 7 }; // s the band stays after the rain starts
const FADE = 3.5; // s

export function createRainFront({ rig }, { still }) {
  if (still) return null;
  const u = sky.uFront.value;
  if (import.meta.env.DEV) (window.__bp ??= {}).sky = sky; // dev: headless checks
  let front = null; // { dir, pos, speed, start, delay, strength, fadeAt }

  document.addEventListener('bp-rain-front', (e) => {
    const d = e.detail ?? {};
    if (d.cancel) { if (front) front.fadeAt = Math.min(front.fadeAt, performance.now() / 1000); return; }
    // The wind blows towards windDir + 180° (x east, z south), the same way the cloud shadows drift.
    const to = ((d.windDir ?? 300) + 180) * Math.PI / 180;
    let dx = Math.sin(to);
    let dz = -Math.cos(to);
    if (!Number.isFinite(dx)) { dx = -0.89; dz = 0.45; }
    const s = rig.state;
    const reach = s.dist * 1.35 + 30; // past the corners of the view
    const centre = s.x * dx + s.z * dz;
    const delay = d.delay ?? 4;
    const now = performance.now() / 1000;
    front = {
      dx, dz,
      start: now,
      from: centre - reach,
      speed: reach / (delay * AT_CENTRE),
      strength: d.storm ? STRENGTH.storm : STRENGTH.day,
      fadeAt: now + delay + (d.manual ? HOLD_AFTER.manual : HOLD_AFTER.live),
    };
  });

  return {
    name: 'rainfront',
    tick() {
      if (!front) return false;
      const now = performance.now() / 1000;
      const t = now - front.start;
      const k = Math.min(1, t / 0.8) * (1 - Math.min(1, Math.max(0, now - front.fadeAt) / FADE));
      u.set(front.dx, front.dz, front.from + front.speed * t, front.strength * k * k * (3 - 2 * k));
      if (now > front.fadeAt + FADE) { front = null; u.w = 0; }
      return true;
    },
    debug: () => ({ on: !!front, edge: +u.z.toFixed(1), strength: +u.w.toFixed(2), dir: [+u.x.toFixed(2), +u.y.toFixed(2)] }),
  };
}
