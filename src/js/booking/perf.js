// Frame-rate budget of the booking map (row 20 of docs/edits-booking-2026-11-06.md).
//
// One place that decides how much the map may do per frame, so the heavy systems do not each guess:
//  - tier: 'high' | 'medium' | 'low', from the machine (cores, memory, screen) and then from the
//    measured frame time. The tier can only go down in a visit, never up, so it does not flap.
//    `?quality=low|medium|high` forces it (a link for testing).
//  - budget: what the tier allows (share of optional people and birds, holiday effects, how often
//    the ambient systems tick). Systems read `budget` where they size or pace themselves.
//  - visibility: `perf.hidden` is true while the tab is hidden; timers skip their work then.
//  - view: the ground rectangle the camera sees, so a system can tell if its place is on screen.

const TIERS = ['low', 'medium', 'high'];

function detectTier() {
  const forced = new URLSearchParams(location.search).get('quality');
  if (TIERS.includes(forced)) return forced;
  const small = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8; // Chrome reports 0.25 to 8; Safari and Firefox leave it out
  if (small || cores <= 4 || memory <= 4) return 'low';
  if (cores <= 6) return 'medium';
  return 'high';
}

// What each tier allows. `people` and `birds` scale the optional ones (the lesson groups, the second
// flock, the crowd), never the core of the scene: a rally on a booked court always has its players.
// `fx` scales holiday particles; `heavyFx` switches off the costliest holiday effects (fireworks, snow
// crew, ghost swarms). `tickHz` caps how often ambient systems that need no 60 Hz step are updated.
const BUDGETS = {
  high: { people: 1, birds: 1, fx: 1, heavyFx: true, tickHz: 60, spriteHz: 60, pixelCap: 1.5 },
  medium: { people: 0.75, birds: 0.75, fx: 0.7, heavyFx: true, tickHz: 60, spriteHz: 60, pixelCap: 1.25 },
  low: { people: 0.5, birds: 0.5, fx: 0.4, heavyFx: false, tickHz: 30, spriteHz: 30, pixelCap: 1.5 },
};

export const perf = {
  tier: detectTier(),
  forced: TIERS.includes(new URLSearchParams(location.search).get('quality')),
  budget: null,
  hidden: document.hidden,
  /** Frames per second the page may draw at (0: the display rate). Set to 30 when even 'low' cannot hold 40. */
  fpsCap: 0,
  /** Why the tier dropped, newest last (dev overlay and the regression script read it). */
  log: [],
};
perf.budget = { ...BUDGETS[perf.tier] };

const listeners = new Set();
/** Calls `fn(tier, budget)` now and whenever the tier drops. */
export function onTier(fn) {
  listeners.add(fn);
  fn(perf.tier, perf.budget);
  return () => listeners.delete(fn);
}

function setTier(tier, why) {
  if (tier === perf.tier) return;
  perf.tier = tier;
  perf.budget = { ...BUDGETS[tier] };
  perf.log.push(`${tier}: ${why}`);
  listeners.forEach((fn) => fn(tier, perf.budget));
}

/** One step down (high to medium to low). Does nothing once low, or when the tier was forced. */
export function downgrade(why) {
  if (perf.forced) return false;
  const next = TIERS[TIERS.indexOf(perf.tier) - 1];
  if (!next) return false;
  setTier(next, why);
  return true;
}

// --- Frame probe ---------------------------------------------------------------------------------
// Fed every frame with the frame time. When the frames stay long for about three seconds at the
// lowest render scale, the machine cannot hold the tier: step down. A hidden tab, a stall of the
// first seconds (shader compile, atlas upload) and a lone long frame are ignored.
const probe = { ema: 16.7, slow: 0, since: performance.now(), cool: 0 };
export function probeFrame(deltaMs, atFloor) {
  if (perf.hidden || deltaMs > 250) return; // a paused tab or a one-off stall, not the steady state
  probe.ema += (deltaMs - probe.ema) * 0.1;
  if (performance.now() - probe.since < 6000) return; // start-up is slower than the steady state
  probe.cool--;
  if (probe.ema > 26 && atFloor) probe.slow++; else probe.slow = Math.max(0, probe.slow - 2);
  if (probe.slow > 180 && probe.cool <= 0) {
    const why = `frames ${probe.ema.toFixed(0)} ms at the lowest scale`;
    if (downgrade(why)) { probe.slow = 0; probe.cool = 600; } else if (perf.tier === 'low' && !perf.fpsCap && !perf.forced) { perf.fpsCap = 30; perf.log.push(`cap 30 fps: ${why}`); probe.slow = 0; probe.cool = 600; }
  }
}
export const frameEma = () => probe.ema;

// --- Visibility ----------------------------------------------------------------------------------
const catchUp = new Set(); // timers that run once on return, so a clock does not show stale minutes
document.addEventListener('visibilitychange', () => {
  perf.hidden = document.hidden;
  probe.ema = 16.7;
  probe.slow = 0;
  probe.since = performance.now() - 3000; // give the first frames after a return a short grace
  if (!document.hidden) catchUp.forEach((fn) => fn());
});

/** setInterval that does nothing while the tab is hidden and runs once when the tab comes back. */
export function visibleInterval(fn, ms) {
  catchUp.add(fn);
  return setInterval(() => { if (!perf.hidden) fn(); }, ms);
}

// --- Camera view ---------------------------------------------------------------------------------
// Ground rectangle (x, z) the camera sees, padded; set from the scene's ticker when the view moves.
const view = { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 };
export function setView(rect) { Object.assign(view, rect); }
/** Is the ground point (x, z) inside the visible rectangle, plus `pad` metres? */
export function inView(x, z, pad = 0) {
  return x > view.minX - pad && x < view.maxX + pad && z > view.minZ - pad && z < view.maxZ + pad;
}

// --- Ambient throttle ----------------------------------------------------------------------------
/**
 * Wraps a tick so it runs at most `hz` times a second and gets the time it missed as `dt`. For
 * systems that move slowly or draw something that changes in steps (birds far away, drifting
 * clouds, a car on a path), where 60 steps a second add nothing the eye can see.
 */
export function throttled(tick, hzOf) {
  let last = -1;
  let acc = 0;
  return (t, dt) => {
    acc += dt;
    const hz = typeof hzOf === 'function' ? hzOf() : hzOf;
    if (last >= 0 && t - last < 1 / hz - 0.002) return false;
    const step = acc;
    acc = 0;
    last = t;
    return tick(t, step);
  };
}
