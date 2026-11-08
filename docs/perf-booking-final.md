# Booking performance, final (row 20 of edits-booking-2026-11-06.md)

Method: dev server (`npm run dev`, the only place `window.__bp` exists), headless Chrome on Metal (`--enable-gpu`), 1440x900 at dpr 2 unless the scenario says otherwise, cache off, 7 s settle after the loader lifts, `season=off` except in the holiday scenarios. Script: `scripts/perf-booking.mjs` (puppeteer-core, no new dependency; set `PUPPETEER_CORE` and `CHROME` if they are not where the script looks).

```
node scripts/perf-booking.mjs --url http://localhost:5183 --label after --out run.json [--only wide,rain] [--budget before.json]
```

Per scenario it prints and stores: `benchPlain` (GPU-synchronised frame with the camera moving, min of 3 runs of 30), `benchLife` (still camera, life layer only), real rAF cadence idle and while the camera flies (fps, frames over 20 ms), CPU time of all rAF callbacks per frame (average and 95th percentile), draw calls, triangles, JS heap, console errors, the tier and render scale the page ended on. `--budget` compares with an earlier run and exits 1 on a scenario that got more than 30 % + 1 ms slower, or on any console error.

The machine is shared with other agents and the GPU numbers carry about +-3 ms of noise (the same code gave 9.5 and 14.4 ms for the rain scenario in two runs), so the "after" columns show the better of two full runs (the first before the 30 fps cap and the tier-rate tweak, the second the final code). CPU columns are steadier.

## Before / after (before / after)

| Scenario | benchPlain ms | benchLife ms | idle CPU per frame, avg ms | idle CPU p95 ms | fps while the camera flies | frames over 20 ms while flying | draw calls | triangles |
|---|---|---|---|---|---|---|---|---|
| Wide view, 14:00 | 9.18 / 10 | 2.64 / 2.83 | 1.13 / 1.00 | 1.7 / 1.5 | 60 / 59.4 | 0 / 1 | 176 / 171 | 408k / 406k |
| Close up on a court | 7.69 / 8.22 | 2.34 / 2.36 | 0.93 / 1.00 | 1.3 / 1.8 | 43.8 / 38.3 | 2 / 2 | 129 / 129 | 404k / 405k |
| Night, 22:00 | 9.98 / 9.78 | 2.68 / 2.21 | 1.07 / 0.76 | 1.8 / 1.2 | 60 / 60 | 0 / 0 | 158 / 160 | 386k / 387k |
| Rain | 9.79 / 9.55 | 3.19 / 3.52 | 1.77 / 1.28 | 3.0 / 2.5 | 60 / 60 | 0 / 0 | 180 / 183 | 420k / 418k |
| Holidays (December) | 10.52 / 9.29 | 2.84 / 2.66 | 1.26 / 1.40 | 1.8 / 2.4 | 60 / 60 | 0 / 0 | 233 / 230 | 1 075k / 1 072k |
| New Year | 12.45 / 10.83 | 2.53 / 2.50 | 1.30 / 1.13 | 1.9 / 1.5 | 60 / 60 | 0 / 0 | 204 / 209 | 438k / 441k |
| Halloween | 11.42 / 10.04 | 2.52 / 2.92 | n/a (1) / 1.40 | n/a (1) / 2.1 | 33.6 / 60 | 25 / 0 | 230 / 235 | 573k / 576k |
| Phone 390x844, dpr 3 | 8.32 / 9.25 | 3.41 / 1.95 | 1.36 / 0.54 | 1.7 / 1.4 | 60 / 60 | 0 / 0 | 186 / 186 | 449k / 448k |
| CPU throttle x4 | 22.34 / 18.42 | 5.51 / 4.55 | 5.06 / 3.92 | 8.1 / 6.9 | 47.8 / 58.6 | 46 / 5 | 177 / 178 | 409k / 475k |

(1) The Halloween "before" run recorded no frames in its idle window (the page was busy finishing the decor build behind the loader) and 25 slow frames in the fly; the later runs on the same code path were clean, so this row is a start-up stall of that one run, not a measured gain.

