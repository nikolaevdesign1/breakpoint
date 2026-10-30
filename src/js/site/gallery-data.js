import { COACHES, coachPhoto } from './coaches-data.js';

// Club life gallery (map-gallery.js): everything that can appear on the map. To add photos later, append
// to EXTRA below ({ src, ar } with ar = width / height; add `video: '/media/...'` for a clip); the map lays
// out whatever is here, repeating pictures with a different crop until it has TILES squares to fill.

export const TILES = 42;

const CLIPS = [
  { name: 'clay-aerial', video: true }, { name: 'clay-rally', video: true }, { name: 'clay-serve' }, { name: 'junior-lesson', video: true },
  { name: 'junior-rally' }, { name: 'padel-aerial' }, { name: 'padel-coach' }, { name: 'padel-night', video: true },
  { name: 'padel-sunset' }, { name: 'serve-studio', video: true }, { name: 'tournaments-night' },
];

const EXTRA = []; // { src: '/media/club/court-1.jpg', ar: 1.5 }

export const GALLERY = [
  ...COACHES.map((c) => ({ src: coachPhoto(c), ar: 4 / 5, alt: c.name })),
  ...CLIPS.map((c) => ({ src: `/media/clips/${c.name}.jpg`, video: c.video ? `/media/clips/${c.name}.mp4` : null, ar: 1.9, alt: '' })),
  ...EXTRA,
];
