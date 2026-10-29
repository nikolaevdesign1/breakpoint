import * as THREE from 'three';

// One rally, as data (About, row 33). Court coordinates: x across, z along the court, net at z = 0,
// the server stands at +z. COURT is clay-2 in the club model. T is rally time in seconds; scroll
// is mapped onto T per chapter, slowed around every contact (slow tennis).

export const COURT = { x: 0, z: 19.5 };
export const R = 0.11; // ball radius as drawn (a real ball is 0.033): big enough to read from the air

// Points the ball passes, in order. kind: contact (racket), bounce (ground), toss.
// Each leg ends where the next begins; `h` is how far the arc bows above the straight chord.
const LEGS = [
  { id: 'toss', p: [1.4, 1.0, 12.6] },
  { id: 'k0', p: [1.7, 2.85, 12.3], T: 1.1, kind: 'rise' }, // serve
  { id: 'b0', p: [-2.6, R, -4.9], T: 0.55, h: 0.5 },
  { id: 'k1', p: [-3.2, 0.95, -12.4], T: 0.65, h: 0.55 }, // return
  { id: 'b1', p: [3.0, R, 9.6], T: 0.8, h: 1.0 },
  { id: 'k2', p: [3.4, 0.9, 12.2], T: 0.55, h: 0.5 },
  { id: 'b2', p: [-2.0, R, -10.6], T: 0.75, h: 0.9 },
  { id: 'k3', p: [-3.6, 1.1, -12.5], T: 0.6, h: 0.5 },
  { id: 'b3', p: [1.0, R, 3.2], T: 1.0, h: 1.6 }, // a floated slice
  { id: 'k4', p: [2.2, 1.0, 2.0], T: 0.5, h: 0.5 }, // volley at the net
  { id: 'b4', p: [-3.92, R, -5.4], T: 0.55, h: 0.5 }, // match point, a hair inside the sideline
  { id: 'b5', p: [-5.1, R, -9.6], T: 0.5, h: 0.3 },
  { id: 'end', p: [-5.5, R, -10.9], T: 0.6, h: 0.08 },
];

let acc = 0;
export const POINTS = LEGS.map((l) => {
  acc += l.T ?? 0;
  return { ...l, p: new THREE.Vector3(...l.p), t: acc };
});
export const T_END = acc;
export const at = (id) => POINTS.find((p) => p.id === id);
export const CONTACTS = ['k0', 'k1', 'k2', 'k3', 'k4'].map((id) => at(id).t);
export const BOUNCES = ['b0', 'b1', 'b2', 'b3', 'b4'].map((id) => at(id));

/** Ball position in court coordinates at rally time T (clamped). */
export function ballAt(T, out = new THREE.Vector3()) {
  const t = Math.min(Math.max(T, 0), T_END);
  let i = 1;
  while (i < POINTS.length - 1 && POINTS[i].t < t) i++;
  const a = POINTS[i - 1];
  const b = POINTS[i];
  const s = (t - a.t) / (b.t - a.t);
  if (b.kind === 'rise') {
    out.lerpVectors(a.p, b.p, 1 - (1 - s) * (1 - s));
    return out;
  }
  out.lerpVectors(a.p, b.p, s);
  out.y += 4 * (b.h ?? 0) * s * (1 - s);
  return out;
}

/** Chapters: the slice of rally time each one owns and its share of the scroll (0..1 of the film). */
export const CHAPTERS = [
  { T: [0, 1.9], p: [0.1, 0.3] },
  { T: [1.9, 3.4], p: [0.3, 0.48] },
  { T: [3.4, 4.9], p: [0.48, 0.64] },
  { T: [4.9, 6.4], p: [0.64, 0.8] },
  { T: [6.4, T_END], p: [0.8, 1] },
];
export const INTRO_END = CHAPTERS[0].p[0];
const INTRO_T = -3; // the aerial opening runs from here to 0

// Scroll to rally time: slow near contacts (and the match-point bounce), so the eye can stay on the hit.
const SLOW = [...CONTACTS.map((t) => [t, 0.18, 0.4]), [at('b2').t, 0.45, 0.3], [at('b4').t, 0.2, 0.45]]; // [T, speed at event, radius]
const speed = (T) => SLOW.reduce((v, [t, s, r]) => {
  const k = Math.min(1, Math.abs(T - t) / r);
  return Math.min(v, s + (1 - s) * k * k * (3 - 2 * k));
}, 1);

