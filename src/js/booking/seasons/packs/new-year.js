import * as THREE from 'three';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { miamiNow } from '../../miami-clock.js';
import { daysFromEvent } from '../calendar.js';
import { createFireworks } from '../fireworks.js';
import { part, merge } from '../../life/geom.js';

// New Year (row 2, round 11), Dec 28 to Jan 2: gold and silver lights and star garlands on the
// fences, party hats on everyone, confetti and streamers drifting down, poppers (on a click on the
// map and every half minute), and a lit ball on a mast above the plaza that drops in the last ten
// seconds before midnight in Miami (23:59:50 to 00:00), with the countdown on a board at its foot,
// "Happy New Year" after, and a volley of fireworks over the club. The date logic: Dec 31 and Jan 1
// follow the real Miami clock; Dec 28 to 30 the ball waits at the top, Jan 2 it rests at the bottom.
// Forced from the menu on any other day, the whole night plays on a loop (75 s) so it can be seen.
// Preview: ?season=new-year, dev: __bp.seasons.newYear.at(seconds) pins the seconds to midnight.

const GOLD = '#d7a93a';
const SILVER = '#dfe6ef';
const TOP = 14.2;
const BOTTOM = 4.4;
const POLE = 15;
const DROP = 10; // s
const SHOW = 26; // s of fireworks after midnight
const LOOP = 75;
const PALETTE = [[1, 0.78, 0.3], [0.95, 0.94, 0.9], [0.8, 0.85, 1], [1, 0.45, 0.55], [1, 0.62, 0.12]];
const SPOT = [33, -46.5];

/** Seconds to midnight (negative after it) on the Miami clock, or the looping preview; Infinity / -Infinity: parked. */
function toMidnight(pin) {
  if (pin != null) return pin;
  const n = miamiNow();
  const k = daysFromEvent('new-year', n);
  if (k === null) return 20 - ((Date.now() / 1000) % LOOP); // forced on another day: loop
  if (n.m === 12 && n.d === 31) return (24 - n.hours) * 3600;
  if (n.m === 1 && n.d === 1) return -n.hours * 3600;
  return k < 0 ? Infinity : -Infinity;
}

/** The year of the coming midnight, from the Miami date (Dec: the next one). */
const comingYear = () => { const n = miamiNow(); return n.m === 12 ? n.y + 1 : n.y; };

const boardText = (sec, year) => {
  if (sec > 0 && sec <= 10) return String(Math.ceil(sec));
  if (sec <= 0 && sec > -600) return 'HAPPY NEW YEAR';
  return String(year);
};

function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  return {
    map: t,
    set(text) {
      if (text === last) return;
      last = text;
      const g = c.getContext('2d');
      g.fillStyle = '#111110'; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(10, 10, 492, 236);
      g.fillStyle = '#f2c24a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const long = text.length > 4;
      g.font = `${long ? 600 : 700} ${long ? 62 : 150}px Anton, Switzer, sans-serif`;
      if (long) { g.fillText('HAPPY', 256, 92); g.fillText('NEW YEAR', 256, 168); } else g.fillText(text, 256, 132);
      t.needsUpdate = true;
    },
  };
}

