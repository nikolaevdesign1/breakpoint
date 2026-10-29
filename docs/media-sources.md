# Media sources

Pexels blocks HD downloads for scripts (Cloudflare 403), so the hero and the four coach video tiles were replaced on 2026-10-28 with clips from Mixkit. Mixkit serves its files from a public CDN (`assets.mixkit.co`) with no bot check; nothing was bypassed.

Licence for all rows: Mixkit Stock Video Free License (https://mixkit.co/license/#videoFree), checked on each clip page on 2026-10-28: free for commercial use, no attribution required. Author on every page: Mixkit.

| Use | Files | Mixkit clip | Date on page |
|---|---|---|---|
| Home hero (`src/js/site/media.js`, `index.html`) | `public/media/hero-clay-park.{webm,mp4,jpg}` | https://mixkit.co/free-stock-video/tennis-courts-filmed-from-the-air-5014/ ("Tennis courts filmed from the air", full 10.7 s, 1280x720) | 2020-05-25 |
| Serve tile | `public/media/clips/serve-studio.{webm,mp4,jpg}` | https://mixkit.co/free-stock-video/tennis-players-at-an-outdoor-court-869/ | 2019-11-07 |
| Padel at sunset tile (no padel clip exists on Mixkit; warm backlit serve under trees and floodlights) | `public/media/clips/padel-sunset.{webm,mp4,jpg}` | https://mixkit.co/free-stock-video/man-doing-a-tennis-serving-23025/ | 2020-08-14 |
| Junior rally tile (no junior clip on Mixkit; rally seen from above) | `public/media/clips/junior-rally.{webm,mp4,jpg}` | https://mixkit.co/free-stock-video/two-people-playing-tennis-aerial-view-880/ | 2019-02-06 |
| Clay from above tile (the clip is a hard court from above; no clay-only top view among free no-bot sources) | `public/media/clips/clay-aerial.{webm,mp4,jpg}` | https://mixkit.co/free-stock-video/tennis-serve-aerial-view-879/ | 2019-11-07 |

Encoding (ffmpeg 6.0, 720p originals from `assets.mixkit.co/videos/<id>/<id>-720.mp4`):
- Tiles: crop to 4:5 (576x720 window, offset per clip), scale to 540x676 (even height), first 5 s, 24 fps, no audio. mp4 H.264 CRF 28 preset slow +faststart; webm VP9 CRF 34. Poster jpg is one frame.
- Hero: 1280x720, 24 fps, no audio, mp4 CRF 28 and webm VP9 CRF 40; poster is the frame at 1.5 s.
- The page picks `.webm` when `canPlayType('video/webm; codecs="vp9"')` is truthy, else `.mp4` (`videoSrc` in `src/js/site/media.js`).

Dropped Pexels originals (serve-studio 10340699, padel-sunset 34445043, clay-aerial 20196829, hero 40369475) are backed up outside the repo. Other files in `public/media/clips/` (clay-rally, padel-aerial, tournaments-night and so on) are still Pexels; see `public/media/clips/CREDITS.md`.

Portrait photos: see `public/media/coaches/CREDITS.md` (Unsplash License).
