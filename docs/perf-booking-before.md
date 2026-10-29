# Booking performance, before (row 48, /booking.html)

Method: production build with the dev hooks switched on (a throwaway vite config that turns `import.meta.env.DEV` into `true`, so `__bp.benchPlain / benchLife / info` work on minified code), served by a local gzip static server (gzip level 6 on js, css, json, glb, hdr; images as they are), headless Chrome (Metal GPU, `--enable-gpu`), 1440x900 at dpr 2, cache off, no network throttle, `?time=14:00`, season decor as the date gives it (Halloween). Scripts live in the session scratchpad (`r9-optbooking/measure.mjs`, `ab.mjs`, `prof.mjs`). Numbers are from one machine shared with other agents, so GPU timings carry about +-2 ms of noise; transfer sizes are exact.

## First load (everything fetched until the map is up and the sprites are in)

51 requests, **15 325 KB** transferred (the main GLB counts as 2 388 KB because the test server gzips it; its file is 3.2 MB).

| file | KB |
|---|---|
| models/life/players.webp (3277x11088) | 5 736 |
| models/clay_courts.glb | 2 388 |
| models/life/padel.webp | 1 442 |
| models/life/lessons.webp (a lesson was not even on at 14:00) | 1 114 |
| models/life/cat.webp | 810 |
| models/life/players-shadow.webp | 446 |
| models/life/keeper.webp | 391 |
| assets/booking-*.js (one chunk, 1 147 KB raw) | 344 |
| models/impostors/* (12 files) | 887 |
| models/life/padel-shadow + lessons-shadow + cat-shadow + keeper-shadow | 513 |
| models/lightmaps (atlas + ground) | 293 |
| models/sky_512.hdr | 179 |
| models/life/players.json + cat/lessons/padel/keeper json | 203 |
| cart.glb, pixel-reveal.js, css, fonts, two Open-Meteo calls, other | ~420 |

Lazy later: players-hi-a/b/c (4.2 + 4.8 + 3.6 MB) once the view is zoomed in, only for variants on screen.

models/life in the repo: 30 MB.

## JS
- booking chunk 1 146.9 KB raw, 351.6 KB gzip, everything in one file: the Three.js build (~650 KB minified), the 40 life systems, seasons decor, anime, lessons, kids, padel.
- Already lazy: mapsound, mapfun, timelapse, tournament-stands.

## Timing (local, no throttle)
- Loader hidden: 5.2 s after navigation (5.3 to 7.4 s over runs).
- Cause: `life.start()` ran straight after the first frame and built all 25 systems in one go. Main thread: 1 445 ms task at ~1.0 s (createRain alone fired ~4 000 rays at the whole model: 1.4 s), 963 ms task at ~2.6 s (the 36-megapixel players atlas decoded and uploaded on the main thread, 300 + 300 ms), so the loader animation stopped twice and the loader lifted at ~4.0 s although the map was ready at ~1.0 s.
- Frame gaps over 50 ms during load: 1 717 ms, 1 300 ms, 383 ms, 333 ms.

## Frame cost (GPU-synchronised, ms, min of 3 runs)
| | ms |
|---|---|
| benchPlain (moving camera, everything) | 11.6 |
| benchStill (static bake + life) | 13.3 |
| benchLife (still camera, life layer only) | 2.6 |
| idle, 6 s of rAF | 16.67 avg, 0 frames over 20 ms |
| draw calls / triangles (beauty pass) | 186 / 530 000 |
| textures / geometries / programs | 103 / 178 / 111 |

Hiding any one group (benches 145k tris, decor, cars, impostors) changes the plain frame by under 0.6 ms: the frame is fragment-bound, not vertex-bound.

## Idle CPU
6 s profile on the unminified build: life.tick all 40 systems ~71 ms / 6 s (0.2 ms a frame), render ~150 ms / 6 s. 214 event listeners, 4 timers (dock 20 s, soundscape 2 s, countdown 5 s, weather 15 min). 600 synthetic pointermove events on the canvas: 0.058 ms each (not worth a dispatcher).

## 3-minute run with time / season / weather toggling (heap after forced GC)
heap 26.6 -> 30.3 MB (flat after the first minute), listeners 208 flat, DOM nodes ~890 flat, textures 103 -> 110, programs 106 -> 160 (shaders built the first time a feature shows), no leak found.

Toggle hitches (worst frame in the 6 s after the toggle): Anime on **233 ms**, a few 33 ms, rest 17 ms.

## Network calls
Open-Meteo twice (current + hourly) on every load, plus a 15-minute refresh.
