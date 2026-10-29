import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, writeFrame, hideFrame, flush, framePair, mirrored, loadAtlas } from './sprite.js';
import { pathGrid, route } from './cat.js';
import { COURTS, isSlotTaken } from '../../shared/availability.js';
import { clubHours, clubSlot, liveSunDir } from './clock.js';
import { decorLight } from './sky.js';
import { box, merge, softRect } from './geom.js';

// The clay groundskeeper (round 7, "clublife"). At the top of every hour, and now and then between
// (a visitor sees him within a minute or two), a groundskeeper walks along the paths to a clay court
// that is free at the hour the map shows, takes the rope of the drag brush lying inside the gate and
// drags the court the classic way: lanes parallel to the net, back and forth across the court with
// a turn at each end, working from the back of the court to the net. At the top of the hour he does
// both halves, passing round the net post on the side without the chair and benches; otherwise one
// half. Then he leaves the brush where it lies by the gate and walks off.
//
// The man is a flipbook (scripts/life/render_keeper.py: MakeHuman in work overalls, Mixamo walk,
// right arm back on the rope; eight headings, mirrored 5..7, baked shadow). The brush and its rope
// are real geometry: the brush trails on the rope like a trailer (it follows the hand only while the
// rope is taut). No drag lines are drawn on the clay (row 172). Every clay court keeps its brush by the gate.

const DATA_URL = '/models/life/keeper.json';
const atlas = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;

const BRUSH_W = 1.8; // m: a standard drag brush
const BRUSH_D = 0.26;
const BRIDLE = 0.8; // m from the brush bar to the ring where the two bridle ropes meet
const ROPE = 1.7; // m (in plan) from the hand to the ring when taut
const LANE = 1.7; // m between lanes: the brush overlaps the last one a little
const MARGIN_SIDE = 1.3; // m kept from the side fence at the outside of a turn
const PASS_U = 7.35; // m from the centre line: the way round the net post
const TURN = 3.2; // rad/s
const SPEED = { pull: 0.95, walk: 1.3 }; // m/s
const FIRST = [14, 30]; // s after the map shows
const EVERY = [60, 140]; // s between visits (plus one at every top of the hour)
const SLIDE = 0.32;
const SHADOW_STRENGTH = 0.6;
const CUT = 0.12;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Positions of the court furniture (instanced props): benches, chairs, baskets, poles. */
export function furniture(scene) {
  const out = [];
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isInstancedMesh || /^(life_|lamp_halos|impostor|flood_lens|Sphere)/.test(o.name)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
      out.push([v.x, v.z]);
    }
  });
  return out;
}

/**
 * A clay court in its own frame: u across (m from the centre line), w from the net towards the
 * gate (the gate faces the walkway at z = 0). Furniture inside the fence, in that frame.
 */
export function courtFrame(root, id, props) { // round 9: also the hard courts for life/squeegee.js
  const play = root.getObjectByName(id);
  const apron = root.getObjectByName(`${id}_apron`);
  if (!play || !apron) return null;
  const pb = new THREE.Box3().setFromObject(play);
  const ab = new THREE.Box3().setFromObject(apron);
  const cx = (pb.min.x + pb.max.x) / 2;
  const cz = (pb.min.z + pb.max.z) / 2;
  const s = Math.sign(cz) || 1;
  const H = s > 0 ? cz - ab.min.z : ab.max.z - cz;
  const W = (ab.max.x - ab.min.x) / 2;
  const y = Math.max(pb.max.y, ab.max.y);
  const world = (u, w) => new THREE.Vector3(cx + u, y, cz - s * w);
  const local = (x, z) => ({ u: x - cx, w: (cz - z) * s });
  const obs = props.map(([x, z]) => local(x, z)).filter((o) => Math.abs(o.u) < W + 0.3 && Math.abs(o.w) < H + 0.3);
  const inside = (x, z) => x > ab.min.x + 0.2 && x < ab.max.x - 0.2 && z > ab.min.z + 0.2 && z < ab.max.z - 0.2;
  return { id, cx, cz, s, H, W, y, world, local, obs, inside, restU: -2.6 };
}

