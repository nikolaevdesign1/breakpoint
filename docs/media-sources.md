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


## Club gallery photos (2026-11-06, row 3 of docs/edits-site-2026-11-06.md)

22 photos for the home gallery map (`src/js/site/gallery-data.js`, const NEW). Found through the Openverse API (`api.openverse.org`, filter license=cc0,pdm, no key, no bot check); the files came from the providers' public image hosts, nothing was bypassed. The licence of each row is the one in the Openverse record (CC0 1.0 or Public Domain Mark: commercial use, no attribution needed). The rawpixel pages answer scripts with 403, so the provider page itself was not opened and the Openverse record is the evidence. Retrieved 2026-11-06.

Processing (sharp): long side 1024-1400 px (rawpixel, Flickr and StockSnap serve at most 1024 px, 960 px for StockSnap; nothing was upscaled), saturation x0.93 and contrast x1.04 for one tone, the archive photo in greyscale, WebP quality 78 (lower where needed to stay under 250 KB). Each file has a 400 px thumb in `public/media/gallery/sm/` (the map loads the thumb first and the full file once the picture is shown big); the 10 older `club/photo-NN.webp` got thumbs there too (`sm/club-photo-NN.webp`). Originals are not kept. Flat-colour frames (court corner, chair) compress below 80 KB.

Duplicate check: SHA-256 of every file and a 64-bit difference hash, each against the others and against all older gallery pictures (club photos and clip stills): no identical hashes, no pair within Hamming distance 8.

Rejected: frames with readable brands or logos (rackets and nets with lettering, a net cover with a logo, court banners, school crests), named or professional players, close-up faces, cartoons and vector art, table tennis and dog shots, near copies of an accepted frame. The Wikimedia Commons API search was rate limited and dropped the connection, so no Commons file is used.

| File | Title at source | Source page | Author | Licence | Size |
|---|---|---|---|---|---|
| `public/media/gallery/gallery-clay-lines-1.webp` | Closeup tennis court lines | rawpixel: https://www.rawpixel.com/image/6030715/photo-image-public-domain-lines-free | not stated | CC0 1.0 | 204 KB + 19 KB thumb |
| `public/media/gallery/gallery-clay-net-1.webp` | Tennis court | rawpixel: https://www.rawpixel.com/image/5939004/tennis-court | not stated | CC0 1.0 | 183 KB + 19 KB thumb |
| `public/media/gallery/gallery-clay-net-2.webp` | Closeup tennis court net | rawpixel: https://www.rawpixel.com/image/6034259/photo-image-public-domain-free-sport | not stated | CC0 1.0 | 122 KB + 30 KB thumb |
| `public/media/gallery/gallery-clay-ball-1.webp` | (untitled) | rawpixel: https://www.rawpixel.com/image/5958953/free-public-domain-cc0-photo | not stated | CC0 1.0 | 164 KB + 20 KB thumb |
| `public/media/gallery/gallery-clay-ball-2.webp` | Tennis ball court | rawpixel: https://www.rawpixel.com/image/6030718/photo-image-public-domain-free-yellow | not stated | CC0 1.0 | 166 KB + 20 KB thumb |
| `public/media/gallery/gallery-clay-ball-3.webp` | Free tennis ball court photo | rawpixel: https://www.rawpixel.com/image/5914383/photo-image-public-domain-line-red | not stated | CC0 1.0 | 125 KB + 18 KB thumb |
| `public/media/gallery/gallery-clay-ball-4.webp` | Free tennis ball court photo | rawpixel: https://www.rawpixel.com/image/5906751/photo-image-public-domain-red-white | not stated | CC0 1.0 | 127 KB + 22 KB thumb |
| `public/media/gallery/gallery-grass-ball-1.webp` | (untitled) | rawpixel: https://www.rawpixel.com/image/5943012/free-public-domain-cc0-photo | not stated | CC0 1.0 | 40 KB + 8 KB thumb |
| `public/media/gallery/gallery-grass-court-1.webp` | Tennis Court, Airlie Castle | flickr: https://www.flickr.com/photos/137828720@N06/51368703444 | Simon_Cotterill | CC0 1.0 | 239 KB + 24 KB thumb |
| `public/media/gallery/gallery-hard-ball-1.webp` | (untitled) | rawpixel: https://www.rawpixel.com/image/5959783/free-public-domain-cc0-photo | not stated | CC0 1.0 | 39 KB + 8 KB thumb |
| `public/media/gallery/gallery-hard-balls-1.webp` | Tenis Balls at the court. | wordpress: https://wordpress.org/photos/photo/494657ee66/ | Heru Irawan | CC0 1.0 | 100 KB + 7 KB thumb |
| `public/media/gallery/gallery-hard-court-1.webp` | (untitled) | rawpixel: https://www.rawpixel.com/image/5943690/free-public-domain-cc0-photo | not stated | CC0 1.0 | 67 KB + 12 KB thumb |
| `public/media/gallery/gallery-hard-lines-1.webp` | Tennis Court | stocksnap: https://stocksnap.io/photo/tennis-court-T4LLIX5GEX | Chris Chondrogiannis | CC0 1.0 | 12 KB + 3 KB thumb |
| `public/media/gallery/gallery-hard-chair-1.webp` | Empty tennis court chair | rawpixel: https://www.rawpixel.com/image/6030699/photo-image-public-domain-green-free | not stated | CC0 1.0 | 21 KB + 4 KB thumb |
| `public/media/gallery/gallery-aerial-courts-1.webp` | Tennis courts | rawpixel: https://www.rawpixel.com/image/9676817/tennis-courts | not stated | CC0 1.0 | 214 KB + 30 KB thumb |
| `public/media/gallery/gallery-aerial-courts-2.webp` | Tennis courts | rawpixel: https://www.rawpixel.com/image/9658740/tennis-courts | not stated | CC0 1.0 | 183 KB + 28 KB thumb |
| `public/media/gallery/gallery-hard-court-2.webp` | Empty blue tennis court | rawpixel: https://www.rawpixel.com/image/6017285/photo-image-public-domain-blue-free | not stated | CC0 1.0 | 87 KB + 15 KB thumb |
| `public/media/gallery/gallery-hard-net-1.webp` | Fancyburg Park | flickr: https://www.flickr.com/photos/140641142@N05/26100960207 | dankeck | CC0 1.0 | 123 KB + 15 KB thumb |
| `public/media/gallery/gallery-hard-net-2.webp` | Free tennis net closeup photo | rawpixel: https://www.rawpixel.com/image/5918115/image-public-domain-free-sport | not stated | CC0 1.0 | 110 KB + 15 KB thumb |
| `public/media/gallery/gallery-hard-player-1.webp` | Waiting for a ball | flickr: https://www.flickr.com/photos/181974411@N03/48049490828 | Ricardo_Calle | Public Domain Mark | 125 KB + 15 KB thumb |
| `public/media/gallery/gallery-archive-net-1.webp` | Negative - Girls at Tennis Net, Ashens, Victoria, 1927 | museumsvictoria: https://collections.museumsvictoria.com.au/items/765288 | not stated | Public Domain Mark | 209 KB + 22 KB thumb |
| `public/media/gallery/gallery-racket-ball-1.webp` | Tennis racket | rawpixel: https://www.rawpixel.com/image/5939085/tennis-racket | not stated | CC0 1.0 | 26 KB + 6 KB thumb |
