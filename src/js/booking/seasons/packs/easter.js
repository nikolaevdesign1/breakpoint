import * as THREE from 'three';
import { adorn } from '../../life/adorn.js';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { kidsForced } from '../../life/lesson-courts.js';
import { miamiNow } from '../../miami-clock.js';
import { kidsCourtOn } from '../../../shared/availability.js';
import { createHerd, drawTexture } from '../critters.js';
import * as P from '../props.js';

// Easter (row 5, round 11), a week before to a day after: pastel pennants, round egg garlands and
// bows on the fences, pastel lights, tulip and daffodil beds, painted eggs lying on the grass and
// in baskets on the benches, rabbits hopping on the lawns (a click startles one), and an egg hunt
// at the kids' court of the day: a dozen hidden eggs round it, each one found with a click
// (hover shows the count), a pastel burst for every find and a bigger one for the last; the eggs
// are hidden again a few seconds after the last. Bunny ears on everyone, a soft pastel balance on
// the light, pastel blossoms drifting down. Preview: ?season=easter

const PASTEL = ['#f6b8c8', '#b8e0d2', '#fbe8a6', '#c9b8f0', '#b8d8f6', '#f9cfb0'];
const EGGS = ['#f4a6bd', '#a8dcc8', '#f8e08a', '#c0aaf0', '#9cc8f2', '#f7b98e', '#fff4e6'];
const TULIPS = ['#e8506e', '#f6a6b8', '#f4d03a', '#fbf2e8', '#b574d8', '#ff9a4a'];
const HUNT = 12;
const BLOSSOM = { shapes: [2, 1, 4], colors: ['#f6b8c8', '#b8e0d2', '#fbe8a6', '#c9b8f0', '#b8d8f6'], fall: 0.55, size: 0.24, flutter: 1.1, density: 0.4 };

const bunnyFrames = () => {
  const draw = (stretch) => (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#efe8dd';
    g.strokeStyle = '#b3a896'; g.lineWidth = 2;
    const body = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); g.stroke(); };
    if (stretch) {
      body(60, 78, 34, 17, -0.15);        // body, stretched
      body(98, 66, 13, 11);               // head
      g.fillStyle = '#e4dccf'; g.beginPath(); g.ellipse(104, 38, 5, 18, 0.5, 0, 7); g.ellipse(94, 40, 5, 18, 0.7, 0, 7); g.fill();
      g.fillStyle = '#f2b8c2'; g.beginPath(); g.ellipse(104, 38, 2.2, 13, 0.5, 0, 7); g.fill();
      g.fillStyle = '#efe8dd'; body(24, 80, 10, 10); // tail
      g.fillStyle = '#e4dccf'; g.fillRect(36, 88, 24, 6); g.fillRect(82, 84, 14, 6); // legs reaching
    } else {
      body(58, 86, 28, 24);               // sitting body
      body(88, 62, 15, 13);               // head
      g.fillStyle = '#e4dccf'; g.beginPath(); g.ellipse(88, 32, 5.5, 22, 0.12, 0, 7); g.ellipse(98, 34, 5.5, 21, 0.3, 0, 7); g.fill();
      g.fillStyle = '#f2b8c2'; g.beginPath(); g.ellipse(88, 32, 2.4, 16, 0.12, 0, 7); g.fill();
      g.fillStyle = '#efe8dd'; body(28, 92, 10, 10);
      g.fillStyle = '#e4dccf'; g.beginPath(); g.ellipse(70, 108, 20, 7, 0, 0, 7); g.fill();
    }
    g.fillStyle = '#2a2420'; g.beginPath(); g.arc(stretch ? 103 : 93, stretch ? 63 : 60, 2.2, 0, 7); g.fill();
    g.fillStyle = '#e88aa0'; g.beginPath(); g.arc(stretch ? 111 : 101, stretch ? 68 : 65, 2, 0, 7); g.fill();
  };
  return [drawTexture(128, 128, draw(false)), drawTexture(128, 128, draw(true))];
};