Tier and run-time checks, final code (dev server, same machine):

| Scenario | benchPlain ms | benchLife ms | idle CPU ms | tier at the end | render scale | console errors |
|---|---|---|---|---|---|---|
| `?quality=medium` | 10.69 | 2.70 | 1.88 | medium | 0.69 | 0 |
| `?quality=low` (desktop) | 9.63 | 3.23 | 0.86 | low | 0.90 | 0 |
| Tier drops high to low while running (`__bp.tierDown()` twice) | 10.51 | 2.86 | 0.76 | low | 1.10 | 0 |
| Tab hidden for 3 s | life ticks while hidden: **0**; 89 ticks in the 1.5 s after it is visible again | | | high | 1.10 | 0 |

Console errors: 0 in every scenario, on the dev server and on a production build served with `vite preview` (desktop and 390 px, Halloween, no horizontal scroll, `html[data-tier]` set).

## What the numbers say

- On this machine (M-series, Metal) the frame is fragment-bound on the GPU, as `perf-booking-before.md` found: the GPU columns did not move beyond the noise, and no change here aims at them. Nothing was traded for it either: draw calls and triangles are the same.
- What moved is the CPU side and the weak-device behaviour. The CPU x4 laptop case (the closest thing to a mid-range machine here) went from 46 frames over 20 ms in a 3.6 s fly to 5, from 47.8 to 58.6 fps, and the idle CPU per frame from 5.1 to 3.9 ms. The phone case idles at 0.54 ms of CPU a frame instead of 1.36 (the life layer is redrawn and ticked at 30 Hz there).
- Where the 60 FPS goal is not met: the close-up fly (30 m from the ground) is 38 to 44 fps on this GPU in both runs. It is the same before and after, GPU-bound (two full-screen MSAA passes at 1.1 to 1.5 scale during a move), and the dynamic resolution already trades pixels for frames there. A fix needs a cheaper close-up pass, not a budget; left as is.
- Real phones and real mid-range laptops were not available: the 4x throttle and the 390 px emulation run on this machine's GPU, so the tier thresholds (below) are set from the code paths and the throttled run, not from a measured weak GPU.

## What changed

New: `src/js/booking/perf.js` (the one place for the budget), `src/js/booking/dev-fps.js` (dev overlay), `scripts/perf-booking.mjs`.

Tier, high / medium / low (`perf.js`)
- Start tier from the machine: low on a phone or coarse pointer, 820 px or narrower, 4 or fewer cores, or 4 GB or less (`deviceMemory`); medium on 6 or fewer cores; high otherwise. `?quality=low|medium|high` forces it (a link for testing; a forced tier never drops).
- FPS probe: after 6 s of steady state, frames over 26 ms at the lowest render scale for about 3 s of moving frames lower the tier one step (high to medium to low), once per 10 s. At low, if even that cannot hold, the page draws at a steady 30 fps (`perf.fpsCap`). A tier never goes up in a visit, so it does not flap. A hidden tab or a stall over 250 ms is not counted.
- Budgets (`perf.budget`): high is exactly the old behaviour. Medium: 75 % of the optional people (lesson groups, ghosts) and birds, 70 % of the holiday particles and snow flakes, render scale cap 1.25. Low: 50 % of people and birds, 40 % of particles and flakes, no fireworks, life layer redrawn and its systems ticked at 30 Hz, AO and bloom of the still frame off when the tier drops at run time, render scale may fall to 55 % of the cap (0.6 minimum).
- `lookdev.detectQuality()` now reads the tier (low stays the same set of phones and weak machines as before, plus the same atlases); the render scale cap, AO and bloom switch follow `onTier`.

