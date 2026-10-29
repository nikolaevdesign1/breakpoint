import * as THREE from 'three';
import gsap from 'gsap';
import '../../../css/booking-seasons.css';
import { LIFE_LAYER } from './shared.js';
import { captureFrame } from '../scene.js';
import { createPlaceCard, PHOTO } from '../seasons/place-card.js';

// Places on the map (round 8, "seasons"; row 180): the clubhouse (changing rooms, front desk, pro
// shop, café), the rest zone, the chill area and the car park.
// - Hover: the cursor label the courts use ("Café · open 7:00 to 22:00"), and the place lights up
//   like a hovered court: a little brighter (multiplied in, as the court light pools do) with a thin
//   white line round its footprint. Both live on the life layer: no re-bake of the still frame.
// - Click (touch: tap): the drone settles on the place and a card opens beside it: a live view of
//   the place from the model, hours, what is inside and one useful line (seasons/place-card.js).
//   While the card is open, a click on the map closes it and does nothing else (no court opens).
// The places are boxes on the ground plan, read from the model (the clubhouse runs along the south
// edge, its doors at x ≈ −9.8, 9.8 and 47); a court plane in front of a box still wins, so court
// hover and booking work as before. The storage shed (staff only) and the greenhouses have no label.

const INFO = {
  changing: {
    label: 'Changing rooms · lockers, showers, towels', title: 'Changing rooms', hours: 'Open 6:00 to 23:00',
    inside: 'Lockers, showers, hair dryers', note: 'Towels at the front desk, free for members',
  },
  clubhouse: {
    label: 'Clubhouse · front desk 6:00 to 23:00', title: 'Clubhouse', hours: 'Front desk 6:00 to 23:00',
    inside: 'Front desk, check-in, lost and found', note: 'Show your booking on your phone, no printout needed',
  },
  proshop: {
    label: 'Pro shop · rackets, balls, restringing', title: 'Pro shop', hours: 'Open 8:00 to 20:00',
    inside: 'Rackets, balls, grips, shoes', note: 'Restringing back in 24 hours, demo rackets to try',
  },
  cafe: {
    label: 'Café · open 7:00 to 22:00', title: 'Café', hours: 'Open 7:00 to 22:00',
    inside: 'Coffee, smoothies, salads', note: 'Order at the counter, we bring it out',
  },
  rest: {
    label: 'Rest zone · shade and water between sets', title: 'Rest zone', hours: 'Open all day',
    inside: 'Shade, benches, a water fountain', note: 'Refill your bottle between sets, it is free',
  },
  chill: {
    label: 'Chill area · loungers by the café', title: 'Chill area', hours: 'Open 7:00 to 22:00',
    inside: 'Loungers, umbrellas, café service', note: 'A quiet spot to wait for your court',
  },
  parking: {
    label: 'Parking · 2 min walk to the courts', title: 'Parking', hours: 'Open 6:00 to 23:00',
    inside: 'Free for players, shade by the hedge', note: '2 min walk to the courts',
  },
};

// Boxes (min x, y, z, max x, y, z) and the view for the card's picture (camera from, looking at).
const PLACES = [
  { kind: 'changing', box: [-25.6, 0, -58.2, -2, 4.8, -51.2], shot: [[-13.8, 10, -40], [-13.8, 1.4, -53]] },
  { kind: 'clubhouse', box: [-2, 0, -58.2, 30, 4.8, -51.2], shot: [[12, 10, -40], [12, 1.4, -53]] },
  { kind: 'proshop', box: [30, 0, -58.2, 42, 4.8, -51.2], shot: [[36, 9, -41], [36, 1.4, -53]] },
  { kind: 'cafe', box: [42, 0, -58.2, 60.6, 4.8, -51.2], shot: [[51, 10, -38], [51, 1.2, -51]] },
  { kind: 'rest', box: [-5.4, 0, -51.2, 5.4, 2.8, -42.6], shot: [[0, 10, -33], [0, 0.8, -47]] },
  { kind: 'chill', box: [50.8, 0, -50.6, 59, 2.8, -43.4], shot: [[54.5, 9, -35], [54.5, 0.6, -47]] },
  { kind: 'parking', box: [59.6, 0, 44.6, 102.4, 2, 67.4], shot: [[80, 22, 88], [80, 0, 56]] },
  { kind: 'parking', box: [102, 0, 52.6, 140, 2, 59.4], shot: [[80, 22, 88], [80, 0, 56]] },
].map((p) => ({ ...p, ...INFO[p.kind], box: new THREE.Box3(new THREE.Vector3(...p.box.slice(0, 3)), new THREE.Vector3(...p.box.slice(3))) }));

