import * as THREE from 'three';
import { adorn } from '../../life/adorn.js';
import { GATES } from '../kit.js';
import { createHerd, drawTexture } from '../critters.js';
import * as P from '../props.js';

// Thanksgiving (row 6, round 11), a week before to a day after: warm gold lights and corn-colour
// garlands, pale pumpkins (cream, buff, soft orange: nothing carved, nothing lit) at the gates,
// the clubhouse door and along the fences, cornstalk shocks tied with raffia, a laid table with a
// roast turkey by the cafe, leaves lying on the walkway and the courts, leaves falling through
// the air, the tree crowns turned red, orange and yellow, turkeys wandering the lawns (a click
// sends one off), a warm low-sun balance on the light, warm clubhouse windows by day, and a
// pilgrim hat on everyone. Preview: ?season=thanksgiving

const CORN = ['#c8602a', '#e8b23a', '#7a3b1d', '#f1dfa0', '#9a2f1f'];
const GOURD = ['#c4521c', '#e8a23a', '#8f3a1a', '#d9b24a'];
const PUMPKIN = ['#f3e2c0', '#efc98a', '#e8a85a', '#f6f0e2', '#dcae52', '#e9b97a'];
const LEAVES = ['#c4501f', '#d9941c', '#9c441f', '#a8571c', '#e0b030', '#8a3416'];
const TABLE_AT = [36, -47.6];

/** The tint the tree impostors get (a shared uniform: 0 leaves them as they are). */
const AUTUMN = { value: 0 };

