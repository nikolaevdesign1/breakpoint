import * as THREE from 'three';
import { LIFE_LAYER } from '../../life/shared.js';
import { gradeLife } from '../../lookdev.js';
import { part, merge } from '../../life/geom.js';
import { table, feast, checkCloth } from './labor-day.js';

// Super Bowl (round 11, row 11), the second Sunday of February, three days before and one after:
// Game Day at the club. Two invented teams, no logos, no names of real clubs or players: Red and
// Gold against Blue and Silver. Pennants and scarves in their colours on the fences, footballs
// resting on the courts and a few in the air over the lawn (three arcs on the life layer), field
// goal posts on the lawn, plain jerseys without numbers on the guests (life/adorn.js), a big
// "Game Day" board with a ticking clock, and tables of food by the terrace.

const RED = '#b3262c';
const GOLD = '#e0b13a';
const BLUE = '#2a4f9c';
const SILVER = '#c7ccd4';
const K = 1.45;
const BALL_K = 2.2;
const POSTS = [[-4, -41.5], [23, -40.5]];
const BOARD = [31, -43.5];
const TABLES = [[43.0, -41.2, RED], [48.0, -40.4, BLUE]];

/** A football: a long brown ellipsoid, two white bands, laces. Long axis along x. */
function football() {
  return merge([
    part(new THREE.SphereGeometry(0.16, 12, 9).scale(1.55, 0.9, 0.9), '#7b3f1e'),
    part(new THREE.TorusGeometry(0.135, 0.012, 5, 14).rotateY(Math.PI / 2).translate(-0.12, 0, 0).scale(1, 0.92, 0.92), '#f2efe6'),
    part(new THREE.TorusGeometry(0.135, 0.012, 5, 14).rotateY(Math.PI / 2).translate(0.12, 0, 0).scale(1, 0.92, 0.92), '#f2efe6'),
    part(new THREE.BoxGeometry(0.16, 0.012, 0.02).translate(0, 0.148, 0), '#f2efe6'),
    ...[-0.05, 0, 0.05].map((x) => part(new THREE.BoxGeometry(0.012, 0.012, 0.06).translate(x, 0.147, 0), '#f2efe6')),
  ]);
}

/** A field goal post: padded base, a pole with a curved neck, a crossbar and two uprights, painted yellow. */
function goalpost() {
  const Y = '#e4b92e';
  return merge([
    part(new THREE.CylinderGeometry(0.2, 0.22, 0.9, 10).translate(0, 0.45, 0), '#2a4f9c'),
    part(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8).translate(0, 2.4, 0), Y),
    part(new THREE.TorusGeometry(0.2, 0.05, 6, 10, Math.PI).rotateZ(Math.PI / 2).translate(0, 4.05, 0), Y),
    part(new THREE.BoxGeometry(2.4, 0.09, 0.09).translate(0, 4.3, 0), Y),
    part(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 6).translate(-1.2, 5.9, 0), Y),
    part(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 6).translate(1.2, 5.9, 0), Y),
    part(new THREE.BoxGeometry(0.5, 0.02, 0.02).translate(-1.2, 7.5, 0), RED),
    part(new THREE.BoxGeometry(0.5, 0.02, 0.02).translate(1.2, 7.5, 0), BLUE),
  ]);
}

/** A knitted scarf hanging from a post: five bands of two team colours, fringe at the hem. */
function scarf(a, b) {
  const L = [];
  for (let k = 0; k < 6; k++) L.push(part(new THREE.BoxGeometry(0.16, 0.16, 0.025).translate(0, -0.08 - k * 0.16, 0), k % 2 ? b : a));
  L.push(part(new THREE.BoxGeometry(0.2, 0.05, 0.03).translate(0, 0.02, 0), a));
  return merge(L);
}

