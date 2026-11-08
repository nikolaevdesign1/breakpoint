import { lifeTime, reducedMotion } from './shared.js';
import { createCars } from './cars.js';
import { createDaylight } from './daylight.js';
import { perf, throttled } from '../perf.js';

// Background life on the booking map (row 95): wind in the trees (life/wind.js, in the impostor
// shader), birds crossing now and then, a car leaving or parking every minute or two, rallies on a
// few courts and a cat wandering the grounds. Every system draws on the life layer, so while the
// camera is still it is redrawn over the cached static frame (see lookdev.js) at a low cost.
//
// Each system: { tick(t, dt) → boolean (needs frames), takeStaticChange?() → boolean,
//                pick?(x, y, touch) → kind | null, click?(x, y, touch) → boolean, debug?() }

export function createLife(ctx) {
  const still = reducedMotion(); // ambient motion is decoration: none with reduced motion
  const systems = [];
  const add = (sys) => { if (sys) systems.push(sys); return sys; };

  // Synchronous part: the cars come out of the merged props before the shadow map is drawn.
  const cars = add(createCars(ctx, { still }));
  const daylight = add(createDaylight(ctx, { still })); // round 7: the Miami clock lights the first frame too

  let started = false;
  let starting = null;
  return {
    /** After the first visible frame: birds and sprite sheets load in the background. */
    start() {
      if (started) return starting;
      started = true;
      starting = import('./systems.js').then(({ startSystems }) => startSystems(ctx, { still, dev: this.dev, add })).catch((err) => console.warn('Life failed', err));
      return starting;
    },
    tick(t, dt) {
      if (!still) lifeTime.value = t;
      let alive = !still; // the trees always move a little
      if (import.meta.env.DEV) {
        // Dev: CPU time of every system's tick, for the FPS overlay and scripts/perf-booking.mjs.
        const t0 = performance.now();
        for (const s of systems) {
          const a = performance.now();
          alive = s.tick(t, dt) || alive;
          const b = (this.cost[s.name ?? '?'] ??= { ms: 0, n: 0 });
          b.ms += performance.now() - a; b.n++;
        }
        this.cost.$total ??= { ms: 0, n: 0 };
        this.cost.$total.ms += performance.now() - t0; this.cost.$total.n++;
        return alive;
      }
      for (const s of systems) alive = s.tick(t, dt) || alive;
      return alive;
    },
    cost: {},
    takeStaticChange() {
      let changed = false;
      for (const s of systems) changed = (s.takeStaticChange?.() ?? false) || changed;
      return changed;
    },
    pick(x, y) {
      for (const s of systems) { const k = s.pick?.(x, y, false); if (k) return k; }
      return null;
    },
    click(x, y, touch) {
      return systems.some((s) => s.click?.(x, y, touch));
    },
    label: (kind) => (kind === 'cat' ? 'Catch the cat' : systems.map((s) => s.label?.(kind)).find(Boolean) ?? null), // round 8: systems may name their own kinds
    debug: () => Object.fromEntries(systems.map((s, i) => [s.name ?? i, s.debug?.()])),
    /** Dev hooks for the headless checks. */
    dev: { cars, daylight },
  };
}
