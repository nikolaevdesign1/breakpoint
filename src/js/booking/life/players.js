import * as THREE from 'three';
import { LIFE_LAYER, rng } from './shared.js';
import { courtHit } from '../ambient.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, writeFrame, hideFrame, flush, framePair, loadAtlas, PITCH } from './sprite.js';
import { COURTS as ALL_COURTS, hoursOn, isOpenHour, isSlotTaken, dayKeyForOffset } from '../../shared/availability.js';
import { hourState } from '../hour-state.js';
import { RALLY_COURTS, rallyCourtsAt, rallyFilters } from './rallies.js';
import { createRoutine } from './player-routine.js';
import { clubSlot } from './clock.js';

// Rallies on a few courts (row 95.4). The players are flipbook sprites rendered offline from the
// drone's exact direction (scripts/life/render_players.py): MakeHuman people, footwork from Mixamo
// locomotion (ready stance, split step, side-steps, jogging strafe, walks), strokes and serve from
// CMU motion capture; each clip for both facings (walks for four), with a matching shadow seen from
// straight above. Here they are instanced cards that step through those frames, plus a real ball on
// a real arc.
//
// A point: serve (ball toss, contact), then shots on a gravity arc that clear the net, bounce on
// clay or hard court and are met by the other player, who split-steps as it is struck, side-steps
// (or strafes, for a wide ball) across in time and starts the forehand or backhand so its contact
// frame meets the ball. After a few shots one goes long or into the net; both players walk to their
// places for the next point (deuce or ad side), and the next serve follows. Hits "pock" through the
// ambient sound bed, louder when the court is near the middle of the view.
//
// Row 181 (motion): the players move like people, not like counters on a board. Footwork has mass
// (accelerates, brakes, arrives a moment early), the clip and its playback rate follow the speed
// actually travelled (no sliding feet, no clip flickering at a threshold), every change of clip is a
// short cross-fade from the pose on screen (a stroke's last frame stays where its body was, so the
// step of the follow-through no longer pops), and nobody is ever moved to the ball: balls are aimed
// within reach and the player swings from where they stand. The serve starts with a few bounces of
// the ball and flows from the set stance into the wind-up; strokes play at 40 fps.
//
// Round 9 (row 1): footwork re-rendered at 30 fps (render_player_moves.py): a low defensive shuffle
// for short moves (CMU 78_26, feet never cross) instead of the goalkeeper side-steps, a real run in
// eight headings for wide balls (run out, then shuffle into the stance), walks in eight headings. The
// body turns through those headings at a human rate (no 90° snaps). Between points (rows 25, 29, 31):
// a ball in the net is picked up and fed over to the server; now and then a shank flies over the side
// fence and the hitter walks out through the gate to fetch it; at the club's last hour one court
// finishes: one player leaves, the other sits on the bench, towels off and goes, and its lights go
// out. Row 32: double-click a player and the camera follows them for a while (life/follow-cam.js).
//
// Round 10 (row 1): a court's hour has a shape now (life/player-routine.js): a warm-up, games with a
// varied tempo and length, breaks between points (a chat across the net, a drink, balls gathered, a
// stroll, standing easy in a relaxed stance) and a changeover every few points where both sit,
// towel off, drink and swap ends. Turns ease out, and between points the players stand in the idle
// loop (weight shifting) instead of the athletic ready stance.

const DATA_URL = '/models/life/players.json';
// Phones and small GPUs get the half-size atlases (same json: rects are in 0..1).
const atlas = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;
// Zoomed-in LOD (row 149): one sharper atlas per variant (json `hi`), fetched only once the view is
// close enough that the shared atlas would be magnified, and only for the variants on screen.
// Released again after a while zoomed out.
const HI_GAIN = 0.9; // sharp atlas once the screen shows about the shared atlas' px per metre (retina: closer than ~50 m)
const HI_RELEASE = 30; // s zoomed out before the sharp atlases are dropped

const SLIDE = 0.48; // cards slide this far towards the camera so their lower edge clears the court

const G = 9.81;
const BALL_R = 0.034;
const BASELINE = 11.885;
const SINGLES = 4.115;
const SERVICE = 6.4;
export { RALLY_COURTS, rallyCourtsAt, rallyFilters };
const COURTS = RALLY_COURTS;
const SHADOW_STRENGTH = 0.62;
const WALK = 1.3; // m/s between points
const WALK_BACK = 0.85; // m/s backing up facing the net
const SPLIT = 'split';
const STROKES = new Set(['forehand', 'backhand', 'serve']);
// Row 181: footwork with mass. vmax / acc / dec in m/s, m/s²; min: the pace when there is time to spare.
const RALLY = { vmax: 5.2, acc: 7, dec: 9, min: 1.6 };
const FORWARD = { ...RALLY, vmax: 3 }; // the walk cycle at its fastest
const STROLL = { vmax: WALK, acc: 1.8, dec: 2.4, min: WALK };
const BACKING = { vmax: WALK_BACK, acc: 1.4, dec: 2, min: WALK_BACK };
const SHANK_P = 0.1; // row 29: share of missed shots that fly over the side fence
const EARLY = 0.12; // s: in a rally they aim to be set this long before the backswing
const REACT = 0.2; // s after the opponent's contact: the split step lands, the first step goes
const BLEND = 0.16; // s cross-fade between clips
const TURN = 0.3; // s when the facing changes too (reads as a turn)
const STOP = [0.16, 0.32]; // m/s: a mover below the first stands still; one standing starts above the second
const SIN = Math.sin(PITCH); // a step towards the camera shows this much lower in the card's plane
// Round 9: headings h0..h7, clockwise from 'away' (−z); the body turns through them at TURN_RATE.
const H8 = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'];
const TURN_RATE = 7; // rad/s: a quick but human turn
const TURN_STEP = 0.12; // s cross-fade between neighbouring headings
const RUN_FROM = 3.2; // m: a move longer than this is run (then shuffled into the stance)
const headingOf = (vx, vz) => Math.atan2(vx, -vz); // rad clockwise from 'away'
const sector = (a) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** How far a player can get in T seconds from standing (accelerating, then at top speed). */
const reach = (T, m = RALLY) => (T <= 0 ? 0 : T <= m.vmax / m.acc ? 0.5 * m.acc * T * T : m.vmax * T - (m.vmax * m.vmax) / (2 * m.acc));
const rand = (a, b) => a + Math.random() * (b - a);
const OLD = import.meta.env.DEV && location.search.includes('oldmoves'); // dev: the round 9 behaviour, for before / after shots

// --- Ball flight ----------------------------------------------------------------------------

/** Launch from p with velocity v at time t: position later, with bounces on the court plane. */
function flight(p, v, t, ground) {
  return { p: p.clone(), v: v.clone(), t, ground, bounces: [] };
}

function ballAt(f, time, out) {
  // Walk the bounces (each restarts the parabola from the contact point).
  let { p, v, t } = f;
  for (const b of f.bounces) {
    if (time < b.t) break;
    ({ p, v, t } = b);
  }
  const dt = time - t;
  out.set(p.x + v.x * dt, p.y + v.y * dt - 0.5 * G * dt * dt, p.z + v.z * dt);
  return out;
}

/** Times and states of the next `n` bounces of a flight (clay keeps ~60% of the height speed). */
function addBounces(f, n, keep = 0.6, slide = 0.66) {
  let { p, v, t } = f.bounces.length ? f.bounces[f.bounces.length - 1] : f;
  keep *= 0.85 ** f.bounces.length;
  for (let i = 0; i < n; i++) {
    const a = 0.5 * G;
    const b = -v.y;
    const c = Math.min(0, -(p.y - (f.ground + BALL_R)));
    const dt = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    const tb = t + dt;
    const pb = new THREE.Vector3(p.x + v.x * dt, f.ground + BALL_R, p.z + v.z * dt);
    const vin = v.y - G * dt;
    const vb = new THREE.Vector3(v.x * slide, -vin * keep, v.z * slide);
    f.bounces.push({ p: pb, v: vb, t: tb });
    p = pb; v = vb; t = tb;
    keep *= 0.85;
  }
  return f;
}

/** Round 9: the ball comes to rest after the last bounce of `f` (rolls out its hop); returns where. */
function settle(f) {
  const last = f.bounces.length ? f.bounces[f.bounces.length - 1] : f;
  const a = 0.5 * G;
  const b = -last.v.y;
  const c = Math.min(0, -(last.p.y - (f.ground + BALL_R)));
  const dt = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  const p = new THREE.Vector3(last.p.x + last.v.x * dt, f.ground + BALL_R, last.p.z + last.v.z * dt);
  f.bounces.push({ p, v: new THREE.Vector3(), t: last.t + dt, rest: true });
  return p;
}

