# Final performance, after (2026-11-08)

Method: production build (`vite build --outDir`, one build per state) served by `vite preview`, headless Chrome 1440x900 and 390x844 dpr2, **CPU x4 + Fast 3G (1.6 Mbps, 562 ms RTT)**, cache off, load, wait for network quiet (max 45 s) plus 3 s, then a wheel scroll through the whole page with a rAF frame counter (parallax and Lenis active). Run offline from the machine (the network dropped mid-session), so Fontshare and Unsplash requests fail fast in both sets: weights are local files only. TBT is noisy (+-300 ms between runs, one shared CPU); LCP on home is the intro choreography (preloader minimum 3.8 s, hop, card opens). Script: scratchpad f/measure.cjs.

## Before / after (same method)
| page | requests | transfer KB | JS KB | CSS KB | media KB | LCP ms | CLS (load) | scroll FPS |
|---|---|---|---|---|---|---|---|---|
| desktop/index | 66 > 72 | 5502 > 4520 | 101 > 103 | 33 > 30 | 4364 > 3279 | 14108 > 13492 | 0 > 0 | 49.2 > 53.4 |
| desktop/about | 64 > 62 | 4101 > 4131 | 300 > 295 | 32 > 30 | 0 > 0 | 1860 > 2056 | 0 > 0 | 59.6 > 59.9 |
| desktop/coaches | 45 > 44 | 2124 > 2117 | 90 > 86 | 33 > 30 | 888 > 888 | 5092 > 4324 | 0 > 0 | 59.8 > 60 |
| desktop/tournaments | 34 > 33 | 688 > 683 | 99 > 98 | 33 > 30 | 0 > 0 | 7116 > 6488 | 0.1891 > 0.0753 | 59.8 > 59.8 |
| desktop/memberships | 27 > 28 | 402 > 401 | 89 > 91 | 33 > 30 | 0 > 0 | 2964 > 2412 | 0.0002 > 0.0002 | 45.8 > 46.9 |
| desktop/contacts | 18 > 17 | 373 > 366 | 83 > 80 | 33 > 30 | 0 > 0 | 2208 > 2060 | 0.0246 > 0.0248 | 50.2 > 51.9 |
| desktop/privacy | 13 > 13 | 173 > 166 | 77 > 73 | 33 > 30 | 0 > 0 | 2012 > 1892 | 0 > 0 | 59.7 > 59 |
| mobile/index | 51 > 49 | 4526 > 4133 | 101 > 103 | 33 > 30 | 3476 > 3085 | 15284 > 14560 | 0 > 0 | 59.7 > 59.9 |
| mobile/about | 17 > 15 | 356 > 348 | 79 > 74 | 33 > 30 | 0 > 0 | 2056 > 2064 | 0 > 0 | 59.8 > 59.8 |
| mobile/coaches | 44 > 43 | 1574 > 1993 | 90 > 86 | 33 > 30 | 339 > 765 | 4792 > 3608 | 0 > 0 | 59.3 > 59.4 |
| mobile/tournaments | 19 > 18 | 371 > 367 | 99 > 98 | 33 > 30 | 0 > 0 | 3544 > 3284 | 0 > 0 | 59.7 > 59.7 |
| mobile/memberships | 20 > 21 | 368 > 367 | 89 > 91 | 33 > 30 | 0 > 0 | 2152 > 2056 | 0 > 0 | 48.2 > 48.6 |
| mobile/contacts | 17 > 16 | 373 > 366 | 83 > 80 | 33 > 30 | 0 > 0 | 3484 > 3324 | 0.4942 > 0.2456 | 49.5 > 50.9 |
| mobile/privacy | 13 > 13 | 173 > 166 | 77 > 73 | 33 > 30 | 0 > 0 | 3268 > 3172 | 0 > 0 | 59.7 > 59.7 |
Reading it: CSS 33 > 30 KB on every page (-9%, raw 164 > 144 KB); JS of the shared chunk 110.5 > 102.2 KB raw (35.0 KB gzip); home transfer -980 KB desktop / -390 KB mobile (the cta and lane clips no longer fetch metadata before they are near the screen); tournaments CLS 0.189 > 0.075; mobile contacts CLS 0.49 > 0.25. Media rows for coaches and about move by hundreds of KB between runs because lazy tiles and the idle-loaded 3D chunk land inside or outside the wait window; treat as noise. TBT per page moved +-300 ms in both directions (noise); long tasks stay under 750 ms at CPU x4 and come from the intro and the Lenis/ScrollTrigger setup, not from a single module.

