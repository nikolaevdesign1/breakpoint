import * as THREE from 'three';
import { adorn } from '../../life/adorn.js';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { PITCH } from '../../life/sprite.js';
import { GATES } from '../kit.js';
import { drawTexture } from '../critters.js';
import * as P from '../props.js';

// St. Patrick's Day (row 4, round 11), Mar 13 to 18: green and gold lights on the fences, clover
// garlands, green, white and orange pennants on the clubhouse eave, shamrocks painted on the
// walkway and mown into the lawn, a pot of gold at the east end of the walkway with a glint on its
// coins, a rainbow over the club by day that ends in the pot, clovers drifting down, a green
// balance on the light, and a green top hat on everyone. Preview: ?season=st-patricks

const GREENS = ['#2fb85a', '#1f8a43', '#7fd06a', '#169b62'];
const IRISH = ['#169b62', '#f4f1ea', '#ff883e'];
const POT_AT = [67, 3.2];
const BAND = ['#e0312b', '#ff883e', '#f6d23a', '#4bb55a', '#3d9bdc', '#4f63c7', '#8a4fd8'];

/** A tall green hat with a black band and a gold buckle (64 px card). */
function topHat(g) {
  g.fillStyle = '#1b7f43';
  g.fillRect(22, 12, 22, 32);
  g.fillStyle = '#146a37';
  g.fillRect(36, 12, 8, 32);
  g.fillStyle = '#1b7f43';
  g.beginPath(); g.ellipse(33, 12, 11, 3.4, 0, 0, 7); g.fill();
  g.fillStyle = '#146a37';
  g.beginPath(); g.ellipse(33, 45, 21, 5.5, 0, 0, 7); g.fill();
  g.fillStyle = '#1c1b19'; g.fillRect(22, 33, 22, 8);
  g.fillStyle = '#f0b92c'; g.fillRect(29, 32, 9, 10);
  g.fillStyle = '#1c1b19'; g.fillRect(31, 34, 5, 6);
  g.fillStyle = '#4bb55a';
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(46 + Math.cos(k * 2.1) * 3, 24 + Math.sin(k * 2.1) * 3, 2.6, 0, 7); g.fill(); }
}

/** The rainbow: seven soft bands on a half ring, 2:1. */
function rainbowTexture() {
  return drawTexture(1024, 512, (g, w, h) => {
    const cx = w / 2; const cy = h;
    const out = 508; const band = 24;
    BAND.forEach((c, i) => {
      g.strokeStyle = c;
      g.lineWidth = band + 2;
      g.beginPath(); g.arc(cx, cy, out - band * (i + 0.5), Math.PI, 0); g.stroke();
    });
    // soften: fade the ends into the ground
    g.globalCompositeOperation = 'destination-in';
    const f = g.createLinearGradient(0, h * 0.72, 0, h);
    f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = f; g.fillRect(0, 0, w, h);
  });
}