export default function build(kit) {
  const { THREE: _T, ctx, plan, flags, lights, strands, TINTS, glowTex, burst, groundAt, still } = kit;
  const { scene, camera, rig } = ctx;
  const group = new THREE.Group();
  const glow = [];

  // Lights and garlands.
  const fence = strands({ eave: false });
  lights(group, fence.filter((_, i) => i % 2 === 0), TINTS.GOLD, glow);
  lights(group, fence.filter((_, i) => i % 2 === 1), TINTS.SILVER, glow);
  lights(group, strands({ fences: false }), TINTS.WARM, glow);
  flags(group, strands({ y: 2.9, out: 0.2, eave: false }), [GOLD, SILVER], { shape: 'star', size: { w: 0.4, l: 0.4 }, step: 0.8 });
  flags(group, strands({ fences: false, y: 2.7 }), [GOLD, SILVER, '#b9b6ad'], { shape: 'diamond', size: { w: 0.34, l: 0.44 }, step: 0.9 });

  // The mast.
  const at = plan.settle(SPOT[0], SPOT[1], 0.7, 5) ?? { x: SPOT[0], z: SPOT[1] };
  plan.take(at.x, at.z, 0.8);
  const gy = plan.floorY(at.x, at.z);
  const mastGeo = merge([
    part(new THREE.CylinderGeometry(0.1, 0.16, POLE, 10).translate(0, POLE / 2, 0), '#8c9097'),
    part(new THREE.CylinderGeometry(0.45, 0.55, 0.4, 12).translate(0, 0.2, 0), '#4a4d52'),
    part(new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0, POLE - 0.2, 0), '#8c9097'),
    part(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, POLE + 0.15, 0), '#d7a93a'),
  ]);
  const mast = new THREE.Mesh(mastGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }));
  mast.position.set(at.x, gy, at.z);
  mast.castShadow = true;
  group.add(mast);

  // The ball, its halo and the board: they move, so they live on the life layer, outside the baked group.
  const live = new THREE.Group();
  live.name = 'newyear_live';
  const ballMat = gradeLife(new THREE.MeshStandardMaterial({ color: '#e7ebf2', metalness: 0.9, roughness: 0.22, emissive: new THREE.Color(1, 0.72, 0.3), emissiveIntensity: 0.15, flatShading: true }));
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 2), ballMat);
  const haloMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-rig.pitch), haloMat);
  const bt = boardTexture();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4).rotateX(-rig.pitch), gradeLife(new THREE.MeshBasicMaterial({ map: bt.map, toneMapped: false })));
  board.position.set(at.x, gy + 2.5, at.z + 0.5);
  for (const m of [ball, halo, board]) { m.layers.set(LIFE_LAYER); m.frustumCulled = false; m.userData.noAO = true; live.add(m); }
  halo.renderOrder = 5;

  let pin = null;
  let fireworks = null;
  let showFrom = -1; // performance seconds when the show began
  let nextShell = 0;
  let nextPop = 0;
  let wasAfter = false;
  let lastClick = 0;

  const ballY = (sec) => {
    if (sec === Infinity || sec > DROP) return TOP;
    if (sec <= 0) return BOTTOM;
    const u = 1 - sec / DROP;
    return TOP - (TOP - BOTTOM) * (u * u * (3 - 2 * u) * 0.35 + u * 0.65); // gathers speed a little, lands softly
  };

  function pop(sx, sy, n) {
    const g = groundAt(sx, sy);
    burst(g.x, 0.4, g.z, n);
  }

  const api = {
    update(t, dt, night) {
      if (!live.parent) scene.add(live);
      const sec = toMidnight(pin);
      const y = gy + ballY(sec);
      ball.position.set(at.x, y, at.z);
      halo.position.set(at.x, y, at.z + 0.3);
      ball.rotation.y = still ? 0 : t * 0.4;
      bt.set(boardText(sec, comingYear()));
      const lit = 0.25 + 0.75 * night;
      ballMat.emissiveIntensity = 0.12 + lit * 0.9 + (sec <= 0 && sec > -30 ? 0.6 : 0);
      haloMat.color.setRGB(1, 0.72, 0.3).multiplyScalar(0.06 + lit * 0.5);

      if (still) return true;
      const now = performance.now() / 1000;
      const after = sec <= 0 && sec > -SHOW;
      if (after && !wasAfter) { showFrom = now; nextShell = now; for (let i = 0; i < 6; i++) pop(innerWidth * (0.15 + 0.14 * i), innerHeight * (0.4 + 0.3 * Math.random()), 120); }
      wasAfter = after;
      if (after && now > nextShell && showFrom > 0) {
        fireworks ??= createFireworks({ scene, camera, pitch: rig.pitch, palette: PALETTE });
        const k = (now - showFrom) / SHOW;
        const salvo = 1 + (k > 0.5 ? 2 : 0) + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < salvo; i++) fireworks.launch(now + i * 0.12, 0.1 + Math.random() * 0.8, 0.04 + Math.random() * 0.26);
        nextShell = now + 0.5 + Math.random() * 0.9;
      }
      // Poppers every half minute, anywhere in view.
      if (now > nextPop) {
        if (nextPop > 0) pop(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.35 + Math.random() * 0.45), 70);
        nextPop = now + 22 + Math.random() * 20;
      }
      return (fireworks?.update(now) ?? false) || true;
    },
    // A click on the map pops one where it landed and goes on to whatever it clicked (a court, a person).
    click(x, y) {
      const now = performance.now();
      if (still || now - lastClick < 400) return false;
      lastClick = now;
      pop(x, y, 90);
      return false;
    },
    pick: () => null,
    label: () => null,
    off() { scene.remove(live); fireworks?.clear?.(); wasAfter = false; },
    debug: () => ({ sec: toMidnight(pin), y: +ballY(toMidnight(pin)).toFixed(2), text: boardText(toMidnight(pin), comingYear()), year: comingYear() }),
    at(sec) { pin = sec; },
  };
  if (import.meta.env.DEV) { window.__bp ??= {}; window.__bp.seasons ??= {}; window.__bp.seasons.newYear = api; }

  return { group, glow, live: api, snow: 0.6, particles: 'confetti', hats: 'party', accent: { tint: [1.03, 1.01, 0.97] } };
}