const LABELS = Object.fromEntries(PLACES.map((p) => [`place:${p.kind}`, p.label]));
const BRIGHTEN = 0.16; // hovered: 16 % brighter, like the edge of a lit court
const LINE = 0.12; // m, the footprint outline

/** A flat ring (outline) round a ground rectangle, `w` wide, inside its edge. */
function ringGeometry(b, w, y) {
  const [x0, z0, x1, z1] = [b.min.x, b.min.z, b.max.x, b.max.z];
  const quads = [[x0, z0, x1, z0 + w], [x0, z1 - w, x1, z1], [x0, z0 + w, x0 + w, z1 - w], [x1 - w, z0 + w, x1, z1 - w]];
  const pos = [];
  for (const [a, c, b2, d] of quads) pos.push(a, y, c, a, y, d, b2, y, c, b2, y, c, a, y, d, b2, y, d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function createPlaces({ scene, root, camera, renderer, rig }) {
  const courts = [];
  root.traverse((o) => { if (o.isMesh && o.name.endsWith('_hl')) courts.push(o); });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const canvas = renderer.domElement;
  const busy = () => document.body.classList.contains('hud-open') || document.body.classList.contains('postcard-on');

  function placeAt(x, y) {
    if (busy()) return null;
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    let bestD = Infinity;
    for (const p of PLACES) {
      if (!raycaster.ray.intersectBox(p.box, hit)) continue;
      const d = hit.distanceTo(raycaster.ray.origin);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return null;
    const court = raycaster.intersectObjects(courts, false)[0];
    return court && court.distance < bestD ? null : best;
  }

  // --- Hover light ------------------------------------------------------------------------
  // The box's front faces are drawn over the frame as light (dst × (1 + k)), so whatever of the
  // place shows through them brightens, nothing in front of it does (depth test); the outline
  // lies on the ground round the footprint.
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
  }));
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(new THREE.BufferGeometry(), lineMat);
  for (const m of [glow, line]) {
    m.layers.set(LIFE_LAYER);
    m.visible = false;
    m.frustumCulled = false;
    m.userData.noAO = true;
    m.renderOrder = 4;
    scene.add(m);
  }
  const level = { v: 0 };
  let lit = null; // place shown lit
  let frames = 0;

  function write() {
    glow.material.color.setScalar(BRIGHTEN * level.v);
    lineMat.opacity = 0.9 * level.v;
    glow.visible = line.visible = level.v > 0.002;
    frames = 2;
  }

  function light(p) {
    if (p === lit) return;
    if (p) {
      const s = p.box.getSize(new THREE.Vector3());
      glow.scale.set(s.x + 0.3, s.y + 0.15, s.z + 0.3);
      glow.position.set((p.box.min.x + p.box.max.x) / 2, p.box.min.y - 0.02, (p.box.min.z + p.box.max.z) / 2);
      line.geometry.dispose();
      line.geometry = ringGeometry(p.box, LINE, 0.05);
    }
    const fresh = p && !lit;
    lit = p;
    if (fresh) level.v = 0;
    gsap.to(level, { v: p ? 1 : 0, duration: p ? 0.35 : 0.3, ease: 'power2.out', overwrite: true, onUpdate: write });
  }

  // The highlight follows the pointer itself (the life pick stops at the first taker).
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    light(card.isOpen() ? card.openFor() : placeAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointerleave', () => light(card.isOpen() ? card.openFor() : null));

  // --- Card ----------------------------------------------------------------------------------

  const card = createPlaceCard({ onClose: () => light(null) });
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  function screenRect(b) {
    let [l, r, t, bt] = [Infinity, -Infinity, Infinity, -Infinity];
    corners.forEach((v, i) => {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
      const x = (v.x + 1) / 2 * innerWidth;
      const y = (1 - v.y) / 2 * innerHeight;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); bt = Math.max(bt, y);
    });
    return { left: l, right: r, top: t, bottom: bt };
  }

  // The card's picture: the place seen from a lower, closer drone, drawn by the map's own renderer
  // into a corner of the canvas, copied out, then the view is redrawn in the same task.
  const shotCam = new THREE.PerspectiveCamera(40, PHOTO.w / PHOTO.h, 0.5, 600);
  function photo(p) {
    try {
      const pr = renderer.getPixelRatio();
      const w = Math.round(PHOTO.w * pr);
      const h = Math.round(PHOTO.h * pr);
      shotCam.position.set(...p.shot[0]);
      shotCam.lookAt(...p.shot[1]);
      shotCam.layers.enableAll();
      shotCam.updateMatrixWorld();
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const size = renderer.getSize(new THREE.Vector2());
      const prev = { glow: glow.visible, line: line.visible };
      glow.visible = line.visible = false;
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, PHOTO.w, PHOTO.h);
      renderer.setScissor(0, 0, PHOTO.w, PHOTO.h);
      renderer.render(scene, shotCam);
      out.getContext('2d').drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      glow.visible = prev.glow;
      line.visible = prev.line;
      captureFrame(() => {}); // the map back in place before the browser shows the canvas
      return out;
    } catch (err) {
      console.warn('Place view failed', err);
      return null;
    }
  }

  function openCard(p) {
    if (rig.flying?.()) return false; // the intro flight has the camera
    light(p);
    card.open(p, photo(p));
    const b = p.box;
    const phone = innerWidth <= 640;
    rig.frame({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }, { inset: phone ? { bottom: 380 } : { right: 340 }, pad: 1.5, duration: 1.2 });
    frames = 2;
    return true;
  }

  const closeCard = () => { if (card.isOpen()) card.close(); };
  document.addEventListener('bp-hud', (e) => { if (e.detail?.open) closeCard(); });
  document.addEventListener('bp-postcard', (e) => { if (e.detail?.open) closeCard(); });

  if (import.meta.env.DEV) {
    window.__bp ??= {};
    window.__bp.places = {
      open: (kind) => openCard(PLACES.find((p) => p.kind === kind)),
      hover: (kind) => light(PLACES.find((p) => p.kind === kind) ?? null),
      close: closeCard,
    };
  }

  return {
    name: 'places',
    tick() {
      if (card.isOpen()) card.place(screenRect(card.openFor().box));
      const need = frames > 0 || gsap.isTweening(level);
      if (frames > 0) frames--;
      return need;
    },
    pick(x, y, touch) {
      if (touch) return null;
      const p = placeAt(x, y);
      return p ? `place:${p.kind}` : null;
    },
    click(x, y) {
      // An open card: the click closes it, and opens another place if it was on one; never a court.
      if (card.isOpen()) {
        const p = placeAt(x, y);
        const same = p && p.kind === card.openFor().kind;
        card.close(false);
        if (p && !same) openCard(p);
        return true;
      }
      const p = placeAt(x, y);
      return p ? openCard(p) : false;
    },
    label: (kind) => LABELS[kind] ?? null,
    debug: () => ({ places: PLACES.length, open: card.openFor()?.kind ?? null }),
  };
}
