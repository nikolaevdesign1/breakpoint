import * as THREE from 'three';
import { CHAPTERS, COURT, cameraAt, ballAt, timeAt } from './path.js';

// Chapter 3, "Water. Roll. Brush. Line.": four small acts on the clay, one per word, each laid where the
// camera looks while that word is on screen. Everything is a function of the chapter's progress q (0..1),
// so scrubbing back undoes it. Acts: a wet patch, a roller crossing, a broom sweeping, chalk drawn.

const [P0, P1] = CHAPTERS[2].p;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp = (v) => Math.min(1, Math.max(0, v));
const BAND = 3; // half width of an act, metres

export function createCraft(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const keep = [];
  const mat = (color, opacity) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    keep.push(m);
    return m;
  };
  const flatPlane = (w, l, m, originLeft) => {
    const g = new THREE.PlaneGeometry(w, l);
    if (originLeft) g.translate(w / 2, 0, 0);
    keep.push(g);
    const o = new THREE.Mesh(g, m);
    o.rotation.x = -Math.PI / 2;
    o.renderOrder = 1;
    return o;
  };

  // Where each act happens: on the ground ahead of the camera, as it will be while its word shows
  const ball = new THREE.Vector3();
  const cam = { pos: new THREE.Vector3(), at: new THREE.Vector3(), fov: 0 };
  const acts = [0, 1, 2, 3].map((k) => {
    const T = timeAt(P0 + ((k + 0.5) / 4) * (P1 - P0));
    const b = ballAt(T);
    ball.set(b.x + COURT.x, b.y, b.z + COURT.z);
    cameraAt(T, ball, cam);
    const f = new THREE.Vector3().subVectors(cam.at, cam.pos).setY(0).normalize();
    const root = new THREE.Group();
    root.position.copy(cam.pos).addScaledVector(f, 6.5).setY(0.04);
    root.rotation.y = Math.atan2(f.x, f.z); // local +z runs away from the camera, local +x to its left
    root.visible = false;
    group.add(root);
    return root;
  });

  // 0 water: a dark wet patch that spreads
  const wet = flatPlane(2 * BAND, 2 * BAND, mat(0x3b2216, 0.4));
  acts[0].add(wet);

  // 1 roll: a drum crossing the court, a darker pressed strip behind it
  const drumGeo = new THREE.CylinderGeometry(0.34, 0.34, 2.4, 20);
  drumGeo.rotateX(Math.PI / 2); // axis along z (away from the camera)
  keep.push(drumGeo);
  const drum = new THREE.Mesh(drumGeo, mat(0x8d9096, 1));
  drum.material.transparent = false;
  drum.position.y = 0.34;
  const strip = flatPlane(1, 2.4, mat(0x6b2a12, 0.38), true);
  acts[1].add(drum, strip);

  // 2 brush: a broom swinging across, pale strokes left in rows
  const broom = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.14), mat(0x2a1f18, 1));
  broom.material.transparent = false;
  keep.push(broom.geometry);
  broom.position.y = 0.06;
  acts[2].add(broom);
  const rows = Array.from({ length: 7 }, (_, i) => {
    const r = flatPlane(2 * BAND, 0.3, mat(0xf2d2a8, 0.3));
    r.position.z = -1.2 + i * 0.4;
    acts[2].add(r);
    return r;
  });

  // 3 line: chalk drawn from one end, a puff at the tip
  const chalk = flatPlane(2 * BAND, 0.07, mat(0xffffff, 1), true);
  chalk.position.x = -BAND;
  chalk.scale.x = 0.001;
  const puff = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat(0xffffff, 0.5));
  puff.rotation.x = -Math.PI / 2;
  keep.push(puff.geometry);
  acts[3].add(chalk, puff);

  return {
    update(q) {
      const x = q * 4;
      acts.forEach((a, k) => { a.visible = x >= k && x < 4.2; });
      const u = (k) => clamp(x - k);
      // water
      const w = u(0);
      wet.scale.setScalar(0.3 + 0.7 * smooth(w));
      wet.material.opacity = 0.4 * smooth(clamp(w * 2));
      // roll
      const r = smooth(u(1));
      const dx = -BAND + 2 * BAND * r;
      drum.position.x = dx;
      drum.rotation.z = -dx / 0.34;
      strip.position.x = -BAND;
      strip.scale.x = Math.max(0.001, dx + BAND);
      // brush
      const b = u(2);
      broom.position.x = Math.sin(b * Math.PI * 3.5) * (BAND - 0.5);
      broom.position.z = -1.2 + b * 2.4;
      rows.forEach((row, i) => { row.visible = b > i / 7; });
      // line
      const l = smooth(u(3));
      chalk.scale.x = Math.max(0.001, l);
      puff.position.set(-BAND + 2 * BAND * l, 0.02, 0);
      puff.visible = l > 0 && l < 1;
    },
    dispose() {
      group.removeFromParent();
      keep.forEach((o) => o.dispose?.());
    },
  };
}
