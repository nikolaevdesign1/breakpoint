# Booking performance, after (row 48, /booking.html)

Same method and machine as `perf-booking-before.md` (production build with dev hooks on, gzip static server, headless Chrome on Metal, 1440x900 dpr 2, cache off, `?time=14:00`). Phone numbers: 390x844 dpr 3, `low` quality (the `-lo` atlases). Before and after were measured against two builds served side by side; GPU numbers carry about +-2 ms of noise, transfer sizes are exact.

## Before / after

| metric | before | after |
|---|---|---|
| First-load transfer, desktop | 15 325 KB, 51 requests | **10 852 KB, 49 requests** (-29 %) |
| First-load transfer, phone | 10 747 KB | **~8 090 KB** (8 368 KB measured, minus a duplicate lightmap fetch fixed afterwards) |
| webp atlases in public/models/life | 28.0 MB (30 MB folder) | 19.2 MB (-8.8 MB, -31 %), hi atlases included |
| JS booking chunk (first load) | 1 147 KB raw / 351.6 KB gzip | **869 KB raw / 242.6 KB gzip** (-31 % gzip). The rest loads after the first frame: systems 254 KB / 99.8 KB gz, seasons 27 KB / 12 KB gz (only when decor or Anime is on) |
| Loader lifts (map visible), headless, no throttle | 4.0 s after the page starts (5.2 s to hidden node) | **2.6 s** (hidden at 3.2 s). The map itself is ready at 0.9 s in both; before, the main thread was frozen by life start-up for 3 s |
| Main-thread blocks during load | 1 445 ms + 963 ms + 300 ms | **347 ms + 220 ms** (GLB parse, model compile) and one 261 ms upload behind the loader; nothing after the loader lifts |
| Frame gaps over 50 ms after the loader lifts | none seen, but the loader itself stalled 4 times (up to 1 717 ms) | none |
| Idle frames, 6 s | 16.67 ms avg, 0 over 20 ms | 16.67 ms avg, 0 over 20 ms |
| benchLife (still camera, life layer) | 2.6 ms | 2.9 ms (noise) |
| Moving-camera frame (benchPlain) at the same render scale | 11.7 ms at scale 1.3 | 12.5 ms at scale 1.5 (see "render scale" below) |
| Draw calls / triangles | 186 / 530 000 | 172 / 510 000 |
| Textures at rest | 103 | 97 |
| Open-Meteo requests at load | 2 | **1** (+ cached 10 min in sessionStorage) |
| Hitch when Anime is switched on | 233 ms | 67 to 83 ms (the 20 painted-material shaders still link on first draw; the render target, the anime shader and the module are warmed when the Decor menu opens) |
| Hitch when a lesson hour first shows (10:00) | none (the atlas had loaded at start, 1.1 MB for everyone) | 83 to 116 ms once (atlas download + build) the first time only; warmed when the time bar is touched, 0 ms on repeat |
| Hitch on first rain | 17 ms | 17 ms (puddles built in the background, shaders compiled ahead) |
| Memory, 3 min run with 7 hours, 3 seasons, Anime, 3 weather clicks, twice over | heap 26.6 -> 30.3 MB | heap 26.3 -> 29.9 MB, flat after the first minute; listeners 212 flat; DOM nodes ~880 flat; textures 97 -> 108; no growth on the second lap |

Render scale: the page lowers its pixel ratio when frames run long while the camera moves and raises it again only after 120 smooth moving frames. Before, the start-up freezes pushed the scale to 1.3 for the rest of the visit; now it stays at the 1.5 cap, so the map is sharper, and the A/B GPU numbers above are not like for like (about +33 % pixels).

## What changed

