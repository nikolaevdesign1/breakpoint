import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, hideFrame, flush } from './sprite.js';
import { poseMan } from './man-pose.js';
import { pathGrid, route } from './cat.js';
import { box, merge, part } from './geom.js';

// Snow crew (round 10, row 4): while the Holidays decor is up, a few groundskeepers in work clothes
// walk the club's footpaths pushing a snow shovel, stop now and then and dig (the blade lifts and
// drops), then set off again. The same flipbook man as the clay keeper and the squeegee (shared
// textures, one card each), the shovel is real geometry. They are alive only while `set(true)`.

const COUNT = 3;
const SPEED = 1.15; // m/s
const TURN = 3.2; // rad/s
const REACH = 0.95; // m from his feet to the blade
const DIG = [4, 8]; // s of digging at a stop
const STOPS = [9, 20]; // s of walking between stops (their route length)
const FADE = 1.2; // s
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The shovel in its own frame: forward is -z, the hands at the origin side, the blade on the ground ahead. */
function shovelGeometry() {
  const from = new THREE.Vector3(0, 0.96, -0.3);
  const to = new THREE.Vector3(0, 0.1, -REACH);
  const d = to.clone().sub(from);
  const handle = new THREE.CylinderGeometry(0.02, 0.02, d.length(), 6);
  handle.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  handle.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return merge([
    part(handle, '#a4a7aa'),
    box(0.9, 0.05, 0.46, 0, 0.05, -REACH - 0.14, '#c4501f'), // a wide pusher blade
    box(0.9, 0.2, 0.04, 0, 0.14, -REACH - 0.36, '#c4501f'), // its lip
    box(0.1, 0.03, 0.1, 0, 0.98, -0.3, '#1d1b19'), // grip
  ]);
}

export function createSnowCrew(ctx, { still }) {
  const { scene, root, keeper } = ctx;
  if (still || !keeper) return null;
  const grid = pathGrid(root);
  if (!grid) return null;

  const crew = [];
  let body = null;
  let shadow = null;
  let data = null;
  const tools = [];
  let on = false;
  let level = 0;
  let last = performance.now() / 1000;

  function dress() {
    const a = keeper.assets;
    if (!a || body) return !!body;
    data = a.data;
    body = spriteMesh(a.bodyTex, COUNT, { slide: 0.32, lift: 1.35 });
    shadow = spriteMesh(a.shadowTex, COUNT, { ground: true, shadow: true, strength: 0.6 });
    body.name = 'life_snow_crew';
    shadow.name = 'life_snow_crew_shadow';
    for (const o of [body, shadow]) { o.layers.set(LIFE_LAYER); o.frustumCulled = false; o.userData.noAO = true; }
    const geo = shovelGeometry();
    const mat = gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }));
    for (let i = 0; i < COUNT; i++) {
      const tool = new THREE.Mesh(geo, mat);
      tool.name = 'life_snow_shovel';
      tool.layers.set(LIFE_LAYER);
      tool.frustumCulled = false;
      tool.userData.noAO = true;
      tools.push(tool);
      scene.add(tool);
      hideFrame(body, i); hideFrame(shadow, i);
      crew.push({ pos: new THREE.Vector3(), heading: 0, path: [], dig: 0, clipT: Math.random() * 3, cell: -1 });
    }
    scene.add(shadow, body);
    flush(body); flush(shadow);
    return true;
  }

  function plan(w) {
    // A walk of 9 to 20 m along the paths from where he stands.
    for (let tries = 0; tries < 30; tries++) {
      const to = pick(grid.cells);
      const p = grid.centre(to);
      const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z);
      if (d < STOPS[0] || d > STOPS[1]) continue;
      const r = route(grid, grid.cellAt(w.pos.x, w.pos.z), to);
      if (r && r.length > 3) { w.path = r; return; }
    }
    w.dig = rand(1, 3); // nowhere to go from here: dig a while longer
  }

  function place(w) {
    const c = pick(grid.cells);
    w.pos.copy(grid.centre(c));
    w.heading = rand(0, Math.PI * 2);
    w.path = [];
    w.dig = rand(0, 3);
  }

  function step(w, dt) {
    if (w.dig > 0) {
      w.dig -= dt;
      if (w.dig <= 0) plan(w);
      return false; // standing: digging
    }
    let left = SPEED * dt;
    while (left > 0 && w.path.length) {
      const q = w.path[0];
      const d = Math.hypot(q.x - w.pos.x, q.z - w.pos.z);
      if (d > 0.04) {
        const turn = Math.atan2(q.x - w.pos.x, -(q.z - w.pos.z)) - w.heading;
        const dh = Math.atan2(Math.sin(turn), Math.cos(turn));
        w.heading += Math.max(-TURN * dt, Math.min(TURN * dt, dh));
      }
      if (d <= left) { w.pos.x = q.x; w.pos.z = q.z; left -= d; w.path.shift(); } else { w.pos.x += ((q.x - w.pos.x) / d) * left; w.pos.z += ((q.z - w.pos.z) / d) * left; left = 0; }
    }
    if (!w.path.length) w.dig = rand(...DIG);
    w.clipT += dt * (SPEED / (data.speed?.walk || SPEED));
    return true;
  }

  return {
    name: 'snowcrew',
    /** On while the holiday decor is up. */
    set(next) { on = next; },
    tick(t) {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      level += Math.sign((on ? 1 : 0) - level) * Math.min(Math.abs((on ? 1 : 0) - level), dt / FADE);
      if (on && !body && dress()) crew.forEach(place); // the keeper's atlas may still be loading
      if (!body) return false;
      const show = level > 0.01;
      body.visible = shadow.visible = show;
      if (!show) { tools.forEach((m) => { m.visible = false; }); return false; }
      crew.forEach((w, i) => {
        const walking = step(w, dt);
        poseMan(data, body, shadow, i, 'walk', w.heading, walking ? w.clipT : 0, w.pos.x, w.pos.y, w.pos.z);
        const tool = tools[i];
        tool.visible = true;
        tool.position.copy(w.pos);
        tool.rotation.set(walking ? 0 : Math.max(0, Math.sin(t * 2.4 + i * 2)) * 0.5, -w.heading, 0, 'YXZ'); // digging: the blade lifts and drops
      });
      body.material.opacity = level;
      shadow.material.opacity = 0.6 * level;
      flush(body); flush(shadow);
      return true;
    },
    debug: () => ({ on, level: +level.toFixed(2), crew: crew.map((w) => [+w.pos.x.toFixed(1), +w.pos.z.toFixed(1), w.dig > 0 ? 'dig' : 'walk']) }),
  };
}
