import '../../css/booking-intro.css';
import { reducedMotion } from './life/shared.js';

// Opening flight (round 8, "arrival"; row 17 of the 2026-11-06 list: every entry). Once the loader
// lifts and the first frame is on screen, the drone comes in high over the southern tree belt, banks
// a little as it sweeps north across the courts and settles on the end view (camera-rig.js `cinematic`).
//
//   first visit (nothing stored)    full flight, 5.6 s
//   later entries (storage flag)    short flight, 3.6 s
//   deep link (court, invite)       short flight that ends framed on that court
//   deep link (coach, slot)         short flight to the usual view
//   reduced motion                  no flight: a 1.2 s dolly-in from slightly further out
//   ?intro=0 off, ?intro=1 forces it (also in automated browsers, which skip it otherwise so headless
//   checks see the normal start view)
//
// Any press, wheel, key or touch, and the Skip button, end it at once (the camera eases onto the end
// view in 0.3 s and the controls are the visitor's). The flag only picks full or short: it never skips.

const KEY = 'bp-intro-seen';
const FULL = 5.6;
const SHORT = 3.6;
const SOFT = 1.2;
const deg = (d) => (d * Math.PI) / 180;

function seen() {
  for (const store of ['localStorage', 'sessionStorage']) {
    try { if (window[store].getItem(KEY) === '1') return true; } catch { /* blocked storage: counts as not seen */ }
  }
  return false;
}

function markSeen() {
  for (const store of ['localStorage', 'sessionStorage']) {
    try { window[store].setItem(KEY, '1'); } catch { /* private mode: it may play in full again */ }
  }
}

/** 'full' | 'short' | 'soft' | null for this entry. `linked`: the address asks for a place, keep it brief. */
function modeFor(linked) {
  const q = new URLSearchParams(location.search).get('intro');
  if (q === '0') return null;
  if (reducedMotion()) return 'soft';
  if (q !== '1' && navigator.webdriver) return null;
  return linked || seen() ? 'short' : 'full';
}

/**
 * Path from high over the south belt to `end` (a normal rig state). Keys are offsets from the end
 * view, so the flight fits any screen; pitch/yaw are tilts from the fixed drone basis. `reach`
 * shrinks the offsets for the short flights.
 */
export function introKeys(end, reach = 1) {
  const { x, z, dist } = end;
  const far = (k) => 1 + (k - 1) * reach;
  return [
    { x: x - 12 * reach, z: z + 28 * reach, dist: dist * far(1.55), pitch: deg(17 * reach), yaw: deg(-10 * reach) },
    { x: x - 8 * reach, z: z + 16 * reach, dist: dist * far(1.32), pitch: deg(10 * reach), yaw: deg(-6.5 * reach) },
    { x: x - 3 * reach, z: z + 5 * reach, dist: dist * far(1.1), pitch: deg(3.5 * reach), yaw: deg(-2 * reach) },
    { x, z, dist, pitch: 0, yaw: 0 },
  ];
}

/** Reduced motion: no travel, only a gentle pull-in from a little further out. */
function softKeys(end) {
  return [{ x: end.x, z: end.z, dist: end.dist * 1.22, pitch: 0, yaw: 0 }, { x: end.x, z: end.z, dist: end.dist, pitch: 0, yaw: 0 }];
}

const frames = (n) => new Promise((resolve) => {
  const tick = () => (n-- > 0 ? requestAnimationFrame(tick) : resolve());
  tick();
});

let skipButton = null;
function showSkip(onSkip) {
  hideSkip();
  skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'intro-skip';
  skipButton.textContent = 'Skip';
  skipButton.addEventListener('click', onSkip);
  document.body.append(skipButton);
  requestAnimationFrame(() => skipButton?.classList.add('is-shown'));
}
function hideSkip() {
  skipButton?.remove();
  skipButton = null;
}

let started = false; // one flight per page load: a bfcache restore must not start a second

/**
 * Puts the camera on the first key and returns { play() → Promise, done }, or null when there is no
 * flight. `endOf()` gives the view to settle on (called again if the window is resized mid-flight).
 */
export function createIntroFlight(rig, endOf, { linked = false } = {}) {
  const mode = started ? null : modeFor(linked);
  if (!mode) return null;
  const keysOf = () => {
    const end = endOf();
    return mode === 'soft' ? softKeys(end) : introKeys(end, mode === 'short' ? 0.55 : 1);
  };
  const flight = rig.cinematic(keysOf(), mode === 'soft'
    ? { duration: SOFT, ease: 'power2.out', paused: true }
    : { duration: mode === 'short' ? SHORT : FULL, paused: true });

  let raf = 0;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (rig.flying()) flight.retarget(keysOf()); });
  };
  const onPageShow = (e) => { if (e.persisted && rig.flying()) rig.endCinematic(0.01); };
  window.addEventListener('resize', onResize);
  window.addEventListener('pageshow', onPageShow);
  flight.done.then(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pageshow', onPageShow);
    hideSkip();
  });

  return {
    mode,
    /** Starts once the loader is gone and two frames have been drawn, so the first move is smooth. */
    async play() {
      started = true;
      markSeen();
      await frames(2);
      flight.play();
      if (mode !== 'soft' && rig.flying()) showSkip(() => rig.endCinematic(0.3));
      return flight.done;
    },
    done: flight.done,
  };
}

if (import.meta.env.DEV) {
  window.__bpIntroKeys = introKeys;
}
