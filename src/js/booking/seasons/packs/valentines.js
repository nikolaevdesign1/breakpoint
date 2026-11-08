import * as THREE from 'three';
import { adorn } from '../../life/adorn.js';
import { GATES } from '../kit.js';
import * as P from '../props.js';

// Valentine's Day (row 3, round 11), Feb 10 to 15: red and pink lights on the fences, heart
// garlands on the fences and the eave, heart balloons tied by every court gate, rose bouquets on
// the benches, a heart bed of roses on the lawn, petals on the ground by the gates, hearts rising
// through the air, a rose-pink balance on the light of the whole map, and a headband of two small
// hearts on everyone (life/adorn.js). Preview: ?season=valentines

const REDS = ['#d92b3a', '#e84a6a', '#f27a99', '#c4172c', '#f6a6b8', '#e0516f'];
const GARLAND = ['#d92b3a', '#f06a9a', '#f7c6d2', '#c4172c'];
const PETAL = ['#f08aa8', '#e0516f', '#f7c6d2', '#c4172c', '#fbe0e6'];
const BED_AT = [38, -44.2];

/** Headband card: two hearts on springs (64 px canvas, sits on the head). */
function headband(g) {
  const heart = (x, y, s, c) => {
    g.fillStyle = c;
    g.beginPath(); g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    g.fill();
  };
  g.strokeStyle = '#f4d6dc'; g.lineWidth = 3;
  g.beginPath(); g.arc(32, 62, 22, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  g.strokeStyle = '#cfcfcf'; g.lineWidth = 1.6;
  for (const [x, y] of [[19, 22], [45, 22]]) {
    g.beginPath(); g.moveTo(x < 30 ? 21 : 43, 47); g.quadraticCurveTo(x + (x < 30 ? 5 : -5), 36, x, y + 6); g.stroke();
  }
  heart(19, 22, 8, '#e0314b'); heart(45, 22, 8, '#f06a9a');
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(16, 18, 2, 0, 7); g.arc(42, 18, 2, 0, 7); g.fill();
}

export default function build(kit) {
  const { ctx, plan, r, once, flags, lights, strands, scatter, TINTS } = kit;
  const { root, rig } = ctx;
  const group = new THREE.Group();
  const glow = [];
  const flatGround = (x, z) => plan.floorY(x, z) + 0.03;

  // Lights and garlands.
  const fence = strands({ eave: false });
  lights(group, fence.filter((_, i) => i % 2 === 0), TINTS.RED, glow);
  lights(group, fence.filter((_, i) => i % 2 === 1), TINTS.PINK, glow);
  lights(group, strands({ fences: false }), TINTS.PINK, glow);
  flags(group, strands({ y: 2.9, out: 0.2, eave: false }), GARLAND, { shape: 'heart', size: { w: 0.5, l: 0.5 }, step: 0.8 });
  flags(group, strands({ fences: false, y: 2.7 }), GARLAND, { shape: 'heart', size: { w: 0.46, l: 0.46 }, step: 0.9 });

  // Heart balloons by every gate, tied to the ground.
  const heart = once('vHeart', () => P.heartSolid('#ffffff').rotateX(-rig.pitch));
  const balloons = [];
  const strings = [];
  GATES.forEach(([gx, side], i) => {
    for (const [dx, h] of [[-2.7, 2.7], [2.7, 3.1], [-3.2, 2.2]]) {
      const at = P.claim(plan, gx + dx, side * 1.75, 0.2, 0.5);
      if (!at) continue;
      const y = at.y + h;
      balloons.push([at.x, y, at.z, 0, 0.84 + ((i + balloons.length) % 3) * 0.1]);
      strings.push(at.x, at.y + 0.05, at.z, at.x + 0.05, y - 0.42, at.z);
    }
  });
  scatter(group, heart, P.propMaterial({ roughness: 0.3, metalness: 0.15 }), balloons, { colors: ['#e0314b', '#f06a9a', '#d92b3a', '#f7a3b8'] });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
  const sl = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xe9e2dc }));
  sl.userData.noAO = true;
  group.add(sl);

  // Bouquets on the benches.
  const benches = P.instanceSpots(root, /^Cube002$/).filter((b) => b.z > -40 || b.x > 10 || b.x < -10);
  const bouquetMat = P.propMaterial({ roughness: 0.55 });
  [[REDS.slice(0, 4), '#f3e9e1', 0], [['#f27a99', '#f6a6b8', '#e84a6a'], '#e9c9d2', 1]].forEach(([palette, paper, k]) => {
    const spots = benches.filter((_, i) => i % 4 === k * 2).slice(0, 8).map((b, i) => [b.x, b.y - 0.02, b.z, -b.yaw + (i % 2 ? 0.5 : -0.4) + k, 1.45]);
    if (spots.length) scatter(group, once(`bouquet${k}`, () => P.bouquetGeometry(palette, paper)), bouquetMat, spots);
  });

  // A heart bed of roses on the lawn.
  const bed = P.claim(plan, BED_AT[0], BED_AT[1], 3.6, 9);
  if (bed) {
    const K = 3.1;
    const base = P.heartFlat().scale(K * 2.3, 1, K * 2.3);
    const baseMat = P.decalMaterial({ color: 0x2f5a2a });
    const baseMesh = new THREE.Mesh(base, baseMat);
    baseMesh.position.set(bed.x, bed.y + 0.03, bed.z);
    baseMesh.receiveShadow = true;
    baseMesh.userData.noAO = true;
    group.add(baseMesh);
    const rose = once('vRose', P.roseHead);
    const spots = [];
    const ring = (n, k) => P.heartOutline(n).forEach(([hx, hy], i) => spots.push([bed.x + hx * K * k, bed.y + 0.04, bed.z - hy * K * k + 0.1 * K * k, r() * 6, 0.38 + r() * 0.08 + k * 0.04]));
    ring(46, 1.04); ring(36, 0.8); ring(24, 0.56); ring(12, 0.3);
    scatter(group, rose, P.propMaterial({ roughness: 0.5 }), spots, { colors: REDS });
  }

  // Petals on the ground by the gates and along the walkway.
  const petals = [];
  const tryPetal = (x, z) => { if (plan.free(x, z, 0.1)) petals.push([x, flatGround(x, z), z, r() * 6, 0.7 + r() * 0.7]); };
  GATES.forEach(([gx, side]) => { for (let i = 0; i < 18; i++) tryPetal(gx + (r() - 0.5) * 10, side * (1.3 + r() * 2.1)); });
  for (let i = 0; i < 50; i++) tryPetal(-44 + r() * 100, (r() < 0.5 ? -1 : 1) * (1.3 + r() * 2.2));
  const petal = once('vPetal', () => new THREE.CircleGeometry(0.1, 7).scale(1, 1.4, 1).rotateX(-Math.PI / 2));
  scatter(group, petal, P.decalMaterial({ side: THREE.DoubleSide }), petals, { colors: PETAL, shadow: false }).receiveShadow = true;

  adorn(ctx).defineHat('valentine', headband);

  return {
    group, glow, hats: 'valentine', particles: 'hearts', windows: 0.5,
    accent: { tint: [1.07, 0.95, 0.99] },
  };
}