/** Two tall ears on a headband: white, pink inside (64 px card). */
function bunnyEars(g) {
  g.strokeStyle = '#f4d6dc'; g.lineWidth = 3;
  g.beginPath(); g.arc(32, 62, 20, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  for (const [x, rot] of [[24, -0.18], [41, 0.2]]) {
    g.fillStyle = '#f4efe6';
    g.beginPath(); g.ellipse(x, 28, 6.4, 19, rot, 0, 7); g.fill();
    g.fillStyle = '#f2b8c2';
    g.beginPath(); g.ellipse(x, 29, 2.8, 14, rot, 0, 7); g.fill();
  }
}

export default function build(kit) {
  const { ctx, plan, r, once, flags, lights, strands, scatter, walkwayFences, courtBoxes, TINTS, glowTex, burst, still } = kit;
  const { root, scene, rig, camera } = ctx;
  const group = new THREE.Group();
  const glow = [];
  const gy = (x, z) => plan.floorY(x, z);
  const benches = P.instanceSpots(root, /^Cube002$/).filter((b) => b.z > -40 || b.x > 10 || b.x < -10);

  // Lights, pennants, round egg garlands and bows.
  const fence = strands({ eave: false });
  lights(group, fence.filter((_, i) => i % 2 === 0), TINTS.PINK, glow);
  lights(group, fence.filter((_, i) => i % 2 === 1), TINTS.BLUE, glow);
  lights(group, strands({ fences: false }), TINTS.WARM, glow);
  flags(group, strands({ y: 2.9, out: 0.2, eave: false }), PASTEL, { size: { w: 0.5, l: 0.62 }, step: 0.7 });
  flags(group, strands({ fences: false, y: 2.7 }), PASTEL, { shape: 'round', size: { w: 0.4, l: 0.5 }, step: 0.8 });
  const bows = [];
  for (const f of walkwayFences()) {
    const n = Math.max(2, Math.round((f.x1 - f.x0) / 3.6));
    for (let k = 0; k < n; k++) bows.push([f.x0 + ((k + 0.5) * (f.x1 - f.x0)) / n, 3.5, f.z + f.side * 0.3, 0, 1.2]);
  }
  scatter(group, once('eBow', () => P.bowGeometry().rotateX(-rig.pitch)), P.propMaterial({ roughness: 0.5, side: THREE.DoubleSide }), bows, { colors: PASTEL, shadow: false });

  // Tulip and daffodil beds.
  const beds = [];
  [[-18, -49.6], [-2, -49.7], [26, -49.8], [40, -49.7], [50, -44], [30, -36.4], [-44, 5.6], [-44, -5.6]].forEach(([x, z]) => {
    const at = P.claim(plan, x, z, 1.7, 3);
    if (at) beds.push([at.x, at.y, at.z, 3.2, 1.1, 0]);
  });
  if (beds.length) {
    const frame = new THREE.Mesh(P.bedGeometry(beds), P.propMaterial({ roughness: 0.85 }));
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);
    const stems = []; const tulips = []; const daffs = [];
    for (const [bx, by, bz, w, d] of beds) {
      for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) {
        const x = bx - w / 2 + 0.22 + (i * (w - 0.44)) / 11 + (r() - 0.5) * 0.12;
        const z = bz - d / 2 + 0.22 + (j * (d - 0.44)) / 2 + (r() - 0.5) * 0.1;
        const s = 1.0 + r() * 0.4;
        const spot = [x, by + 0.1, z, r() * 6, s];
        stems.push(spot);
        (r() < 0.28 ? daffs : tulips).push(spot);
      }
    }
    const stemMat = P.propMaterial({ roughness: 0.8, side: THREE.DoubleSide });
    scatter(group, once('eStem', P.stemGeometry), stemMat, stems, { shadow: false });
    scatter(group, once('eTulip', P.tulipHead), P.propMaterial({ roughness: 0.55, side: THREE.DoubleSide }), tulips, { colors: TULIPS, shadow: false });
    scatter(group, once('eDaff', P.daffodilHead), P.propMaterial({ roughness: 0.6, side: THREE.DoubleSide }), daffs, { colors: ['#f7d84a', '#fbe98a'], shadow: false });
  }

  // Eggs on the grass, and baskets on the benches.
  const eggMat = P.propMaterial({ roughness: 0.35, metalness: 0.05 });
  const lying = once('eEggLying', () => P.eggGeometry().rotateZ(Math.PI / 2).translate(0.15, 0.15, 0));
  const onGrass = [];
  const lawns = [[14, -47, 58, -36.5], [-47, 3, -34, 6], [-47, -6, -34, -3]];
  for (let n = 0; n < 150 && onGrass.length < 56; n++) {
    const [x0, z0, x1, z1] = lawns[n % 3 === 0 ? 1 + (n % 2) : 0];
    const cx = x0 + r() * (x1 - x0); const cz = z0 + r() * (z1 - z0);
    for (let k = 0; k < 3; k++) {
      const x = cx + (r() - 0.5) * 2.4; const z = cz + (r() - 0.5) * 2.4;
      if (x > x0 && x < x1 && z > z0 && z < z1 && plan.free(x, z, 0.2)) onGrass.push([x, gy(x, z), z, r() * 6, 1.5 + r() * 0.4]);
    }
  }
  scatter(group, lying, eggMat, onGrass, { colors: EGGS });
  const basketSpots = benches.filter((_, i) => i % 3 === 1).slice(0, 9);
  if (basketSpots.length) {
    scatter(group, once('eBasket', P.basketGeometry), P.propMaterial({ roughness: 0.85 }), basketSpots.map((b) => [b.x, b.y - 0.02, b.z, r() * 6, 1.3]));
    const inBasket = [];
    basketSpots.forEach((b, i) => [[-0.12, 0.05], [0.1, -0.06], [0.0, 0.12]].forEach(([dx, dz], k) => inBasket.push([b.x + dx * 1.3, b.y + 0.3, b.z + dz * 1.3, r() * 6, 1.1 + 0 * i + 0 * k])));
    scatter(group, once('eEgg', P.eggGeometry), eggMat, inBasket, { colors: EGGS });
  }

  adorn(ctx).defineHat('bunny', bunnyEars);

  // --- Live: the hunt and the rabbits ------------------------------------------------------------------
  const live = new THREE.Group();
  live.name = 'easter_live';
  const huntMat = gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }));
  const huntEggs = new THREE.InstancedMesh(once('eEgg', P.eggGeometry), huntMat, HUNT);
  const haloMat = gradeLife(new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-rig.pitch), haloMat, HUNT);
  for (const m of [huntEggs, halos]) { m.layers.set(LIFE_LAYER); m.frustumCulled = false; m.userData.noAO = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); live.add(m); }
  halos.renderOrder = 5; huntEggs.renderOrder = 4;
  const eggs = []; // { x, y, z, color, found: seconds since found | -1 }
  const SIZE = 1.9;
  let found = 0;
  let doneAt = -1;

  function courtBox() {
    const id = kidsForced.court ?? kidsCourtOn(`${miamiNow().y}-${String(miamiNow().m).padStart(2, '0')}-${String(miamiNow().d).padStart(2, '0')}`) ?? 'clay-5';
    const o = root.getObjectByName(id) ?? root.getObjectByName('clay-5');
    return o ? new THREE.Box3().setFromObject(o) : new THREE.Box3(new THREE.Vector3(-5.5, 0, -31.4), new THREE.Vector3(5.5, 0, -7.6));
  }
  function hide() {
    eggs.length = 0; found = 0; doneAt = -1;
    const box = courtBox();
    const courts = courtBoxes().map((b) => b.clone().expandByScalar(0.6));
    const inner = box.clone().expandByScalar(0.8);
    for (let n = 0; n < 900 && eggs.length < HUNT; n++) {
      const x = box.min.x - 7 + Math.random() * (box.max.x - box.min.x + 14);
      const z = box.min.z - 7 + Math.random() * (box.max.z - box.min.z + 14);
      if (inner.containsPoint(new THREE.Vector3(x, 0, z).setY(inner.min.y)) || courts.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z)) continue;
      if (!plan.free(x, z, 0.3) || eggs.some((e) => Math.hypot(e.x - x, e.z - z) < 3)) continue;
      eggs.push({ x, y: plan.floorY(x, z), z, color: new THREE.Color(EGGS[eggs.length % EGGS.length]), found: -1, ph: Math.random() * 6 });
    }
  }
  hide();

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  function drawEggs(t) {
    eggs.forEach((e, i) => {
      const age = e.found < 0 ? -1 : t - e.found;
      const gone = age > 0.7;
      const hop = age < 0 ? 0 : Math.sin(Math.min(1, age / 0.7) * Math.PI) * 0.9;
      const k = age < 0 ? 1 : Math.max(0, 1 - age / 0.7);
      huntEggs.setMatrixAt(i, m4.compose(p3.set(e.x, e.y + hop, e.z), q.setFromAxisAngle(up, e.ph), s3.setScalar(gone ? 0.0001 : SIZE * k)));
      huntEggs.setColorAt(i, e.color);
      const pulse = still ? 0.8 : 0.65 + 0.35 * Math.sin(t * 2.2 + e.ph);
      halos.setMatrixAt(i, m4.makeScale(gone || age >= 0 ? 0.0001 : 1.1 * pulse, gone || age >= 0 ? 0.0001 : 1.1 * pulse, 1).setPosition(e.x, e.y + 0.25, e.z + 0.05));
      halos.setColorAt(i, e.color);
    });
    huntEggs.count = halos.count = eggs.length;
    for (const m of [huntEggs, halos]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  const herd = createHerd(ctx, plan, {
    frames: bunnyFrames(), w: 1.2, h: 1.2, count: 7, speed: 1.4, hop: 0.42, reach: 7, label: 'bunny',
    tints: [0xffffff, 0xe9c9a6, 0xcfc9c2, 0xffffff, 0xd9b38a, 0xf4ece0, 0xffffff],
    regions: [[16, -46.5, 56, -37], [16, -46.5, 56, -37], [-47, 2.8, -34, 6], [-47, -6, -34, -2.8]], gain: 1.7,
  }, { still });

  const hitEgg = (x, y) => {
    let best = null; let bestD = Infinity;
    eggs.forEach((e) => {
      if (e.found >= 0) return;
      const v = new THREE.Vector3(e.x, e.y + 0.2, e.z).project(camera);
      const sx = ((v.x + 1) / 2) * innerWidth; const sy = ((1 - v.y) / 2) * innerHeight;
      const ex = new THREE.Vector3(e.x + 0.45, e.y, e.z).project(camera);
      const rad = Math.max(26, Math.abs(((ex.x + 1) / 2) * innerWidth - sx) * 1.5);
      const d = Math.hypot(sx - x, sy - y);
      if (d < rad && d < bestD) { best = e; bestD = d; }
    });
    return best;
  };

  const api = {
    update(t, dt, night) {
      if (!live.parent) scene.add(live);
      haloMat.opacity = 0.5 + 0.5 * night;
      haloMat.color.setScalar(0.8 + 0.6 * night);
      const now = performance.now() / 1000;
      if (doneAt > 0 && now - doneAt > 7) { hide(); }
      drawEggs(now);
      herd.update(t, dt);
      return !still;
    },
    pick: (x, y) => (hitEgg(x, y) ? 'egg' : herd.pick(x, y)),
    label: (kind) => (kind === 'egg' ? `Egg hunt, ${found} of ${eggs.length} found` : kind === 'bunny' ? 'Easter bunny' : null),
    click(x, y) {
      const e = hitEgg(x, y);
      if (e) {
        e.found = performance.now() / 1000; found++;
        burst(e.x, e.y + 0.3, e.z, 60);
        if (found === eggs.length) { doneAt = e.found; for (const k of [0, 1, 2]) setTimeout(() => burst(e.x + (k - 1) * 2, e.y + 0.3, e.z, 90), k * 220); }
        return true;
      }
      return herd.click(x, y);
    },
    off() { scene.remove(live); herd.off(); },
    debug: () => ({ eggs: eggs.map((e) => [+e.x.toFixed(1), +e.z.toFixed(1), e.found]), found, bunnies: herd.debug(), beds: beds.length }),
    hunt: () => eggs,
  };
  live.add(herd.group);
  if (import.meta.env.DEV) { window.__bp ??= {}; window.__bp.seasons ??= {}; window.__bp.seasons.easter = api; }

  return { group, glow, live: api, hats: 'bunny', particles: BLOSSOM, accent: { tint: [1.03, 1.02, 1.06] } };
}
