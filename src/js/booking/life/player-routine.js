import * as THREE from 'three';
import { drinkingFountains as fountains } from './fountains-drinking.js';

// Round 10 (row 1): what the players do with their time besides the points. A court's session has a
// shape, like a real hour on court: a warm-up (a jog along the baseline, side-shuffles, a soft rally),
// then games with a break now and then (a chat across the net, a drink at the bench, balls gathered
// off the court, a stroll to the fence), and a changeover every few points (both sit at the bench,
// towel off, take a drink, and walk round the net post to the other end). The breaks never repeat
// back to back and their order is shuffled, so a court takes minutes before the same thing returns.
// The planners only queue waypoints and clips on players.js' own machinery (`path`, `stroke`, `hold`).

const rand = (a, b) => a + Math.random() * (b - a);
const BENCH_X = 6.35; // the benches stand on the +x side by the net (c.x + …)
const POST_X = 7.7; // the walkway round the net post, behind the benches

// Movers: { vmax, acc, dec, min } in m/s, m/s². A jog, a lateral slide, a stroll.
export const JOG = { vmax: 3.4, acc: 3.2, dec: 3.2, min: 3.2 };
export const SLIDE = { vmax: 2.4, acc: 6, dec: 6, min: 2.2 };
export const AMBLE = { vmax: 0.95, acc: 1.2, dec: 1.6, min: 0.8 };

const BREAKS = { chat: 3, water: 3, tidy: 3, stroll: 3, stretch: 2, rest: 2 };

