// Row 48: load a system's heavy assets only when the visitor can see it. `whenNeeded(need)` resolves
// the first time `need()` is true: checked now, on every hour or clock change of the map and when
// something pokes it (`pokeLazy`, a dev trigger). Nothing polls.
export function whenNeeded(need) {
  return new Promise((resolve) => {
    const events = ['bp-hour', 'bp-clock', 'bp-lazy'];
    const check = () => {
      let on = false;
      try { on = need(); } catch { on = false; }
      if (!on) return false;
      events.forEach((e) => document.removeEventListener(e, check));
      resolve();
      return true;
    };
    if (!check()) events.forEach((e) => document.addEventListener(e, check));
  });
}

export const pokeLazy = () => document.dispatchEvent(new CustomEvent('bp-lazy'));

/**
 * Runs `fn` once, the first time the visitor reaches for the time bar (the way into lesson hours):
 * the atlas then downloads, decodes and uploads while they drag, instead of at the hour they land on.
 */
export function onTimeIntent(fn) {
  const bar = document.querySelector('[data-time]');
  if (!bar) return;
  const go = () => { ['pointerenter', 'pointerdown', 'focusin'].forEach((e) => bar.removeEventListener(e, go)); fn(); };
  ['pointerenter', 'pointerdown', 'focusin'].forEach((e) => bar.addEventListener(e, go, { passive: true }));
}
