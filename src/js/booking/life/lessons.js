import * as THREE from 'three';
import { spriteMesh, hideFrame, flush } from './sprite.js';
import { lessonCourtsAt, forcedLessons as forced, MAX_LESSONS } from './lesson-courts.js';
import { clubSlot, liveSunDir } from './clock.js';
import { whenNeeded, pokeLazy, onTimeIntent } from './lazy.js';
import { lessonsAt } from '../interact/coach-hover.js';
import { COURTS, isOpenHour, kidsCourtOn } from '../../shared/availability.js';
import { KIDS_HOUR } from '../../shared/academy.js';
import { isTournamentCourt } from '../../shared/tournaments.js';
import {
  loadLessonAtlas, coachVariant, actor, setClip, writeActor, walkPath, clipLength, aimed, overNet, track,
  ballPool, hoppers, pock, rand, BASELINE, HOPPER_CAP,
} from './lesson-kit.js';

// Coaching lessons on the map (round 8). Some of the courts booked at the hour the map shows are
// lessons (interact/coach-hover.js `lessonsAt`, the same schedule the hover card reads): there the
// players system keeps its rally off (players.js `rallyFilters`) and a lesson plays instead. The
// coach stands on the near half by the service line with the ball hopper on its stand beside him,
// feeds one ball after another over the net with a short racket swing, and the student at the far
// baseline moves across and plays forehands and backhands back. The balls bounce, roll and stay on
// the coach's side; when the hopper runs low (or every few minutes) the coach picks them up, walking
// the hopper over them, while the student gathers the few by the net, and the feeding starts again.
//
// The coach is a flipbook from scripts/life/render_lessons.py (black club polo, no logos; a woman
// or one of two men, matched to the scheduled coach); the student is one of the players' flipbooks
// (players.js shares its atlas). The hopper on its stand and the balls are geometry.
// Dev: __bp.lifeDev().lessons.trigger('clay-2') · .debug()

const MAX = MAX_LESSONS; // lessons drawn at once (the hover card names a coach on each)
const FEED_EVERY = [2.5, 3.4]; // s between feeds
const PICKUP_EVERY = [150, 220]; // s: a pickup at the latest after this
const PICKUP_AT = 30; // balls on the coach's half
const STUDENT_WALK = 1.2;