export function createRoutine({ has, switchClip, pickup, places, flight, toCorridor, BASELINE, BALL_R, BLEND, onTournament }) {
  const half = (p) => (p.near ? 1 : -1);
  const baseZ = (c, p, d = 0.4) => c.z + half(p) * (BASELINE + d);

  function begin(game, name, n) {
    game.chore = { kind: 'episode', name, left: n };
    for (const p of game.players) { p.plan = null; p.goal = null; p.path = null; p.relax = true; }
    game.session.last = name;
  }

  /** One participant is done; when all are, the court goes back to its points. */
  function finish(game, now) {
    const ch = game.chore;
    if (!ch || ch.kind !== 'episode' || --ch.left > 0) return;
    game.chore = null;
    game.next = now + rand(1.4, 3);
    game.players.sort((a, b) => b.near - a.near); // after a changeover the near player is the other one
    for (const p of game.players) { p.relax = false; p.wantHeading = null; }
    places(game, now);
  }

  /** Stand where you are (relaxed) for `secs`, then call `cb`. */
  const hold = (p, now, secs, cb) => { p.hold = { until: now + secs, cb }; };

  /** Turned to face −x (the court from the bench side), then `cb`. */
  function faceWest(p, cb) {
    p.wantHeading = -Math.PI / 2;
    p.afterTurn = (t) => { p.wantHeading = null; cb(t); };
  }

  function drink(p, now, cb) {
    if (!has(p, 'drink', 'h6')) { hold(p, now, 3, cb); return; }
    p.stroke = { clip: 'drink', start: now, then: cb };
    switchClip(p, 'drink', 'h6', now, BLEND);
  }

  /** A stretch (arm across the chest, then both arms up and a lean each way), facing the net. */
  function stretching(p, now, cb) {
    if (!has(p, 'stretch', p.home)) { hold(p, now, 3, cb); return; }
    p.stroke = { clip: 'stretch', start: now, then: cb };
    switchClip(p, 'stretch', p.home, now, BLEND);
  }

  const benchSpot = (c, p) => ({ x: c.x + BENCH_X, z: c.z + half(p) * 2.6 });

  // --- Breaks ---------------------------------------------------------------------------------

  /** Both walk to the net and talk across it, now and then a few steps, then back. */
  function chat(game) {
    const c = game.court;
    begin(game, 'chat', 2);
    const x = c.x + rand(-2.5, 2.5);
    for (const p of game.players) {
      p.path = [{ x: x + half(p) * 0.3, z: c.z + half(p) * rand(1.4, 1.9), stop: true, m: AMBLE, then: (t) => hold(p, t, rand(4, 9), (t2) => finish(game, t2)) }];
    }
  }

  /** Row 36: out through the gate to a drinking fountain on the footpath, a place in its queue, a drink, and back. */
  function fountain(game) {
    const c = game.court;
    const p = game.players[Math.floor(Math.random() * 2)];
    const spot = fountains.pick(p.x, p.z, {});
    if (!spot || Math.hypot(spot.x - c.x, spot.z - c.z) > 48) return false;
    const r = fountains.reserve(spot.id, p);
    if (!r) return false;
    begin(game, 'water', 1);
    const out = toCorridor(c, p);
    const zc = out[out.length - 1].z;
    const home = { x: p.spot?.x ?? c.x, z: p.spot?.z ?? baseZ(c, p) };
    const back = [{ x: r.x, z: zc }, ...[...out].reverse(), { ...home, stop: true, then: (t) => finish(game, t) }];
    const sip = (t) => {
      const west = Math.abs(Math.atan2(spot.x - r.x, -(spot.z - r.z)) + Math.PI / 2) < 0.9; // the drink clip faces −x
      const done = (t2) => { fountains.release(p); p.wantHeading = null; p.path = back; };
      const go = (t2) => { fountains.drink(spot.id, p, 3); if (west && has(p, 'drink', 'h6')) drink(p, t2, done); else hold(p, t2, 3.2, done); };
      p.wantHeading = Math.atan2(spot.x - r.x, -(spot.z - r.z));
      p.afterTurn = (t2) => hold(p, t2, 0.6 + r.slot * 3.4, west ? (t3) => { p.wantHeading = -Math.PI / 2; p.afterTurn = go; } : go);
    };
    p.path = [...out, { x: r.x, z: zc }, { x: r.x, z: r.z, stop: true, m: AMBLE, then: sip }];
    return true;
  }

  /** One (sometimes both) walks to the bench side for a drink. */
  function water(game) {
    if (fountains.ready && Math.random() < Math.min(0.85, 0.5 * fountains.thirst()) && fountain(game)) return;
    const c = game.court;
    const who = Math.random() < 0.35 ? [...game.players] : [game.players[Math.floor(Math.random() * 2)]];
    begin(game, 'water', who.length);
    for (const p of who) {
      const b = benchSpot(c, p);
      p.path = [
        { x: b.x - 1.6, z: b.z + half(p) * 0.5, m: AMBLE },
        { x: b.x - 0.7, z: b.z, stop: true, m: AMBLE, then: () => faceWest(p, (t) => drink(p, t, (t2) => finish(game, t2))) },
      ];
    }
  }

  /** One gathers two to four balls off the court (each shown lying there until it is picked up). */
  function tidy(game) {
    const c = game.court;
    const p = game.players[Math.floor(Math.random() * 2)];
    begin(game, 'tidy', 1);
    let left = 2 + Math.floor(Math.random() * 3);
    const next = () => {
      if (left-- <= 0) { finish(game, performance.now() / 1000); return; }
      const at = new THREE.Vector3(c.x + rand(-3.6, 3.6), c.y + BALL_R, c.z + half(p) * rand(3, 10.5));
      game.ball = flight(at, new THREE.Vector3(), performance.now() / 1000, c.y);
      p.path = [{ x: at.x + p.right * 0.14, z: at.z - p.fwd * 0.42, stop: true, m: AMBLE, then: (t) => pickup(game, p, t, p.home, () => next()) }];
    };
    next();
  }

  /** A few slow steps along the back fence and a breath. */
  function stroll(game) {
    const c = game.court;
    begin(game, 'stroll', game.players.length);
    for (const p of game.players) {
      const x = c.x + rand(-4, 4);
      p.path = [
        { x, z: baseZ(c, p, rand(2, 3.4)), m: AMBLE },
        { x: x + rand(-2, 2), z: baseZ(c, p, rand(1, 2)), stop: true, m: AMBLE, then: (t) => hold(p, t, rand(2, 5), (t2) => finish(game, t2)) },
      ];
    }
  }

  /** Both stretch where they stand. */
  function stretch(game, now) {
    begin(game, 'stretch', game.players.length);
    for (const p of game.players) stretching(p, now, (t) => finish(game, t));
  }

  /** Nothing much: both stand easy for a few seconds. */
  function rest(game, now) {
    begin(game, 'rest', game.players.length);
    for (const p of game.players) hold(p, now, rand(3, 7), (t) => finish(game, t));
  }

  /** The warm-up: jog the baseline both ways, slide side to side, settle. */
  function jog(game, now) {
    const c = game.court;
    begin(game, 'jog', game.players.length);
    for (const p of game.players) {
      const s = Math.random() < 0.5 ? -1 : 1;
      const z = baseZ(c, p, 0.6);
      p.path = [
        { x: c.x + 3.8 * s, z, m: JOG },
        { x: c.x - 3.8 * s, z, m: JOG },
        { x: c.x + 3.4 * s, z, m: JOG },
        { x: c.x, z, walk: false, m: SLIDE, min: 2 },
        { x: c.x - 2.6, z, walk: false, m: SLIDE, min: 2 },
        { x: c.x + 2.6, z, walk: false, m: SLIDE, min: 2 },
        { x: c.x + rand(-1, 1), z, walk: false, m: SLIDE, min: 2, stop: true, then: (t) => stretching(p, t, (t2) => hold(p, t2, rand(0.8, 2), (t3) => finish(game, t3))) },
      ];
    }
  }

  /**
   * Changeover: both sit on their half's bench, towel off, stand and drink, then walk round the net
   * post to the other end (each player's end, hand and facing flip as they set off).
   */
  function changeover(game) {
    const c = game.court;
    begin(game, 'changeover', 2);
    for (const [i, p] of game.players.entries()) {
      const b = benchSpot(c, p);
      const h = half(p);
      const cross = (t) => {
        p.near = !p.near;
        p.home = p.near ? 'away' : 'toward';
        p.fwd = -p.fwd;
        p.right = -p.right;
        const x = c.x + POST_X + i * 0.7;
        p.path = [
          { x, z: c.z + h * 1.6 },
          { x, z: c.z - h * 1.6 },
          { x: c.x + rand(-1, 1), z: baseZ(c, p), stop: true, then: (t2) => finish(game, t2) },
        ];
      };
      const sit = (t) => {
        if (!has(p, 'bench', 'h6')) { drink(p, t, cross); return; }
        p.stroke = { clip: 'bench', start: t, then: (t2) => drink(p, t2, cross) };
        switchClip(p, 'bench', 'h6', t, BLEND);
      };
      p.path = [
        { x: b.x - 1.1, z: b.z + h * 0.6 },
        { x: b.x, z: b.z, stop: true, then: () => faceWest(p, sit) },
      ];
    }
  }

  const EPISODES = { chat, water, tidy, stroll, stretch, rest };

  return {
    /** A court's session starts: players warm up. */
    init(game, now) {
      game.session = { points: 0, since: 0, last: '', changeAt: 5 + Math.floor(Math.random() * 4), warm: 3 + Math.floor(Math.random() * 2) };
      game.tempo = 1.25;
      if (Math.random() < 0.8) jog(game, now);
    },
    /** After a point: the break (if any) before the next one; `busy` when something else (a ball to fetch) fills the pause. */
    after(game, now, busy = false) {
      const s = game.session;
      s.points++;
      s.since++;
      if (s.warm > 0) s.warm--;
      game.tempo = s.warm > 0 ? 1.25 : rand(0.92, 1.2);
      if (busy) return false;
      if (!onTournament(game) && s.since >= s.changeAt) {
        s.since = 0;
        s.changeAt = 5 + Math.floor(Math.random() * 4);
        changeover(game);
        s.last = 'changeover';
        return true;
      }
      if (Math.random() < 0.38) return false; // straight on to the next point
      const pool = Object.entries(BREAKS).filter(([k]) => k !== s.last);
      let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
      const [name] = pool.find(([, w]) => (r -= w) < 0) ?? pool[0];
      EPISODES[name](game, now);
      return true;
    },
  };
}