function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  return {
    map: t,
    set(clock, home, away) {
      const key = `${clock}${home}${away}`;
      if (key === last) return;
      last = key;
      const g = c.getContext('2d');
      g.fillStyle = '#10110f'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = GOLD; g.fillRect(0, 0, 512, 78);
      g.fillStyle = '#10110f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 58px Anton, Switzer, sans-serif';
      g.fillText('GAME DAY', 256, 42);
      g.fillStyle = RED; g.fillRect(0, 78, 232, 178);
      g.fillStyle = BLUE; g.fillRect(280, 78, 232, 178);
      g.fillStyle = '#f2efe6';
      g.font = '700 34px Anton, Switzer, sans-serif';
      g.fillText('RED', 116, 112); g.fillText('BLUE', 396, 112);
      g.font = '700 88px Anton, Switzer, sans-serif';
      g.fillText(String(home), 116, 188); g.fillText(String(away), 396, 188);
      g.fillStyle = '#f2c24a';
      g.font = '700 30px Anton, Switzer, sans-serif';
      g.fillText(clock, 256, 150);
      t.needsUpdate = true;
    },
  };
}

export default function build(kit) {
  const { ctx, plan, flags, lights, strands, walkwayFences, TINTS, scatter, once, r, still } = kit;
  const { scene, rig } = ctx;
  const group = new THREE.Group();
  const glow = [];
  const solid = (extra) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...extra });
  const spot = (x, z, rad, reach = 1.4) => {
    const at = plan.settle(x, z, rad, reach);
    if (!at) return null;
    plan.take(at.x, at.z, rad * 1.05);
    return { x: at.x, z: at.z, y: plan.floorY(at.x, at.z) };
  };

  // Pennants and lights in the team colours: the fences alternate, the eave runs both.
  const fence = strands({ eave: false, y: 3.2, out: 0.2 });
  flags(group, fence.filter((_, i) => i % 2 === 0), [RED, GOLD], { step: 0.55, size: { w: 0.5, l: 0.9 } });
  flags(group, fence.filter((_, i) => i % 2 === 1), [BLUE, SILVER], { step: 0.55, size: { w: 0.5, l: 0.9 } });
  flags(group, strands({ fences: false, y: 3.0 }), [RED, GOLD, BLUE, SILVER], { step: 0.7, size: { w: 0.5, l: 0.9 } });
  const lit = strands({ eave: false, y: 3.75 });
  lights(group, lit.filter((_, i) => i % 2 === 0), TINTS.GOLD, glow);
  lights(group, lit.filter((_, i) => i % 2 === 1), TINTS.BLUE, glow);
  lights(group, strands({ fences: false, y: 3.8 }), TINTS.WARM, glow);

  // Scarves on the end posts of every fence.
  const reds = []; const blues = [];
  walkwayFences().forEach((f, i) => {
    [f.x0 + 0.14, f.x1 - 0.14].forEach((x, j) => ((i + j) % 2 ? blues : reds).push([x, 2.6, f.z + f.side * 0.22, (r() - 0.5) * 0.3, 1.5]));
  });
  scatter(group, once('sb-scarf-r', () => scarf(RED, GOLD)), solid({ side: THREE.DoubleSide }), reds, { shadow: false });
  scatter(group, once('sb-scarf-b', () => scarf(BLUE, SILVER)), solid({ side: THREE.DoubleSide }), blues, { shadow: false });

  // Footballs at rest: on the courts and by the gates.
  const balls = [];
  for (const cx of [-19, 0, 19, 38, 57]) for (const cz of [-1, 1]) {
    const x = cx + (r() - 0.5) * 5;
    const z = cz * (11 + r() * 8);
    balls.push([x, plan.floorY(x, z) + 0.17 * BALL_K * 0.9, z, r() * Math.PI * 2, BALL_K]);
  }
  for (const [gx, side] of kit.GATES) { const s = spot(gx + 1.6, side * 1.6, 0.3, 0.8); if (s) balls.push([s.x, s.y + 0.16 * BALL_K * 0.9, s.z, r() * 3, BALL_K]); }
  scatter(group, once('sb-ball', football), solid(), balls);

  // Field goal posts on the lawn.
  const posts = POSTS.map(([x, z]) => spot(x, z, 0.6, 2.4)).filter(Boolean);
  scatter(group, once('sb-post', goalpost), solid(), posts.map((s) => [s.x, s.y, s.z, 0, K]));

  // The board: a frame and two posts (baked), the screen on the life layer.
  const board = spot(BOARD[0], BOARD[1], 2.2, 3);
  const live = new THREE.Group();
  live.name = 'superbowl_live';
  const bt = boardTexture();
  let screen = null;
  if (board) {
    const frame = merge([
      part(new THREE.BoxGeometry(4.5, 2.4, 0.2).translate(0, 4.2, 0), '#17181a'),
      part(new THREE.CylinderGeometry(0.1, 0.12, 3.1, 8).translate(-1.7, 1.55, 0), '#2a2b2e'),
      part(new THREE.CylinderGeometry(0.1, 0.12, 3.1, 8).translate(1.7, 1.55, 0), '#2a2b2e'),
    ]);
    scatter(group, frame, solid(), [[board.x, board.y, board.z, 0, 1]]);
    screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1).rotateX(-rig.pitch * 0.35), gradeLife(new THREE.MeshBasicMaterial({ map: bt.map, toneMapped: false })));
    screen.position.set(board.x, board.y + 4.2, board.z + 0.14);
    screen.layers.set(LIFE_LAYER);
    screen.frustumCulled = false;
    screen.userData.noAO = true;
    live.add(screen);
  }

  // Food tables.
  const tables = TABLES.map(([x, z, c]) => ({ at: spot(x, z, 1.0, 1.6), c })).filter((t) => t.at);
  scatter(group, once('sb-table', table), solid(), tables.map(({ at }) => [at.x, at.y, at.z, 0, K]));
  scatter(group, once('sb-feast', feast), solid(), tables.map(({ at }) => [at.x, at.y, at.z, 0, K]));
  for (const { at, c } of tables) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 0.9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkCloth(c), roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(at.x, at.y + 0.77 * K, at.z);
    m.scale.setScalar(K);
    m.receiveShadow = true;
    m.userData.noAO = true;
    group.add(m);
  }

  // Footballs in the air: three arcs over the lawn, a throw every few seconds.
  const flyGeo = once('sb-ball', football);
  const flying = new THREE.InstancedMesh(flyGeo, gradeLife(new THREE.MeshBasicMaterial({ vertexColors: true })), 3);
  flying.layers.set(LIFE_LAYER);
  flying.frustumCulled = false;
  flying.userData.noAO = true;
  flying.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  live.add(flying);
  const throws = [[-14, -43.5, 4, -42, 5.5, 0], [8, -42.5, 20, -44, 5, 2.2], [26, -43, 38, -42, 6, 4.1]];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3().setScalar(BALL_K);
  const api = {
    update(t, dt, night) {
      if (!live.parent) scene.add(live);
      throws.forEach(([x0, z0, x1, z1, h, off], i) => {
        const period = 6;
        const k = ((t + off) % period) / 3.2; // a 3.2 s flight, then the catch and a pause
        if (k > 1 || still) { flying.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        p.set(x0 + (x1 - x0) * k, 0.8 + h * 4 * k * (1 - k), z0 + (z1 - z0) * k);
        e.set(t * 18, Math.atan2(-(z1 - z0), x1 - x0), (0.5 - k) * 1.2, 'YXZ');
        flying.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), sc));
      });
      flying.instanceMatrix.needsUpdate = true;
      flying.material.color.setScalar(0.9 - 0.4 * night);
      if (screen) {
        const s = Math.floor(performance.now() / 1000);
        const left = 900 - ((s + 137) % 900);
        bt.set(`Q3  ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, 21, 17);
        screen.material.color.setScalar(0.85 + 0.15 * night);
      }
      return !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { scene.remove(live); },
  };

  return { group, glow, live: api, jerseys: { colors: [RED, BLUE] }, accent: { tint: [1.0, 1.0, 1.0] } };
}
