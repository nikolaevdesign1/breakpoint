import { MEDIA, mediaUrl } from './media.js';

// Club life gallery (map-gallery.js): everything that can appear on the map. To add photos later, append
// to EXTRA below ({ src, ar } with ar = width / height; add `video: '/media/...'` for a clip); the map lays
// out whatever is here, repeating pictures with a different crop until it has TILES squares to fill.

export const TILES = 120; // upper bound; the map shows each picture once, so it uses as many as GALLERY holds

const CLIPS = [
  { name: 'clay-aerial', video: true }, { name: 'clay-rally', video: true }, { name: 'clay-serve' }, { name: 'junior-lesson', video: true },
  { name: 'junior-rally' }, { name: 'padel-aerial' }, { name: 'padel-coach' }, { name: 'padel-night', video: true },
  { name: 'padel-sunset' }, { name: 'serve-studio', video: true }, { name: 'tournaments-night' },
];

const EXTRA = [ // { src: '/media/club/court-1.webp', ar: 1.5 }; the clips carry a still (webp) and the mp4
  { src: '/media/club/photo-01.webp', thumb: '/media/gallery/sm/club-photo-01.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-02.webp', thumb: '/media/gallery/sm/club-photo-02.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-03.webp', thumb: '/media/gallery/sm/club-photo-03.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-04.webp', thumb: '/media/gallery/sm/club-photo-04.webp', ar: 825 / 1100, alt: '' },
  { src: '/media/club/photo-05.webp', thumb: '/media/gallery/sm/club-photo-05.webp', ar: 825 / 1100, alt: '' },
  { src: '/media/club/photo-06.webp', thumb: '/media/gallery/sm/club-photo-06.webp', ar: 733 / 1100, alt: '' },
  { src: '/media/club/photo-07.webp', thumb: '/media/gallery/sm/club-photo-07.webp', ar: 880 / 1100, alt: '' },
  { src: '/media/club/photo-08.webp', thumb: '/media/gallery/sm/club-photo-08.webp', ar: 1100 / 619, alt: '' },
  { src: '/media/club/photo-09.webp', thumb: '/media/gallery/sm/club-photo-09.webp', ar: 734 / 1100, alt: '' },
  { src: '/media/club/photo-10.webp', thumb: '/media/gallery/sm/club-photo-10.webp', ar: 1100 / 733, alt: '' },
  { src: '/media/clips/courts-sunset.webp', video: '/media/clips/courts-sunset.mp4', ar: 16 / 9, alt: '' },
  { src: '/media/clips/court-tall-1.webp', video: '/media/clips/court-tall-1.mp4', ar: 540 / 972, alt: '' },
  { src: '/media/clips/court-wide-1.webp', video: '/media/clips/court-wide-1.mp4', ar: 16 / 9, alt: '' },
  { src: '/media/clips/court-wide-2.webp', video: '/media/clips/court-wide-2.mp4', ar: 960 / 506, alt: '' },
  { src: '/media/clips/cta-aerial.webp', video: '/media/clips/cta-aerial.mp4', ar: 16 / 9, alt: '' },
];

