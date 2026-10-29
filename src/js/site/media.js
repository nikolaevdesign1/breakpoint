// Stock media for the mockup. Unsplash images are hotlinked with size params; swap for club photography later.

const U = (id) => `https://images.unsplash.com/${id}`;

export const MEDIA = {
  hero: {
    // Mixkit Stock Video Free License: courts and a green park from above (row 44). docs/media-sources.md.
    video: '/media/hero-clay-park',
    poster: '/media/hero-clay-park.jpg',
    thumb: U('photo-1554068865-24cecd4e34b8'),
  },
  advantages: [
    U('photo-1731777347309-6e9b0af10ee1'), // surface: one unbranded ball on clay — Eliott Goutard (row 145: replaces HEAD ATP balls)
    U('photo-1515017804404-92b19fdfe6ac'), // aerial hard court — Lucas Davies (row 145: replaces a hall with ad boards)
    U('photo-1557561371-160934834af4'), // aerial court, floodlight shadows — Mudassir Ali (row 145: replaces sponsor boards)
    U('photo-1781274326569-7120016a6c7e'), // locker room — Alex Lion
    U('photo-1636988742970-4c7d1e882024'), // aerial courts — Weichao Deng
    U('photo-1781955781178-6ea29c66e860'), // lounge — Yanhao Fang
  ],
  services: [
    U('photo-1637071692126-d0ee7df18271'), // covered court serve — Fei Chao (row 145: replaces a Nike shirt)
    U('photo-1554068865-24cecd4e34b8'), // clay — Moises Alex
    U('photo-1634840542403-1a9b1067aaa0'), // coaching — Richard Sagredo
    U('flagged/photo-1576972405668-2d020a01cbfa'), // adult doubles — J. Schiemann
    U('photo-1660463529933-1d0f6fcfce1f'), // junior — Rezli
    U('photo-1750856698142-d84955b0abf7'), // members watching a clay match — Aleksandr Galichkin (row 145: replaces ASICS / Nike gear)
    U('photo-1696661115319-a9b6801e2571'), // baseline on clay at dusk — Peyman Shojaei (row 145: replaces a BNP Paribas board)
    U('photo-1658491830143-72808ca237e3'), // covered padel court, net — Oskar Hagberg (row 145: replaces a branded ball bag)
  ],
  // Home booking banner (row 113): night court under one floodlight, no boards or logos — Alim.
  banner: [U('photo-1642716540228-d79545ffeb28')],
  coaches: [
    U('photo-1618566105831-d604c45a7316'), // Parthiv Sailesh (row 145: replaces a Nike cap)
    U('photo-1569597795158-cde373f5fc4a'), // Julia Kuzenkov (row 145: replaces Nike swooshes)
    U('photo-1568927198336-e9ae04365910'), // Cherry Laithang (row 145: replaces a Nike shirt)
    U('photo-1514932535303-f7b1712cf831'), // Taylor Harding (row 145: replaces adidas)
  ],
  community: [
    U('photo-1756670591855-30dafeefd89d'), // handshake — Andy Sartori
    U('photo-1727837350740-a98cd7a7b70e'), // doubles pair by an orange wall — Segi Waktu (row 115: no sponsor boards)
    U('photo-1711290453815-43c5651e8ac8'), // aerial court, two players — Julius Hildebrandt (row 115: replaces a logo cap)
    U('photo-1578269174936-2709b6aeb913'), // gold cup — Giorgio Trovato (row 145: replaces sportswear logos)
    U('photo-1770482228588-270b08d2d376'), // trophy wall — breizhography (row 145: replaces a league emblem)
    U('photo-1761286753856-2f39b4413c1c'), // night serve, motion blur (no sponsor boards)
  ],
};

// Extensionless video path -> .webm where VP9 plays, else .mp4.
export const videoSrc = (base) => `${base}.${document.createElement('video').canPlayType('video/webm; codecs="vp9"') ? 'webm' : 'mp4'}`;

export function mediaUrl(key, width = 1200) {
  const [group, index] = key.split('.');
  const entry = MEDIA[group]?.[index];
  if (!entry) return '';
  if (!entry.includes('images.unsplash.com')) return entry;
  return `${entry}?auto=format&fit=crop&w=${width}&q=78`;
}

// Fill every <img data-media> on the page; returns the promises so the preloader can wait for above-the-fold ones.
export function hydrateImages(root = document) {
  return [...root.querySelectorAll('img[data-media]')].map((img) => {
    const w = +img.dataset.w || 1200;
    const src = mediaUrl(img.dataset.media, w);
    if (!src) return Promise.resolve();
    img.src = src;
    // Four steps (0.5x, 0.75x, 1x, 2x capped at 2400 px) so a 1440 px screen gets ~1500 px, not the next jump up to 2000.
    const steps = [...new Set([w / 2, w * 0.75, w, Math.min(w * 2, 2400)].map((n) => Math.round(n / 2) * 2))].filter((n) => n >= w / 2);
    img.srcset = steps.map((n) => `${mediaUrl(img.dataset.media, n)} ${n}w`).join(', ');
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
    img.sizes = img.dataset.sizes || `${Math.round(w / 2)}px`;
    if (img.complete) return Promise.resolve();
    return new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); });
  });
}