export default function build(kit) {
  const { ctx, plan, r, once, flags, lights, strands, scatter, TINTS, glowTex, still } = kit;
  const { scene, rig } = ctx;
  const group = new THREE.Group();
  const glow = [];
  const gy = (x, z) => plan.floorY(x, z) + 0.03;

  // Lights and garlands.
  const fence = strands({ eave: false });
  lights(group, fence.filter((_, i) => i % 2 === 0), TINTS.GREEN, glow);
  lights(group, fence.filter((_, i) => i % 2 === 1), TINTS.GOLD, glow);
  lights(group, strands({ fences: false }), TINTS.WARM, glow);
  flags(group, strands({ y: 2.9, out: 0.2, eave: false }), GREENS, { shape: 'clover', size: { w: 0.5, l: 0.5 }, step: 0.8 });
  flags(group, strands({ fences: false, y: 2.7 }), IRISH, { shape: 'pennant' });

  // Shamrocks painted on the walkway, white and green, and one mown into the lawn.
  const shamrock = once('sSham', P.shamrockFlat);
  const marks = [];
  GATES.forEach(([gx, side], i) => {
    for (const dx of [-3.4, 3.4]) marks.push([gx + dx, gy(gx + dx, 0), side * 0.2, dx > 0 ? 0.3 : -0.3, 1.5, i % 2]);
  });
  for (let x = -40; x < 58; x += 9) if (!GATES.some(([gx]) => Math.abs(gx - x) < 6)) marks.push([x, gy(x, 0), -0.1 + (x % 2) * 0.2, 0, 1.0, 1]);
  const colors = ['#2fb85a', '#f4f1ea'];
  const sm = scatter(group, shamrock, P.decalMaterial({ side: THREE.DoubleSide }), marks.map((m) => m.slice(0, 5)), { colors: marks.map((m) => colors[m[5]]), shadow: false });
  sm.receiveShadow = true; sm.userData.noAO = true;
  const lawn = P.claim(plan, 24, -43.6, 3, 6);
  if (lawn) {
    const big = new THREE.Mesh(shamrock.clone().scale(5.4, 1, 5.4), P.decalMaterial({ color: 0x74c46b, transparent: true, opacity: 0.55, depthWrite: false }));
    big.position.set(lawn.x, lawn.y + 0.03, lawn.z + 0.2);
    big.receiveShadow = true; big.userData.noAO = true;
    group.add(big);
  }

  // The pot of gold: a cauldron, a heap and loose coins.
  const pot = P.claim(plan, POT_AT[0], POT_AT[1], 0.9, 6) ?? { x: POT_AT[0], y: 0, z: POT_AT[1] };
  const cauldron = new THREE.Mesh(once('sPot', P.cauldronGeometry), P.propMaterial({ roughness: 0.45, metalness: 0.5 }));
  cauldron.scale.setScalar(1.5);
  cauldron.position.set(pot.x, pot.y, pot.z);
  cauldron.castShadow = cauldron.receiveShadow = true;
  group.add(cauldron);
  const coins = [];
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2; const d = 0.55 + r() * 1.6;
    const x = pot.x + Math.cos(a) * d; const z = pot.z + Math.sin(a) * d * 0.8 + 0.4;
    if (plan.free(x, z, 0.08)) coins.push([x, gy(x, z) + 0.01, z, r() * 6, 1.3]);
  }
  scatter(group, once('sCoin', P.coinGeometry), P.propMaterial({ roughness: 0.3, metalness: 0.7 }), coins);

  adorn(ctx).defineHat('leprechaun', topHat);

  // Live: the rainbow (by day) and the glint on the gold.
  const live = new THREE.Group();
  live.name = 'stpatricks_live';
  const W = 62;
  const rbMat = gradeLife(new THREE.MeshBasicMaterial({ map: rainbowTexture(), transparent: true, depthWrite: false, opacity: 0.4, side: THREE.DoubleSide }));
  const rainbow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5).translate(0, 0.25, 0), rbMat);
  rainbow.scale.set(W, W, 1);
  rainbow.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PITCH);
  rainbow.position.set(pot.x - W * 0.42, pot.y, pot.z);
  const sparks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-rig.pitch), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffd36a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 8);
  const spots = Array.from({ length: 8 }, (_, i) => [pot.x + Math.cos(i * 2.4) * 0.55 * (i % 3 ? 1 : 0.4), pot.y + 1.05 + (i % 3) * 0.12, pot.z + Math.sin(i * 2.4) * 0.3]);
  for (const m of [rainbow, sparks]) { m.layers.set(LIFE_LAYER); m.frustumCulled = false; m.userData.noAO = true; live.add(m); }
  rainbow.renderOrder = 2; sparks.renderOrder = 5;
  const m4 = new THREE.Matrix4();
  const api = {
    update(t, dt, night) {
      if (!live.parent) scene.add(live);
      const day = 1 - THREE.MathUtils.smoothstep(night, 0.15, 0.75);
      rbMat.opacity = 0.4 * day * (0.9 + 0.1 * Math.sin(t * 0.4));
      rainbow.visible = day > 0.01;
      spots.forEach((p, i) => {
        const k = still ? 0.3 : Math.max(0, Math.sin(t * (1.1 + (i % 3) * 0.4) + i * 2.3)) ** 3;
        sparks.setMatrixAt(i, m4.makeScale(0.2 + k * 1.1, 0.2 + k * 1.1, 1).setPosition(p[0], p[1] + k * 0.15, p[2]));
      });
      sparks.instanceMatrix.needsUpdate = true;
      return !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { scene.remove(live); },
    debug: () => ({ pot: [pot.x, pot.z], marks: marks.length, coins: coins.length }),
  };

  return { group, glow, live: api, hats: 'leprechaun', particles: 'clovers', accent: { tint: [0.94, 1.06, 0.95] } };
}