/** Turns the green of the tree sprites to red, orange and yellow while AUTUMN is 1. */
function patchTrees(root) {
  root.traverse((o) => {
    if (!o.isInstancedMesh || !/^impostor_tree/.test(o.name) || Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.map || m.userData.autumn) return;
    m.userData.autumn = true;
    const prev = m.onBeforeCompile;
    const key = m.customProgramCacheKey?.() ?? '';
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      shader.uniforms.uAutumn = AUTUMN;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAutumn;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float gr = clamp((c.g - max(c.r, c.b)) * 14.0, 0.0, 1.0) * uAutumn;
            float n = fract(sin(dot(floor(vMapUv * 34.0), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 fall = mix(vec3(1.0, 0.34, 0.09), vec3(1.0, 0.7, 0.14), smoothstep(0.2, 0.7, n));
            fall = mix(fall, vec3(0.74, 0.16, 0.07), step(0.88, n));
            float l = dot(c, vec3(0.3, 0.55, 0.15));
            diffuseColor.rgb = mix(c, fall * (l * 1.7 / dot(fall, vec3(0.3, 0.55, 0.15))), gr);
          }`);
    };
    m.customProgramCacheKey = () => `${key}|autumn`;
    m.needsUpdate = true;
  });
}

/** A turkey in profile, facing right: pose 0 and 1 swap the legs, pose 2 pecks. */
const turkeyFrames = () => {
  const draw = (pose) => (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // tail fan
    const fan = ['#8a3d1a', '#c4701f', '#d9a23a', '#6b3418', '#c4701f', '#8a3d1a', '#d9a23a'];
    fan.forEach((c, i) => {
      const a = Math.PI * (1.08 + i * 0.14);
      g.save(); g.translate(52, 84); g.rotate(a);
      g.fillStyle = c; g.beginPath(); g.ellipse(34, 0, 36, 8, 0, 0, 7); g.fill();
      g.fillStyle = '#f1dfa0'; g.beginPath(); g.ellipse(64, 0, 5, 6, 0, 0, 7); g.fill();
      g.restore();
    });
    // body
    g.fillStyle = '#6b4423'; g.beginPath(); g.ellipse(82, 86, 32, 23, -0.1, 0, 7); g.fill();
    g.fillStyle = '#8a5a30'; g.beginPath(); g.ellipse(76, 84, 20, 13, -0.2, 0, 7); g.fill();
    g.fillStyle = '#a8713a'; g.beginPath(); g.ellipse(100, 90, 12, 14, 0, 0, 7); g.fill();
    // neck and head
    const hx = pose === 2 ? 128 : 122; const hy = pose === 2 ? 104 : 48;
    g.strokeStyle = '#7f9fb8'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(104, 72); g.quadraticCurveTo(116, pose === 2 ? 88 : 60, hx, hy); g.stroke();
    g.fillStyle = '#7f9fb8'; g.beginPath(); g.arc(hx, hy, 7, 0, 7); g.fill();
    g.fillStyle = '#c4261d'; g.beginPath(); g.ellipse(hx - 1, hy + 9, 3.4, 6, 0, 0, 7); g.fill();
    g.fillStyle = '#e8b83a'; g.beginPath(); g.moveTo(hx + 6, hy - 1); g.lineTo(hx + 15, hy + 2); g.lineTo(hx + 6, hy + 4); g.fill();
    g.fillStyle = '#1c1b19'; g.beginPath(); g.arc(hx + 2, hy - 2, 1.6, 0, 7); g.fill();
    // legs
    g.strokeStyle = '#d9a23a'; g.lineWidth = 3.4;
    const [a, b] = pose === 1 ? [64, 86] : [78, 70];
    for (const x of [a, b]) { g.beginPath(); g.moveTo(80, 104); g.lineTo(x + 6, 124); g.lineTo(x + 14, 124); g.stroke(); }
  };
  return [0, 1, 2].map((p) => drawTexture(160, 128, draw(p)));
};

/** A tall black hat with a white band and a gold buckle (64 px card). */
function pilgrimHat(g) {
  g.fillStyle = '#1f1d1b';
  g.beginPath(); g.moveTo(22, 44); g.lineTo(26, 12); g.lineTo(40, 12); g.lineTo(44, 44); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(33, 45, 21, 5, 0, 0, 7); g.fill();
  g.fillStyle = '#f1ece0'; g.fillRect(23.4, 34, 20.4, 6);
  g.fillStyle = '#e3a92a'; g.fillRect(29, 33, 9, 8);
  g.fillStyle = '#1f1d1b'; g.fillRect(31, 35, 5, 4);
}

export default function build(kit) {
  const { ctx, plan, r, once, flags, lights, strands, scatter, walkwayFences, TINTS, still } = kit;
  const { root } = ctx;
  const group = new THREE.Group();
  const glow = [];
  const gy = (x, z) => plan.floorY(x, z);

  // Lights and garlands.
  const fence = strands({ eave: false });
  lights(group, fence.filter((_, i) => i % 2 === 0), TINTS.GOLD, glow);
  lights(group, fence.filter((_, i) => i % 2 === 1), TINTS.WARM, glow);
  lights(group, strands({ fences: false }), TINTS.WARM, glow);
  flags(group, strands({ y: 2.9, out: 0.2, eave: false }), CORN, { shape: 'diamond', size: { w: 0.34, l: 0.54 }, step: 0.7 });
  flags(group, strands({ fences: false, y: 2.7 }), GOURD, { shape: 'round', size: { w: 0.4, l: 0.5 }, step: 0.8 });

  // Pale pumpkins and corn shocks at the gates, the door and along the fences.
  const pumps = [];
  const shocks = [];
  const pump = (x, z, size, yaw) => {
    const s = size * 1.5;
    const at = P.claim(plan, x, z, s * 0.5, 0.7);
    if (at) pumps.push([at.x, at.y, at.z, yaw, s]);
  };
  const shock = (x, z, yaw = 0) => { const at = P.claim(plan, x, z, 0.4, 0.7); if (at) shocks.push([at.x, at.y, at.z, yaw, 1.7]); };
  GATES.forEach(([gx, side], i) => {
    shock(gx - 2.3, side * 1.62, 0.3); shock(gx + 2.3, side * 1.62, -0.4);
    pump(gx - 1.4, side * 1.62, 0.62 + (i % 2) * 0.08, 0.4); pump(gx + 1.35, side * 1.62, 0.54, -0.5);
    pump(gx - 3.3, side * 1.7, 0.44, 1.2); pump(gx + 3.2, side * 1.7, 0.4, 2.2);
  });
  for (const f of walkwayFences()) {
    for (let x = f.x0 + 3; x < f.x1 - 2; x += 5.2) {
      if (GATES.some(([gx]) => Math.abs(gx - x) < 4.2)) continue;
      const k = Math.round(x * 7) & 3;
      pump(x, f.z + f.side * 0.55, 0.42 + k * 0.06, k);
    }
  }
  for (const [x, z, s] of [[-12.3, -50.6, 0.66], [-6.8, -50.6, 0.5], [8.0, -50.7, 0.6], [13.5, -50.5, 0.66], [17.0, -50.7, 0.5], [44.9, -50.6, 0.64], [49.6, -50.6, 0.66]]) pump(x, z, s, x);
  for (const [x, z] of [[-9.6, -50.4], [10.4, -50.4], [20, -50.4], [47.2, -50.4], [-41.5, 3.4], [-41.5, -3.4], [-34.5, 3.3], [-34.5, -3.3]]) shock(x, z, x * 0.1);
  scatter(group, once('tPumpkin', P.pumpkinPale), P.propMaterial({ roughness: 0.6 }), pumps, { colors: PUMPKIN });
  scatter(group, once('tShock', P.cornShock), P.propMaterial({ roughness: 0.85, side: THREE.DoubleSide }), shocks);

  // A laid table by the cafe: cloth, roast turkey, pies, a pumpkin.
  const table = P.claim(plan, TABLE_AT[0], TABLE_AT[1], 1.4, 6);
  if (table) {
    const t = new THREE.Group();
    t.position.set(table.x, table.y, table.z);
    const mat = P.propMaterial({ roughness: 0.7 });
    const add = (geo, x, y, z, s = 1, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; t.add(m); };
    add(once('tTable', P.tableGeometry), 0, 0, 0, 1.25);
    add(once('tRoast', P.roastTurkey), 0, 0.82 * 1.25, 0, 1.15);
    add(once('tPieA', () => P.dishGeometry('#b8651f')), 0.78, 0.82 * 1.25, 0.12, 1.5);
    add(once('tPieB', () => P.dishGeometry('#c9a24a')), -0.78, 0.82 * 1.25, -0.1, 1.5);
    add(once('tBowl', () => P.dishGeometry('#8f3a1a')), 0.52, 0.82 * 1.25, -0.28, 1.2);
    add(once('tPumpkin1', P.pumpkinPale), -0.55, 0.82 * 1.25, 0.2, 0.26, 0.4);
    group.add(t);
  }

  // Leaves on the walkway and the aprons.
  const leaves = [];
  const leaf = (x, z) => { if (plan.free(x, z, 0.1)) leaves.push([x, gy(x, z) + 0.03, z, r() * 6, 0.3 + r() * 0.22]); };
  GATES.forEach(([gx, side]) => { for (let i = 0; i < 16; i++) leaf(gx + (r() - 0.5) * 11, side * (1.2 + r() * 2.2)); });
  for (let i = 0; i < 70; i++) leaf(-46 + r() * 104, (r() < 0.5 ? -1 : 1) * (0.2 + r() * 2.4));
  for (let i = 0; i < 50; i++) leaf(14 + r() * 44, -49 + r() * 3);
  scatter(group, once('tLeaf', P.leafFlat), P.decalMaterial({ side: THREE.DoubleSide }), leaves, { colors: LEAVES, shadow: false }).receiveShadow = true;

  // The crowns turn: shared sprites, so it follows the season on and off.
  patchTrees(ctx.scene);
  glow.push(() => { AUTUMN.value = 1; });

  adorn(ctx).defineHat('pilgrim', pilgrimHat);

  const herd = createHerd(ctx, plan, {
    frames: turkeyFrames(), w: 1.5, h: 1.2, count: 5, speed: 0.55, reach: 8, label: 'turkey', peck: 2,
    regions: [[16, -46.5, 56, -37], [16, -46.5, 56, -37], [-47, 2.8, -34, 6], [-47, -6, -34, -2.8], [62, -46, 80, -37]],
  }, { still });
  const api = {
    update: (t, dt) => { AUTUMN.value = 1; return herd.update(t, dt); },
    pick: (x, y) => herd.pick(x, y),
    label: (k) => (k === 'turkey' ? 'Turkey' : null),
    click: (x, y) => herd.click(x, y),
    off() { AUTUMN.value = 0; herd.off(); },
    debug: () => ({ turkeys: herd.debug(), pumpkins: pumps.length, shocks: shocks.length, leaves: leaves.length, autumn: AUTUMN.value }),
  };
  if (import.meta.env.DEV) { window.__bp ??= {}; window.__bp.seasons ??= {}; window.__bp.seasons.thanksgiving = api; }

  return { group, glow, live: api, hats: 'pilgrim', particles: 'leaves', windows: 0.85, accent: { tint: [1.1, 0.97, 0.82] } };
}
