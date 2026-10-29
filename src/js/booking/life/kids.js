import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, hideFrame, flush } from './sprite.js';
import { kidsCourtAt, kidsForced } from './lesson-courts.js';
import { whenNeeded, pokeLazy } from './lazy.js';
import { clubSlot, liveSunDir } from './clock.js';
import { lessonsAt } from '../interact/coach-hover.js';
import { kidsCourtOn } from '../../shared/availability.js';
import { KIDS_HOUR } from '../../shared/academy.js';
import { box, merge, softRect } from './geom.js';
import { drinkingFountains as fountains } from './fountains-drinking.js';
import {
  loadLessonAtlas, coachVariant, actor, setClip, writeActor, walkPath, clipLength, aimed, overNet, track,
  ballPool, hoppers, pock, whistle, rand, HOPPER_CAP,
} from './lesson-kit.js';

// The kids group (round 8): every day 16:00–17:00 at the map's hour, on the academy's court of the
// day (shared/academy.js; availability.js counts it as taken then, coach-hover.js shows the junior
// coach). Five to seven kids (MakeHuman children, junior rackets; scripts/life/render_lessons.py)
// go through three drills on the far half while the coach runs it from the near side of the net:
//   line    a line behind the service line, one hit each: the coach feeds from the hopper, the kid
//           plays a forehand (now and then a backhand) and runs round to the back of the line;
//   cones   two slaloms through orange and yellow cones towards the net, jogging back outside;
//   ladder  side-steps through an agility ladder one after another, back round to the queue.
// A whistle (two blasts, through the ambient sound bed) marks every change; after the hitting the
// coach walks the hopper over the balls on his side. The cones and the ladder stay laid out all hour.
// Round 10 (row 1): a fourth step now and then, a water break: three of the kids jog out through the gate
// to the drinking fountain on the footpath (life/fountains-drinking.js: a place in its queue, a drink,
// the jet), and back, while the rest stand easy; skipped when no fountain is near.
// Preview: ?time=16:20 · dev: __bp.lifeDev().kids.trigger('clay-5'), .drill('ladder'), .debug()

const DRILLS = [['line', 75], ['cones', 45], ['ladder', 45], ['water', 70]]; // s each
const RUN = 2.1; // m/s between places and round the cones
const SHUFFLE = 1.5; // m/s through the ladder
const FEED_EVERY = [1.6, 2.3];
const VARIANTS = ['kid_a', 'kid_b', 'kid_c'];


function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- Props -------------------------------------------------------------------------------------------

const ORANGE = new THREE.Color('#e2662a');
const YELLOW = new THREE.Color('#e9c22c');

function ladderGeometry(len, rungs) {
  const parts = [];
  for (const z of [-0.22, 0.22]) parts.push(box(len, 0.006, 0.035, 0, 0.003, z, '#232323'));
  for (let i = 0; i <= rungs; i++) parts.push(box(0.03, 0.012, 0.44, -len / 2 + (i * len) / rungs, 0.006, 0, '#e3c02e'));
  return merge(parts);
}