// Photos added 2026-11-06 (CC0 / public domain, see docs/media-sources.md): a 1024-1400 px picture and a 400 px thumb.
const NEW = [
  { src: '/media/gallery/gallery-clay-lines-1.webp', thumb: '/media/gallery/sm/gallery-clay-lines-1.webp', ar: 1024 / 768, alt: 'Two white lines crossing on red clay' },
  { src: '/media/gallery/gallery-clay-net-1.webp', thumb: '/media/gallery/sm/gallery-clay-net-1.webp', ar: 1024 / 680, alt: 'Clay court net post with a long afternoon shadow' },
  { src: '/media/gallery/gallery-clay-net-2.webp', thumb: '/media/gallery/sm/gallery-clay-net-2.webp', ar: 1024 / 768, alt: 'Close view of a tennis net on clay' },
  { src: '/media/gallery/gallery-clay-ball-1.webp', thumb: '/media/gallery/sm/gallery-clay-ball-1.webp', ar: 1024 / 768, alt: 'Worn ball resting on a clay baseline' },
  { src: '/media/gallery/gallery-clay-ball-2.webp', thumb: '/media/gallery/sm/gallery-clay-ball-2.webp', ar: 1024 / 740, alt: 'Ball beside a white line on clay' },
  { src: '/media/gallery/gallery-clay-ball-3.webp', thumb: '/media/gallery/sm/gallery-clay-ball-3.webp', ar: 1024 / 764, alt: 'Net shadow stripes on red clay with a ball' },
  { src: '/media/gallery/gallery-clay-ball-4.webp', thumb: '/media/gallery/sm/gallery-clay-ball-4.webp', ar: 1024 / 684, alt: 'Ball lying by the net on a clay court' },
  { src: '/media/gallery/gallery-grass-ball-1.webp', thumb: '/media/gallery/sm/gallery-grass-ball-1.webp', ar: 1024 / 640, alt: 'Ball on a grass court in soft focus' },
  { src: '/media/gallery/gallery-grass-court-1.webp', thumb: '/media/gallery/sm/gallery-grass-court-1.webp', ar: 1024 / 768, alt: 'Empty grass court behind a hedge and trees' },
  { src: '/media/gallery/gallery-hard-ball-1.webp', thumb: '/media/gallery/sm/gallery-hard-ball-1.webp', ar: 684 / 1024, alt: 'Single ball on a green hard court' },
  { src: '/media/gallery/gallery-hard-balls-1.webp', thumb: '/media/gallery/sm/gallery-hard-balls-1.webp', ar: 1400 / 788, alt: 'Balls scattered across a red and blue court' },
  { src: '/media/gallery/gallery-hard-court-1.webp', thumb: '/media/gallery/sm/gallery-hard-court-1.webp', ar: 1024 / 684, alt: 'Low view along red court lines' },
  { src: '/media/gallery/gallery-hard-lines-1.webp', thumb: '/media/gallery/sm/gallery-hard-lines-1.webp', ar: 960 / 600, alt: 'Court corner with white lines on green and red' },
  { src: '/media/gallery/gallery-hard-chair-1.webp', thumb: '/media/gallery/sm/gallery-hard-chair-1.webp', ar: 1024 / 768, alt: 'White chair beside the net on a green court' },
  { src: '/media/gallery/gallery-aerial-courts-1.webp', thumb: '/media/gallery/sm/gallery-aerial-courts-1.webp', ar: 1024 / 682, alt: 'Blue courts among trees seen from above' },
  { src: '/media/gallery/gallery-aerial-courts-2.webp', thumb: '/media/gallery/sm/gallery-aerial-courts-2.webp', ar: 1024 / 682, alt: 'Row of blue courts and a clubhouse from the air' },
  { src: '/media/gallery/gallery-hard-court-2.webp', thumb: '/media/gallery/sm/gallery-hard-court-2.webp', ar: 1024 / 684, alt: 'Blue court under palm trees' },
  { src: '/media/gallery/gallery-hard-net-1.webp', thumb: '/media/gallery/sm/gallery-hard-net-1.webp', ar: 1024 / 576, alt: 'Net and post shadow on a blue court' },
  { src: '/media/gallery/gallery-hard-net-2.webp', thumb: '/media/gallery/sm/gallery-hard-net-2.webp', ar: 576 / 1024, alt: 'Net edge in late light, portrait crop' },
  { src: '/media/gallery/gallery-hard-player-1.webp', thumb: '/media/gallery/sm/gallery-hard-player-1.webp', ar: 1024 / 766, alt: 'Player walking the baseline of a blue court' },
  { src: '/media/gallery/gallery-archive-net-1.webp', thumb: '/media/gallery/sm/gallery-archive-net-1.webp', ar: 1400 / 980, alt: 'Four women with rackets at a net, archive photo' },
  { src: '/media/gallery/gallery-racket-ball-1.webp', thumb: '/media/gallery/sm/gallery-racket-ball-1.webp', ar: 1024 / 684, alt: 'Ball on racket strings over grass' },
];

// The stock photos of the other blocks (hotlinked, see media.js), landscape and portrait mixed.
const STOCK = ['services', 'community', 'advantages']
  .flatMap((group) => MEDIA[group].map((_, i) => ({ src: mediaUrl(`${group}.${i}`, 900), thumb: mediaUrl(`${group}.${i}`, 400), ar: i % 3 === 0 ? 0.8 : 1.45, alt: '' })));

export const GALLERY = [
  ...CLIPS.map((c) => ({ src: `/media/clips/${c.name}.jpg`, video: c.video ? `/media/clips/${c.name}.mp4` : null, ar: 1.9, alt: '' })),
  ...STOCK,
  ...EXTRA,
  ...NEW,
];
