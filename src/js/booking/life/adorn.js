import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { PITCH } from './sprite.js';

// Hats and jackets on the flipbook people (round 10, rows 4 and 5). The baked sprites are not
// redrawn: every person (any body mesh made by sprite.js: players, coaches, kids, the keeper) gets
// a small card in the same image plane, at the head or the torso. Where the head is comes from the
// frame itself: the top of its rect, held down to the usual standing height so a raised racket
// does not lift the hat. Both layers are one draw call each and cost nothing while off.

const MAX = 192;
const HEAD = { w: 0.6, h: 0.6, drop: 0.07 }; // m: hat card, and how far it sits into the head
const TORSO = { w: 0.52, h: 0.46, below: 0.4 }; // m: jacket card, centre below the head top
const JACKETS = ['#e9e6df', '#646544', '#9c441f', '#36251b', '#1d1b19', '#646544', '#e9e6df'];
const ADORNED = (o) => o.userData.flip && !o.userData.ground && !/cat/.test(o.name);

// Staff only (a holiday hat for the club's own people, row 14): the keeper, the squeegee man, the lesson coaches.
const STAFF = (o) => /^life_(keeper|squeegee_man|players_lesson_coach|snow_crew)$/.test(o.name);

const canvas = (draw, size = 64) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** A Santa hat leaning to one side: red cone, white band, white bobble. */
const hatTexture = () => canvas((g) => {
  g.fillStyle = '#c4261d';
  g.beginPath(); g.moveTo(14, 40); g.quadraticCurveTo(22, 10, 48, 14); g.quadraticCurveTo(40, 24, 50, 40); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0, 0, 0, 0.16)';
  g.beginPath(); g.moveTo(34, 40); g.quadraticCurveTo(34, 24, 48, 14); g.quadraticCurveTo(40, 24, 50, 40); g.closePath(); g.fill();
  g.fillStyle = '#f6f3ec';
  g.beginPath(); g.roundRect(10, 36, 44, 12, 6); g.fill();
  g.beginPath(); g.arc(49, 14, 7, 0, Math.PI * 2); g.fill();
});

/** A party hat: a striped cone, tilted, with a gold pompom (round 11, New Year). */
const partyTexture = () => canvas((g) => {
  g.fillStyle = '#d7a93a';
  g.beginPath(); g.moveTo(16, 50); g.lineTo(34, 8); g.lineTo(52, 50); g.closePath(); g.fill();
  g.fillStyle = '#f3efe4';
  for (const [x0, x1] of [[22, 27], [30, 35], [38, 43]]) { g.beginPath(); g.moveTo(x0, 50); g.lineTo(34, 8); g.lineTo(x1, 50); g.closePath(); g.fill(); }
  g.fillStyle = '#1d1b19';
  g.fillRect(16, 46, 36, 5);
  g.fillStyle = '#e8e6df';
  g.beginPath(); g.arc(34, 9, 6, 0, Math.PI * 2); g.fill();
});

/** A puffer jacket from the front (grey: the card is tinted per person): shoulders, sleeves, collar, zip. */
const jacketTexture = () => canvas((g) => {
  g.fillStyle = '#d8d8d8';
  g.beginPath(); g.roundRect(14, 10, 36, 46, 10); g.fill();
  g.fillStyle = '#bdbdbd';
  g.beginPath(); g.roundRect(4, 14, 12, 34, 6); g.fill();
  g.beginPath(); g.roundRect(48, 14, 12, 34, 6); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(24, 6, 16, 9, 4); g.fill();
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  g.fillRect(31, 14, 2, 42);
  g.fillRect(14, 34, 36, 2);
});

/** A plain jersey from the front (grey: the card is tinted per person): short sleeves, a V collar, two bands. No number, no mark. */
const jerseyTexture = () => canvas((g) => {
  g.fillStyle = '#e4e4e4';
  g.beginPath(); g.moveTo(20, 8); g.lineTo(28, 8); g.lineTo(32, 16); g.lineTo(36, 8); g.lineTo(44, 8); g.lineTo(60, 18); g.lineTo(54, 30); g.lineTo(48, 26); g.lineTo(48, 56); g.lineTo(16, 56); g.lineTo(16, 26); g.lineTo(10, 30); g.lineTo(4, 18); g.closePath(); g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(16, 38, 32, 5);
  g.beginPath(); g.moveTo(4, 18); g.lineTo(10, 30); g.lineTo(13, 28); g.lineTo(8, 16); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(60, 18); g.lineTo(54, 30); g.lineTo(51, 28); g.lineTo(56, 16); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  g.beginPath(); g.moveTo(28, 8); g.lineTo(32, 16); g.lineTo(36, 8); g.closePath(); g.fill();
}, 64);

let shared = null;
/** The one set of layers every user shares (the holiday decor wants hats, the cold jackets). */
export const adorn = (ctx) => (shared ??= createAdorn(ctx));

