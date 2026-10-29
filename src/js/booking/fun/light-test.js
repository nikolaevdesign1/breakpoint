import { isSlotTaken, HOURS } from '../../shared/availability.js';
import { hourState } from '../hour-state.js';
import { weatherSky } from '../life/sky.js';
import { courtPick } from './court-pick.js';
import { relayClunk } from './sounds.js';

// Round 9 (row 14): try the lights. After dark, pointing at a free court (or tapping it) switches
// its floodlights on the way real metal-halide masts come on: the contactor clunks, the lamps
// stutter and catch, then burn. They stay on a couple of seconds after the pointer leaves, then
// fade out again (unless the court is open, booked or hovered: scene.js keeps those lit).
// The lamp level is driven through floodlights.test() (scene.js), which hands it back afterwards.

// Warm-up: [seconds, level].
const STUTTER = [[0, 0], [0.06, 0.5], [0.12, 0.06], [0.24, 0.62], [0.3, 0.18], [0.44, 0.8], [0.54, 0.55], [0.8, 1]];
const HOLD = 2.4; // s lit after the pointer leaves
const AGAIN = 4; // s before the same court plays its warm-up again

function levelAt(t) {
  let i = 0;
  while (i + 1 < STUTTER.length && t >= STUTTER[i + 1][0]) i++;
  const [t0, v] = STUTTER[i];
  const from = i ? STUTTER[i - 1][1] : 0;
  return from + (v - from) * Math.min(1, (t - t0) / 0.03); // each step snaps (lamps don't glide)
}

export function createLightTest(ctx, { players, padel }) {
  const { floodlights, rig } = ctx;
  if (!floodlights?.test) return null;
  const pick = courtPick(ctx);
  const tests = new Map(); // id -> { start, hovered, leftAt }
  const lastRun = new Map();
  let changed = false;

  const night = () => weatherSky.day < 0.02;
  function free(id) {
    if (floodlights.lit().includes(id)) return false; // booked at this hour after dark: already on
    if (hourState.dayKey && HOURS.includes(hourState.hour) && isSlotTaken(id, hourState.dayKey, hourState.hour)) return false;
    return !players?.game?.(id) && !padel?.game?.(id);
  }

  function start(id) {
    const now = performance.now() / 1000;
    const t = tests.get(id);
    if (t) { t.hovered = true; return; }
    if (!night() || !free(id) || now - (lastRun.get(id) ?? -99) < AGAIN) return;
    lastRun.set(id, now);
    tests.set(id, { start: now, hovered: true, leftAt: 0 });
    floodlights.test(id, 0);
    const box = pick.byId(id)?.box;
    if (box) {
      const v = rig.state;
      const x = (box.min.x + box.max.x) / 2;
      const z = (box.min.z + box.max.z) / 2;
      const s = rig.screenOf(x, z);
      relayClunk(Math.max(0.15, Math.min(1, 40 / v.dist)), (s.x / innerWidth) * 2 - 1);
    }
    changed = true;
  }

  let hoveredId = null;
  pick.on((hit) => {
    const id = hit?.court.id ?? null;
    if (id === hoveredId) return;
    const prev = tests.get(hoveredId);
    if (prev) { prev.hovered = false; prev.leftAt = performance.now() / 1000; }
    hoveredId = id;
    if (id) start(id);
  });

  return {
    name: 'light-test',
    tick() {
      if (!tests.size) return false;
      const now = performance.now() / 1000;
      for (const [id, t] of tests) {
        const done = !t.hovered && now - t.leftAt > HOLD && now - t.start > 0.8 + HOLD;
        if (done || !night()) {
          tests.delete(id);
          floodlights.test(id, null); // scene.js fades it out, or keeps it if it is hovered / open now
          changed = true;
          continue;
        }
        const v = levelAt(now - t.start);
        if (v !== t.v) { t.v = v; floodlights.test(id, v); changed = true; }
      }
      return false;
    },
    takeStaticChange() {
      const c = changed;
      changed = false;
      return c;
    },
    /** Touch has no hover: a tap on a free court tries its lights too (the booking still opens). */
    click(x, y, touch) {
      if (!touch) return false;
      const hit = pick.at(x, y);
      if (hit) { start(hit.court.id); const t = tests.get(hit.court.id); if (t) { t.hovered = false; t.leftAt = performance.now() / 1000; } }
      return false;
    },
    debug: () => ({ night: night(), day: +weatherSky.day.toFixed(3), tests: [...tests].map(([id, t]) => `${id}:${(t.v ?? 0).toFixed(2)}${t.hovered ? ' hovered' : ''}`) }),
    /** Dev: run the warm-up on a court as if hovered then left. */
    run(id) { lastRun.delete(id); start(id); const t = tests.get(id); if (t) { t.hovered = false; t.leftAt = performance.now() / 1000; } return !!t; },
  };
}