Assets
- Flipbook atlases re-encoded with a coarser alpha and a lower colour quality, `scripts/life/optimize-atlases.mjs` (the sprites are about 30 px tall, side by side crops at 3x are indistinguishable): players 5.7 -> 3.8 MB, players-lo 3.4 -> 2.3, hi a/b/c 12.4 -> 8.2, padel 1.4 -> 0.95, lessons 1.1 -> 0.9, cat 0.8 -> 0.6, keeper 0.4 -> 0.27. Total 28.0 -> 19.2 MB.
- Tree and bush impostors re-encoded from the Blender PNGs at quality 70 / alpha 70 (887 -> 584 KB); the same numbers are in `scripts/optimize-model.mjs`.
- Lessons and kids atlas (900 KB + shadow) now load only when a lesson or the kids group is on at the hour the map shows; warmed when the visitor reaches for the time bar. Padel was already gated on a busy padel court; hi atlases already gated on zoom.
- `<link rel=preload>` for the sky HDR and the two lightmaps next to the GLB; removed the unused unsplash preconnect.
- Checked and left alone: the main GLB (1.77 MB of its 3.2 MB is already WebP textures at 512 to 1024 px, meshopt geometry), lightmaps (q90 bake), sky_512 (the 1K HDR is a Blender pipeline input only, not served to the page).

Code
- `life/index.js` now holds only cars and daylight (needed before the first frame). The other ~25 systems are one lazy chunk (`life/systems.js`) built after the first frame, one per animation frame, each followed by a parallel shader compile (`compileAsync`).
- `life/rallies.js` and `life/lesson-courts.js`: the small tables the first frame needs (which courts have a rally, a lesson, the kids group) split out of players.js, lessons.js, kids.js.
- Holiday decor and Anime (`life/seasons.js`, 27 KB) load only on a dressed-up date or when the visitor picks them; a stub system wakes on `bp-season` / `bp-anime`.
- Rain puddles: 4 000 rays against the whole model (1.4 s of main thread) now run 6 ms per frame in the background; same seed, same puddles.
- Sprite atlases decode off the main thread (`createImageBitmap`, premultiplied and flipped on arrival, Safari and iOS keep the old path) and go to the GPU one per frame; the bitmap is closed after upload. A 36-megapixel upload dropped from ~600 ms of main thread to ~35 ms.
- The loader waits (up to 2 s) for the first sprite sheets to be on the GPU, so those uploads happen behind it.
- One Open-Meteo request for the current weather and the hourly forecast (`open-meteo.js`), cached 10 minutes per tab.
- Anime pass: `warm()` when the Decor menu opens (render target + shader), released after 25 s if unused. Rain, lessons, kids and padel compile their shaders before their first draw.
- `performance.mark` points (`bp-glb-parsed`, `bp-ready`, `bp-loader-done`, `life:<system>` measures) for the next profiling round.

## Measured and left as it is
- Per-frame CPU of the ~40 systems: 0.2 ms a frame (life.tick 71 ms in 6 s of idle), so no per-system skipping was added.
- pointermove: 6 listeners on the canvas, 0.058 ms per event in total, so no shared dispatcher.
- Triangle count: hiding the 31 benches (145k triangles), the decor, the cars or the impostors moves the moving-camera frame by under 0.6 ms; the frame is fragment-bound. The model was not re-exported.
- Timers (dock 20 s, soundscape 2 s, countdown 5 s, weather 15 min): negligible.

## Checks run
- `vite build` passes (196 modules, no warnings besides the chunk size note), zero console errors on every run.
- Booking flow with a group of two courts, member price, invite link, partner flags, walk from the car park (`r9-bookflow/flow1.mjs` against the dev server): same totals and states as before.
- Systems present: 36 at 14:00 (23 with reduced motion), intro flight plays with `?intro=1`, lessons at 10:30 (4 courts), kids at 16:20, padel doubles, keeper, cart, rain then storm, tournament `?tournament=1` (67 spectators), places card, seasons (3) and Anime through the lazy stub, timelapse and postcard buttons, 390 px phone without horizontal overflow.
- Screenshots before / after in `docs/shots/r9-48-booking-*` (14:00, 22:00, storm, Halloween, Anime, phone). Pixel diffs show only edge noise from the different render scale; side by side crops of the players on a zoomed-in court (hi atlas) show no new artefacts.

## Risks
- The atlas re-encode is a second lossy pass over the packed sheets. Re-run pack-sprites.mjs, then optimize-atlases.mjs, never optimize twice on the same files. Another agent regenerating `public/models/life` will overwrite the smaller files.
- `createImageBitmap` options on Safari are not used on purpose (UA check): the old path stays there, untested by me.
- The first lesson hour after a cold start still costs one ~100 ms frame if the visitor jumps straight to it without touching the time bar.
- The loader can now hold for up to 2 s on a slow link while the sprite sheets download (they were not waited for before).
