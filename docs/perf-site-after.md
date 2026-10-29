# Site performance, after (row 48, site pages)

Method: production build (`vite build`) served by a local gzip static server, headless Chrome 1440x900 (no throttle) and 390x844 dpr2 (4x CPU, 1.6 Mbps / 150 ms RTT), cache off, 7 s idle after load then a 40 px/frame scroll to the end (full-page weight includes lazy images). Third-party hotlinks (Unsplash, Pexels, Fontshare) are real network. Scripts: scratchpad r9-optsite/measure.mjs.

## Desktop
| page | req | transfer KB | js / css / img / media / font KB | LCP ms | CLS (load) | TBT ms | max long task ms |
|---|---|---|---|---|---|---|---|
| desktop/index | 62 | 6937 | 90 / 23 / 1280 / 5444 / 89 | 5588 | 0.0001 | 11 | 61 |
| desktop/about | 23 | 662 | 77 / 23 / 486 / 0 / 69 | 192 | 0.0001 | 0 | 0 |
| desktop/coaches | 31 | 934 | 77 / 23 / 776 / 0 / 53 | 328 | 0 | 0 | 0 |
| desktop/tournaments | 36 | 1972 | 84 / 23 / 432 / 1371 / 53 | 108 | 0 | 0 | 0 |
| desktop/memberships | 22 | 201 | 77 / 23 / 39 / 0 / 53 | 164 | 0 | 17 | 67 |
| desktop/contacts | 13 | 176 | 73 / 23 / 0 / 0 / 73 | 68 | 0.0039 | 0 | 0 |

## Mobile (throttled)
| page | req | transfer KB | js / css / img / media / font KB | LCP ms | CLS (load) | TBT ms | max long task ms |
|---|---|---|---|---|---|---|---|
| mobile/index | 51 | 945 | 90 / 23 / 454 / 277 / 89 | 7424 | 0.0004 | 117 | 145 |
| mobile/about | 23 | 1023 | 77 / 23 / 847 / 0 / 69 | 2080 | 0 | 1 | 51 |
| mobile/coaches | 31 | 934 | 77 / 23 / 776 / 0 / 53 | 796 | 0 | 31 | 81 |
| mobile/tournaments | 21 | 274 | 84 / 23 / 105 / 0 / 53 | 1532 | 0.0001 | 85 | 135 |
| mobile/memberships | 22 | 201 | 77 / 23 / 39 / 0 / 53 | 820 | 0 | 96 | 146 |
| mobile/contacts | 13 | 176 | 73 / 23 / 0 / 0 / 73 | 2064 | 0 | 118 | 168 |

## Before / after
| metric | before | after |
|---|---|---|
| home desktop transfer | 7219 KB | 6937 KB |
| about desktop transfer | 944 KB | 662 KB (banner and story photos pick a closer srcset step) |
| CLS while scrolling home (real wheel, desktop) | 2.0 (two shifts of ~1.0 at the services pin) | 0 |
| tournaments desktop load CLS | 0.16 in one run, 0 in others (reviews window 0.012) | 0 |
| preloader wait for hero video | `canplay`, cap 6 s | `loadeddata` (first frame), cap 2.5 s, skipped on data saver |
| Switzer faces requested | 8 | 5 (only those rendered) |
| dead files | 3 partials + 2 jpg | removed (moved to scratchpad) |
| build | passes | passes, same chunk sizes (+0.2 KB html) |

Home LCP stays 5.6 s desktop / 7.4 s mobile: it is the intro choreography (preloader minimum 1.8 s, hop, card opens, title reveals). Inner pages: LCP 0.07 to 0.5 s desktop, 0.8 to 2.1 s mobile (throttled). Not changed because it would change how the intro looks and feels.

## Changes
- `src/js/site/services-drum.js`, `src/css/site/services.css`: pin via CSS sticky inside a tall track (same scroll length, same snap), removes the CLS of the fixed switch.
- `src/js/pages/home.js`, `index.html`: hero poster in HTML + `<link rel=preload as=image fetchpriority=high>`, preconnect to Pexels, preloader waits for the first frame only, data saver skips the 5 MB clip.
- `partials/head.html`: preconnect `cdn.fontshare.com` (woff2), no `crossorigin` on image/CSS hosts, Switzer list trimmed to 400, 500, 700, 400i, 500i (CSS stays blocking on purpose so `fonts.ready` still gates ScrollTrigger measuring).
- `src/js/site/media.js`: srcset steps 0.5x, 0.75x, 1x, 2x (cap 2400 px), `decoding=async` when not set.
- `src/js/site/type-reveal.js`: `will-change` on `.tr-word` only while a reveal runs, dropped when settled (fewer compositor layers on text-heavy pages).
- Removed: partials/coach-cloud.html, partials/coaches.html, partials/community.html, public/media/map-preview.jpg, grass-courts.jpg (backup: scratchpad/optsite-removed/).

## Verification
Zero console errors on all 6 pages at 1440 and 390; no horizontal overflow; identical page heights; menu, gallery fullscreen, next-slot video, coaches filter + profile, tournaments calendar + apply modal, contacts form behave the same before and after (verify.mjs, JSON in scratchpad). Screenshot diff after vs before at 4 scroll positions per page/viewport is at the grain-noise floor (mean abs diff ~2/255); only the home top differs by the random edge squares. Screenshots: scratchpad r9-optsite/shots/.

## Not done, needs a decision
- Hero video: re-host and re-encode (e.g. 1280x676, ~1.2 MB instead of 4.9 MB). Needs downloading the Pexels clip, so it needs your OK. macOS `avconvert` is available for the re-encode (no ffmpeg).
- Self-hosting Switzer woff2 (removes 2 third-party round trips, allows `font-display`/preload): needs downloading the font files, your OK.
- Per-page CSS split (site.css 22 KB gzip is loaded by every page, about 30% unused per page): moderate cascade risk, left as is.
- Scroll long tasks of 50 to 126 ms under 4x CPU on memberships/contacts come from many gsap-driven style updates; no single fix without changing the effects.
