# Final performance, before (2026-11-08)

Method: production build (`vite build --outDir`, one build per state) served by `vite preview`, headless Chrome 1440x900 and 390x844 dpr2, **CPU x4 + Fast 3G (1.6 Mbps, 562 ms RTT)**, cache off, load, wait for network quiet (max 45 s) plus 3 s, then a wheel scroll through the whole page with a rAF frame counter (parallax and Lenis active). Run offline from the machine (the network dropped mid-session), so Fontshare and Unsplash requests fail fast in both sets: weights are local files only. TBT is noisy (+-300 ms between runs, one shared CPU); LCP on home is the intro choreography (preloader minimum 3.8 s, hop, card opens). Script: scratchpad f/measure.cjs.

State: working tree before the final pass (build 2.1 s, site-Cho97IfR.js 110.5 KB, site-BEe5nLh4.css 164.4 KB / 32.7 KB gzip, 285 modules).

### desktop (1440x900)

| page | req | transfer KB | js / css / img / media / font KB | FCP ms | LCP ms | CLS load | CLS scroll | TBT load ms | TBT scroll ms | max long task | scroll FPS | frames >50 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| index | 66 | 5502 | 101 / 33 / 936 / 4364 / 56 | 2128 | 14108 | 0 | 0.0002 | 696 | 322 | 731 | 49.2 | 14 |
| about | 64 | 4101 | 300 / 32 / 472 / 0 / 18 | 1860 | 1860 | 0 | 0.0001 | 585 | 0 | 525 | 59.6 | 0 |
| coaches | 45 | 2124 | 90 / 33 / 1049 / 888 / 56 | 2080 | 5092 | 0 | 0 | 0 | 37 | 476 | 59.8 | 0 |
| tournaments | 34 | 688 | 99 / 33 / 489 / 0 / 56 | 2116 | 7116 | 0.1891 | 0.1891 | 479 | 0 | 529 | 59.8 | 0 |
| memberships | 27 | 402 | 89 / 33 / 211 / 0 / 56 | 2152 | 2964 | 0.0002 | 0.0002 | 18 | 144 | 668 | 45.8 | 19 |
| contacts | 18 | 373 | 83 / 33 / 172 / 0 / 76 | 2208 | 2208 | 0.0246 | 0.0298 | 0 | 48 | 498 | 50.2 | 3 |
| privacy | 13 | 173 | 77 / 33 / 0 / 0 / 56 | 2012 | 2012 | 0 | 0 | 395 | 0 | 445 | 59.7 | 0 |

### mobile (390x844 dpr2)

| page | req | transfer KB | js / css / img / media / font KB | FCP ms | LCP ms | CLS load | CLS scroll | TBT load ms | TBT scroll ms | max long task | scroll FPS | frames >50 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| index | 51 | 4526 | 101 / 33 / 848 / 3476 / 56 | 2120 | 15284 | 0 | 0 | 683 | 0 | 695 | 59.7 | 0 |
| about | 17 | 356 | 79 / 33 / 179 / 0 / 56 | 2056 | 2056 | 0 | 0 | 0 | 0 | 396 | 59.8 | 0 |
| coaches | 44 | 1574 | 90 / 33 / 1049 / 339 / 56 | 2088 | 4792 | 0 | 0 | 0 | 27 | 425 | 59.3 | 1 |
| tournaments | 19 | 371 | 99 / 33 / 172 / 0 / 56 | 2124 | 3544 | 0 | 0 | 572 | 0 | 622 | 59.7 | 0 |
| memberships | 20 | 368 | 89 / 33 / 177 / 0 / 56 | 2152 | 2152 | 0 | 0 | 15 | 45 | 522 | 48.2 | 7 |
| contacts | 17 | 373 | 83 / 33 / 172 / 0 / 76 | 2236 | 3484 | 0.4942 | 0.497 | 0 | 34 | 468 | 49.5 | 2 |
| privacy | 13 | 173 | 77 / 33 / 0 / 0 / 56 | 2008 | 3268 | 0 | 0 | 288 | 0 | 338 | 59.7 | 0 |