export function createKids(ctx, { still }) {
  if (still) return null;
  const { scene, rig, courtSurface, quality } = ctx;
  const sys = { name: 'kids', tick: () => false, trigger: (id = 'clay-5') => { kidsForced.court = id; pokeLazy(); return false; } };
  // Row 48: the group's atlas comes down when the kids' hour is on the map.
  whenNeeded(() => { const { dayKey, hour } = clubSlot(); return !!kidsCourtAt(dayKey, hour); }).then(() => loadLessonAtlas(quality)).then(async (L) => {
    const built = build(L);
    await ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {}); // shaders ready before the group first draws
    Object.assign(sys, built);
  }).catch((err) => console.warn('Kids failed', err));

  function build(L) {
    const data = L.data;
    const sun = liveSunDir(ctx);
    const MAXK = 7;
    const body = spriteMesh(L.bodyTex, MAXK + 1, { slide: 0.42 });
    const shadow = spriteMesh(L.shadowTex, MAXK + 1, { ground: true, shadow: true });
    body.name = 'life_players_kids';
    shadow.name = 'life_players_kids_shadow';
    scene.add(shadow, body);
    for (let i = 0; i <= MAXK; i++) { hideFrame(body, i); hideFrame(shadow, i); }
    const pool = ballPool(scene, 90, sun);
    const stand = hoppers(scene, 1, sun);

    // Cones and the ladder.
    const CONES = 12;
    const coneGeo = new THREE.ConeGeometry(0.085, 0.23, 14, 1, true).translate(0, 0.115, 0);
    const cones = new THREE.InstancedMesh(coneGeo, gradeLife(new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide })), CONES);
    const coneShade = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softRect(48, 48, 6), color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }), CONES);
    for (let i = 0; i < CONES; i++) cones.setColorAt(i, i % 2 ? YELLOW : ORANGE);
    const LADDER = 4;
    const ladder = new THREE.Mesh(ladderGeometry(LADDER, 10), gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
    ladder.name = 'life_kids_ladder';
    for (const o of [cones, coneShade, ladder]) {
      o.frustumCulled = false;
      o.layers.set(LIFE_LAYER);
      o.userData.noAO = true;
      o.visible = false;
    }
    coneShade.renderOrder = 1;
    scene.add(coneShade, cones, ladder);

    let g = null; // the group on the court now
    const tmp = new THREE.Vector3();

    function makeGroup(id, coach) {
      const c = courtSurface(id);
      if (!c) return null;
      const seed = seedOf(`${id}|${clubSlot().dayKey}`);
      const n = 5 + (seed % 3);
      const K = { x: c.x + 0.4, z: c.z + 1.9 }; // the coach, near side of the net
      const H = { x: K.x + 0.5, z: K.z + 0.32 };
      const hit = { x: c.x - 0.6, z: c.z - 5.3 };
      const ladderZ = c.z - 4; // between the net and the service line, between the two cone lines
      const lx0 = c.x - 1.9;
      const geo = {
        hit, ladderZ, lx0, lx1: lx0 + LADDER,
        lines: [{ x: c.x - 2.7, side: -1 }, { x: c.x + 2.3, side: 1 }],
        coneZ: (k) => c.z - 3.2 - k * 1.45,
      };
      const kids = [];
      for (let i = 0; i < n; i++) {
        const v = VARIANTS[(i + seed) % VARIANTS.length];
        const k = actor(data, data.frames[v] ? v : VARIANTS.find((x) => data.frames[x]), hit.x + 1.2, c.y, hit.z - 1.3 - i * 0.95, 'ready', 'toward');
        k.path = [];
        k.i = i;
        kids.push(k);
      }
      const co = actor(data, coachVariant(coach, data), K.x, c.y, K.z, 'stand', 'away');
      const group = {
        id, c, K, H, geo, kids, co, coach: coach?.name ?? null,
        bounds: { x0: c.x - 7.9, x1: c.x + 7.9, z0: c.z - 16.9, z1: c.z + 16.9 },
        count: Math.round(rand(40, 64)), rest: [], flying: [], hopperShown: true,
        drill: -1, drillEnds: 0, queue: [], nextFeed: 0, feedAt: 0, pickup: false,
      };
      placeProps(group);
      return group;
    }

    function placeProps(gr) {
      const { c, geo } = gr;
      const m4 = new THREE.Matrix4();
      let i = 0;
      const s = sun.update();
      for (const line of geo.lines) {
        for (let k = 0; k < 6; k++) {
          const x = line.x;
          const z = geo.coneZ(k);
          cones.setMatrixAt(i, m4.makeTranslation(x, c.y, z));
          coneShade.setMatrixAt(i, m4.compose(new THREE.Vector3(x - s.x * 0.12, c.y + 0.003, z - s.z * 0.12), new THREE.Quaternion(), new THREE.Vector3(0.3, 1, 0.3)));
          i++;
        }
      }
      cones.instanceMatrix.needsUpdate = true;
      cones.instanceColor.needsUpdate = true;
      coneShade.instanceMatrix.needsUpdate = true;
      ladder.position.set((geo.lx0 + geo.lx1) / 2, c.y, geo.ladderZ);
      ladder.updateMatrixWorld();
      for (const o of [cones, coneShade, ladder]) o.visible = true;
    }

    // --- Drills ---

    const slotOf = (gr, j) => {
      const { geo } = gr;
      if (DRILLS[gr.drill][0] === 'line') return j === 0 ? { x: geo.hit.x, z: geo.hit.z } : { x: geo.hit.x + 1.2, z: geo.hit.z - 0.6 - j * 0.95 };
      return { x: geo.lx0 - 0.45 - j * 0.85, z: geo.ladderZ };
    };

    /** The closed slalom loop of cone line `line`: weaving to the net, back round the outside. */
    function loopOf(gr, line) {
      const { c, geo } = gr;
      const pts = [{ x: line.x, z: c.z - 12 }];
      for (let k = 5; k >= 0; k--) pts.push({ x: line.x + (k % 2 ? 0.5 : -0.5), z: geo.coneZ(k) + 0.0 });
      pts.push({ x: line.x, z: c.z - 1.9 }, { x: line.x + line.side * 1.5, z: c.z - 2.4 }, { x: line.x + line.side * 1.5, z: c.z - 11.6 });
      pts.push(pts[0]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      return { pts, cum, len: cum[cum.length - 1] };
    }
    function along(loop, s) {
      s = ((s % loop.len) + loop.len) % loop.len;
      let i = 1;
      while (i < loop.cum.length - 1 && loop.cum[i] < s) i++;
      const a = loop.pts[i - 1];
      const b = loop.pts[i];
      const u = (s - loop.cum[i - 1]) / Math.max(1e-6, loop.cum[i] - loop.cum[i - 1]);
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }

    /** Out through the gate in the fence to the corridor (round the net post first when the gate is on the other half). */
    function routeOut(gr) {
      const { c } = gr;
      const gz = c.z - Math.sign(c.z) * 17.42;
      const s = Math.sign(gz - c.z);
      const pts = [];
      if (s !== -1) pts.push({ x: c.x + 7.7, z: c.z - 1.4 }, { x: c.x + 7.7, z: c.z + 1.4 });
      pts.push({ x: c.x, z: gz - s * 1.2 }, { x: c.x, z: gz + s * 2 });
      return pts;
    }

    /** Three kids to the nearest fountain; false when there is none close enough (or no drinking clip yet). */
    function sendWater(gr) {
      if (!fountains.ready || !data.clips.drink) return false;
      const spot = fountains.pick(gr.c.x, gr.c.z, { kid: true });
      if (!spot || Math.hypot(spot.x - gr.c.x, spot.z - gr.c.z) > 34) return false;
      const out = routeOut(gr);
      const zc = out[out.length - 1].z;
      for (const kid of gr.kids.slice(0, 3)) {
        const r = fountains.reserve(spot.id, kid);
        if (!r) continue;
        kid.trip = { state: 'out', spot, r, home: { x: kid.x, z: kid.z }, back: [{ x: r.x, z: zc }, ...[...out].reverse(), { x: kid.x, z: kid.z }] };
        kid.path = [...out, { x: r.x, z: zc }, { x: r.x, z: r.z }];
      }
      return gr.kids.some((kid) => kid.trip);
    }

    /** One step of a kid's trip to the fountain. Returns whether it owns the body this frame. */
    function tripStep(kid, now, dt) {
      const t = kid.trip;
      if (t.state === 'out' || t.state === 'back') {
        walkPath(kid, dt, RUN * 0.9, 7);
        setClip(kid, 'run', null, dt, runRate(RUN * 0.9));
        if (!kid.path.length) {
          if (t.state === 'back') { kid.trip = null; return false; }
          Object.assign(t, { state: 'wait', at: now + t.r.slot * 3.4 });
        }
        return true;
      }
      if (t.state === 'wait') {
        setClip(kid, 'ready', 'toward', dt);
        if (now >= t.at) { Object.assign(t, { state: 'sip', start: now }); fountains.drink(t.spot.id, kid, 3); }
        return true;
      }
      setClip(kid, 'drink', 'toward', dt);
      if (now - t.start > clipLength(data, 'drink')) {
        fountains.release(kid);
        t.state = 'back';
        kid.path = t.back;
      }
      return true;
    }

    function startDrill(gr, k, now, sound = true) {
      // A water break only when some fountain is near enough; else the next drill.
      if (DRILLS[k][0] === 'water' && !(gr.kids.some((kid) => kid.trip) || sendWater(gr))) { startDrill(gr, (k + 1) % DRILLS.length, now, sound); return; }
      gr.drill = k;
      gr.drillEnds = now + DRILLS[k][1];
      const name = DRILLS[k][0];
      if (sound) whistle(rig, gr.co.x, gr.co.z);
      // Everyone leaves what they were doing.
      for (const kid of gr.kids) {
        if (kid.trip && DRILLS[k][0] !== 'water') { fountains.release(kid); kid.x = kid.trip.home.x; kid.z = kid.trip.home.z; kid.trip = null; } // a late one is back in its place
        kid.stroke = null; kid.plan = null; kid.hitAt = 0; kid.joining = false; kid.loop = null; if (!kid.trip) kid.path = [];
      }
      gr.queue = [];
      if (name === 'water') {
        gr.nextFeed = now + 1e9;
      } else if (name === 'line' || name === 'ladder') {
        // Nearest to the front first.
        const order = [...gr.kids].sort((a, b) => Math.hypot(a.x - gr.geo.hit.x, a.z - gr.geo.hit.z) - Math.hypot(b.x - gr.geo.hit.x, b.z - gr.geo.hit.z));
        gr.queue = order;
        gr.nextFeed = now + 3;
      } else {
        const loops = gr.geo.lines.map((line) => loopOf(gr, line));
        gr.kids.forEach((kid, i) => {
          const loop = loops[i % 2];
          const per = Math.ceil(gr.kids.length / 2);
          kid.loop = { loop, s: (loop.len * Math.floor(i / 2)) / per };
          kid.path = [along(loop, kid.loop.s)];
        });
      }
      // After the hitting the coach walks the hopper over the balls on his side.
      if (name === 'cones' && gr.rest.some((p) => p.z > gr.c.z)) startPickup(gr);
    }

    function startPickup(gr) {
      const { co, c, K } = gr;
      const left = gr.rest.filter((p) => p.z > c.z);
      const path = [];
      let at = { x: co.x, z: co.z };
      while (left.length && path.length < 14) {
        left.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
        const p = left.shift();
        at = { x: p.x, z: p.z };
        path.push(at);
        for (let i = left.length - 1; i >= 0; i--) if (Math.hypot(left[i].x - p.x, left[i].z - p.z) < 0.9) left.splice(i, 1);
      }
      co.path = [...path, { x: K.x, z: K.z + 1.4 }, { x: K.x, z: K.z }];
      co.facing = null;
      co.clip = 'carry';
      co.heading = Math.PI;
      co.hopOff = data.variants[co.variant]?.hopper ?? [0.42, 0];
      gr.pickup = true;
      gr.hopperShown = false;
    }

    function feed(gr, now) {
      const { co } = gr;
      co.clip = 'feed';
      co.clipT = 0;
      const info = data.variants[co.variant]?.contact?.feed;
      gr.feedAt = now + (info?.frame ?? 18) / (data.clips.feed.fps ?? data.fps);
      gr.feedFrom = info?.at ?? [0.35, 0.55, -0.6];
      gr.count--;
    }

    function kidContact(kid) {
      const info = data.variants[kid.variant]?.contact?.forehand;
      const fps = data.clips.forehand.fps ?? data.fps;
      return { t: (info?.frame ?? 12) / fps, at: info?.at ?? [-0.6, 0.6, 0.35] };
    }

    function launchFeed(gr, now) {
      const { co, c } = gr;
      const kid = gr.queue[0];
      const from = new THREE.Vector3(co.x + gr.feedFrom[0], c.y + Math.max(0.35, gr.feedFrom[1]), co.z + gr.feedFrom[2]);
      pock(rig, co.x, co.z, 0.5);
      if (!kid) return;
      const back = Math.random() < 0.25;
      const { at } = kidContact(kid);
      const dx = back ? -at[0] : at[0];
      const to = new THREE.Vector3(kid.x + dx + rand(-0.45, 0.45), 0, kid.z + 2.4 + rand(-0.4, 0.4));
      const v = overNet(from, aimed(from, to, rand(1.05, 1.2), c.y), c.z, c.y, 1.2);
      const tr = track(from, v, now, c.y, gr.bounds);
      gr.flying.push(tr);
      // The kid meets it on its way down from the bounce.
      const b = tr.firstBounce;
      if (!b) return;
      let t = b.t + 0.12;
      for (let s = b.t + 0.1; s < b.t + 1.2; s += 0.01) {
        t = s;
        const y = tr.at(s, tmp).y;
        if (tr.at(s + 0.01, new THREE.Vector3()).y < y && y < c.y + 0.75) break;
      }
      const pos = tr.at(t, new THREE.Vector3());
      kid.plan = { t, tr, mirror: back, x: pos.x - dx, z: pos.z - at[2] };
    }

    function kidStrike(gr, kid, now) {
      const { c } = gr;
      const plan = kid.plan;
      kid.plan = null;
      if (!plan) return;
      const from = plan.tr.at(now, new THREE.Vector3());
      const k = gr.flying.indexOf(plan.tr);
      if (k >= 0) gr.flying.splice(k, 1);
      const r = Math.random();
      let to;
      let T = rand(1.0, 1.3);
      let net = false;
      if (r < 0.25) { net = true; to = new THREE.Vector3(c.x + rand(-3, 2), 0, c.z - rand(0.3, 1)); T = 0.55; } else if (r < 0.4) {
        to = new THREE.Vector3(c.x + rand(-6.5, 6.5), 0, c.z + rand(4, 12.5));
      } else {
        to = new THREE.Vector3(c.x + rand(-3.8, 3.8), 0, c.z + rand(2.2, 9.5));
      }
      const v = aimed(from, to, T, c.y);
      if (!net) overNet(from, v, c.z, c.y, 1.1);
      gr.flying.push(track(from, v, now, c.y, gr.bounds));
      pock(rig, kid.x, kid.z, 0.8);
    }

    /** Off the front of the queue: round the line to the back of it. */
    function sendRound(gr, kid, name) {
      const { geo } = gr;
      gr.queue.shift();
      const tail = slotOf(gr, gr.kids.length - 1);
      if (name === 'line') {
        kid.path = [{ x: geo.hit.x - 2.2, z: geo.hit.z - 0.4 }, { x: geo.hit.x - 2.2, z: tail.z - 1.1 }, { x: tail.x, z: tail.z - 1.1 }];
      } else {
        kid.path = [{ x: geo.lx1 + 0.45, z: geo.ladderZ, shuffle: true }, { x: geo.lx1 + 1.0, z: geo.ladderZ - 1.5 }, { x: tail.x, z: geo.ladderZ - 1.5 }];
      }
      kid.joining = true;
    }

    // --- Per frame ---

    function stepKid(gr, kid, now, dt) {
      const name = DRILLS[gr.drill][0];
      if (kid.trip && tripStep(kid, now, dt)) return;
      // A stroke owns the body.
      if (kid.stroke) {
        const t = now - kid.stroke.start;
        if (t >= clipLength(data, 'forehand')) { kid.stroke = null; sendRound(gr, kid, 'line'); } else {
          setClip(kid, 'forehand', 'toward', 0, 1, kid.stroke.mirror);
          kid.clipT = t;
          return;
        }
      }
      if (kid.plan) {
        const { t: ct } = kidContact(kid);
        if (now >= kid.plan.t - ct) {
          kid.x = kid.plan.x; kid.z = kid.plan.z;
          kid.stroke = { start: kid.plan.t - ct, mirror: kid.plan.mirror };
          kid.hitAt = kid.plan.t;
          setClip(kid, 'forehand', 'toward', 0, 1, kid.plan.mirror);
          kid.clipT = now - kid.stroke.start;
          return;
        }
        // a step across to where the ball will be
        const dx = kid.plan.x - kid.x;
        const dz = kid.plan.z - kid.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const sp = Math.min(2.5, d / Math.max(0.2, kid.plan.t - ct - now) + 0.2);
          const s = Math.min(d, sp * dt);
          kid.x += (dx / d) * s; kid.z += (dz / d) * s;
          const pace = data.clips.shuffle.pace || 1.2;
          setClip(kid, 'shuffle', 'toward', dt, THREE.MathUtils.clamp(sp / Math.abs(pace), 0.6, 1.6), Math.sign(pace) !== Math.sign(-dx));
          return;
        }
      }
      if (kid.loop && !kid.path.length) {
        // Round the cones, at a steady jog.
        kid.loop.s += RUN * dt;
        const p = along(kid.loop.loop, kid.loop.s);
        const q = along(kid.loop.loop, kid.loop.s + 0.3);
        kid.x = p.x; kid.z = p.z;
        let dh = Math.atan2(q.x - p.x, -(q.z - p.z)) - kid.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        kid.heading += THREE.MathUtils.clamp(dh, -6 * dt, 6 * dt);
        setClip(kid, 'run', null, dt, runRate(RUN));
        return;
      }
      if (kid.path.length) {
        const seg = kid.path[0];
        if (seg.shuffle) {
          const dx = seg.x - kid.x;
          const pace = data.clips.shuffle.pace || 1.2;
          walkPath(kid, dt, SHUFFLE);
          setClip(kid, 'shuffle', 'toward', dt, THREE.MathUtils.clamp(SHUFFLE / Math.abs(pace), 0.7, 1.6), Math.sign(pace) !== Math.sign(-dx));
        } else {
          walkPath(kid, dt, RUN * 0.9, 7);
          setClip(kid, 'run', null, dt, runRate(RUN * 0.9));
        }
        if (!kid.path.length && kid.joining) { kid.joining = false; gr.queue.push(kid); }
        return;
      }
      // In the queue: to its place, else waiting, racket ready.
      const j = gr.queue.indexOf(kid);
      if (j >= 0 && name !== 'cones') {
        const s = slotOf(gr, j);
        if (Math.hypot(s.x - kid.x, s.z - kid.z) > 0.12) { kid.path = [s]; return; }
      }
      setClip(kid, 'ready', 'toward', dt);
    }

    // The jog (CMU 16_35) on a ten-year-old covers about 2.1 m/s at its own pace (the measured ground
    // speed comes out low on a run, both feet off the ground half the time).
    const runRate = (speed) => THREE.MathUtils.clamp(speed / 2.1, 0.75, 1.5);

    function step(gr, now, dt) {
      const { co, c } = gr;
      if (now > gr.drillEnds) startDrill(gr, (gr.drill + 1) % DRILLS.length, now);
      const name = DRILLS[gr.drill][0];
      for (let i = gr.flying.length - 1; i >= 0; i--) {
        const tr = gr.flying[i];
        if (now > tr.stopAt && !gr.kids.some((k) => k.plan?.tr === tr)) { gr.rest.push(tr.end.clone()); gr.flying.splice(i, 1); }
      }
      for (const kid of gr.kids) if (kid.hitAt && now >= kid.hitAt) { kid.hitAt = 0; kidStrike(gr, kid, now); }
      if (gr.feedAt && now >= gr.feedAt) { gr.feedAt = 0; launchFeed(gr, now); }

      // The coach.
      if (gr.pickup) {
        const going = walkPath(co, dt, data.clips.carry.speed || 0.95);
        setClip(co, 'carry', null, dt);
        const fx = Math.sin(co.heading);
        const fz = -Math.cos(co.heading);
        const hx = co.x - fz * co.hopOff[0] + fx * co.hopOff[1];
        const hz = co.z + fx * co.hopOff[0] + fz * co.hopOff[1];
        for (let i = gr.rest.length - 1; i >= 0; i--) {
          const p = gr.rest[i];
          if (Math.hypot(p.x - hx, p.z - hz) < 0.45 || Math.hypot(p.x - co.x, p.z - co.z) < 0.3) { gr.rest.splice(i, 1); gr.count++; }
        }
        if (!going) {
          gr.pickup = false; gr.hopperShown = true;
          co.x = gr.K.x; co.z = gr.K.z; co.facing = 'away'; co.clip = 'stand'; co.clipT = 0;
        }
      } else if (co.clip === 'feed') {
        setClip(co, 'feed', 'away', dt);
        if (co.clipT >= clipLength(data, 'feed')) { co.clip = 'stand'; co.clipT = 0; gr.nextFeed = now + rand(...FEED_EVERY); }
      } else {
        setClip(co, 'stand', 'away', dt);
        const front = gr.queue[0];
        const s = slotOf(gr, 0);
        const ready = front && !front.path.length && !front.plan && !front.stroke && Math.hypot(front.x - s.x, front.z - s.z) < 0.15;
        if (name === 'line' && ready && now > gr.nextFeed && !gr.flying.some((tr) => tr.firstBounce && now < tr.firstBounce.t + 0.3) && gr.count > 0) feed(gr, now);
      }
      // The ladder: the next one goes when the one ahead is half way along.
      if (name === 'ladder') {
        const front = gr.queue[0];
        const s = slotOf(gr, 0);
        const busy = gr.kids.some((k) => k.path[0]?.shuffle && k.x < gr.geo.lx0 + 1.7);
        if (front && !front.path.length && !busy && Math.hypot(front.x - s.x, front.z - s.z) < 0.15) sendRound(gr, front, 'ladder');
      }
      for (const kid of gr.kids) {
        stepKid(gr, kid, now, dt);
        // Kids running over a ball pick it up on the way.
        if (!kid.stroke && !kid.plan) {
          for (let i = gr.rest.length - 1; i >= 0; i--) {
            const p = gr.rest[i];
            if (p.z < c.z && Math.hypot(p.x - kid.x, p.z - kid.z) < 0.35) { gr.rest.splice(i, 1); gr.count = Math.min(HOPPER_CAP, gr.count + 1); }
          }
        }
      }
    }

    function draw(now) {
      if (!g) {
        for (let i = 0; i <= MAXK; i++) { hideFrame(body, i); hideFrame(shadow, i); }
        stand.set(0, 0, 0, 0, 0, false);
        pool.begin(); pool.end();
      } else {
        // Back to front, so the cards never cut each other.
        const all = [g.co, ...g.kids].sort((a, b) => a.z - b.z);
        for (let i = 0; i <= MAXK; i++) {
          if (all[i]) writeActor(body, shadow, i, all[i], now);
          else { hideFrame(body, i); hideFrame(shadow, i); }
        }
        stand.set(0, g.H.x, g.c.y, g.H.z, g.count / HOPPER_CAP, g.hopperShown);
        pool.begin();
        for (const p of g.rest) pool.put(p, g.c.y);
        for (const tr of g.flying) pool.put(tr.at(now, tmp), g.c.y);
        pool.end();
      }
      stand.flush();
      flush(body);
      flush(shadow);
    }

    let key = '';
    function sync(now) {
      const { dayKey, hour } = clubSlot();
      const id = kidsCourtAt(dayKey, hour);
      const k = `${dayKey}|${id}`;
      if (k === key) return;
      key = k;
      g = null;
      for (const o of [cones, coneShade, ladder]) o.visible = false;
      if (!id) return;
      const coach = lessonsAt(dayKey, KIDS_HOUR)[id];
      g = makeGroup(id, coach);
      if (g) startDrill(g, 0, now, false);
    }

    let last = performance.now() / 1000;
    let idle = false;
    return {
      tick() {
        const now = performance.now() / 1000;
        const dt = Math.min(0.1, now - last);
        last = now;
        sync(now);
        sun.update();
        if (!g) {
          if (idle) return false;
          idle = true;
          draw(now);
          return true;
        }
        idle = false;
        step(g, now, dt);
        draw(now);
        return true;
      },
      /** Dev: the kids group on this court now (null: back to the schedule). */
      trigger(id = 'clay-5') {
        kidsForced.court = id;
        const { dayKey, hour } = clubSlot();
        ctx.players?.setHour?.(dayKey, hour);
        sync(performance.now() / 1000);
        return g?.id ?? null;
      },
      /** Dev: jump to a drill ('line' | 'cones' | 'ladder'). */
      drill(name) {
        if (!g) return null;
        startDrill(g, Math.max(0, DRILLS.findIndex(([n]) => n === name)), performance.now() / 1000);
        return DRILLS[g.drill][0];
      },
      whistle: () => (g ? whistle(rig, g.co.x, g.co.z) : false),
      debug: () => (g ? { court: g.id, c: [+g.c.x.toFixed(1), +g.c.z.toFixed(1)], coach: g.coach, sprite: g.co.variant, drill: DRILLS[g.drill][0], left: +(g.drillEnds - performance.now() / 1000).toFixed(0), kids: g.kids.length, queue: g.queue.length, hopper: g.count, lying: g.rest.length, flying: g.flying.length, clips: g.kids.map((k) => `${k.variant}:${k.clip}`) } : null),
    };
  }

  return sys;
}