/** How far a lane at `w` may run towards side `side` (±1) before the furniture or the fence. */
function laneEnd(cf, w, side) {
  let lim = cf.W - MARGIN_SIDE; // the outer edge of the turn
  for (const o of cf.obs) {
    if (Math.sign(o.u) === side && Math.abs(o.u) > 2 && Math.abs(o.w - w) < LANE * 1.1) lim = Math.min(lim, Math.abs(o.u) - 0.95);
  }
  return side * (lim - LANE / 2); // the turn bulges out by half a lane
}

/** Is the way round the net post on `side` clear of chairs, benches and tables? */
function passClear(cf, side) {
  return !cf.obs.some((o) => Math.sign(o.u) === side && Math.abs(o.u) > 5 && Math.abs(o.w) < 3.4);
}

/**
 * Lanes over one half (half: +1 the gate half, worked from the back of the court to the net; −1
 * the far half, from the net out), as local [u, w] points with a half-circle turn between lanes.
 * The first lane starts on `startSide`, or on whichever side makes the last one end on `endSide`.
 */
function lanes(cf, half, { endSide = 1, startSide = null } = {}) {
  const ws = [];
  for (let w = 1.5; w <= cf.H - 2.6; w += LANE) ws.push(w * half);
  if (half > 0) ws.reverse();
  const n = ws.length;
  const side0 = startSide ?? -endSide * (n % 2 ? 1 : -1); // lane i runs from side_i to −side_i
  const ends = ws.map((w, i) => {
    const s = side0 * (i % 2 ? -1 : 1);
    return [laneEnd(cf, w, s), laneEnd(cf, w, -s)];
  });
  // A turn joins two lanes at the shorter of their two ends.
  for (let i = 0; i < n - 1; i++) {
    const e = Math.abs(ends[i][1]) < Math.abs(ends[i + 1][0]) ? ends[i][1] : ends[i + 1][0];
    ends[i][1] = ends[i + 1][0] = e;
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const w = ws[i];
    pts.push([ends[i][0], w], [ends[i][1], w]);
    if (i < n - 1) {
      const e = ends[i][1];
      const out = Math.sign(e);
      const w2 = ws[i + 1];
      const mid = (w + w2) / 2;
      const r = Math.abs(w2 - w) / 2;
      for (let k = 1; k < 6; k++) {
        const th = (k / 6) * Math.PI;
        pts.push([e + out * r * Math.sin(th), mid + (w - mid) * Math.cos(th)]);
      }
    }
  }
  return pts;
}

// --- Geometry -------------------------------------------------------------------------------

/** Drag brush in its own frame: +z towards the rope, bar along x. Vertex colours. */
function brushGeometry() {
  const parts = [
    box(BRUSH_W, 0.07, 0.16, 0, 0.035, 0, '#3a3129'), // bristles
    box(BRUSH_W, 0.045, 0.09, 0, 0.09, 0, '#9fa3a6'), // aluminium back
  ];
  for (const x of [-BRUSH_W / 2 + 0.04, BRUSH_W / 2 - 0.04]) parts.push(box(0.04, 0.05, 0.08, x, 0.1, 0.07, '#7d8184')); // rope eyes
  return merge(parts);
}

// --- System ---------------------------------------------------------------------------------