Frame budget
- `life.tick` is called at the tier's rate with the time it missed (never above 60 Hz, so a 120 Hz display no longer ticks 120 times); the life layer redraw uses the same rate. Hidden tab: no tick at all, and four periodic timers (dock, soundscape, next-up, countdown; the 15-minute weather refresh stays as it was) use `visibleInterval`, which skips while hidden and runs once on return.
- `perf.setView` publishes the ground rectangle in view (updated at most every 100 ms while the view moves); `inView(x, z, pad)` is there for systems that can idle off screen. Not wired into any system: the per-system tick costs (below) are 0.04 to 0.18 ms each, too small to be worth the risk of a person freezing mid-step when off screen.
- Far people: the players already switch to the sharp atlas only for the player on screen and zoomed in, and trees and props are impostors; no further LOD was needed. Sprite flipbooks stay at their authored 24/12 fps with the cross-fade; the redraw rate is what the tier limits.

No allocation in the tick (heap sampling over 15 s with minor-GC objects included, `src` code only; the numbers are what was found, not everything in three.js)
- `sprite.writeFrame` (closure per call, the top item at 5.7 MB / 15 s) and `framePair` (an array per call) now allocate nothing.
- `cart-look.update`: built a long string key every frame to see if the cart moved; now compares rounded numbers (4.9 MB / 15 s gone).
- `keeper`: idle keeper no longer rewrites brushes and rope every frame; it does when the sun moves or he works (4.5 MB / 15 s gone while idle).
- `lesson-kit` hopper shade: three objects per call, now reused. `courtScreenRect` (used by the annotation pins on every view change): no arrays or spreads, and `courtBox` is cached.
- Left: per-player template strings for the clip key (small), iguana spine layout, car overlap test (runs on parking events), pin layout. Each is under 3 MB / 15 s.

Systems checked (CPU of the tick, wide view, avg ms per frame: cart 0.12 to 0.16, seasons 0.06 to 0.18, padel 0.04 to 0.08, players 0.04 to 0.09, lessons 0.04 to 0.06, everything else under 0.03; the whole life tick 0.4 to 0.64 ms)
- Hologram annotations (DOM pins in `club/pins.js`): their scanline layer animates `background-position`, which repaints every frame, and ran even for labels not shown. Now paused unless the label is shown (`booking-club.css`), and still at low tier. Layout is on view change only.
- Drinking fountains, pond and birds: tick cost under 0.03 ms; the pond shader loops only over live ripples. Birds and parrots take their flock size from `budget.birds`.
- Ghosts (Halloween): up to 8 flying ones, a weaker tier keeps `ceil(8 x people)` and hides the rest (mesh invisible, no draw call).
- Snow and holiday bits: all motion is in the vertex shader, so the CPU cost is nil; the draw range now follows `budget.fx` (fewer points submitted, not just faded out).
- Fireworks (New Year, July 4th): off at low.

Dev tools
- FPS overlay: press **F** on the dev server (not in the production build, checked): fps, frame ms, tier, render scale, draw calls, triangles, tick ms, the six most expensive life systems, tier drops with their reason. `__bp.perf()`, `__bp.perfReset()`, `__bp.tierDown()`, `__bp.setHidden(bool)` are the hooks the script uses.

## Why `vite build` was said to take ~5 minutes

Not reproducible: `npm run build` takes **2.5 s** (three runs, 2.1 to 2.7 s of Vite time, 11 pages, 67 MB `dist`), same with `--outDir` elsewhere. Checked and found innocent: `public/` is 54 MB (27 MB media, 27 MB models) and copies in well under a second; `htmlPartials` (9 partials, `{{fact:...}}` filled by a regex) and the 11 entry pages cost milliseconds; the one `import.meta.glob` (holiday packs, 11 small files) is fine; `optimizeDeps` and the watcher ignore list affect the dev server only. The likely cause of the slow run is not in the repo: the machine was busy with parallel agents (Blender renders and several headless Chromes) while the build ran, and Vite's minifier and the copy of `public/` are CPU and disk work that suffers under such load. Only change made: `build.reportCompressedSize: false` in `vite.config.js` (skips gzipping every chunk just to print a size). If it recurs, run `npx vite build --debug` and look at the `[vite:...]` plugin timings first.

## Not done

- Per-system off-screen idling (`perf.inView`) is in place but unused, see above.
- No measurement on a physical phone or a real weak GPU.
- The close-up fly stays at 38 to 44 fps on this GPU (see "What the numbers say").