/** Row 25: a ball struck too low hits the net, drops and stays by it on the hitter's side. */
function netStop(f, c) {
  const t = f.t + (c.z - f.p.z) / f.v.z;
  const at = ballAt(f, t, new THREE.Vector3());
  if (!(t > f.t) || at.y > c.y + 1.0) return null;
  const s = -Math.sign(f.v.z);
  f.bounces = f.bounces.filter((b) => b.t < t);
  f.bounces.push({ p: new THREE.Vector3(at.x, Math.max(at.y, c.y + BALL_R), c.z + s * 0.06), v: new THREE.Vector3(f.v.x * 0.12, -0.4, s * 0.55), t });
  addBounces(f, 3, 0.35, 0.45);
  return settle(f);
}

/** Row 29: the path between two courts' fences on the hitter's side (edge courts: towards their neighbour). */
function gapX(c, x) {
  if (c.x < -10) return c.x + 9.5;
  if (c.x > 50) return c.x - 9.5;
  return x < c.x ? c.x - 9.5 : c.x + 9.5;
}
/** The gate in the fence on the corridor side, and the corridor's middle (z = 0). */
const gateZ = (c) => c.z - Math.sign(c.z) * 17.42;

/** Velocity that leaves `from` and lands on `to` (court level) after `T` seconds. */
function aimed(from, to, T, ground) {
  return new THREE.Vector3(
    (to.x - from.x) / T,
    (ground + BALL_R - from.y + 0.5 * G * T * T) / T,
    (to.z - from.z) / T,
  );
}

// --- System ---------------------------------------------------------------------------------