const TABLES = CHAPTERS.map(({ T: [t0, t1] }) => {
  const N = 120;
  const cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + (t1 - t0) / N / speed(t0 + ((i - 0.5) / N) * (t1 - t0)));
  return cum.map((c) => c / cum[N]); // scroll share reached at each step of T
});

/** Film progress p (0..1) to rally time. Before the first chapter T runs from INTRO_T up to 0. */
export function timeAt(p) {
  if (p < INTRO_END) return INTRO_T * (1 - p / INTRO_END);
  let c = CHAPTERS.findIndex((ch) => p < ch.p[1]);
  if (c < 0) c = CHAPTERS.length - 1;
  const { T: [t0, t1], p: [p0, p1] } = CHAPTERS[c];
  const q = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
  const tab = TABLES[c];
  let i = 1;
  while (i < tab.length - 1 && tab[i] < q) i++;
  const f = (q - tab[i - 1]) / (tab[i] - tab[i - 1] || 1);
  return t0 + ((i - 1 + f) / (tab.length - 1)) * (t1 - t0);
}

// Camera: keyframes in court coordinates. `at` is the look-at point, `follow` pulls it towards the ball.
const KEYS = [
  { T: -3, pos: [-46, 52, 52], at: [8, 0, -8], follow: 0, fov: 34 },
  { T: -1.5, pos: [-24, 22, 40], at: [2, 0.5, 2], follow: 0, fov: 36 },
  { T: 0, pos: [0.4, 2.6, 23.5], at: [1.2, 1.4, 11], follow: 0.7, fov: 40 },
  { T: 1.1, pos: [-2.8, 3.2, 18], at: [1.7, 2.8, 12.3], follow: 1, fov: 36 },
  { T: 1.65, pos: [1.2, 2.4, 6], at: [-2.6, 0, -4.9], follow: 0.7, fov: 42 },
  { T: 2.3, pos: [3.4, 1.5, -4.8], at: [-3.2, 1, -12.4], follow: 1, fov: 36 },
  { T: 3.1, pos: [8.5, 5, -1], at: [3, 0.5, 9.6], follow: 0.8, fov: 40 },
  { T: 3.65, pos: [-7.2, 2.2, 14.5], at: [3.4, 0.9, 12.2], follow: 1, fov: 36 },
  { T: 4.4, pos: [0.6, 0.6, -6], at: [-2, 0.1, -10.6], follow: 0.6, fov: 34 },
  { T: 5.0, pos: [4.6, 1.8, -5.5], at: [-3.6, 1.1, -12.5], follow: 1, fov: 36 },
  { T: 5.7, pos: [3.4, 3.4, -2.2], at: [1.2, 1, 1.5], follow: 0.6, fov: 40 },
  { T: 6.1, pos: [-2.6, 2.3, 0.4], at: [1.4, 0.8, 2.6], follow: 0.8, fov: 42 },
  { T: 6.5, pos: [-1.6, 2.4, 7.5], at: [2.2, 1, 2], follow: 1, fov: 38 },
  { T: 7.05, pos: [-2.4, 5.2, -2.2], at: [-3.9, 0, -5.4], follow: 0.3, fov: 38 },
  { T: T_END, pos: [-3.9, 9.5, -3.6], at: [-4.9, 0, -4.4], follow: 0.05, fov: 34 },
];
const toWorld = (v) => v.map((n, i) => (i === 0 ? n + COURT.x : i === 2 ? n + COURT.z : n));
const curve = (key) => new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...toWorld(k[key]))), false, 'centripetal');
const POS = curve('pos');
const AT = curve('at');

/** Camera state at rally time T into `out` ({ pos, at, fov }). `ball` is the ball in world space. */
export function cameraAt(T, ball, out) {
  const t = Math.min(Math.max(T, KEYS[0].T), T_END);
  let i = 1;
  while (i < KEYS.length - 1 && KEYS[i].T < t) i++;
  const a = KEYS[i - 1];
  const b = KEYS[i];
  const s0 = (t - a.T) / (b.T - a.T);
  const s = s0 * s0 * (3 - 2 * s0); // ease between keys, so the camera settles on each
  const u = (i - 1 + s) / (KEYS.length - 1);
  POS.getPoint(u, out.pos);
  AT.getPoint(u, out.at);
  out.at.lerp(ball, a.follow + (b.follow - a.follow) * s);
  out.fov = a.fov + (b.fov - a.fov) * s;
  return out;
}
