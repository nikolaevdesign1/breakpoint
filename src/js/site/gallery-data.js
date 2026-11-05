import { MEDIA, mediaUrl } from './media.js';

// Club life gallery (map-gallery.js): everything that can appear on the map. To add photos later, append
// to EXTRA below ({ src, ar } with ar = width / height; add `video: '/media/...'` for a clip); the map lays
// out whatever is here, repeating pictures with a different crop until it has TILES squares to fill.

export const TILES = 84; // upper bound; the map shows each picture once, so it uses as many as GALLERY holds

const CLIPS = [
  { name: 'clay-aerial', video: true }, { name: 'clay-rally', video: true }, { name: 'clay-serve' }, { name: 'junior-lesson', video: true },
  { name: 'junior-rally' }, { name: 'padel-aerial' }, { name: 'padel-coach' }, { name: 'padel-night', video: true },
  { name: 'padel-sunset' }, { name: 'serve-studio', video: true }, { name: 'tournaments-night' },
];

const EXTRA = [ // { src: '/media/club/court-1.webp', ar: 1.5 }; the clips carry a still (webp) and the mp4
  { src: '/media/club/photo-01.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-02.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-03.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-04.webp', ar: 825 / 1100, alt: '' },
  { src: '/media/club/photo-05.webp', ar: 825 / 1100, alt: '' },
  { src: '/media/clips/courts-sunset.webp', video: '/media/clips/courts-sunset.mp4', ar: 16 / 9, alt: '' },
  { src: '/media/clips/court-tall-1.webp', video: '/media/clips/court-tall-1.mp4', ar: 540 / 972, alt: '' },
  { src: '/media/clips/court-wide-1.webp', video: '/media/clips/court-wide-1.mp4', ar: 16 / 9, alt: '' },
  { src: '/media/clips/court-wide-2.webp', video: '/media/clips/court-wide-2.mp4', ar: 960 / 506, alt: '' },
  { src: '/media/clips/cta-aerial.webp', video: '/media/clips/cta-aerial.mp4', ar: 16 / 9, alt: '' },
];

// The stock photos of the other blocks (hotlinked, see media.js), landscape and portrait mixed.
const STOCK = ['services', 'community', 'advantages']
  .flatMap((group) => MEDIA[group].map((_, i) => ({ src: mediaUrl(`${group}.${i}`, 900), ar: i % 3 === 0 ? 0.8 : 1.45, alt: '' })));

export const GALLERY = [
  ...CLIPS.map((c) => ({ src: `/media/clips/${c.name}.jpg`, video: c.video ? `/media/clips/${c.name}.mp4` : null, ar: 1.9, alt: '' })),
  ...STOCK,
  ...EXTRA,
];