export function createKeeper(ctx, { still }) {
  if (still) return null;
  const { scene, root, camera, quality } = ctx;
  const grid = pathGrid(root);
  if (!grid) return null;
  const sys = { name: 'keeper', tick: () => false };

  Promise.all([
    fetch(DATA_URL).then((r) => r.json()),
    loadAtlas(atlas('keeper', quality)),
    loadAtlas(atlas('keeper-shadow', quality)),
  ]).then(([data, bodyTex, shadowTex]) => {
    sys.assets = { data, bodyTex, shadowTex }; // round 9: life/squeegee.js dresses the same man
    Object.assign(sys, build(data, bodyTex, shadowTex));
  }).catch((err) => console.warn('Keeper failed', err));

  function build(data, bodyTex, shadowTex) {
    const sun = liveSunDir(ctx);
    const props = furniture(scene);
    const courts = COURTS.filter((c) => c.type === 'clay').map((c) => courtFrame(root, c.id, props)).filter(Boolean);
    if (!courts.length) return {};

    // --- Meshes ---
    const body = spriteMesh(bodyTex, 1, { slide: SLIDE, lift: 1.35 });
    const shadow = spriteMesh(shadowTex, 1, { ground: true, shadow: true, strength: SHADOW_STRENGTH });
    body.name = 'life_keeper';
    shadow.name = 'life_keeper_shadow';
    shadow.renderOrder = 1;

    const brushes = new THREE.InstancedMesh(brushGeometry(), gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 })), courts.length);
    brushes.name = 'life_drag_brushes';
    const brushShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softRect(), color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }), courts.length);
    brushShadows.name = 'life_drag_brush_shadows';
    brushShadows.renderOrder = 1;

    const ROPE_SEG = 10;
    const ropePos = new Float32Array(courts.length * (ROPE_SEG + 4) * 2 * 3);
    const ropeGeo = new THREE.BufferGeometry();
    ropeGeo.setAttribute('position', new THREE.BufferAttribute(ropePos, 3).setUsage(THREE.DynamicDrawUsage));
    const ropes = new THREE.LineSegments(ropeGeo, gradeLife(new THREE.LineBasicMaterial({ color: 0xc9bc97, transparent: true, opacity: 0.85 })));
    ropes.name = 'life_drag_ropes';


    for (const o of [body, shadow, brushes, brushShadows, ropes]) {
      o.layers.set(LIFE_LAYER);
      o.frustumCulled = false;
      o.userData.noAO = true;
    }
    for (const o of [brushes, brushShadows]) o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(brushShadows, brushes, ropes, shadow, body);
    hideFrame(body, 0);
    hideFrame(shadow, 0);

    // Each court's brush lies inside the gate, rope towards it.
    const rest = (cf) => ({ p: cf.world(cf.restU, cf.H - 0.9 - 0.31 - ROPE - BRIDLE - BRUSH_D / 2), yaw: Math.atan2(0, -cf.s) });
    const brushState = courts.map((cf) => ({ cf, ...rest(cf), ring: null }));
    brushState.forEach((b) => { b.ring = ringOf(b); });
    function ringOf(b) {
      return new THREE.Vector3(b.p.x + Math.sin(b.yaw) * (BRIDLE + BRUSH_D / 2), b.p.y, b.p.z + Math.cos(b.yaw) * (BRIDLE + BRUSH_D / 2));
    }

    // --- Keeper ---
    const H8 = data.headings;
    const fpsOf = (clip) => data.clips[clip].fps ?? data.fps;
    const k = {
      active: false,
      pos: new THREE.Vector3(),
      heading: 0,
      clip: 'walk',
      clipT: 0,
      path: [], // [{ p: Vector3, pull: bool, act?: 'grab' | 'drop' | 'done' }]
      brush: null, // brushState while holding the rope
      fade: 0,
      court: null,
      full: false,
    };
    let next = performance.now() / 1000 + rand(...FIRST);
    let lastHour = Math.floor(clubHours());

    const look = new THREE.Vector3();
    function viewCentre() {
      camera.getWorldDirection(look);
      const t = -camera.position.y / look.y;
      return new THREE.Vector3(camera.position.x + look.x * t, 0, camera.position.z + look.z * t);
    }
    function onScreen(p, pad = 40) {
      const v = p.clone().project(camera);
      const x = ((v.x + 1) / 2) * innerWidth;
      const y = ((1 - v.y) / 2) * innerHeight;
      return v.z < 1 && x > -pad && x < innerWidth + pad && y > -pad && y < innerHeight + pad;
    }

    /** A clay court free at the hour shown, preferably near the middle of the view. */
    function freeCourt(id) {
      if (id) return courts.find((c) => c.id === id) ?? null;
      const { dayKey, hour } = clubSlot();
      const free = courts.filter((c) => !isSlotTaken(c.id, dayKey, hour) && !ctx.players?.game?.(c.id)); // no rally on it either
      if (!free.length) return null;
      const centre = viewCentre();
      free.sort((a, b) => Math.hypot(a.cx - centre.x, a.cz - centre.z) - Math.hypot(b.cx - centre.x, b.cz - centre.z));
      return Math.random() < 0.75 ? free[0] : pick(free);
    }

    const cellNear = (p) => {
      let best = -1;
      let bestD = Infinity;
      for (const c of grid.cells) {
        const q = grid.centre(c);
        const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    };

    /** A path cell 12–22 m from the gate along the walks, off screen if there is one. */
    function farCell(gate, wantOff) {
      const from = cellNear(gate);
      const options = [];
      for (let tries = 0; tries < 60 && options.length < 12; tries++) {
        const c = pick(grid.cells);
        const p = grid.centre(c);
        const d = Math.hypot(p.x - gate.x, p.z - gate.z);
        if (d < 12 || d > 24) continue;
        const r = route(grid, c, from);
        if (r && r.length < 30) options.push({ c, p, r, off: !onScreen(p) });
      }
      const off = options.filter((o) => o.off);
      return (wantOff && off.length ? pick(off) : pick(options)) ?? null;
    }

    function start(cf, full) {
      const out = cf.world(0, cf.H + 1.1);
      const into = cf.world(0, cf.H - 0.7);
      const grab = cf.world(cf.restU, cf.H - 0.9);
      const brush = brushState[courts.indexOf(cf)];
      const came = farCell(out, true);
      if (!came) return false;
      const pass = full ? [-1, 1].find((side) => passClear(cf, side)) : null;
      full = full && !!pass;
      const toW = ([u, w]) => cf.world(u, w);
      const path = [];
      came.r.forEach((p) => path.push({ p: p.setY(cf.y), pull: false }));
      path.push({ p: out, pull: false }, { p: into, pull: false }, { p: grab, pull: false, act: 'grab' });
      const endSide = full ? pass : (Math.random() < 0.5 ? -1 : 1);
      const near = lanes(cf, 1, { endSide });
      near.forEach((q) => path.push({ p: toW(q), pull: true }));
      let at = near[near.length - 1];
      if (full) {
        path.push({ p: toW([pass * PASS_U, at[1]]), pull: true }, { p: toW([pass * PASS_U, -1.4]), pull: true });
        const farL = lanes(cf, -1, { startSide: pass });
        farL.forEach((q) => path.push({ p: toW(q), pull: true }));
        at = farL[farL.length - 1];
        path.push({ p: toW([pass * PASS_U, at[1]]), pull: true }, { p: toW([pass * PASS_U, 1.6]), pull: true });
        at = [pass * PASS_U, 1.6];
      }
      // Back to where the brush lives: across, then a straight pull towards the gate so it lines up.
      path.push({ p: toW([cf.restU, Math.max(at[1], 4)]), pull: true });
      path.push({ p: toW([cf.restU, cf.H - 0.9]), pull: true, act: 'drop' });
      path.push({ p: into, pull: false }, { p: out, pull: false });
      const gone = farCell(out, true);
      (gone ? gone.r.slice().reverse() : []).forEach((p) => path.push({ p: p.setY(cf.y), pull: false }));
      path[path.length - 1].act = 'done';

      k.active = true;
      k.court = cf;
      k.full = full;
      k.path = path;
      k.pos.copy(path[0].p);
      k.heading = Math.atan2(path[1].p.x - path[0].p.x, -(path[1].p.z - path[0].p.z));
      k.clip = 'walk';
      k.clipT = Math.random();
      k.brush = null;
      k.wantBrush = brush;
      k.fade = 0;
      return true;
    }

    // --- Brush on the rope ---
    const hand = new THREE.Vector3();
    function handAt() {
      const [r, f, up] = data.hand ?? [0.24, -0.31, 1.0];
      const fx = Math.sin(k.heading);
      const fz = -Math.cos(k.heading);
      // right of a heading (fx, fz) in three: (−fz, fx)
      hand.set(k.pos.x + fx * f - fz * r, k.pos.y + up, k.pos.z + fz * f + fx * r);
      return hand;
    }
    function towBrush(b) {
      handAt();
      const dx = hand.x - b.ring.x;
      const dz = hand.z - b.ring.z;
      const d = Math.hypot(dx, dz);
      if (d <= ROPE) return false; // slack: the brush stays put
      const ux = dx / d;
      const uz = dz / d;
      b.ring.x = hand.x - ux * ROPE;
      b.ring.z = hand.z - uz * ROPE;
      // The bar lags round behind the ring (a trailer), not snapped to the rope.
      const lead = BRIDLE + BRUSH_D / 2;
      const bx = b.ring.x - b.p.x;
      const bz = b.ring.z - b.p.z;
      const bl = Math.hypot(bx, bz) || 1;
      b.p.x = b.ring.x - (bx / bl) * lead;
      b.p.z = b.ring.z - (bz / bl) * lead;
      b.yaw = Math.atan2(bx, bz);
      return true;
    }

    // --- Per frame ---
    function step(t, dt) {
      if (!k.active) return;
      if (k.fade < 1 && k.path.length) k.fade = Math.min(1, k.fade + dt * 2);
      const goal = k.path[0];
      if (!goal) return;
      const pulling = !!k.brush;
      const speed = SPEED[pulling ? 'pull' : 'walk'];
      let left = speed * dt;
      while (left > 0 && k.path.length) {
        const g = k.path[0];
        const d = Math.hypot(g.p.x - k.pos.x, g.p.z - k.pos.z);
        const target = Math.atan2(g.p.x - k.pos.x, -(g.p.z - k.pos.z));
        if (d > 0.04) {
          let dh = target - k.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          const turn = TURN * dt;
          k.heading += Math.max(-turn, Math.min(turn, dh));
        }
        if (d <= left) {
          k.pos.x = g.p.x; k.pos.z = g.p.z;
          left -= d;
          k.path.shift();
          if (g.act === 'grab') { k.brush = k.wantBrush; break; }
          if (g.act === 'drop') k.brush = null;
          if (g.act === 'done') { k.active = false; k.fade = 0; break; }
        } else {
          k.pos.x += ((g.p.x - k.pos.x) / d) * left;
          k.pos.z += ((g.p.z - k.pos.z) / d) * left;
          left = 0;
        }
      }
      k.pos.y = k.court.y;
      // Fade out over the last couple of metres (a path end may be in view).
      if (k.path.length === 1) {
        const g = k.path[0];
        k.fade = Math.min(k.fade, Math.hypot(g.p.x - k.pos.x, g.p.z - k.pos.z) / 2.5);
      }
      const clip = pulling ? 'pull' : 'walk';
      if (clip !== k.clip) { k.clip = clip; }
      k.clipT += dt * (speed / (data.speed[clip] || speed));
      if (k.brush) towBrush(k.brush);
    }

    // --- Drawing ---
    let shown = null;
    let shownKey = '';
    let cutFrom = null;
    let cutAt = -1;
    const bodyOf = (e) => (e[2] ? mirrored(data.body[e[0]]) : data.body[e[0]]);
    function writeKeeper(t) {
      if (!k.active || k.fade <= 0.001) {
        hideFrame(body, 0); hideFrame(shadow, 0);
        flush(body); flush(shadow);
        return;
      }
      const c = data.clips[k.clip];
      const fps = fpsOf(k.clip);
      const hf = ((((k.heading / (Math.PI * 2)) * H8) % H8) + H8) % H8;
      const h0 = Math.floor(hf);
      const h1 = (h0 + 1) % H8;
      const ht = THREE.MathUtils.smoothstep(hf - h0, 0.38, 0.62);
      const frames = data.frames[k.clip];
      const clipA = frames[ht < 0.5 ? h0 : h1];
      let [i, j, ft] = framePair(clipA.length, fps, k.clipT, c.loop);
      let a = bodyOf(clipA[i]);
      let b = bodyOf(clipA[j]);
      if (ht > 0.02 && ht < 0.98) { a = bodyOf(frames[h0][i]); b = bodyOf(frames[h1][i]); ft = ht; }
      if (k.clip !== shownKey) { cutFrom = shown; cutAt = t; shownKey = k.clip; }
      if (cutFrom && t - cutAt < CUT) { b = a; a = cutFrom; ft = (t - cutAt) / CUT; }
      shown = ft < 0.5 ? a : b;
      writeFrame(body, 0, a, b, ft, k.pos.x, k.pos.y, k.pos.z);
      const [si, sj, st] = framePair(clipA.length, fps, k.clipT, c.loop, data.shadowEvery ?? 1);
      const s0 = clipA[si][1];
      const s1 = clipA[sj][1];
      if (s0 >= 0) writeFrame(shadow, 0, data.shadow[s0], data.shadow[s1 >= 0 ? s1 : s0], st, k.pos.x, k.pos.y + 0.004, k.pos.z);
      else hideFrame(shadow, 0);
      body.material.opacity = k.fade;
      shadow.material.opacity = SHADOW_STRENGTH * k.fade;
      flush(body);
      flush(shadow);
    }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const sc = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    function writeBrushes() {
      const s = sun.update();
      const off = 0.08 / Math.max(0.2, s.y); // shadow of a 8 cm high brush along the sun
      let r = 0;
      brushState.forEach((b, n) => {
        q.setFromAxisAngle(up, b.yaw);
        m4.compose(b.p, q, one);
        brushes.setMatrixAt(n, m4);
        tmp.set(b.p.x - s.x * off, b.p.y + 0.003, b.p.z - s.z * off);
        m4.compose(tmp, q, sc.set(BRUSH_W + 0.25, 1, BRUSH_D + 0.3));
        brushShadows.setMatrixAt(n, m4);
        // Bridle: bar ends → ring; rope: ring → hand (sagging) or lying on the clay.
        const held = k.brush === b && k.active;
        const rx = Math.cos(b.yaw);
        const rz = -Math.sin(b.yaw);
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        const y = b.p.y + 0.1;
        const end = (sgn) => [b.p.x + rx * sgn * (BRUSH_W / 2 - 0.04) + fx * 0.06, y, b.p.z + rz * sgn * (BRUSH_W / 2 - 0.04) + fz * 0.06];
        const ring = [b.ring.x, b.p.y + (held ? 0.25 : 0.02), b.ring.z];
        const seg = (p0, p1) => { ropePos.set(p0, r); ropePos.set(p1, r + 3); r += 6; };
        seg(end(-1), ring);
        seg(end(1), ring);
        const to = held ? [hand.x, hand.y, hand.z] : [b.ring.x + fx * ROPE * 0.9, b.p.y + 0.02, b.ring.z + fz * ROPE * 0.9];
        let prev = ring;
        for (let i = 1; i <= ROPE_SEG; i++) {
          const u = i / ROPE_SEG;
          const sag = held ? Math.sin(Math.PI * u) * 0.12 : 0;
          const p = [ring[0] + (to[0] - ring[0]) * u, ring[1] + (to[1] - ring[1]) * u - sag, ring[2] + (to[2] - ring[2]) * u];
          seg(prev, p);
          prev = p;
        }
      });
      ropeGeo.setDrawRange(0, r / 3);
      ropeGeo.attributes.position.needsUpdate = true;
      brushes.instanceMatrix.needsUpdate = true;
      brushShadows.instanceMatrix.needsUpdate = true;
    }

    let lastSlot = '';
    let lastHours = clubHours();
    let reappear = 0;
    { const s0 = clubSlot(); lastSlot = `${s0.dayKey}|${s0.hour}`; }

    /** Off the map at once; whatever brush he held lies by its gate again. */
    function vanish() {
      if (k.brush) Object.assign(k.brush, rest(k.brush.cf));
      if (k.wantBrush) Object.assign(k.wantBrush, rest(k.wantBrush.cf));
      brushState.forEach((b) => { b.ring = ringOf(b); });
      k.active = false;
      k.brush = null;
      k.path = [];
      k.fade = 0;
      hideFrame(body, 0);
      hideFrame(shadow, 0);
      next = performance.now() / 1000 + rand(...EVERY);
    }

    /** Skip his walk in: from the moment he takes the rope, fading in where he stands. */
    function atWork() {
      let t = performance.now() / 1000;
      for (let s = 0; s < 3000 && k.active && !k.brush; s++) { step(t, 0.1); t += 0.1; }
      k.fade = 0;
    }

    let last = performance.now() / 1000;
    let drawn = false;
    let held = false; // round 9: off squeegeeing the hard courts (life/squeegee.js)
    return {
      /** Round 9: keep him off the clay while he works elsewhere (true sends him off at once). */
      hold(v) { held = !!v; if (held && k.active) vanish(); },
      tick() {
        const t = performance.now() / 1000;
        const dt = Math.min(0.1, t - last);
        last = t;
        const hours = clubHours();
        const hour = Math.floor(hours);
        const day = (hours > 6.5 && hours < 21.5) || decorLight.nightKeeper; // nobody drags a court in the dark (but Death does, on Halloween)
        // A jump in time (the dock's scrubber, another day, __bp.setTime), not the clock ticking on:
        // he is simply gone, his brush back by the gate, and turns up a moment later already at work
        // on a court that is free at the new hour (row 175).
        const slot = clubSlot();
        const slotKey = `${slot.dayKey}|${slot.hour}`;
        if (slotKey !== lastSlot && Math.abs(hours - lastHours) > 0.05) {
          if (k.active) vanish();
          if (day) reappear = t + rand(1.2, 2.4);
        }
        lastSlot = slotKey;
        lastHours = hours;
        if (reappear && t > reappear) {
          reappear = 0;
          const cf = day && !k.active && !held ? freeCourt() : null;
          if (cf && start(cf, false)) { atWork(); next = Infinity; }
        }
        if (!k.active && day && !reappear && !held) {
          const top = hour !== lastHour && hours - hour < 0.1;
          if (top || t > next) {
            const cf = freeCourt();
            if (cf && start(cf, top || Math.random() < 0.3)) next = Infinity;
            else next = t + 20;
          }
        }
        lastHour = hour;
        const was = k.active;
        step(t, dt);
        if (was && !k.active) next = t + rand(...EVERY);
        writeKeeper(t);
        writeBrushes();
        const first = !drawn;
        drawn = true;
        return first || k.active;
      },
      debug: () => ({ active: k.active, court: k.court?.id, full: k.full, clip: k.clip, holding: !!k.brush, x: +k.pos.x.toFixed(1), z: +k.pos.z.toFixed(1), left: k.path.length, next: +(next - performance.now() / 1000).toFixed(0) }),
      /** Where the keeper stands (other systems keep clear of him), or null. */
      where: () => (k.active ? { x: k.pos.x, z: k.pos.z } : null),
      /** Dev: send him to a court now (`full`: both halves); `skip` metres of his walk done at once. */
      trigger(id, full = false, skip = 0) {
        const cf = freeCourt(id);
        if (!cf) return false;
        const ok = start(cf, full);
        if (ok && skip) {
          let t = performance.now() / 1000 - skip; // replay the walk in big steps
          for (let s = 0; s < skip * 10 && k.active; s++) { step(t, 0.1); t += 0.1; }
        }
        return ok;
      },
      screen() {
        const v = k.pos.clone().project(camera);
        return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, world: [k.pos.x, k.pos.z] };
      },
      courts: () => courts.map((c) => ({ id: c.id, cx: c.cx, cz: c.cz, H: +c.H.toFixed(2), W: c.W, pass: [-1, 1].filter((s) => passClear(c, s)), obs: c.obs.map((o) => [+o.u.toFixed(1), +o.w.toFixed(1)]) })),
    };
  }

  return sys;
}
