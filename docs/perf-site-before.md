# Site performance, before (row 48, site pages)

Method: production build (`vite build`) served by a local gzip static server, headless Chrome 1440x900 (no throttle) and 390x844 dpr2 (4x CPU, 1.6 Mbps / 150 ms RTT), cache off, 7 s idle after load then a 40 px/frame scroll to the end (full-page weight includes lazy images). Third-party hotlinks (Unsplash, Pexels, Fontshare) are real network. Scripts: scratchpad r9-optsite/measure.mjs.

## Desktop
| page | req | transfer KB | js / css / img / media / font KB | LCP ms | CLS (load) | TBT ms | max long task ms |
|---|---|---|---|---|---|---|---|
| desktop/index | 62 | 7219 | 90 / 23 / 1562 / 5444 / 89 | 5608 | 0.0001 | 0 | 0 |
| desktop/about | 23 | 944 | 77 / 23 / 768 / 0 / 69 | 228 | 0.0009 | 0 | 0 |
| desktop/coaches | 31 | 934 | 77 / 23 / 776 / 0 / 53 | 224 | 0 | 4 | 54 |
| desktop/tournaments | 36 | 1972 | 84 / 23 / 432 / 1371 / 53 | 84 | 0.1601 | 0 | 0 |
| desktop/memberships | 22 | 201 | 77 / 23 / 39 / 0 / 53 | 396 | 0 | 27 | 77 |
| desktop/contacts | 13 | 176 | 73 / 23 / 0 / 0 / 73 | 528 | 0 | 22 | 72 |

## Mobile (throttled)
| page | req | transfer KB | js / css / img / media / font KB | LCP ms | CLS (load) | TBT ms | max long task ms |
|---|---|---|---|---|---|---|---|
| mobile/index | 51 | 879 | 90 / 23 / 454 / 211 / 89 | 7868 | 0.0004 | 218 | 199 |
| mobile/about | 23 | 1023 | 77 / 23 / 847 / 0 / 69 | 2072 | 0 | 8 | 58 |
| mobile/coaches | 31 | 934 | 77 / 23 / 776 / 0 / 53 | 784 | 0 | 40 | 90 |
| mobile/tournaments | 21 | 274 | 84 / 23 / 105 / 0 / 53 | 1556 | 0 | 94 | 144 |
| mobile/memberships | 22 | 201 | 77 / 23 / 39 / 0 / 53 | 812 | 0 | 133 | 183 |
| mobile/contacts | 13 | 176 | 73 / 23 / 0 / 0 / 73 | 2056 | 0 | 129 | 179 |

## Build chunks (gzip)
site.css 22.1 KB (one file for all site pages), site.js 35.3 KB (gsap ScrollTrigger + Locomotive/Lenis + shared UI), pixel-reveal.js 33.9 KB (gsap core, shared with booking), page chunks 2.7 to 9.7 KB, reviews 3.9, coaches-data 4.5. Booking (three.js) is a separate entry and is not loaded by site pages.

## Findings
- Home hero: 4.9 MB Pexels mp4 (2048x1080, preload auto) is the whole page weight on desktop (7.2 MB total). The preloader waited for `canplay` (cap 6 s).
- Home LCP 5.6 s desktop / 7.9 s mobile: the h1 and the hero card are revealed by the intro (preloader min 1.8 s + ~2.6 s animation), so LCP follows the intro by design.
- CLS during scroll: the pinned services drum (ScrollTrigger pin = position:fixed switch) reports two layout shifts of ~1.0 each in Chrome with real wheel scrolling (home only). Load CLS is ~0 everywhere.
- Fonts: Fontshare CSS requested 8 faces (300 to 800), only 400/500/700/400i/500i are ever fetched; `cdn.fontshare.com` (woff2 host) had no preconnect; preconnects used `crossorigin` on no-cors hosts (unused connection).
- Images: Unsplash already served as AVIF (`auto=format`); srcset steps jumped 1x to 2x (banner 2000 px picked for a 1440 screen, 491 KB).
- Film grain: already one 128 px tile + stepped CSS transform on the compositor; nothing to gain.
- Videos: all clips already 70 to 220 KB (4 to 5 s) except tournaments-night (1.4 MB, 12 s, 933 kbps, loaded after `load`, desktop only, off for data saver); all lazy and visibility-gated.
- Mobile scroll: 9 to 13 long tasks of 50 to 126 ms in memberships/contacts at 4x CPU; dominated by style recalc on gsap-driven transforms, not one hot function (ScrollTrigger `_maxScroll` forced layout is the top script entry).
- Dead: partials/coach-cloud.html, partials/coaches.html, partials/community.html (not included anywhere), public/media/map-preview.jpg and grass-courts.jpg (no references).