export function createLessons(ctx, { still, players }) {
  if (still || !players) return null;
  const { scene, rig, courtSurface, quality } = ctx;
  const sys = { name: 'lessons', tick: () => false, trigger: (id) => { if (id == null) forced.clear(); else forced.add(id); pokeLazy(); return false; } };
  onTimeIntent(() => loadLessonAtlas(quality).catch(() => {})); // row 48: warm the atlas while they reach for the time bar
  const hasLesson = () => { const { dayKey, hour } = clubSlot(); return lessonCourtsAt(dayKey, hour).length > 0; };

  // Students come from the players' atlas: wait for it (players.js loads it after life.start()).
  const playersReady = new Promise((resolve) => {
    const poll = () => (players.atlas ? resolve(players.atlas) : setTimeout(poll, 300));
    poll();
  });
  // Row 48: the coaches' atlas (~1 MB) comes down when a lesson is on at the hour the map shows, not before.
  whenNeeded(hasLesson).then(() => Promise.all([loadLessonAtlas(quality), playersReady])).then(async ([L, P]) => {
    const built = build(L, P);
    await ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {}); // shaders ready before the first lesson draws
    Object.assign(sys, built);
  }).catch((err) => console.warn('Lessons failed', err));

  function build(L, P) {
    const sun = liveSunDir(ctx);
    const coachBody = spriteMesh(L.bodyTex, MAX);
    const coachShadow = spriteMesh(L.shadowTex, MAX, { ground: true, shadow: true });
    const studentBody = spriteMesh(P.bodyTex, MAX);
    const studentShadow = spriteMesh(P.shadowTex, MAX, { ground: true, shadow: true });
    // 'life_players…': the floodlight gain after dark reaches these cards too (daylight.js).
    coachBody.name = 'life_players_lesson_coach';
    coachShadow.name = 'life_players_lesson_coach_shadow';
    studentBody.name = 'life_players_lesson_student';
    studentShadow.name = 'life_players_lesson_student_shadow';
    scene.add(coachShadow, studentShadow, coachBody, studentBody);
    for (let i = 0; i < MAX; i++) for (const m of [coachBody, coachShadow, studentBody, studentShadow]) hideFrame(m, i);
    const pool = ballPool(scene, MAX * 70, sun);
    const stands = hoppers(scene, MAX, sun);

    const pdata = P.data;
    const pVariants = Object.keys(pdata.frames);
    const pContact = (clip) => pdata.clips[clip].contact / (pdata.clips[clip].fps ?? pdata.fps);
    const lessons = [];
    const tmp = new THREE.Vector3();

    function seed(id) {
      let h = 7;
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return h;
    }

    function makeLesson(id, coach) {
      const c = courtSurface(id);
      if (!c) return null;
      const bounds = { x0: c.x - 7.9, x1: c.x + 7.9, z0: c.z - 16.9, z1: c.z + 16.9 };
      const F = { x: c.x + 0.7, z: c.z + 5.2 }; // feeding spot, just inside the service line
      const H = { x: F.x + 0.5, z: F.z + 0.32 }; // hopper: to his right, a step behind
      const S = { x: c.x - 0.3, z: c.z - BASELINE + 1.0 }; // student's place
      const cv = coachVariant(coach, L.data);
      const co = actor(L.data, cv, F.x, c.y, F.z, 'stand', 'away');
      const st = actor(pdata, pVariants[seed(id) % pVariants.length], S.x, c.y, S.z, 'ready', 'toward');
      const now = performance.now() / 1000;
      const lesson = {
        id, c, bounds, F, H, S, co, st, coach: coach?.name ?? null,
        count: Math.round(rand(26, 60)), // balls in the hopper
        rest: [], // balls lying on the court
        flying: [],
        phase: 'feed',
        nextFeed: now + rand(0.6, 2),
        feedAt: 0, // contact time of the feed under way
        nextPickup: now + rand(...PICKUP_EVERY),
        hopperShown: true,
      };
      // Mid-lesson: some balls already lie on the coach's half, a few by the net on the other.
      for (let i = Math.round(rand(5, 16)); i > 0; i--) lesson.rest.push(new THREE.Vector3(c.x + rand(-5, 5), c.y + 0.034, c.z + rand(1.5, 12.5)));
      for (let i = Math.round(rand(0, 3)); i > 0; i--) lesson.rest.push(new THREE.Vector3(c.x + rand(-4, 4), c.y + 0.034, c.z - rand(0.3, 1.2)));
      return lesson;
    }

    let slotKey = '';
    function sync() {
      const { dayKey, hour } = clubSlot();
      const key = `${dayKey}|${hour}|${[...forced].join(',')}`;
      if (key === slotKey) return;
      slotKey = key;
      const ids = lessonCourtsAt(dayKey, hour);
      const coaches = isOpenHour(dayKey, hour) ? lessonsAt(dayKey, hour) : {};
      for (let i = lessons.length - 1; i >= 0; i--) if (!ids.includes(lessons[i].id)) lessons.splice(i, 1);
      for (const id of ids) {
        if (lessons.some((l) => l.id === id)) continue;
        const l = makeLesson(id, coaches[id]);
        if (l) lessons.push(l);
      }
    }

    // --- Feeding and playing ---

    function feed(l, now) {
      const { co, c } = l;
      co.clip = 'feed';
      co.clipT = 0;
      const info = L.data.variants[co.variant]?.contact?.feed;
      const fps = L.data.clips.feed.fps ?? L.data.fps;
      l.feedAt = now + (info?.frame ?? 18) / fps;
      l.feedFrom = info?.at ?? [0.35, 0.55, -0.6];
      l.count--;
    }

    function launchFeed(l, now) {
      const { co, c, st } = l;
      const from = new THREE.Vector3(co.x + l.feedFrom[0], c.y + Math.max(0.35, l.feedFrom[1]), co.z + l.feedFrom[2]);
      const to = new THREE.Vector3(c.x + rand(-2.6, 2.6), 0, c.z - rand(7, 9.4));
      const v = overNet(from, aimed(from, to, rand(1.25, 1.5), c.y), c.z, c.y, 1.3);
      const tr = track(from, v, now, c.y, l.bounds);
      l.flying.push(tr);
      pock(rig, co.x, co.z, 0.55);
      planStudent(l, tr);
    }

    /** Where and when the student meets the fed ball: after its bounce, coming down through ~0.9 m. */
    function planStudent(l, tr) {
      const { c, st } = l;
      const b = tr.firstBounce;
      if (!b) return;
      let t = b.t + 0.12;
      for (let s = b.t + 0.1; s < b.t + 1.4; s += 0.01) {
        tr.at(s, tmp);
        t = s;
        const falling = tr.at(s + 0.01, new THREE.Vector3()).y < tmp.y;
        if ((falling && tmp.y < c.y + 0.95) || tmp.z < c.z - BASELINE - 0.8) break;
      }
      const pos = tr.at(t, new THREE.Vector3());
      const right = -1; // facing the camera, the right hand is towards −x
      const fore = (pos.x - st.x) * right > -0.2;
      const clip = fore ? 'forehand' : 'backhand';
      const x = THREE.MathUtils.clamp(pos.x - right * (fore ? 0.85 : -0.85), c.x - 6, c.x + 6);
      const z = THREE.MathUtils.clamp(pos.z - 0.45, c.z - BASELINE - 2.2, c.z - 4);
      st.plan = { t, pos, clip, x, z, tr };
      st.goal = { x, z, by: t - pContact(clip) };
    }

    function studentStrike(l, now) {
      const { c, st, F } = l;
      const plan = st.plan;
      st.plan = null;
      const from = plan.tr.at(now, new THREE.Vector3());
      const k = l.flying.indexOf(plan.tr);
      if (k >= 0) l.flying.splice(k, 1);
      const r = Math.random();
      let to;
      let T = rand(1.0, 1.25);
      let net = false;
      if (r < 0.12) { net = true; to = new THREE.Vector3(c.x + rand(-3, 3), 0, c.z - rand(0.3, 0.9)); T = 0.6; } else if (r < 0.2) {
        to = new THREE.Vector3(c.x + rand(-4.6, 4.6), 0, c.z + BASELINE + rand(0.4, 2));
      } else {
        let x = c.x + rand(-3.9, 3.9);
        if (Math.abs(x - F.x) < 1.3) x += Math.sign(x - F.x || 1) * 1.6;
        to = new THREE.Vector3(x, 0, c.z + rand(2.6, 10.8));
      }
      const v = aimed(from, to, T, c.y);
      if (!net) overNet(from, v, c.z, c.y, 1.15);
      l.flying.push(track(from, v, now, c.y, l.bounds));
      pock(rig, st.x, st.z, 1);
    }

    // --- Student movement (players' atlas: side-steps, strafes, walks) ---

    function lateralClip(kind, dir) {
      const a = `${kind}_r`;
      return Math.sign(pdata.clips[a].pace) === Math.sign(dir) ? a : `${kind}_l`;
    }

    function moveStudent(l, now, dt) {
      const { st } = l;
      if (st.stroke) {
        const t = now - st.stroke.start;
        if (t >= clipLength(pdata, st.stroke.clip)) { st.stroke = null; } else { setClip(st, st.stroke.clip, 'toward', 0); st.clipT = t; return; }
      }
      if (st.plan && now >= st.plan.t - pContact(st.plan.clip)) {
        st.x = st.plan.x; st.z = st.plan.z;
        st.stroke = { clip: st.plan.clip, start: st.plan.t - pContact(st.plan.clip) };
        st.hitAt = st.plan.t;
        st.goal = null;
        setClip(st, st.stroke.clip, 'toward', 0);
        st.clipT = now - st.stroke.start;
        return;
      }
      if (st.path?.length) {
        // Between drills: walking, turned the way he goes.
        const g = st.path[0];
        const dx = g.x - st.x;
        const dz = g.z - st.z;
        const facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'toward' : 'away';
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, STUDENT_WALK * dt);
        if (d > 1e-4) { st.x += (dx / d) * step; st.z += (dz / d) * step; }
        if (d - step < 0.04) st.path.shift();
        setClip(st, 'walk', facing, dt, STUDENT_WALK / (pdata.clips.walk.speed || 1.3));
        return;
      }
      if (st.goal) {
        const dx = st.goal.x - st.x;
        const dz = st.goal.z - st.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.04) { st.goal = null; } else {
          const left = Math.max(0.25, st.goal.by - now);
          const speed = Math.min(4, Math.max(0.9, dist / left));
          const step = Math.min(dist, speed * dt);
          st.x += (dx / dist) * step;
          st.z += (dz / dist) * step;
          let clip;
          let pace;
          if (Math.abs(dz) > Math.abs(dx) * 1.5) {
            clip = dz > 0 ? 'walk' : 'walk_back';
            pace = Math.abs(pdata.clips[clip].speed) || 1;
          } else {
            clip = lateralClip(speed > 2.3 || dist > 3 ? 'strafe' : 'sidestep', -dx);
            pace = Math.abs(pdata.clips[clip].pace) || 1;
          }
          setClip(st, clip, 'toward', dt, THREE.MathUtils.clamp(speed / pace, 0.6, 1.8));
          return;
        }
      }
      setClip(st, 'ready', 'toward', dt);
    }

    // --- Picking the balls up ---

    /** A walk through the balls on one half (side +1: z > net), nearest first, from (x, z). */
    function sweep(l, side, x, z) {
      const left = l.rest.filter((p) => Math.sign(p.z - l.c.z) === side);
      const path = [];
      let at = { x, z };
      while (left.length && path.length < 16) {
        left.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
        const p = left.shift();
        at = { x: p.x, z: p.z };
        path.push(at);
        for (let i = left.length - 1; i >= 0; i--) if (Math.hypot(left[i].x - p.x, left[i].z - p.z) < 0.9) left.splice(i, 1);
      }
      return path;
    }

    function startPickup(l, now) {
      const { co, st, c, F, S } = l;
      l.phase = 'pickup';
      l.hopperShown = false;
      co.facing = null;
      co.clip = 'carry';
      co.heading = Math.PI; // turning round from facing the net
      const hop = L.data.variants[co.variant]?.hopper ?? [0.42, 0];
      co.hopOff = hop;
      co.path = [...sweep(l, 1, co.x, co.z), { x: F.x, z: F.z + 1.4 }, { x: F.x, z: F.z }];
      st.goal = null;
      st.path = [...sweep(l, -1, st.x, st.z), { x: S.x, z: S.z }];
      l.nextPickup = now + rand(...PICKUP_EVERY);
    }

    /** Balls under the hopper (his right side, as he carries it) or at his feet go into it. */
    function collect(l, a, hopper) {
      const fx = Math.sin(a.heading);
      const fz = -Math.cos(a.heading);
      const hx = hopper ? a.x - fz * a.hopOff[0] + fx * a.hopOff[1] : a.x;
      const hz = hopper ? a.z + fx * a.hopOff[0] + fz * a.hopOff[1] : a.z;
      for (let i = l.rest.length - 1; i >= 0; i--) {
        const p = l.rest[i];
        if (Math.hypot(p.x - hx, p.z - hz) < 0.45 || Math.hypot(p.x - a.x, p.z - a.z) < 0.3) {
          l.rest.splice(i, 1);
          l.count++;
        }
      }
    }

    // --- Per frame ---

    function step(l, now, dt) {
      const { co, st, c, F } = l;
      // Balls that have come to rest stay where they stopped.
      for (let i = l.flying.length - 1; i >= 0; i--) {
        const tr = l.flying[i];
        if (now > tr.stopAt && st.plan?.tr !== tr) {
          l.rest.push(tr.end.clone());
          l.flying.splice(i, 1);
        }
      }
      if (st.hitAt && now >= st.hitAt) { st.hitAt = 0; studentStrike(l, now); }
      if (l.feedAt && now >= l.feedAt) { l.feedAt = 0; launchFeed(l, now); }

      if (l.phase === 'feed') {
        const near = l.rest.filter((p) => p.z > c.z).length;
        const calm = !l.flying.length && !st.plan && !st.stroke && co.clip !== 'feed';
        if (calm && (l.count <= 0 || near >= PICKUP_AT || now > l.nextPickup)) startPickup(l, now);
        else if (co.clip === 'feed') {
          setClip(co, 'feed', 'away', dt);
          if (co.clipT >= clipLength(L.data, 'feed')) { co.clip = 'stand'; co.clipT = 0; l.nextFeed = now + rand(...FEED_EVERY); }
        } else {
          setClip(co, 'stand', 'away', dt);
          if (now > l.nextFeed && !st.plan && !st.stroke && l.count > 0) feed(l, now);
        }
      } else {
        // Pickup: the coach walks the hopper over the balls on his half, the student gathers his.
        const going = walkPath(co, dt, L.data.clips.carry.speed || 0.95);
        setClip(co, 'carry', null, dt);
        collect(l, co, true);
        if (st.path?.length) collect(l, st, false);
        if (!going) {
          co.x = F.x; co.z = F.z;
          co.facing = 'away';
          co.clip = 'stand';
          co.clipT = 0;
          l.hopperShown = true;
          l.phase = 'feed';
          l.nextFeed = now + rand(1.5, 3);
        }
      }
      moveStudent(l, now, dt);
    }

    function draw(now) {
      pool.begin();
      for (let i = 0; i < MAX; i++) {
        const l = lessons[i];
        if (!l) {
          for (const m of [coachBody, coachShadow, studentBody, studentShadow]) hideFrame(m, i);
          stands.set(i, 0, 0, 0, 0, false);
          continue;
        }
        writeActor(coachBody, coachShadow, i, l.co, now);
        writeActor(studentBody, studentShadow, i, l.st, now);
        stands.set(i, l.H.x, l.c.y, l.H.z, l.count / HOPPER_CAP, l.hopperShown);
        for (const p of l.rest) pool.put(p, l.c.y);
        for (const tr of l.flying) pool.put(tr.at(now, tmp), l.c.y);
      }
      pool.end();
      stands.flush();
      for (const m of [coachBody, coachShadow, studentBody, studentShadow]) flush(m);
    }

    let last = performance.now() / 1000;
    let drawnEmpty = false;
    return {
      tick() {
        const now = performance.now() / 1000;
        const dt = Math.min(0.1, now - last);
        last = now;
        sync();
        sun.update();
        for (const l of lessons) step(l, now, dt);
        if (!lessons.length) {
          if (drawnEmpty) return false;
          drawnEmpty = true;
        } else drawnEmpty = false;
        draw(now);
        return true;
      },
      /** Dev: a lesson on this court now (whatever the schedule says); null clears the forced ones. */
      trigger(id) {
        if (id == null) forced.clear();
        else forced.add(id);
        const { dayKey, hour } = clubSlot();
        players.setHour?.(dayKey, hour);
        sync();
        return lessons.map((l) => l.id);
      },
      /** Dev: start the pickup on a court now. */
      pickup(id) {
        const l = lessons.find((x) => x.id === id) ?? lessons[0];
        if (l) startPickup(l, performance.now() / 1000);
        return !!l;
      },
      courts: () => lessons.map((l) => l.id),
      debug: () => lessons.map((l) => ({ court: l.id, c: [+l.c.x.toFixed(1), +l.c.z.toFixed(1)], goal: l.st.goal && [+l.st.goal.x.toFixed(1), +l.st.goal.z.toFixed(1)], plan: l.st.plan && [+l.st.plan.x.toFixed(1), +l.st.plan.z.toFixed(1)], coach: l.coach, sprite: l.co.variant, phase: l.phase, hopper: l.count, lying: l.rest.length, flying: l.flying.length, coachClip: l.co.clip, student: `${l.st.variant}:${l.st.clip}@${l.st.x.toFixed(1)},${l.st.z.toFixed(1)}` })),
    };
  }

  return sys;
}
