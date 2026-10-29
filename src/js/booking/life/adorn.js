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

const canvas = (draw) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
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
  const jackets = layer('jackets', jacketTexture(), 3);
  const want = { hats: false, jackets: false };
  let bodies = [];
  let scanned = -1;
  let doneAt = -1; // two users tick it in one frame: the second finds it done
  let alive = false;
  let standing = 1.3; // the usual head height in the image plane (a running median of the frames' tops)
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function scan(t) {
    scanned = t;
    bodies = [];
    scene.traverse((o) => { if (o.isInstancedMesh && ADORNED(o)) bodies.push(o); });
  }

  return {
    /** `{ hats, jackets }`: which layers are on. */
    set(next) {
      Object.assign(want, next);
      hats.visible = want.hats; // off at once, whoever ticks next
      jackets.visible = want.jackets;
    },
    on: () => want.hats || want.jackets,
    tick(t) {
      if (t === doneAt) return alive;
      doneAt = t;
      const active = want.hats || want.jackets;
      hats.visible = want.hats;
      jackets.visible = want.jackets;
      if (!active) { hats.count = jackets.count = 0; return (alive = false); }
      if (t - scanned > 1) scan(t); // a lower-detail mesh swaps in and out as the camera moves
      let n = 0;
      for (const b of bodies) {
        if (!b.visible) continue;
        const at = b.geometry.attributes;
        const away = b.userData.flip.slide;
        for (let i = 0; i < b.count && n < MAX; i++) {
          b.getMatrixAt(i, m4);
          const e = m4.elements;
          if (e[0] === 0 && e[5] === 0) continue; // hidden slot
          const top = Math.max(at.aBox.getW(i), at.aBox2.getW(i)); // the frame's top edge
          standing += Math.sign(top - standing) * 0.0015;
          const head = Math.min(top, standing * 1.08);
          const seed = hash(i + b.id * 17);
          p.set(e[12], e[13], e[14]);
          s.set(HEAD.w, HEAD.h, 1);
          if (want.hats) {
            m4.compose(p.clone().addScaledVector(up, head - HEAD.drop + HEAD.h * 0.3).addScaledVector(back, away + 0.03), tilt, s);
            hats.setMatrixAt(n, m4);
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
      hats.count = want.hats ? n : 0;
      jackets.count = want.jackets ? n : 0;
      hats.instanceMatrix.needsUpdate = jackets.instanceMatrix.needsUpdate = true;
      if (jackets.instanceColor) jackets.instanceColor.needsUpdate = true;
      return (alive = n > 0);
    },
  };
}