function createAdorn({ scene }) {
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PITCH); // faces the drone
  const up = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));
  const back = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  const geo = new THREE.PlaneGeometry(1, 1);
  const layer = (name, map, order) => {
    const mat = gradeLife(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, alphaTest: 0.02, color: new THREE.Color().setScalar(1.3) }));
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.name = `life_adorn_${name}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.layers.set(LIFE_LAYER);
    mesh.userData.noAO = true;
    mesh.renderOrder = order; // over the bodies (2)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return mesh;
  };
  const hats = layer('hats', hatTexture(), 3);
  const kinds = { santa: hats.material.map };
  /** Registers a hat card (a 64 px canvas drawing) under a name; `set({ hats: true, hat: name })` shows it. */
  const defineHat = (name, draw, { size = 64, w = HEAD.w, h = HEAD.h, rise = 0.3, sway = 0 } = {}) => {
    kinds[name] ??= canvas(draw, size);
    looks[name] = { w, h, rise, sway };
  };
  kinds.party = partyTexture();
  const jackets = layer('jackets', jacketTexture(), 3);
  const jerseys = layer('jerseys', jerseyTexture(), 3);
  const looks = {}; // hat name → { w, h, rise, sway } (the default is the Santa hat's)
  const want = { hats: false, jackets: false, jerseys: false, hat: 'santa', staff: false, jerseyColors: ['#c4261d', '#2f5fb0'] };
  const last = new Map(); // body id → Float32Array(x, z per slot): who is walking (the hat sways)
  let bodies = [];
  let scanned = -1;
  let doneAt = -1; // two users tick it in one frame: the second finds it done
  let alive = false;
  let standing = 1.3; // the usual head height in the image plane (a running median of the frames' tops)
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const axis = new THREE.Vector3(0, 0, 1);
  const swayQ = new THREE.Quaternion();
  const HEAD_LOOK = { w: HEAD.w, h: HEAD.h, rise: 0.3, sway: 0 };
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function scan(t) {
    scanned = t;
    bodies = [];
    scene.traverse((o) => { if (o.isInstancedMesh && ADORNED(o)) bodies.push(o); });
  }

  return {
    /** `{ hats, jackets, jerseys }`: which layers are on; `hat` the kind, `staff` hats for the club's own people only, `jerseyColors` the teams. */
    defineHat,
    set(next) {
      Object.assign(want, next);
      const map = kinds[want.hat] ?? kinds.santa;
      if (hats.material.map !== map) { hats.material.map = map; hats.material.needsUpdate = true; }
      hats.visible = want.hats; // off at once, whoever ticks next
      jackets.visible = want.jackets;
      jerseys.visible = want.jerseys;
    },
    on: () => want.hats || want.jackets || want.jerseys,
    tick(t) {
      if (t === doneAt) return alive;
      doneAt = t;
      const active = want.hats || want.jackets || want.jerseys;
      hats.visible = want.hats;
      jackets.visible = want.jackets;
      jerseys.visible = want.jerseys;
      if (!active) { hats.count = jackets.count = jerseys.count = 0; return (alive = false); }
      if (t - scanned > 1) scan(t); // a lower-detail mesh swaps in and out as the camera moves
      const look = looks[want.hat] ?? HEAD_LOOK;
      let n = 0;
      let nh = 0;
      for (const b of bodies) {
        if (!b.visible) continue;
        const staff = STAFF(b);
        const at = b.geometry.attributes;
        const away = b.userData.flip.slide;
        let seen = last.get(b.id);
        if (!seen || seen.length < b.count * 3) last.set(b.id, (seen = new Float32Array(b.count * 3)));
        for (let i = 0; i < b.count && n < MAX; i++) {
          b.getMatrixAt(i, m4);
          const e = m4.elements;
          if (e[0] === 0 && e[5] === 0) continue; // hidden slot
          const top = Math.max(at.aBox.getW(i), at.aBox2.getW(i)); // the frame's top edge
          standing += Math.sign(top - standing) * 0.0015; // everyone feeds the median, staff or not
          if (want.staff && !staff && !want.jerseys) continue;
          const head = Math.min(top, standing * 1.08);
          const seed = hash(i + b.id * 17);
          p.set(e[12], e[13], e[14]);
          s.set(look.w, look.h, 1);
          if (want.hats && (!want.staff || staff)) {
            let q = tilt;
            if (look.sway) { // walking: the hat rocks with the step
              const moved = Math.hypot(e[12] - seen[i * 3], e[14] - seen[i * 3 + 2]);
              seen[i * 3] = e[12]; seen[i * 3 + 2] = e[14];
              seen[i * 3 + 1] += (Math.min(1, moved * 40) - seen[i * 3 + 1]) * 0.1;
              q = swayQ.setFromAxisAngle(axis, Math.sin(t * 7 + seed * 40) * look.sway * seen[i * 3 + 1]).premultiply(tilt);
            }
            m4.compose(p.clone().addScaledVector(up, head - HEAD.drop + look.h * look.rise).addScaledVector(back, away + 0.03), q, s);
            hats.setMatrixAt(nh++, m4);
          }
          if (want.jerseys && !(want.staff && staff)) {
            s.set(TORSO.w, TORSO.h, 1);
            m4.compose(p.clone().addScaledVector(up, head - TORSO.below).addScaledVector(back, away + 0.02), tilt, s);
            jerseys.setMatrixAt(n, m4);
            jerseys.setColorAt(n, c.set(want.jerseyColors[Math.floor(seed * 7.13) % want.jerseyColors.length]));
          }
          if (want.jackets) {
            s.set(TORSO.w, TORSO.h, 1);
            m4.compose(p.clone().addScaledVector(up, head - TORSO.below).addScaledVector(back, away + 0.02), tilt, s);
            jackets.setMatrixAt(n, m4);
            jackets.setColorAt(n, c.set(JACKETS[Math.floor(seed * JACKETS.length)]));
          }
          n++;
        }
      }
      hats.count = want.hats ? nh : 0;
      jackets.count = want.jackets ? n : 0;
      jerseys.count = want.jerseys ? n : 0;
      hats.instanceMatrix.needsUpdate = jackets.instanceMatrix.needsUpdate = jerseys.instanceMatrix.needsUpdate = true;
      if (jackets.instanceColor) jackets.instanceColor.needsUpdate = true;
      if (jerseys.instanceColor) jerseys.instanceColor.needsUpdate = true;
      return (alive = n > 0);
    },
  };
}