export function createPlayers({ scene, rig, camera, renderer, courtSurface, quality, floodlights }, { still }) {
  if (still) return null;
  const sys = { name: 'players', ready: false, tick: () => false };
  // Round 7: `bp-hour` (hour-state.js) moves the rallies onto the courts booked at that hour.
  let pending = hourState.dayKey ? rallyCourtsAt(hourState.dayKey, hourState.hour) : null;
  sys.setHour = (dayKey, hour) => {
    pending = withForced(rallyCourtsAt(dayKey, hour));
    sys.setCourts?.(pending);
  };
  document.addEventListener('bp-hour', (e) => sys.setHour(e.detail.dayKey, e.detail.hour));
  // Round 7 (life/tournament.js): one court can keep a rally whatever the hour, and a listener hears
  // its points: onPoint(id, (nearWon) => endsGame), the serve changes when it returns true.
  let forced = null;
  const withForced = (ids) => (forced ? [forced, ...ids.filter((id) => id !== forced)].slice(0, 4) : ids);
  const points = new Map();
  sys.forceCourt = (id) => {
    forced = id;
    pending = withForced(hourState.dayKey ? rallyCourtsAt(hourState.dayKey, hourState.hour) : COURTS);
    sys.setCourts?.(pending);
  };
  sys.onPoint = (id, fn) => { if (fn) points.set(id, fn); else points.delete(id); };

  Promise.all([
    fetch(DATA_URL).then((r) => r.json()),
    loadAtlas(atlas('players', quality)),
    loadAtlas(atlas('players-shadow', quality)),
  ]).then(([data, bodyTex, shadowTex]) => {
    sys.atlas = { data, bodyTex, shadowTex }; // round 8: life/lessons.js draws its students from the same atlas
    Object.assign(sys, build(data, bodyTex, shadowTex));
    sys.ready = true;
    if (!pending) { const slot = clubSlot(); if (!isOpenHour(slot.dayKey, slot.hour)) pending = []; } // live clock outside club hours: nobody on court
    if (pending) sys.setCourts(pending);
  }).catch((err) => console.warn('Players failed', err));

  function build(data, bodyTex, shadowTex) {
    const courts = COURTS.map((id) => courtSurface(id)).filter(Boolean);
    const n = courts.length * 2;
    const bodies = spriteMesh(bodyTex, n);
    bodies.name = 'life_players';
    const shadows = spriteMesh(shadowTex, n, { ground: true, shadow: true });
    shadows.name = 'life_players_shadow';
    shadows.renderOrder = 1;

    const ballGeo = new THREE.SphereGeometry(BALL_R, 10, 8);
    const balls = new THREE.InstancedMesh(ballGeo, gradeLife(new THREE.MeshStandardMaterial({ color: 0xc9d93a, roughness: 0.85 })), courts.length);
    const ballShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(BALL_R * 1.1, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), courts.length);
    for (const o of [balls, ballShadows]) {
      o.frustumCulled = false;
      o.layers.set(LIFE_LAYER);
      o.userData.noAO = true;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    ballShadows.renderOrder = 1;
    scene.add(bodies, shadows, balls, ballShadows);

    const variants = Object.keys(data.frames);

    // --- Zoomed-in LOD ---
    const hi = quality !== 'low' && data.hi ? data.hi : null;
    const hiBody = hi ? hi.rects.map((r, i) => [...r, ...data.body[i].slice(4)]) : null;
    const hiSets = {}; // variant → { mesh, state: 'loading' | 'ready' }
    let hiOffSince = 0;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const hiWanted = () => hi && (innerHeight * renderer.getPixelRatio()) / (2 * rig.state.dist * halfTan) > hi.farPpm * HI_GAIN;
    function hiSet(variant) {
      let set = hiSets[variant];
      if (!set) {
        set = hiSets[variant] = { state: 'loading', mesh: null };
        loadAtlas(hi.atlases[variant]).then((tex) => {
          if (hiSets[variant] !== set) { tex.dispose(); return; }
          set.mesh = spriteMesh(tex, n);
          set.mesh.name = `life_players_hi_${variant}`;
          for (let k = 0; k < n; k++) hideFrame(set.mesh, k);
          scene.add(set.mesh);
          set.state = 'ready';
        }).catch((err) => console.warn('Players LOD failed', err));
      }
      return set.state === 'ready' ? set : null;
    }
    function hiRelease() {
      for (const [v, set] of Object.entries(hiSets)) {
        if (set.mesh) {
          scene.remove(set.mesh);
          set.mesh.material.map.dispose();
          set.mesh.material.dispose();
          set.mesh.geometry.dispose();
        }
        delete hiSets[v];
      }
    }
    const onScreen = (p) => {
      const s = rig.screenOf(p.x, p.z);
      return s.x > -120 && s.x < innerWidth + 120 && s.y > -200 && s.y < innerHeight + 120;
    };
    const random = rng(95);
    const games = courts.map((c, k) => makeGame(c, k));
    const m4 = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    const sun = new THREE.Vector3(0.7009, 0.5, 0.5086).normalize();

    function makePlayer(court, near, k) {
      return {
        court,
        near,
        home: near ? 'away' : 'toward', // facing the net
        facing: near ? 'away' : 'toward', // the sprite set in use (walks turn left / right)
        fwd: near ? -1 : 1, // z direction they face
        right: near ? 1 : -1, // x direction of their right hand
        variant: variants[(k * 2 + (near ? 0 : 1) + Math.floor(random() * 3)) % variants.length],
        x: court.x + rand(-1, 1),
        z: court.z + (near ? 1 : -1) * (BASELINE + 0.4),
        clip: 'ready',
        clipT: rand(0, 2), // clip time (s)
        rate: 1, // playback rate of a looping clip (follows the ground speed)
        vx: 0, // m/s
        vz: 0,
        from: null, // the clip being cross-faded out: { clip, facing, t, rate, x, z, at, dur }
        stroke: null, // { clip, start, len?, target?, contactAt?, then? }
        goal: null, // { x, z, by?, walk?, back?, min?, run?, pass? }
        heading: near ? 0 : Math.PI, // round 9: rad clockwise from 'away'; the body turns through it
        path: null, // round 9: waypoints walked one after the other (out through the gate and back)
        slot: 0,
        pace: OLD ? 1 : rand(0.88, 1.12), // round 10: each player has their own tempo (footwork, breathing, reaction)
        react: rand(-0.04, 0.1), // s later (or earlier) than the average into the split step
      };
    }

    function makeGame(court, k) {
      const near = makePlayer(court, true, k);
      const far = makePlayer(court, false, k);
      const game = { log: [], court, players: [near, far], ball: null, server: k % 2 ? near : far, deuce: true, shots: 0, maxShots: 0, next: performance.now() / 1000 + rand(0.5, 6), idx: k };
      places(game, 0, true);
      return game;
    }

    function other(game, p) { return game.players[0] === p ? game.players[1] : game.players[0]; }

    /**
     * Where both stand for the next point: the server just behind the baseline on the deuce or ad
     * side, the receiver diagonally across. They walk there (or, on the first point, start there).
     */
    function places(game, now, jump = false) {
      const s = game.server;
      const r = other(game, s);
      const c = game.court;
      const side = game.deuce ? 1 : -1;
      game.side = side;
      const spots = [
        [s, c.x + s.right * side * rand(0.6, 1.2), c.z + (s.near ? 1 : -1) * (BASELINE + 0.25)],
        [r, c.x - s.right * side * rand(2.2, 2.9), c.z + (r.near ? 1 : -1) * (BASELINE + rand(0.4, 0.9))],
      ];
      for (const [p, x, z] of spots) {
        p.plan = null;
        p.spot = { x, z };
        p.wantHeading = null;
        if (jump) { p.x = x; p.z = z; p.goal = null; continue; }
        // A few steps back to the baseline are taken backwards, facing the net (row 181: decided once
        // per walk, not every frame).
        const dz = z - p.z;
        p.goal = { x, z, walk: true, back: dz * p.fwd < 0 && Math.hypot(x - p.x, dz) < 4 && Math.abs(x - p.x) < Math.abs(dz) * 1.2 };
      }
    }

    // --- Planning ---

    const fpsOf = (clip) => data.clips[clip].fps ?? data.fps;
    function frameCount(clip) { return data.clips[clip].frames; }
    function contactTime(clip) { return data.clips[clip].contact / fpsOf(clip); }
    function clipLength(clip) { return frameCount(clip) / fpsOf(clip); }

    /** Plan where and when `p` meets the ball of flight `f` (after its first bounce). */
    function meet(game, p, f) {
      // The ball comes down through ~0.9 m after the bounce (or is taken at its peak if lower).
      const b = f.bounces[0];
      const peakT = b.v.y / G;
      const peakY = b.p.y + b.v.y * peakT - 0.5 * G * peakT * peakT;
      let dt = peakT;
      if (peakY > 0.95) {
        const a = 0.5 * G; const bb = -b.v.y; const c = 0.95 - b.p.y;
        dt = (-bb + Math.sqrt(bb * bb - 4 * a * c)) / (2 * a);
      }
      // …but nobody backs up more than a step behind the baseline: take it earlier, on the rise.
      const zBack = game.court.z + (p.near ? 1 : -1) * (BASELINE + 0.9);
      const tz = (zBack - b.p.z) / b.v.z;
      // A ball that bounces deep is taken straight off the bounce (a half volley), never chased.
      const t = b.t + (tz > 0 ? Math.max(0.14, Math.min(dt, tz)) : 0.1);
      const pos = ballAt(f, t, new THREE.Vector3());
      const forehand = (pos.x - p.x) * p.right > -0.2;
      const clip = forehand ? 'forehand' : 'backhand';
      // Stand so the contact point is beside and a little ahead of the body.
      const x = pos.x - p.right * (forehand ? 0.85 : -0.85);
      const z = pos.z - p.fwd * 0.45;
      // Stay on their own end of the court, whatever the ball does.
      const base = game.court.z + (p.near ? 1 : -1) * BASELINE;
      const plan = {
        t, pos, clip,
        x: THREE.MathUtils.clamp(x, game.court.x - SINGLES - 3, game.court.x + SINGLES + 3),
        z: p.near ? THREE.MathUtils.clamp(z, base - 4, base + 2.5) : THREE.MathUtils.clamp(z, base - 2.5, base + 4),
      };
      // Row 181: where the stance had to be clamped, the bounce sends the ball to the racket instead
      // (a bounce is where a ball's path may change; nothing pulls the player to the ball any more).
      if (plan.x !== x || plan.z !== z) {
        const b0 = f.bounces[0];
        const dt = t - b0.t;
        const to = new THREE.Vector3(pos.x + plan.x - x, pos.y, pos.z + plan.z - z);
        if (dt > 0.08) {
          b0.v.set((to.x - b0.p.x) / dt, (to.y - b0.p.y + 0.5 * G * dt * dt) / dt, (to.z - b0.p.z) / dt);
          f.bounces.length = 1;
          addBounces(f, 3);
          plan.pos = to;
        }
      }
      return plan;
    }

    function strike(game, hitter, now) {
      const opp = other(game, hitter);
      const c = game.court;
      game.shots++;
      const from = game.ball ? ballAt(game.ball, now, new THREE.Vector3()) : hitter.contactPos.clone();
      const miss = game.shots >= game.maxShots;
      const side = Math.sign(opp.z - c.z); // the half the ball goes to
      let to;
      let T;
      // Row 29: now and then a mishit flies over the side fence (never on the tournament court).
      const forced = import.meta.env.DEV ? devMiss : null; // headless checks: __bp.lifeDev().players.devMiss('net' | 'shank')
      const shank = miss && !points.has(c.id) && (forced ? forced === 'shank' : game.shots > 2 && Math.random() < SHANK_P);
      const netMiss = miss && !shank && (forced ? forced === 'net' : Math.random() < 0.5);
      if (shank) {
        to = new THREE.Vector3(gapX(c, hitter.x), 0, THREE.MathUtils.clamp(hitter.z + rand(-4, 2) * (hitter.near ? -1 : 1), c.z - 15, c.z + 15));
        T = rand(1.9, 2.2);
      } else if (netMiss) {
        // Into the net: aim at the tape from too low.
        to = new THREE.Vector3(c.x + rand(-3, 3), 0, c.z + side * 3);
        T = 0.75;
      } else if (miss) {
        to = new THREE.Vector3(c.x + rand(-4.5, 4.5), 0, c.z + side * (BASELINE + rand(0.6, 2.2)));
        T = rand(1.05, 1.3);
      } else {
        // In: deep-ish, within reach of the other player.
        const reach = 2.4 * 1.5;
        const x = THREE.MathUtils.clamp(opp.x + rand(-reach, reach) + opp.right * 0.85 * (Math.random() < 0.6 ? 1 : -1), c.x - SINGLES + 0.5, c.x + SINGLES - 0.5);
        to = new THREE.Vector3(x, 0, c.z + side * rand(BASELINE - 6.5, BASELINE - 2.2));
        T = rand(1.0, 1.25);
      }
      if (!netMiss && !shank) T *= game.tempo ?? 1; // round 10: a slow, loopy rally or a brisk one
      const T0 = T;
      const v = aimed(from, to, T, c.y);
      // Clear the net (0.914 m in the middle, a ball's width more for safety) unless this is the net error.
      const tNet = (c.z - from.z) / v.z;
      const yNet = from.y + v.y * tNet - 0.5 * G * tNet * tNet;
      if (!netMiss && !shank && yNet < c.y + 1.15) {
        const extra = (c.y + 1.15 - yNet) / tNet + 0.5 * G * tNet; // more lift, a little slower
        v.y += extra / 2;
        v.x *= 0.92; v.z *= 0.92;
      }
      game.ball = addBounces(flight(from, v, now, c.y), 4);
      game.netBall = netMiss ? netStop(game.ball, c) : null; // row 25: it stays by the net, to be picked up
      if (shank) {
        game.ball = flight(from, v, now, 0); // lands outside, on the path (ground level)
        addBounces(game.ball, 2, 0.45, 0.15);
        const at = settle(game.ball);
        at.x = THREE.MathUtils.clamp(at.x, to.x - 0.45, to.x + 0.45); // it stays on the path between the fences
        game.fetch = { at, by: hitter };
      }
      // Row 181: a ball the other player could not run down in time is aimed a little closer to them
      // (they used to be carried to it in a single frame).
      for (let k = 0; k < 3 && !miss; k++) {
        const plan = meet(game, opp, game.ball);
        const T = plan.t - contactTime(plan.clip) - now - REACT - EARLY;
        const d = Math.hypot(plan.x - opp.x, plan.z - opp.z);
        const can = reach(T) * 0.7 + 0.2; // + a little slide into the backswing
        if (d <= can) break;
        to.x += (opp.x - to.x) * Math.min(1, ((d - can) * 1.15) / Math.max(0.5, Math.abs(opp.x - to.x)));
        const v2 = aimed(from, to, T0, c.y);
        v.copy(v2);
        const tNet2 = (c.z - from.z) / v.z;
        const yNet2 = from.y + v.y * tNet2 - 0.5 * G * tNet2 * tNet2;
        if (yNet2 < c.y + 1.15) { v.y += ((c.y + 1.15 - yNet2) / tNet2 + 0.5 * G * tNet2) / 2; v.x *= 0.92; v.z *= 0.92; }
        game.ball = addBounces(flight(from, v, now, c.y), 4);
      }
      if (import.meta.env.DEV) game.log.push(`${now.toFixed(2)} hit#${game.shots} by ${hitter.near ? 'near' : 'far'} miss=${miss} from ${from.x.toFixed(1)},${from.y.toFixed(2)},${from.z.toFixed(1)} T=${T.toFixed(2)} bounce ${game.ball.bounces[0].t.toFixed(2)}@${game.ball.bounces[0].p.z.toFixed(1)}`);
      playHit(c, 1);
      // The receiver split-steps as the ball is struck, then reads it.
      splitStep(opp, now);
      if (!miss) {
        const plan = meet(game, opp, game.ball);
        opp.plan = plan;
        opp.goal = { x: plan.x, z: plan.z, by: plan.t - contactTime(plan.clip), run: Math.hypot(plan.x - opp.x, plan.z - opp.z) > RUN_FROM };
        if (import.meta.env.DEV) game.log.push(`  plan ${opp.near ? 'near' : 'far'} ${plan.clip} t=${plan.t.toFixed(2)} at ${plan.x.toFixed(1)},${plan.z.toFixed(1)} ball y ${plan.pos.y.toFixed(2)} from x ${opp.x.toFixed(1)}`);
      } else {
        opp.plan = null;
        game.pointOver = now + T + 2.2;
        game.winner = opp;
      }
      // The hitter recovers towards the middle once the stroke is done (row 181: unhurried, and the
      // follow-through is cut a little short to start the first step).
      hitter.goal = { x: c.x + rand(-0.6, 0.6), z: c.z + (hitter.near ? 1 : -1) * (BASELINE + 0.5), min: 2.4 };
    }

    function serve(game, now) {
      const s = game.server;
      const c = game.court;
      game.shots = 0;
      game.maxShots = (game.session?.warm ?? 0) > 0 ? 8 + Math.floor(Math.random() * 7) : Math.random() < 0.12 ? 9 + Math.floor(Math.random() * 8) : 2 + Math.floor(Math.random() * 7);
      game.ball = null;
      game.pointOver = 0;
      game.bouncing = false;
      // Both are in place (places()), the ball has been bounced (startServe): the toss and the serve.
      s.goal = null;
      s.stroke = { clip: 'serve', start: now };
      switchClip(s, 'serve', s.home, now, BLEND);
      // Toss: from the left hand up to just above the reach, met at the contact frame.
      const tc = now + contactTime('serve');
      s.contactPos = new THREE.Vector3(s.x + s.right * 0.25, c.y + 2.7, s.z + s.fwd * 0.35);
      // Row 181: the ball leaves the hand as the tossing arm nears the top (json `hand`), and sits in
      // that hand until then.
      const hand = data.clips.serve.hand;
      let from = null;
      let tr = 0;
      if (hand) {
        const ci = data.clips.serve.contact;
        const top = Math.max(...hand.slice(0, ci).map((h) => h[2]));
        const k = hand.findIndex((h, i) => i < ci && h[2] >= top - 0.25);
        if (k >= 0) { tr = now + k / fpsOf('serve'); from = handPoint(s, 'serve', k / fpsOf('serve'), new THREE.Vector3()); }
      }
      if (!from) {
        tr = now + 0.04; // thrown as the racket arm starts back
        from = new THREE.Vector3(s.x - s.right * 0.25, c.y + 1.45, s.z + s.fwd * 0.3);
      }
      const tossT = tc - tr;
      const v = new THREE.Vector3((s.contactPos.x - from.x) / tossT, (s.contactPos.y - from.y + 0.5 * G * tossT * tossT) / tossT, (s.contactPos.z - from.z) / tossT);
      game.toss = { f: flight(from, v, tr, c.y), until: tc, from: tr };
      game.serveAt = tc;
      game.deuce = !game.deuce;
    }

    /** Row 181: before the serve the server bounces the ball two to four times, then serves. */
    function startServe(game, now) {
      const s = game.server;
      for (const p of game.players) p.relax = false;
      if (!data.clips.bounce || !data.frames[s.variant][`bounce|${s.home}`]) { serve(game, now); return; }
      const n = 2 + Math.floor(Math.random() * 3);
      s.goal = null;
      s.stroke = { clip: 'bounce', start: now, len: n * clipLength('bounce'), then: (t) => serve(game, t) };
      switchClip(s, 'bounce', s.home, now, TURN);
      game.bouncing = true;
      game.bounceHeard = -1;
    }

    function serveShot(game, now) {
      const s = game.server;
      const c = game.court;
      const side = s.near ? -1 : 1;
      const fault = Math.random() < 0.12;
      // Cross-court into the service box diagonally opposite the server.
      const to = new THREE.Vector3(c.x - s.right * game.side * rand(0.6, 3.6), 0, c.z + side * (fault ? SERVICE + rand(0.3, 1.5) : rand(SERVICE - 3.5, SERVICE - 0.4)));
      const from = ballAt(game.toss.f, now, new THREE.Vector3());
      const T = rand(0.62, 0.78);
      const r = other(game, s);
      let v = aimed(from, to, T, c.y);
      game.ball = addBounces(flight(from, v, now, c.y), 4);
      // Row 181: a serve the receiver can get to (still inside the box): see strike().
      for (let k = 0; k < 3 && !fault && game.maxShots > 1; k++) {
        const plan = meet(game, r, game.ball);
        const left = plan.t - contactTime(plan.clip) - now - REACT - EARLY;
        const d = Math.hypot(plan.x - r.x, plan.z - r.z);
        const can = reach(left) * 0.7 + 0.2;
        if (d <= can) break;
        to.x = THREE.MathUtils.clamp(to.x + (plan.x > r.x ? -1 : 1) * (d - can) * 1.15, c.x - SINGLES + 0.2, c.x + SINGLES - 0.2);
        v = aimed(from, to, T, c.y);
        game.ball = addBounces(flight(from, v, now, c.y), 4);
      }
      game.toss = null;
      playHit(c, 1.1);
      game.shots = 1;
      splitStep(r, now);
      if (fault || game.maxShots <= 1) {
        game.pointOver = now + T + 2;
        game.winner = fault ? r : s;
        r.plan = null;
      } else {
        const plan = meet(game, r, game.ball);
        r.plan = plan;
        r.goal = { x: plan.x, z: plan.z, by: plan.t - contactTime(plan.clip), run: Math.hypot(plan.x - r.x, plan.z - r.z) > RUN_FROM };
      }
    }

    function playHit(c, level) {
      const v = rig.state;
      const d = Math.hypot(c.x - v.x, c.z - v.z);
      const loud = THREE.MathUtils.clamp(1 - d / 70, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2) * level;
      if (loud < 0.05) return;
      const s = rig.screenOf(c.x, c.z);
      courtHit(loud, THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.8, 0.8));
    }

    // --- Between points (round 9: rows 25, 29, 31) ---

    /** Waypoints from p's end of the court out through the gate to the corridor between the rows
     *  (round the net post first when the gate is in the other half). */
    function toCorridor(c, p) {
      const gz = gateZ(c);
      const s = Math.sign(gz - c.z);
      const pts = [];
      const half = Math.sign(p.z - c.z) || 1;
      // round the nearer net post (on the +x side behind the umpire's chair and the benches)
      const px = p.x > c.x + 3 ? c.x + 7.7 : c.x - 7;
      if (half !== s) pts.push({ x: px, z: c.z + half * 1.4 }, { x: px, z: c.z - half * 1.4 });
      pts.push({ x: c.x, z: gz - s * 1.2 }, { x: c.x, z: gz + s * 0.9 }, { x: c.x, z: gz + s * 2.0 });
      return pts;
    }

    /** Bends down for a ball: the pickup clip seen from `facing`; the ball leaves the court at its grab frame. */
    function pickup(game, p, now, facing, then) {
      if (!has(p, 'pickup', facing)) { game.ball = null; then(now); return; }
      p.wantHeading = null;
      p.heading = { away: 0, toward: Math.PI }[facing] ?? p.heading;
      p.stroke = { clip: 'pickup', start: now, then };
      switchClip(p, 'pickup', facing, now, BLEND);
      game.chore.grabAt = now + (data.clips.pickup.grab ?? 20) / fpsOf('pickup');
      game.chore.grabFacing = facing;
    }

    /** Row 25: the ball in the net is picked up by the player on its side and fed over to the server. */
    function startCollect(game, now) {
      const c = game.court;
      const at = game.netBall;
      const p = game.players.find((q) => Math.sign(q.z - c.z) === Math.sign(at.z - c.z)) ?? game.players[0];
      game.chore = { kind: 'collect', p };
      p.plan = null;
      p.goal = null;
      p.path = [{ x: at.x + p.right * 0.14, z: at.z - p.fwd * 0.42, stop: true, then: (t) => pickup(game, p, t, p.home, (t2) => afterPickup(game, p, t2)) }];
    }

    function afterPickup(game, p, now) {
      const r = other(game, p);
      if (p === game.server || !has(p, 'feed', p.home)) {
        // Their serve next: the ball goes in the pocket.
        game.held = null;
        game.ball = null;
        game.chore = null;
        p.path = [p.spot];
        return;
      }
      p.stroke = { clip: 'feed', start: now, then: () => { p.path = [p.spot]; } };
      switchClip(p, 'feed', p.home, now, BLEND * 0.6);
      const fc = data.clips.feed;
      const fps = fpsOf('feed');
      Object.assign(game.chore, { kind: 'feed', dropAt: now + (fc.drop ?? 15) / fps, hitAt: now + (fc.contact ?? 23) / fps, to: r });
    }

    /** Row 29: the hitter walks out through the gate, along the path to the ball, and back. */
    function startFetch(game, now) {
      const c = game.court;
      const { at, by: p } = game.fetch;
      const out = toCorridor(c, p);
      const zc = out[out.length - 1].z;
      const dir = Math.sign(at.z - zc) || 1;
      const facing = dir > 0 ? 'toward' : 'away';
      const stand = { x: at.x + (dir > 0 ? -1 : 1) * 0.14, z: at.z - dir * 0.42 };
      game.chore = { kind: 'fetch', p };
      p.plan = null;
      p.goal = null;
      const back = [{ x: at.x, z: zc }, ...[...out].reverse(), p.spot];
      p.path = [...out, { x: at.x, z: zc }, { ...stand, stop: true, then: (t) => pickup(game, p, t, facing, () => {
        game.chore = null;
        game.fetch = null;
        p.path = back;
      }) }];
    }

    /** Row 31: the club's last hour, one court finishes for the day. */
    const lastHour = () => { const h = hoursOn(hourState.dayKey ?? dayKeyForOffset(0)); return h[h.length - 1]; }; // the day's last booking start (weekends close earlier)
    function closing(game) {
      if (game.ended || hourState.hour !== lastHour() || points.has(game.court.id) || (game.played ?? 0) < 2) return false;
      return games.find((g) => !g.off) === game;
    }

    function startLeave(game, now) {
      const c = game.court;
      Object.assign(game, { ended: true, ball: null, netBall: null, fetch: null, held: null, chore: { kind: 'leave' } });
      const [a, b] = Math.random() < 0.5 ? game.players : [...game.players].reverse();
      const west = c.x > 19 ? 1 : -1; // along the corridor, away from the middle of the club
      for (const p of game.players) { p.plan = null; p.goal = null; }
      const outB = toCorridor(c, b);
      const zc = outB[outB.length - 1].z;
      b.path = [...outB, { x: c.x + west * 24, z: zc, then: () => { b.gone = true; } }];
      // The other one sits down on the bench on their half (benches stand on the +x side by the net).
      const bz = c.z + (Math.sign(a.z - c.z) || 1) * 2.6;
      const bx = c.x + 6.69 - 0.34;
      a.path = [{ x: bx - 1.1, z: bz + (Math.sign(a.z - c.z) || 1) * 0.6 }, { x: bx, z: bz, stop: true, then: () => {
        a.wantHeading = -Math.PI / 2; // facing the court (−x), the bench behind
        a.afterTurn = (t) => {
          if (!has(a, 'bench', 'h6')) { leaveCourt(game, a, t); return; }
          a.stroke = { clip: 'bench', start: t, then: (t2) => leaveCourt(game, a, t2) };
          switchClip(a, 'bench', 'h6', t, BLEND);
        };
      } }];
    }

    function leaveCourt(game, p, now) {
      const c = game.court;
      p.wantHeading = null;
      const out = toCorridor(c, p);
      const zc = out[out.length - 1].z;
      out[out.length - 2].then = () => floodlights?.hold?.(c.id, true); // through the gate: lights out
      p.path = [...out, { x: c.x + (c.x > 19 ? 1 : -1) * 24, z: zc, then: () => { p.gone = true; } }];
    }

    function choreTick(game, now) {
      const ch = game.chore;
      const c = game.court;
      if (ch.grabAt && now >= ch.grabAt) {
        ch.grabAt = 0;
        game.ball = null;
        game.netBall = null;
        // In the hand while it is drawn there (facing the net), else straight into the pocket.
        game.held = ch.kind === 'collect' && ch.grabFacing === ch.p.home ? ch.p : null;
      }
      if (ch.kind !== 'feed') return;
      const p = ch.p;
      if (ch.dropAt && now >= ch.dropAt) {
        ch.dropAt = 0;
        const from = handPoint(p, 'feed', now - p.stroke.start, new THREE.Vector3()) ?? new THREE.Vector3(p.x, c.y + 0.9, p.z);
        game.held = null;
        game.ball = flight(from, new THREE.Vector3(), now, c.y);
      }
      if (ch.hitAt && now >= ch.hitAt && game.ball) {
        ch.hitAt = 0;
        const from = ballAt(game.ball, now, new THREE.Vector3());
        const r = ch.to;
        const to = new THREE.Vector3(r.spot.x, 0, r.spot.z - r.fwd * 2.2);
        const T = 1.35;
        const v = aimed(from, to, T, c.y);
        const tN = (c.z - from.z) / v.z;
        const yN = from.y + v.y * tN - 0.5 * G * tN * tN;
        if (tN > 0 && yN < c.y + 1.4) v.y += (c.y + 1.4 - yN) / tN;
        game.ball = addBounces(flight(from, v, now, c.y), 1);
        ch.catchAt = game.ball.bounces[0].t + 0.42;
        playHit(c, 0.4);
      }
      if (ch.catchAt && now >= ch.catchAt) {
        game.ball = null;
        game.chore = null;
      }
    }

    // --- Per frame ---

    function splitStep(p, now) {
      if (!p.stroke && !p.goal?.walk) {
        p.stroke = { clip: SPLIT, start: now };
        switchClip(p, SPLIT, p.home, now, BLEND * 0.6);
      }
    }

    /** Clip of `kind` whose ground pace has the sign `dir` (to the player's right when +). */
    function lateralClip(kind, dir) {
      const a = `${kind}_r`;
      const b = `${kind}_l`;
      return Math.sign(data.clips[a].pace) === Math.sign(dir) ? a : b;
    }

    /**
     * Row 181: a change of clip cross-fades from the pose on screen. The clip going out keeps playing
     * (or holds its last frame) through the fade; `at` pins it to where its body was (a stroke's last
     * frame, before its travel moved the player), else it moves with the player.
     */
    function switchClip(p, clip, facing, now, dur, { t = 0, at = null } = {}) {
      if (clip === p.clip && facing === p.facing) return false;
      const w = p.from ? (now - p.from.at) / p.from.dur : 1;
      if (w < 0.5) {
        // Still mostly the old pose on screen: fade from it to the new clip instead.
        p.from.dur = dur;
        p.from.at = now - w * dur;
      } else {
        p.from = { clip: p.clip, facing: p.facing, t: p.clipT, rate: data.clips[p.clip].loop ? p.rate : 1, x: at?.x ?? null, z: at?.z ?? null, at: now, dur };
      }
      p.clip = clip;
      p.facing = facing;
      p.clipT = t;
      return true;
    }

    /**
     * Row 181: where to enter looping `clip`: at its frame whose silhouette (json `sig`) is most like
     * the frame on screen, so the cross-fade joins two look-alike poses.
     */
    const sigs = data.sig?.frames;
    function entryTime(p, clip, facing) {
      const list = data.frames[p.variant][`${clip}|${facing}`];
      const cur = sigs?.[p.shownIdx];
      if (!cur || !list) return 0;
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < list.length; k++) {
        const s2 = sigs[list[k][0]];
        let d = 0;
        for (let i = 0; i < cur.length; i++) d += Math.abs(cur.charCodeAt(i) - s2.charCodeAt(i));
        if (d < bd) { bd = d; best = k; }
      }
      return best / fpsOf(clip);
    }

    /** A looping clip at `rate`; between the side-steps and the strafe the stride carries on in phase. */
    function playLoop(p, clip, facing, rate, now, dt) {
      if (clip !== p.clip || facing !== p.facing) {
        // Round 9: the same cycle seen from the next heading (a turn) or the stride carried across
        // walk ↔ run keeps its phase: left foot stays left foot through the cross-fade.
        const cyc = /^(walk|run)$/;
        const turn = clip === p.clip && facing !== p.facing;
        const same = turn || (facing === p.facing && cyc.test(clip) && cyc.test(p.clip))
          || (facing === p.facing && clip.slice(-2) === p.clip.slice(-2) && /^(sidestep|strafe|shuffle)_/.test(clip) && /^(sidestep|strafe|shuffle)_/.test(p.clip));
        const t = same ? (((p.clipT / clipLength(p.clip)) % 1 + 1) % 1) * clipLength(clip) : entryTime(p, clip, facing);
        const neighbour = /^h\d$/.test(facing) && /^h\d$/.test(p.facing);
        switchClip(p, clip, facing, now, turn && neighbour ? TURN_STEP : facing === p.facing || neighbour ? BLEND : TURN, { t });
      }
      p.rate = THREE.MathUtils.clamp(rate, 0.5, 2);
      p.clipT += dt * p.rate;
    }

    /**
     * Round 10: a groundstroke is not played at one speed. The backswing takes its time (the racket
     * is drawn back, the weight loaded), speeds up into the contact and slows through the follow-
     * through; the contact still falls at the same moment. Serves stay as they are (the ball is tied to them).
     */
    function warp(clip, t, len) {
      if (OLD || (clip !== 'forehand' && clip !== 'backhand')) return t;
      const C = contactTime(clip);
      const L = Math.min(len, clipLength(clip));
      if (t <= C) return C * (t / C) ** 1.35;
      const y = Math.min(1, (t - C) / Math.max(0.01, L - C));
      return C + (L - C) * (1 - (1 - y) ** 1.5);
    }

    /** Brake towards standing still. */
    function brake(p, dt, dec = RALLY.dec) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp < 1e-4) { p.vx = p.vz = 0; return; }
      const k = Math.max(0, sp - dec * dt) / sp;
      p.vx *= k;
      p.vz *= k;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }

    /**
     * Row 181: moves `p` towards goal { x, z, by? } with mass: accelerates up to the pace the deadline
     * asks for (never below the mover's `min` when there is time to spare: get there, then wait),
     * brakes so as to stop on the spot. Returns true once there and still.
     */
    function steer(p, goal, now, dt, m0) {
      const k = p.pace;
      const m = { vmax: m0.vmax * k, acc: m0.acc * k, dec: m0.dec * k, min: m0.min * k };
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const dist = Math.hypot(dx, dz);
      const sp = Math.hypot(p.vx, p.vz);
      if (dist < 0.04 && sp < 0.25) { p.vx = p.vz = 0; return true; }
      if (goal.pass && dist < 0.5) return true; // round 9: a waypoint is walked through, not stopped at
      const left = goal.by ? Math.max(0.05, goal.by - now - (goal.walk ? 0 : EARLY)) : Infinity;
      let want = Math.max(goal.min ?? m.min, dist / left * 1.1);
      want = Math.min(want, m.vmax, goal.pass ? Infinity : Math.sqrt(2 * m.dec * Math.max(0, dist - 0.02)));
      const tx = (dx / Math.max(dist, 1e-4)) * want;
      const tz = (dz / Math.max(dist, 1e-4)) * want;
      let ax = tx - p.vx;
      let az = tz - p.vz;
      const da = Math.hypot(ax, az);
      const lim = (want > sp ? m.acc * (OLD ? 1 : 0.55 + 0.45 * Math.min(1, sp / 1.5)) : m.dec) * dt; // eases out of a standstill: the first step is a lean, not a jump
      if (da > lim) { ax *= lim / da; az *= lim / da; }
      p.vx += ax;
      p.vz += az;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      return false;
    }

    /** Round 9: does this player's set have `clip` seen from `facing`? */
    const has = (p, clip, facing) => !!data.frames[p.variant][`${clip}|${facing}`];
    // The stride lengths measured in Blender undercount the jog and the slide (their feet skid in the
    // mocap): the ground speeds their cycles were captured at, by eye against the court lines.
    const STRIDE = { run: 3.3, shuffle_l: 1.9, shuffle_r: 1.9 };
    const speedOf = (clip, fallback) => Math.max(Math.abs(data.clips[clip]?.speed || 0) || fallback, STRIDE[clip] ?? 0);
    const homeHeading = (p) => (p.near ? 0 : Math.PI);
    const routine = createRoutine({ has, switchClip, pickup, places, flight, toCorridor, BASELINE, BALL_R, BLEND, onTournament: (g) => points.has(g.court.id) });

    /** Round 9: the body turns towards `want` (rad) at a human rate. */
    function turnTo(p, want, dt) {
      const d = angDiff(want, p.heading);
      const step = Math.min(TURN_RATE, 0.9 + 4.2 * Math.abs(d)) * dt; // eases out into the new heading
      p.heading += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }

    /** A travelling clip seen from the heading the body is turned to (walk / run in eight headings). */
    function headed(p, clip, sp, fallbackSpeed) {
      const h = H8[sector(p.heading)];
      if (!has(p, clip, h)) {
        // Older atlas (four walk facings): the nearest of away / right / toward / left.
        const f = ['away', 'right', 'toward', 'left'][Math.round(sector(p.heading) / 2) % 4];
        return ['walk', f, sp / speedOf('walk', WALK)];
      }
      return [clip, h, sp / speedOf(clip, fallbackSpeed)];
    }

    /** The footwork clip for the way `p` is actually moving: [clip, facing, rate matched to the ground speed]. */
    function gait(p, standing, dt = 0) {
      let sp = Math.hypot(p.vx, p.vz);
      let { vx, vz } = p;
      // Setting off towards a goal: the first step already belongs to the gait, slowly.
      const gx = p.goal ? p.goal.x - p.x : 0;
      const gz = p.goal ? p.goal.z - p.z : 0;
      const gd = Math.hypot(gx, gz);
      if (gd > 0.3 && sp < STOP[1]) { vx = (gx / gd) * STOP[1]; vz = (gz / gd) * STOP[1]; sp = STOP[1] * 1.01; }
      const still = standing ? sp <= STOP[1] : sp <= STOP[0];
      const want = p.wantHeading ?? homeHeading(p);
      if (still) {
        // Standing but turned away from where they want to face: step round on the spot.
        turnTo(p, want, dt * 0.7);
        if (Math.abs(angDiff(want, p.heading)) > 0.3 && has(p, 'walk', 'h0')) return headed(p, 'walk', 0.55, WALK);
        p.heading = want;
        return [p.relax && has(p, 'idle', p.home) ? 'idle' : 'ready', p.home, p.pace];
      }
      if (p.goal?.walk) {
        // Between points: walking, turned the way they go (or backwards to the baseline).
        if (p.goal.back) { turnTo(p, homeHeading(p), dt); return ['walk_back', p.home, sp / Math.abs(data.clips.walk_back.speed || WALK_BACK)]; }
        turnTo(p, headingOf(vx, vz), dt);
        return sp > 2.3 && has(p, 'run', 'h0') ? headed(p, 'run', sp, 3.5) : headed(p, 'walk', sp, WALK);
      }
      // In the rally. A long move is run, turned the way they go; the last metre is shuffled in.
      const running = has(p, 'run', 'h0') && p.goal?.run && gd > (p.clip === 'run' ? 0.7 : 1.2) && sp > (p.clip === 'run' ? 1.2 : 1.8);
      if (running) {
        turnTo(p, headingOf(vx, vz), dt);
        return headed(p, 'run', sp, 3.5);
      }
      turnTo(p, homeHeading(p), dt);
      if (Math.abs(angDiff(homeHeading(p), p.heading)) > 0.4 && has(p, 'run', 'h0')) return headed(p, sp > 1.6 ? 'run' : 'walk', sp, sp > 1.6 ? 3.5 : WALK);
      p.heading = homeHeading(p);
      // Facing the net: shuffles sideways, forward or back walks.
      const lat = vx * p.right;
      const fw = vz * p.fwd;
      const backs = p.clip === 'walk_back' ? 1.35 : /^(shuffle|sidestep|strafe)_/.test(p.clip) ? 0.6 : 1.1;
      if (Math.abs(fw) > Math.abs(lat) * 1.4 && (fw > 0 || sp < backs)) {
        const clip = fw > 0 ? 'walk' : 'walk_back';
        const facing = clip === 'walk' && !has(p, 'walk', p.home) ? H8[sector(homeHeading(p))] : p.home;
        return [clip, facing, Math.abs(fw) / speedOf(clip, 1)];
      }
      const toward = Math.abs(lat) > 0.15 ? lat : p.clip.endsWith('_l') ? -1 : 1;
      const kind = data.clips.shuffle_r ? 'shuffle' : sp > 2.5 ? 'strafe' : 'sidestep';
      const clip = lateralClip(kind, toward);
      return [clip, p.home, sp / Math.max(Math.abs(data.clips[clip].pace || 1), STRIDE[clip] ?? 0)];
    }

    function footwork(p, now, dt) {
      const [clip, facing, rate] = gait(p, p.clip === 'ready', dt);
      playLoop(p, clip, facing, rate, now, dt);
    }

    function endStroke(p, now) {
      const s = p.stroke;
      const [tr, tf] = data.clips[s.clip].travel;
      const at = { x: p.x, z: p.z }; // the last frame stays where it was drawn
      p.x += tr * p.right;
      p.z += tf * p.fwd;
      p.stroke = null;
      if (s.then) { p.from = null; s.then(now); return; }
      // Straight into the footwork the moment asks for (a split step lands into the first step).
      const [clip, facing, rate] = gait(p, false);
      switchClip(p, clip, facing, now, BLEND * 1.25, { at, t: entryTime(p, clip, facing) });
      p.rate = THREE.MathUtils.clamp(rate, 0.6, 2.2);
    }

    function updatePlayer(game, p, now, dt) {
      if (p.from) {
        if (now - p.from.at >= p.from.dur) p.from = null;
        else p.from.t += dt * (data.clips[p.from.clip].loop ? p.from.rate : 1);
      }
      // A stroke (the split step, the ball bounce) owns the body until it ends; a planned swing cuts a
      // split short, a split hands over to the first step once it lands, and a stroke's
      // follow-through is cut a little short when there is somewhere to go.
      if (p.stroke) {
        const s = p.stroke;
        const t = now - s.start;
        const len = s.len ?? clipLength(s.clip);
        const swingDue = s.clip === SPLIT && p.plan && now >= p.plan.t - contactTime(p.plan.clip);
        const stepOff = (s.clip === SPLIT && p.goal && t > REACT) || (STROKES.has(s.clip) && s.clip !== 'serve' && p.goal && t > len * 0.8);
        if (t >= len || swingDue || stepOff) {
          endStroke(p, now);
          if (p.stroke) return; // the next stroke (the serve after the bounces) has begun
        } else {
          p.clip = s.clip;
          p.clipT = warp(s.clip, t, len);
          // Into the ball: the last of the run carries on through the backswing, to the stance.
          if (s.target && now < s.contactAt - 0.06) steer(p, { ...s.target, by: s.contactAt - 0.06, min: 0 }, now, dt, RALLY);
          else brake(p, dt, s.clip === SPLIT ? RALLY.dec : RALLY.dec * 1.4);
          return;
        }
      }
      // Time to swing at a planned ball? From wherever they are: the backswing covers the rest.
      if (p.plan && now >= p.plan.t - contactTime(p.plan.clip)) {
        const start = p.plan.t - contactTime(p.plan.clip);
        p.heading = homeHeading(p); // square to the net for the swing (the run has turned back by now)
        p.stroke = { clip: p.plan.clip, start, target: { x: p.plan.x, z: p.plan.z }, contactAt: p.plan.t };
        p.hitAt = p.plan.t;
        p.plan = null;
        p.goal = null;
        switchClip(p, p.stroke.clip, p.home, now, BLEND, { t: now - start });
        return;
      }
      // Round 9: turned to where the next thing happens (the bench)?
      if (p.afterTurn && !p.goal && !p.path?.length && Math.abs(angDiff(p.wantHeading ?? homeHeading(p), p.heading)) < 0.06) {
        const fn = p.afterTurn;
        p.afterTurn = null;
        fn(now);
        if (p.stroke) return;
      }
      // Round 10: standing easy for a while (a chat, a breather), then on to what comes next.
      if (p.hold && !p.goal && !p.path?.length && now >= p.hold.until) {
        const cb = p.hold.cb;
        p.hold = null;
        cb(now);
        if (p.stroke) return;
      }
      // Round 9: a walk along waypoints (out through the gate, to the bench, back to the baseline).
      if (!p.goal && p.path?.length) {
        const w = p.path.shift();
        p.goal = { ...w, walk: w.walk ?? true, pass: p.path.length > 0 && !w.stop };
      }
      if (p.goal) {
        // In a rally, running forward facing the net tops out where the walk cycle can keep up.
        const fwd = !p.goal.walk && (p.goal.z - p.z) * p.fwd > Math.abs(p.goal.x - p.x) * 1.4;
        const m = p.goal.m ?? (p.goal.walk ? (p.goal.back ? BACKING : STROLL) : fwd && !p.goal.run ? FORWARD : RALLY);
        if (steer(p, p.goal, now, dt, m)) {
          const then = p.goal.then;
          p.goal = null;
          then?.(now);
          if (p.stroke) return;
        }
      } else {
        brake(p, dt);
      }
      footwork(p, now, dt);
    }

    /** The ball hand (json `hand`, row 181) of `p` at `t` s into `clip`, in the world. */
    function handPoint(p, clip, t, out) {
      const c = data.clips[clip];
      const h = c?.hand;
      if (!h) return null;
      const n = h.length;
      let f = t * fpsOf(clip);
      f = c.loop ? ((f % n) + n) % n : THREE.MathUtils.clamp(f, 0, n - 1);
      const i = Math.floor(f);
      const j = c.loop ? (i + 1) % n : Math.min(n - 1, i + 1);
      const u = f - i;
      const at = (k) => h[i][k] + (h[j][k] - h[i][k]) * u;
      return out.set(p.x + at(0) * p.right, p.court.y + at(2) - 0.05, p.z + at(1) * p.fwd);
    }

    /** Row 181: the ball the server is bouncing: pushed down at the hand's lowest, back into it at the top. */
    let bounceKeys = null;
    function bounceBall(game, s, now, out) {
      const c = data.clips.bounce;
      if (!bounceKeys) {
        const h = c.hand;
        const n = h.length;
        let rel = 0;
        for (let i = 0; i < Math.ceil(n * 0.6); i++) if (h[i][2] < h[rel][2]) rel = i;
        let cat = n;
        let best = -Infinity;
        for (let i = rel + 2; i <= n; i++) if (h[i % n][2] >= best - 1e-3) { best = h[i % n][2]; cat = i; }
        bounceKeys = { rel: rel / fpsOf('bounce'), cat: cat / fpsOf('bounce') };
      }
      const L = clipLength('bounce');
      const t = now - s.stroke.start;
      const cyc = Math.floor(t / L);
      const u = t - cyc * L;
      const { rel, cat } = bounceKeys;
      if (u <= rel || u >= cat) return handPoint(s, 'bounce', u, out);
      const p0 = handPoint(s, 'bounce', rel, new THREE.Vector3());
      const p1 = handPoint(s, 'bounce', cat, new THREE.Vector3());
      const T = cat - rel;
      const td = T * 0.45; // down to the court, then back up to the hand
      const g = s.court.y + BALL_R;
      const k = (u - rel) / T;
      out.lerpVectors(p0, p1, k);
      if (u - rel < td) {
        const h0 = p0.y - g;
        const t1 = u - rel;
        const v0 = (0.5 * G * td * td - h0) / td;
        out.y = g + h0 + v0 * t1 - 0.5 * G * t1 * t1;
      } else {
        const tu = T - td;
        const t1 = u - rel - td;
        const vu = (p1.y - g + 0.5 * G * tu * tu) / tu;
        out.y = g + vu * t1 - 0.5 * G * t1 * t1;
        if (game.bounceHeard !== cyc) { game.bounceHeard = cyc; playHit(s.court, 0.22); }
      }
      return out;
    }

    const shadowEvery = data.shadowEvery ?? 1;
    // Row 181: a frame drawn away from the card's base point (the clip fading out from where it was).
    const offA = [0, 0, 0, 0, 0, 0, 0, 0];
    const offS = [0, 0, 0, 0, 0, 0, 0, 0];
    function shifted(out, f, dx, dy) {
      for (let k = 0; k < 4; k++) out[k] = f[k];
      out[4] = f[4] + dx; out[5] = f[5] + dy; out[6] = f[6] + dx; out[7] = f[7] + dy;
      return out;
    }
    function writeSprite(p, slot, now, sharp) {
      const list = data.frames[p.variant][`${p.clip}|${p.facing}`];
      const c = data.clips[p.clip];
      const fps = fpsOf(p.clip);
      // Two neighbouring frames, cross-faded by the time between them (row 132).
      let [i, j, t] = framePair(list.length, fps, p.clipT, c.loop);
      let a = list[i][0];
      let b = list[j][0];
      p.shownIdx = t < 0.5 ? a : b;
      let [si, sj, st] = framePair(list.length, fps, p.clipT, c.loop, shadowEvery);
      let sa = list[si][1];
      let sb = list[sj][1];
      // Row 181: a clip change fades from the outgoing clip's nearest frame to the new one's.
      let dx = 0;
      let dz = 0;
      const from = p.from;
      const w = from ? (now - from.at) / from.dur : 1;
      if (w < 1) {
        const fl = data.frames[p.variant][`${from.clip}|${from.facing}`];
        const fc = data.clips[from.clip];
        const [fi, fj, ft] = framePair(fl.length, fpsOf(from.clip), from.t, fc.loop);
        const [fsi, fsj, fst] = framePair(fl.length, fpsOf(from.clip), from.t, fc.loop, shadowEvery);
        b = t < 0.5 ? a : b;
        a = fl[ft < 0.5 ? fi : fj][0];
        if (w < 0.5) p.shownIdx = a;
        sb = st < 0.5 ? sa : sb;
        sa = fl[fst < 0.5 ? fsi : fsj][1];
        t = st = Math.max(0, w);
        if (from.x != null) { dx = from.x - p.x; dz = from.z - p.z; }
      }
      // The sharp atlas of this variant when zoomed in on it, else the shared one.
      const set = sharp && onScreen(p) ? hiSet(p.variant) : null;
      for (const s of Object.values(hiSets)) if (s.mesh && s !== set) hideFrame(s.mesh, slot);
      const rects = set ? hiBody : data.body;
      const A = dx || dz ? shifted(offA, rects[a], dx, -dz * SIN) : rects[a];
      if (set) {
        writeFrame(set.mesh, slot, A, rects[b], t, p.x, p.court.y, p.z);
        hideFrame(bodies, slot);
      } else {
        writeFrame(bodies, slot, A, rects[b], t, p.x, p.court.y, p.z);
      }
      if (sa < 0 && sb < 0) { hideFrame(shadows, slot); return; }
      if (sa < 0) sa = sb;
      if (sb < 0) sb = sa;
      const SA = dx || dz ? shifted(offS, data.shadow[sa], dx, dz) : data.shadow[sa];
      writeFrame(shadows, slot, SA, data.shadow[sb], st, p.x, p.court.y + 0.004, p.z);
    }

    function writeBall(game, now) {
      const k = game.idx;
      const f = game.toss?.f ?? game.ball;
      const s = game.server;
      // Row 181: in the server's hand while they bounce it and until the toss leaves the hand.
      const hp = game.held; // round 9: picked up / about to be fed over
      const held = game.bouncing && s.stroke?.clip === 'bounce' ? bounceBall(game, s, now, tmp)
        : game.toss && now < game.toss.from && s.stroke?.clip === 'serve' ? handPoint(s, 'serve', now - s.stroke.start, tmp)
          : hp && hp.stroke && data.clips[hp.stroke.clip]?.hand ? handPoint(hp, hp.stroke.clip, now - hp.stroke.start, tmp) : null;
      // A ball that went long is out of sight by the fence; one by the net or over the fence stays.
      const lying = game.netBall || game.fetch || game.chore;
      const shown = held || (!hp && f && !(game.ball && game.pointOver && !lying && now > game.pointOver - 0.6));
      if (!shown) {
        m4.makeScale(0, 0, 0);
        balls.setMatrixAt(k, m4);
        ballShadows.setMatrixAt(k, m4);
        return;
      }
      if (!held) ballAt(f, now, tmp);
      if (tmp.y < game.court.y + BALL_R) tmp.y = game.court.y + BALL_R;
      m4.makeTranslation(tmp.x, tmp.y, tmp.z);
      balls.setMatrixAt(k, m4);
      // Shadow along the sun onto the court.
      const h = tmp.y - game.court.y;
      m4.makeTranslation(tmp.x - (sun.x / sun.y) * h, game.court.y + 0.005, tmp.z - (sun.z / sun.y) * h);
      ballShadows.setMatrixAt(k, m4);
    }

    // Round 7: games beyond the courts booked at the map's hour sit out (no cards, no ball).
    function hideGame(g) {
      for (const slot of [g * 2, g * 2 + 1]) {
        hideFrame(bodies, slot);
        hideFrame(shadows, slot);
        for (const s of Object.values(hiSets)) if (s.mesh) hideFrame(s.mesh, slot);
      }
    }
    function setCourts(ids) {
      games.forEach((game, k) => {
        const court = ids[k] ? courtSurface(ids[k]) : null;
        if (!court) {
          if (game.ended) floodlights?.hold?.(game.court.id, false);
          Object.assign(game, { off: true, ended: false, ball: null, toss: null, bouncing: false });
          return;
        }
        if (!game.off && !game.ended && game.court.id === court.id) return;
        if (game.ended) floodlights?.hold?.(game.court.id, false); // round 9: a new hour, the court's lights follow it again
        games[k] = makeGame(court, k);
      });
    }

    let devMiss = null;
    let last = performance.now() / 1000;
    return {
      devMiss: (k) => { devMiss = k; },
      setCourts,
      courts: () => games.filter((g) => !g.off).map((g) => g.court.id),
      /** Round 7 (life/tournament.js): the rally on a court, read only, and where its ball is now. */
      game: (id) => games.find((g) => !g.off && g.court.id === id) ?? null,
      ballOf(id, out) {
        const g = games.find((x) => !x.off && x.court.id === id);
        const f = g && (g.toss?.f ?? g.ball);
        return f ? ballAt(f, performance.now() / 1000, out) : null;
      },
      tick() {
        const now = performance.now() / 1000;
        const dt = Math.min(0.1, now - last);
        last = now;
        for (const game of games) {
          if (game.off) continue;
          if (!OLD && !game.session) routine.init(game, now);
          // Point flow.
          if (!game.toss && !game.ball && !game.bouncing && !game.chore && !game.ended && now > game.next && game.players.every((p) => !p.goal && !p.stroke && !p.path?.length)) startServe(game, now);
          if (game.toss && now >= game.serveAt) serveShot(game, now);
          for (const p of game.players) {
            if (p.hitAt && now >= p.hitAt) {
              p.hitAt = 0;
              strike(game, p, now);
            }
          }
          if (game.ball && game.pointOver && now > game.pointOver) {
            game.pointOver = 0;
            game.next = now + (OLD ? rand(1.2, 3.5) : rand(2, 4.5));
            game.played = (game.played ?? 0) + 1;
            const heard = points.get(game.court.id); // round 7: the tournament scoreboard keeps the score
            if (heard ? heard(game.winner === game.players[0]) : Math.random() < 0.2) game.server = other(game, game.server); // a new game
            places(game, now);
            // Round 9: what happens between this point and the next (rows 25, 29, 31).
            if (closing(game)) startLeave(game, now);
            else if (game.fetch) startFetch(game, now);
            else if (game.netBall && Math.random() < 0.85) startCollect(game, now);
            else game.ball = null;
            if (!OLD) routine.after(game, now, !!game.chore); // round 10: a break of its own, unless a chore fills the pause
            for (const p of game.players) p.relax = !OLD; // standing easy until the next serve
            game.netBall = null;
          }
          if (game.chore) choreTick(game, now);
          game.players.forEach((p) => updatePlayer(game, p, now, dt));
        }
        const sharp = hiWanted();
        if (sharp) hiOffSince = now;
        else if (hi && now - hiOffSince > HI_RELEASE && Object.keys(hiSets).length) hiRelease();
        games.forEach((game, g) => {
          if (game.off) { hideGame(g); writeBall(game, now); return; }
          // The far player is drawn first: back to front, so their cards never cut each other.
          for (const [p, slot] of [[game.players[1], g * 2], [game.players[0], g * 2 + 1]]) {
            if (p.gone) { hideFrame(bodies, slot); hideFrame(shadows, slot); for (const st of Object.values(hiSets)) if (st.mesh) hideFrame(st.mesh, slot); } else writeSprite(p, slot, now, sharp);
          }
          writeBall(game, now);
        });
        for (const set of Object.values(hiSets)) if (set.mesh) flush(set.mesh);
        flush(bodies);
        flush(shadows);
        balls.instanceMatrix.needsUpdate = true;
        ballShadows.instanceMatrix.needsUpdate = true;
        return true;
      },
      /** Row 32 (life/follow-cam.js): the player drawn under a screen point, as a live position getter. */
      personAt(x, y) {
        let best = null;
        let bd = Infinity;
        for (const g of games) {
          if (g.off) continue;
          for (const p of g.players) {
            if (p.gone) continue;
            tmp.set(p.x, p.court.y + 0.95, p.z).project(camera);
            const sx = (tmp.x + 1) * innerWidth / 2;
            const sy = (1 - tmp.y) * innerHeight / 2;
            // about a body's height on screen: the card spans ~1.8 m
            const r = Math.max(14, 1.1 * innerHeight / (2 * rig.state.dist * halfTan));
            const d = Math.hypot((sx - x) * 1.6, sy - y);
            if (d < r && d < bd) { bd = d; best = p; }
          }
        }
        return best && (() => (best.gone || games.every((g) => !g.players.includes(best)) ? null : { x: best.x, z: best.z }));
      },
      log: (k) => games[k].log.splice(0),
      lod: () => ({ wanted: !!hiWanted(), sets: Object.fromEntries(Object.entries(hiSets).map(([v, s]) => [v, s.state])) }),
      debug: () => games.map((g) => ({ court: g.court.id, off: !!g.off, shots: g.shots, ball: !!g.ball, chore: g.chore?.kind ?? (g.ended ? 'ended' : null), players: g.players.map((p) => `${p.variant}:${p.clip}|${p.facing}@${p.x.toFixed(1)},${p.z.toFixed(1)}${p.gone ? ' gone' : ''}`) })),
    };
  }

  return sys;
}