## What changed
- `partials/cta.html`, `src/js/site/cta.js`: the 3.7 MB clip has `preload="none"`, `data-src`, and gets its `src` only when the block is one screen away; poster until then. Same on all pages that carry the block.
- `src/js/site/court-lane.js`: lane videos `preload="metadata"` > `none` (no range requests on load; they load on play).
- `index.html`: removed the unused `preconnect` to images.unsplash.com (the Unsplash images load far below the hero; the connection opens on demand and no longer competes with hero poster and fonts).
- `src/js/site/site.js`: `ambient-music` (own 8.7 KB chunk) and `custom-select` + `date-picker` (13 KB) are dynamic imports; custom-select loads only on pages that have a select, a date input or a check box.
- `src/js/site/reviews.js`: the review form (`review-form.js`, 2.9 KB, line-form) loads on hover, focus, idle (8 s) or the first tap, then opens; verified on memberships at 1440 and 390 (open, validate, send).
- Dead code removed (moved to scratchpad f/removed): `member-scene.js`, `member-scene.css` (8.7 KB, no markup uses it), `cursor-trail.js`. Dead CSS removed with a postcss pass over classes that appear nowhere in HTML or live JS: `.cgrid*`, `.hero-alert*`, `.thero*`, `.rc__photo*`, `.plate-grass`, `.split__aside`, `.page-hero__actions`, `.cta-line` (15 KB raw).
- `src/css/site/page-tournaments.css`, `tournament-calendar.js`: the calendar row of plates, the filter chips and the grid are drawn by script; their space is now reserved (min-height, a margin until `is-ready`), which cut the load CLS.
- `src/js/site/type-reveal.js`: letter widths are pinned with the kerning difference spread over the word, so the headings do not re-wrap when the letter boxes fold back to text (first of two shifts on contacts at 390 gone).

## Checked and left as is
- Three chunk (`lightmaps` 810 KB raw, shared by booking and About): already a separate dynamic chunk, loaded only on About at idle and only where WebGL is available; a split gains nothing, merging would put it into booking. No change.
- One rAF loop: all animation runs on the GSAP ticker (Lenis, ScrollTrigger, map gallery, rally); the few raw `requestAnimationFrame` calls are short one-shot effects (flap, type-reveal, intro). Non-passive `wheel` listeners (map gallery, calendar) call `preventDefault`, so they must stay.
- `will-change` is already scoped (parallax and type-reveal set it only while active); the rest is on persistent moving layers (hero, lane track, noise).
- Fonts: Anton is local with a metric-matched fallback, `font-display: swap`, preloaded; the two Switzer faces are preloaded from the Fontshare CDN with their hashed URLs.
- Posters and images: hero poster preloaded with `fetchpriority=high`; `media.js` already emits width/height-aware srcset; below-the-fold images are lazy.

## Not done, needs a decision
- Self-hosting Switzer (the Fontshare stylesheet is render-blocking and costs 3 round trips, about 2 s of first paint on Fast 3G; FCP is 2.0 to 2.2 s on every page for that reason): needs downloading the woff2 files, so it needs your OK.
- Hero video webm is 3 MB (mp4 3.4 MB): a 1280 px re-encode would save about 2 MB; needs a tool and your OK.
- Contacts mobile CLS 0.25 remains: the heading is re-laid when fonts finish loading (about 6 s under throttle); fixing it means giving the title a fixed line count, which changes the look.
- Per-page CSS split of `site.css` (about 28% unused per page): cascade risk, left.
