import { reducedMotion } from './life/shared.js';

// Opening flight (round 8, "arrival"): on a visitor's first time on the map, once the loader lifts,
// the drone comes in high over the southern tree belt, banks a little as it sweeps north across the
// courts and settles on the usual start view (camera-rig.js `cinematic`). Any press, wheel, key or
// touch ends it at once (the camera eases onto the start view in 0.3 s).
// First visit per browser only (localStorage); `?intro=1` forces it, `?intro=0` skips it.
// Reduced motion: no flight. Automated browsers (navigator.webdriver) skip it unless forced, so
// headless checks see the normal start view.

const KEY = 'bp-intro-seen';
const DURATION = 5.6;
const deg = (d) => (d * Math.PI) / 180;

function wanted() {
  const q = new URLSearchParams(location.search).get('intro');
  if (q === '0' || reducedMotion()) return false;
  if (q === '1') return true;
  if (navigator.webdriver) return false;
  try { return localStorage.getItem(KEY) !== '1'; } catch { return false; }
}

/**
 * Path from high over the south belt to `end` (a normal rig state). Keys are offsets from the end
 * view, so the flight fits any screen; pitch/yaw are tilts from the fixed drone basis.
 */
export function introKeys(end) {
  const { x, z, dist } = end;
  return [
    { x: x - 12, z: z + 28, dist: dist * 1.55, pitch: deg(17), yaw: deg(-10) },
    { x: x - 8, z: z + 16, dist: dist * 1.32, pitch: deg(10), yaw: deg(-6.5) },
    { x: x - 3, z: z + 5, dist: dist * 1.1, pitch: deg(3.5), yaw: deg(-2) },
    { x, z, dist, pitch: 0, yaw: 0 },
  ];
}

/** Puts the camera on the first key and returns { play() → Promise }, or null when there is no flight. */
export function createIntroFlight(rig, end) {
  if (!wanted()) return null;
  const flight = rig.cinematic(introKeys(end), { duration: DURATION, paused: true });
  return {
    play() {
      try { localStorage.setItem(KEY, '1'); } catch { /* private mode: it may play again */ }
      flight.play();
      return flight.done;
    },
    done: flight.done,
  };
}

if (import.meta.env.DEV) {
  window.__bpIntroKeys = introKeys;
}
