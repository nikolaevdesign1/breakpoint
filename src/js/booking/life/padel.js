import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { ambientBus, ballBounce } from '../ambient.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, writeFrame, hideFrame, flush, framePair, loadAtlas, mirrored, PITCH } from './sprite.js';
import { COURTS, isOpenHour, isSlotTaken } from '../../shared/availability.js';
import { hourState } from '../hour-state.js';

// Row 38: padel doubles on the padel courts booked at the map's hour (Pelican, Manatee, Heron, Ibis).
// Two pairs, side-on to the drone (the courts run along x): the left pair faces +x ('right' sprites),
// the right pair their mirror image. Sprites from scripts/life/render_player_moves.py -- padel
// (same people as the tennis players, a solid perforated padel bat, 30 fps footwork, 40 fps strokes),
// packed into their own atlas that loads only once a padel court is busy.
//
// The game: an underhand serve (the ball dropped, met low) diagonally into the box; the ball bounces
// on the turf, comes off the back and side glass (lively) and the mesh (dead), and over the net. Each
// pair keeps its lanes (side by side), one up one back on the serve, then both up after a lob of
// theirs or a volley, both back when lobbed. Net players volley, smash a short lob; from the back the
// players drive low, take the ball off the glass or lob the pair at the net. Hits sound through the
// ambient bus (a duller "thock" than tennis), glass and mesh have their own.

const DATA_URL = '/models/life/padel.json';
const atlas = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;
const PADEL = COURTS.filter((c) => c.type === 'padel').map((c) => c.id);
const HALF_L = 10; // m, along x
const HALF_W = 5; // along z
const NET_H = 0.88;
const GLASS_H = 3;
const FENCE_H = 4;
const G = 9.81;
const R = 0.033;
const STEP = 1 / 120; // trajectory samples
const NET_X = 3.1; // m from the net: volley position
const BACK_X = 8.3; // defending position
const LANE = 2.4;
const BLEND = 0.15;
const MOVE = { vmax: 4.2, acc: 7, dec: 9 };
const STROLL = { vmax: 1.4, acc: 2, dec: 2.6 };
const rand = (a, b) => a + Math.random() * (b - a);
const reach = (T, m = MOVE) => (T <= 0 ? 0 : T <= m.vmax / m.acc ? 0.5 * m.acc * T * T : m.vmax * T - (m.vmax * m.vmax) / (2 * m.acc));

/** Padel courts booked at the map's hour. */
export function padelCourtsAt(dayKey, hour) {
  if (!dayKey || !isOpenHour(dayKey, hour)) return [];
  return PADEL.filter((id) => isSlotTaken(id, dayKey, hour));
}

// --- Ball: sampled flight in the glass box ----------------------------------------------------

/**
 * Flies a ball from p with velocity v (from t0) through the court box `c`: turf bounces, glass and
 * mesh rebounds, the net. Samples every STEP s for up to `secs`; events: floor / glass / mesh / net.
 */
function simulate(p, v, t0, c, secs = 4.2) {
  const n = Math.ceil(secs / STEP);
  const pts = new Float32Array((n + 1) * 3);
  const events = [];
  let { x, y, z } = p;
  let vx = v.x; let vy = v.y; let vz = v.z;
  const floor = c.y + R;
  let rest = false;
  for (let i = 0; i <= n; i++) {
    pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z;
    if (rest) continue;
    const t = t0 + i * STEP;
    const px = x;
    vy -= G * STEP;
    x += vx * STEP; y += vy * STEP; z += vz * STEP;
    if (y < floor) {
      y = floor + (floor - y) * 0.7;
      if (Math.abs(vy) > 0.6) events.push({ t, kind: 'floor', x, z, speed: -vy });
      vy = -vy * 0.7;
      vx *= 0.82; vz *= 0.82;
      if (Math.abs(vy) < 0.35) { vy = 0; y = floor; vx *= 0.97; vz *= 0.97; if (Math.hypot(vx, vz) < 0.25) rest = true; }
    }
    const dx = x - c.x;
    if (Math.abs(dx) > HALF_L - R) {
      if (y > FENCE_H) { events.push({ t, kind: 'out', x, z }); rest = true; continue; }
      const glass = y < GLASS_H;
      x = c.x + Math.sign(dx) * (HALF_L - R);
      vx = -vx * (glass ? 0.68 : 0.22);
      vy *= glass ? 0.92 : 0.6;
      events.push({ t, kind: glass ? 'glass' : 'mesh', x, z, speed: Math.abs(vx) });
    }
    const dz = z - c.z;
    if (Math.abs(dz) > HALF_W - R) {
      if (y > FENCE_H) { events.push({ t, kind: 'out', x, z }); rest = true; continue; }
      const glass = y < GLASS_H && Math.abs(x - c.x) > HALF_L - 2; // glass at the corners, mesh between
      z = c.z + Math.sign(dz) * (HALF_W - R);
      vz = -vz * (glass ? 0.66 : 0.2);
      vx *= glass ? 0.95 : 0.6;
      events.push({ t, kind: glass ? 'glass' : 'mesh', x, z, speed: Math.abs(vz) });
    }
    if (Math.sign(px - c.x) !== Math.sign(x - c.x) && y < c.y + NET_H + R) {
      // into the net: drops dead on the hitter's side
      x = c.x - Math.sign(vx) * 0.05;
      vx = -vx * 0.08; vz *= 0.3; vy = Math.min(vy, 0) * 0.3;
      events.push({ t, kind: 'net', x, z, speed: 1 });
    }
  }
  return { t0, n, pts, events };
}

function trajAt(tr, t, out) {
  let f = (t - tr.t0) / STEP;
  f = Math.max(0, Math.min(tr.n, f));
  const i = Math.min(tr.n - 1, Math.floor(f));
  const u = f - i;
  const a = i * 3; const b = a + 3;
  return out.set(tr.pts[a] + (tr.pts[b] - tr.pts[a]) * u, tr.pts[a + 1] + (tr.pts[b + 1] - tr.pts[a + 1]) * u, tr.pts[a + 2] + (tr.pts[b + 2] - tr.pts[a + 2]) * u);
}

/** Velocity from `from` landing on the turf at `to` after T s (no walls), lifted to clear the net. */
function aim(from, to, T, c, clear = 0.25) {
  const v = new THREE.Vector3((to.x - from.x) / T, (c.y + R - from.y + 0.5 * G * T * T) / T, (to.z - from.z) / T);
  const tn = (c.x - from.x) / v.x;
  if (tn > 0 && tn < T) {
    const yn = from.y + v.y * tn - 0.5 * G * tn * tn;
    const need = c.y + NET_H + clear;
    if (yn < need) v.y += (need - yn) / tn;
  }
  return v;
}

// --- System -----------------------------------------------------------------------------------

export function createPadel({ scene, rig, camera, renderer, courtSurface, quality }, { still }) {
  if (still) return null;
  const sys = { name: 'padel', ready: false, tick: () => false };
  let wanted = hourState.dayKey ? padelCourtsAt(hourState.dayKey, hourState.hour) : [];
  let loading = null;

  function load() {
    loading ??= Promise.all([
      fetch(DATA_URL).then((r) => r.json()),
      loadAtlas(atlas('padel', quality)),
      loadAtlas(atlas('padel-shadow', quality)),
    ]).then(async ([data, bodyTex, shadowTex]) => {
      const built = build(data, bodyTex, shadowTex);
      await renderer.compileAsync(scene, camera).catch(() => {}); // shaders ready before the first padel draw
      Object.assign(sys, built);
      sys.ready = true;
      sys.apply(wanted);
    }).catch((err) => console.warn('Padel failed', err));
  }
  sys.setCourts = (ids) => {
    wanted = ids;
    if (sys.ready) sys.apply(ids);
    else if (ids.length) load();
  };
  document.addEventListener('bp-hour', (e) => sys.setCourts(padelCourtsAt(e.detail.dayKey, e.detail.hour)));
  if (wanted.length) load();

  function build(data, bodyTex, shadowTex) {
    const MAX = 4;
    const bodies = spriteMesh(bodyTex, MAX * 4);
    bodies.name = 'life_padel';
    const shadows = spriteMesh(shadowTex, MAX * 4, { ground: true, shadow: true });
    shadows.name = 'life_padel_shadow';
    shadows.renderOrder = 1;
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 10, 8), gradeLife(new THREE.MeshStandardMaterial({ color: 0xd2dd3c, roughness: 0.85 })), MAX);
    const ballShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(R * 1.1, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), MAX);
    for (const o of [balls, ballShadows]) {
      o.frustumCulled = false;
      o.layers.set(LIFE_LAYER);
      o.userData.noAO = true;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    ballShadows.renderOrder = 1;
    scene.add(bodies, shadows, balls, ballShadows);
    const variants = Object.keys(data.frames);
    const sun = new THREE.Vector3(0.7009, 0.5, 0.5086).normalize();
    const m4 = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    const SIN = Math.sin(PITCH);
    const fpsOf = (clip) => data.clips[clip]?.fps ?? data.fps;
    const lenOf = (clip) => data.clips[clip].frames / fpsOf(clip);
    const contactOf = (clip) => (data.clips[clip].contact ?? Math.round(data.clips[clip].frames / 2)) / fpsOf(clip);
    let games = [];

    // --- People ---

    function makePlayer(c, team, lane, k) {
      const dir = team ? -1 : 1; // +1 faces +x
      return {
        c, team, lane, dir,
        facing: dir > 0 ? 'right' : 'left',
        variant: variants[(k + team * 2 + (lane > 0 ? 1 : 0)) % variants.length],
        x: c.x - dir * BACK_X, z: c.z + lane * LANE,
        vx: 0, vz: 0, clip: 'ready', clipT: rand(0, 1), rate: 1, from: null,
        stroke: null, goal: null, plan: null, role: 'back',
      };
    }

    function makeGame(id, k) {
      const c = courtSurface(id);
      if (!c) return null;
      const players = [makePlayer(c, 0, -1, k), makePlayer(c, 0, 1, k), makePlayer(c, 1, -1, k), makePlayer(c, 1, 1, k)];
      const g = { id, c, k, players, traj: null, ev: 0, serveTeam: k % 2, serveLane: 1, points: 0, next: performance.now() / 1000 + rand(1, 4), shots: 0, max: 0, over: 0, held: null };
      servePlaces(g, true);
      return g;
    }

    /** Positions for the serve: server back on its lane, partner at the net; receivers diagonal. */
    function servePlaces(g, jump = false) {
      for (const p of g.players) {
        const serving = p.team === g.serveTeam;
        const server = serving && p.lane === g.serveLane;
        const receiver = !serving && p.lane === -g.serveLane;
        p.role = server || receiver ? 'back' : 'net';
        const x = g.c.x - p.dir * (server ? 8.9 : receiver ? 9.1 : serving ? NET_X : 5.2);
        const z = g.c.z + p.lane * (server || receiver ? 2.0 : LANE);
        p.plan = null;
        if (jump) { p.x = x; p.z = z; p.goal = null; } else p.goal = { x, z, walk: true };
      }
    }

    function rolePlace(p) {
      return { x: p.c.x - p.dir * (p.role === 'net' ? NET_X : BACK_X), z: p.c.z + p.lane * LANE };
    }

    // --- Clips and sprites ---

    function switchClip(p, clip, now, dur = BLEND, { t = 0, at = null } = {}) {
      if (clip === p.clip) return;
      p.from = { clip: p.clip, t: p.clipT, rate: data.clips[p.clip]?.loop ? p.rate : 1, x: at?.x ?? null, z: at?.z ?? null, at: now, dur };
      p.clip = clip;
      p.clipT = t;
    }

    /** Footwork for the velocity: shuffle along z, walk forward / backwards along x, else the stance. */
    function gait(p) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp < 0.2) return ['ready', 1];
      const fw = p.vx * p.dir;
      if (Math.abs(fw) > Math.abs(p.vz) * 1.3) {
        const clip = fw > 0 ? 'walk' : 'walk_back';
        return [clip, Math.abs(fw) / (Math.abs(data.clips[clip].speed) || 1.3)];
      }
      const clip = Math.sign(data.clips.shuffle_r.pace) === Math.sign(p.vz) ? 'shuffle_r' : 'shuffle_l';
      return [clip, sp / Math.max(Math.abs(data.clips[clip].pace) || 0, 1.9)]; // see players.js STRIDE
    }

    function steer(p, goal, now, dt, m) {
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const dist = Math.hypot(dx, dz);
      const sp = Math.hypot(p.vx, p.vz);
      if (dist < 0.05 && sp < 0.3) { p.vx = p.vz = 0; return true; }
      const left = goal.by ? Math.max(0.05, goal.by - now) : Infinity;
      let want = Math.max(m === STROLL ? m.vmax : 1.2, (dist / left) * 1.1);
      want = Math.min(want, m.vmax, Math.sqrt(2 * m.dec * Math.max(0, dist - 0.02)));
      let ax = (dx / Math.max(dist, 1e-4)) * want - p.vx;
      let az = (dz / Math.max(dist, 1e-4)) * want - p.vz;
      const da = Math.hypot(ax, az);
      const lim = (want > sp ? m.acc : m.dec) * dt;
      if (da > lim) { ax *= lim / da; az *= lim / da; }
      p.vx += ax; p.vz += az;
      p.x += p.vx * dt; p.z += p.vz * dt;
      // never through the glass, never over the net
      p.x = p.c.x + THREE.MathUtils.clamp((p.x - p.c.x) * -p.dir, 0.7, HALF_L - 0.4) * -p.dir;
      p.z = THREE.MathUtils.clamp(p.z, p.c.z - HALF_W + 0.4, p.c.z + HALF_W - 0.4);
      return false;
    }

    function brake(p, dt) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp < 1e-3) { p.vx = p.vz = 0; return; }
      const k = Math.max(0, sp - MOVE.dec * dt) / sp;
      p.vx *= k; p.vz *= k;
      p.x += p.vx * dt; p.z += p.vz * dt;
    }

    function handPoint(p, clip, t, out) {
      const h = data.clips[clip]?.hand;
      if (!h) return null;
      const f = THREE.MathUtils.clamp(t * fpsOf(clip), 0, h.length - 1);
      const i = Math.floor(f); const j = Math.min(h.length - 1, i + 1); const u = f - i;
      const at = (k) => h[i][k] + (h[j][k] - h[i][k]) * u;
      // [to their right, towards the net, up]: right is +z for both pairs (the left pair is mirrored)
      return out.set(p.x + at(1) * p.dir, p.c.y + at(2) - 0.05, p.z + at(0));
    }

    const offA = [0, 0, 0, 0, 0, 0, 0, 0];
    function frameRect(entry, mir) {
      const r = data.body[entry[0]];
      return mir || entry[2] ? mirrored(r) : r;
    }
    function writeSprite(p, slot, now) {
      const key = `${p.clip}|${p.facing}`;
      const list = data.frames[p.variant][key];
      if (!list) { hideFrame(bodies, slot); hideFrame(shadows, slot); return; }
      const loop = data.clips[p.clip].loop;
      let [i, j, t] = framePair(list.length, fpsOf(p.clip), p.clipT, loop);
      let A = frameRect(list[i]);
      let B = frameRect(list[j]);
      let [si, sj, st] = framePair(list.length, fpsOf(p.clip), p.clipT, loop, data.shadowEvery ?? 2);
      let sa = list[si][1];
      let sb = list[sj][1];
      const w = p.from ? (now - p.from.at) / p.from.dur : 1;
      if (w < 1) {
        const fl = data.frames[p.variant][`${p.from.clip}|${p.facing}`];
        if (fl) {
          const fc = data.clips[p.from.clip];
          const [fi, fj, ft] = framePair(fl.length, fpsOf(p.from.clip), p.from.t, fc.loop);
          B = t < 0.5 ? A : B;
          A = frameRect(fl[ft < 0.5 ? fi : fj]);
          if (p.from.x != null) {
            const dx = p.from.x - p.x; const dz = p.from.z - p.z;
            for (let k = 0; k < 4; k++) offA[k] = A[k];
            offA[4] = A[4] + dx; offA[5] = A[5] - dz * SIN; offA[6] = A[6] + dx; offA[7] = A[7] - dz * SIN;
            A = offA;
          }
          sb = st < 0.5 ? sa : sb;
          const [fsi] = framePair(fl.length, fpsOf(p.from.clip), p.from.t, fc.loop, data.shadowEvery ?? 2);
          sa = fl[fsi][1];
          t = st = Math.max(0, w);
        }
      }
      writeFrame(bodies, slot, A, B, t, p.x, p.c.y, p.z);
      if (sa < 0 && sb < 0) { hideFrame(shadows, slot); return; }
      if (sa < 0) sa = sb;
      if (sb < 0) sb = sa;
      writeFrame(shadows, slot, data.shadow[sa], data.shadow[sb], st, p.x, p.c.y + 0.004, p.z);
    }

    // --- Sound ---

    function level(c) {
      const v = rig.state;
      const d = Math.hypot(c.x - v.x, c.z - v.z);
      return THREE.MathUtils.clamp(1 - d / 70, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2);
    }
    const panOf = (x, z) => THREE.MathUtils.clamp((rig.screenOf(x, z).x / innerWidth) * 2 - 1, -0.8, 0.8);
    let noise = null;
    /** A padel hit: the solid bat's dull "thock" (a low body, little ring); glass a hard clack; mesh a rattle. */
    function sound(kind, x, z, c, gain = 1) {
      const bus = ambientBus();
      const lv = level(c) * gain;
      if (!bus || lv < 0.04) return;
      if (kind === 'floor') { ballBounce(lv * 0.8, panOf(x, z), 'padel'); return; }
      const { ctx, out } = bus;
      const when = ctx.currentTime + 0.005;
      if (!noise) {
        noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = panOf(x, z);
      pan.connect(out);
      const tone = { hit: [1150, 0.9, 0.045, 190], glass: [3400, 4, 0.03, 0], mesh: [1600, 0.7, 0.11, 0], net: [500, 0.8, 0.06, 0] }[kind] ?? [1200, 1, 0.04, 0];
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = tone[0] * rand(0.92, 1.08);
      bp.Q.value = tone[1];
      const gn = ctx.createGain();
      const peak = (kind === 'hit' ? 0.22 : kind === 'glass' ? 0.12 : 0.08) * lv;
      gn.gain.setValueAtTime(0.0001, when);
      gn.gain.exponentialRampToValueAtTime(peak, when + 0.003);
      gn.gain.exponentialRampToValueAtTime(0.0001, when + tone[2]);
      src.connect(bp).connect(gn).connect(pan);
      src.start(when, Math.random() * 0.05, tone[2] + 0.02);
      if (tone[3]) {
        const body = ctx.createOscillator();
        body.type = 'sine';
        body.frequency.setValueAtTime(tone[3] * rand(0.94, 1.06), when);
        body.frequency.exponentialRampToValueAtTime(tone[3] * 0.6, when + 0.06);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.0001, when);
        bg.gain.exponentialRampToValueAtTime(0.16 * lv, when + 0.004);
        bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
        body.connect(bg).connect(pan);
        body.start(when);
        body.stop(when + 0.1);
      }
    }

    // --- Play ---

    const side = (c, x) => Math.sign(x - c.x) || 1; // +1: the right pair's half
    const teamSide = (team) => (team ? 1 : -1);

    /**
     * Where and how a pair can take the ball of trajectory `tr`: the first moment one of them can be
     * there in time with a volley (net player, before the bounce), a smash (a short lob) or a
     * groundstroke after one bounce (and the glass). null: they can't (the point is over).
     */
    function findHit(g, tr, team, now) {
      const c = g.c;
      const s = teamSide(team);
      let bounced = 0;
      let ev = 0;
      const pos = new THREE.Vector3();
      const prev = new THREE.Vector3();
      for (let i = Math.round(0.3 / STEP); i < tr.n; i += 2) {
        const t = tr.t0 + i * STEP;
        while (ev < tr.events.length && tr.events[ev].t <= t) {
          const e = tr.events[ev++];
          if (e.kind === 'floor' && side(c, e.x) === s) bounced++;
          if (e.kind === 'floor' && side(c, e.x) !== s) return null; // still on the hitter's side: a fault
          if (e.kind === 'net' || e.kind === 'out') return null;
        }
        if (bounced > 1) return null;
        trajAt(tr, t, pos);
        trajAt(tr, t - STEP * 2, prev);
        const ax = (pos.x - c.x) * s;
        if (ax < 0.5) continue;
        const desc = pos.y < prev.y;
        let clip = null;
        let kind = null;
        if (!bounced && ax < 4.8 && pos.y > c.y + 0.7 && pos.y < c.y + 1.7) kind = 'volley';
        else if (!bounced && ax < 6.5 && pos.y > c.y + 2.2 && pos.y < c.y + 2.9 && desc) kind = 'smash';
        else if (bounced === 1 && ax > 2.5 && ax < HALF_L - 0.4 && pos.y > c.y + 0.45 && pos.y < c.y + 1.25 && desc) kind = 'ground';
        if (!kind) continue;
        const lane = Math.sign(pos.z - c.z) || 1;
        const p = g.players.find((q) => q.team === team && q.lane === lane);
        if ((kind === 'volley' || kind === 'smash') && p.role !== 'net') continue;
        const fore = pos.z - p.z > -0.1;
        clip = kind === 'smash' ? 'serve' : fore ? 'forehand' : 'backhand';
        const off = kind === 'smash' ? [0.3, 0.25] : [0.4, fore ? 0.78 : -0.78]; // [towards the net, +z]
        const stand = {
          x: c.x + THREE.MathUtils.clamp((pos.x - c.x) * s + off[0], 0.8, HALF_L - 0.4) * s,
          z: THREE.MathUtils.clamp(pos.z - off[1], c.z - HALF_W + 0.4, c.z + HALF_W - 0.4),
        };
        const lead = kind === 'volley' ? 0.24 : contactOf(clip);
        const by = t - lead - 0.08;
        if (Math.hypot(stand.x - p.x, stand.z - p.z) > reach(by - now - 0.15) + 0.25) continue;
        return { t, p, clip, kind, stand, lead, pos: pos.clone() };
      }
      return null;
    }

    /** The ball of `hitter` (shot `kind`) towards the other pair: a trajectory they can return, unless `last`. */
    function shoot(g, hitter, from, now, kind, last) {
      const c = g.c;
      const s = -teamSide(hitter.team); // the half it goes to
      const opp = g.players.filter((q) => q.team !== hitter.team);
      const netPair = opp.every((q) => q.role === 'net');
      let best = null;
      for (let k = 0; k < 7; k++) {
        let to; let T; let shot;
        const lane = Math.random() < 0.5 ? -1 : 1;
        if (kind === 'serve') {
          to = new THREE.Vector3(c.x + s * rand(3.6, 6.4), 0, c.z - hitter.lane * rand(1.2, 3.6));
          T = rand(0.85, 1.05); shot = 'serve';
        } else if (kind === 'smash') {
          to = new THREE.Vector3(c.x + s * rand(4, 7), 0, c.z + lane * rand(0.5, 4));
          T = rand(0.42, 0.55); shot = 'smash';
        } else if (kind === 'volley') {
          to = new THREE.Vector3(c.x + s * rand(5.5, 8.6), 0, c.z + lane * rand(0.6, 4));
          T = rand(0.6, 0.85); shot = 'volley';
        } else if ((netPair && Math.random() < 0.55) || Math.random() < 0.12) {
          to = new THREE.Vector3(c.x + s * rand(8, 9.4), 0, c.z + lane * rand(0.5, 3.8));
          T = rand(1.8, 2.2); shot = 'lob';
        } else {
          to = new THREE.Vector3(c.x + s * rand(5, 9), 0, c.z + lane * rand(0.4, 4));
          T = rand(0.9, 1.25); shot = 'drive';
        }
        if (last && Math.random() < 0.35) {
          // an error: into the net
          to.x = c.x + s * 1.5; T = 0.7;
          const v = new THREE.Vector3((to.x - from.x) / T, (c.y + 0.3 - from.y + 0.5 * G * T * T) / T, (to.z - from.z) / T);
          return { tr: simulate(from, v, now, c), shot: 'error', hit: null };
        }
        const v = aim(from, to, T, c, shot === 'lob' ? 2.2 : 0.2);
        const tr = simulate(from, v, now, c);
        const hit = findHit(g, tr, 1 - hitter.team, now);
        if (last ? !hit : hit) return { tr, shot, hit };
        best ??= { tr, shot, hit };
      }
      return best;
    }

    function playShot(g, hitter, now) {
      const c = g.c;
      const from = g.traj ? trajAt(g.traj, now, new THREE.Vector3()) : hitter.contactPos;
      g.shots++;
      const kind = hitter.kind ?? 'drive';
      const last = g.shots >= g.max;
      const r = shoot(g, hitter, from, now, kind, last);
      g.traj = r.tr;
      g.ev = 0;
      sound('hit', from.x, from.z, c, kind === 'smash' ? 1.3 : 1);
      // Positions: after a lob or a volley this pair goes up; a pair lobbed over drops back.
      const mates = g.players.filter((q) => q.team === hitter.team);
      if (r.shot === 'lob' || kind === 'volley' || kind === 'smash') mates.forEach((q) => { if (Math.random() < 0.8) q.role = 'net'; });
      const opp = g.players.filter((q) => q.team !== hitter.team);
      if (r.shot === 'lob') opp.forEach((q) => { q.role = 'back'; });
      for (const q of g.players) {
        if (q === hitter) continue;
        q.plan = null;
        q.goal = { ...rolePlace(q), by: now + 0.9 };
      }
      if (r.hit) {
        const p = r.hit.p;
        p.plan = r.hit;
        p.goal = { ...r.hit.stand, by: r.hit.t - r.hit.lead - 0.08 };
        // the split step as the other side strikes
        for (const q of opp) if (!q.stroke && Math.random() < 0.7) { q.stroke = { clip: 'split', start: now }; switchClip(q, 'split', now, BLEND * 0.6); }
      } else {
        g.over = now + (r.shot === 'error' ? 1.6 : 2.4);
      }
      hitter.kind = null;
    }

    function startServe(g, now) {
      const s = g.players.find((q) => q.team === g.serveTeam && q.lane === g.serveLane);
      g.server = s;
      g.shots = 0;
      g.max = 2 + Math.floor(Math.random() * 8);
      g.traj = null;
      g.over = 0;
      s.goal = null;
      s.stroke = { clip: 'feed', start: now, serve: true };
      switchClip(s, 'feed', now, BLEND);
      const fc = data.clips.feed;
      g.dropAt = now + (fc.drop ?? 15) / fpsOf('feed');
      g.hitAt = now + contactOf('feed');
      g.held = s;
    }

    function updatePlayer(g, p, now, dt) {
      if (p.from && now - p.from.at >= p.from.dur) p.from = null;
      else if (p.from) p.from.t += dt * (data.clips[p.from.clip]?.loop ? p.from.rate : 1);
      if (p.stroke) {
        const st = p.stroke;
        const t = now - st.start + (st.skip ?? 0);
        const len = lenOf(st.clip);
        const cut = st.clip === 'split' && (p.goal || p.plan) && now - st.start > 0.2;
        if (t >= len || cut) {
          const tr = data.clips[st.clip].travel ?? [0, 0];
          const at = { x: p.x, z: p.z };
          p.x += tr[1] * p.dir;
          p.z += tr[0];
          p.stroke = null;
          const [clip, rate] = gait(p);
          switchClip(p, clip, now, BLEND * 1.2, { at });
          p.rate = rate;
        } else {
          p.clip = st.clip;
          p.clipT = t;
          if (st.target && now < st.contactAt - 0.05) steer(p, { ...st.target, by: st.contactAt - 0.05 }, now, dt, MOVE);
          else brake(p, dt);
          return;
        }
      }
      if (p.plan && now >= p.plan.t - p.plan.lead) {
        const pl = p.plan;
        p.plan = null;
        p.kind = pl.kind;
        const skip = pl.kind === 'volley' ? contactOf(pl.clip) - pl.lead : 0;
        p.stroke = { clip: pl.clip, start: now, skip, target: pl.stand, contactAt: pl.t };
        p.hitAt = pl.t;
        p.goal = null;
        switchClip(p, pl.clip, now, BLEND * 0.8, { t: skip });
        return;
      }
      if (p.goal) {
        if (steer(p, p.goal, now, dt, p.goal.walk ? STROLL : MOVE)) p.goal = null;
      } else {
        brake(p, dt);
      }
      const [clip, rate] = gait(p);
      if (clip !== p.clip) switchClip(p, clip, now, BLEND);
      p.rate = THREE.MathUtils.clamp(rate, 0.5, 2);
      p.clipT += dt * (data.clips[clip].loop ? p.rate : 1);
    }

    function writeBall(g, now) {
      const k = g.k;
      let shown = false;
      if (g.held && g.held.stroke?.clip === 'feed' && now < g.dropAt) {
        shown = !!handPoint(g.held, 'feed', now - g.held.stroke.start, tmp);
      } else if (g.held && g.dropAt && now >= g.dropAt && now < g.hitAt) {
        const t = now - g.dropAt;
        tmp.copy(g.dropFrom); tmp.y -= 0.5 * G * t * t;
        tmp.y = Math.max(g.c.y + R, tmp.y);
        shown = true;
      } else if (g.traj && !(g.over && now > g.over - 0.4)) {
        trajAt(g.traj, now, tmp);
        shown = true;
      }
      if (!shown) {
        m4.makeScale(0, 0, 0);
        balls.setMatrixAt(k, m4);
        ballShadows.setMatrixAt(k, m4);
        return;
      }
      m4.makeTranslation(tmp.x, tmp.y, tmp.z);
      balls.setMatrixAt(k, m4);
      const h = Math.max(0, tmp.y - g.c.y);
      m4.makeTranslation(tmp.x - (sun.x / sun.y) * h, g.c.y + 0.005, tmp.z - (sun.z / sun.y) * h);
      ballShadows.setMatrixAt(k, m4);
    }

    function hideSlots(k) {
      for (let i = 0; i < 4; i++) { hideFrame(bodies, k * 4 + i); hideFrame(shadows, k * 4 + i); }
      m4.makeScale(0, 0, 0);
      balls.setMatrixAt(k, m4);
      ballShadows.setMatrixAt(k, m4);
    }

    function apply(ids) {
      const keep = ids.slice(0, MAX);
      const next = [];
      keep.forEach((id, k) => {
        const old = games.find((g) => g.id === id);
        next.push(old ? Object.assign(old, { k }) : makeGame(id, k));
      });
      games = next.filter(Boolean);
      for (let k = games.length; k < MAX; k++) hideSlots(k);
      flush(bodies); flush(shadows);
      balls.instanceMatrix.needsUpdate = true;
      ballShadows.instanceMatrix.needsUpdate = true;
    }

    let last = performance.now() / 1000;
    return {
      apply,
      courts: () => games.map((g) => g.id),
      tick() {
        const now = performance.now() / 1000;
        const dt = Math.min(0.1, now - last);
        last = now;
        if (!games.length) return false;
        for (const g of games) {
          const c = g.c;
          if (!g.traj && !g.held && !g.over && now > g.next && g.players.every((p) => !p.goal && !p.stroke)) startServe(g, now);
          if (g.held && g.dropAt && now >= g.dropAt && !g.dropFrom) {
            g.dropFrom = handPoint(g.held, 'feed', now - g.held.stroke.start, new THREE.Vector3()) ?? new THREE.Vector3(g.held.x + g.held.dir * 0.4, c.y + 0.9, g.held.z + 0.4);
          }
          if (g.held && g.hitAt && now >= g.hitAt) {
            const s = g.held;
            const t = now - g.dropAt;
            s.contactPos = g.dropFrom.clone();
            s.contactPos.y = Math.max(c.y + 0.35, s.contactPos.y - 0.5 * G * t * t);
            s.kind = 'serve';
            g.held = null; g.dropFrom = null; g.dropAt = g.hitAt = 0;
            playShot(g, s, now);
          }
          for (const p of g.players) {
            if (p.hitAt && now >= p.hitAt) { p.hitAt = 0; playShot(g, p, now); }
          }
          // bounces, glass and mesh in the sound bed
          if (g.traj) {
            while (g.ev < g.traj.events.length && g.traj.events[g.ev].t <= now) {
              const e = g.traj.events[g.ev++];
              if (e.kind !== 'out') sound(e.kind, e.x, e.z, c, Math.min(1, (e.speed ?? 4) / 8));
            }
          }
          if (g.over && now > g.over) {
            g.over = 0;
            g.traj = null;
            g.points++;
            g.serveLane = -g.serveLane;
            if (g.points % 4 === 0) g.serveTeam = 1 - g.serveTeam;
            g.next = now + rand(1.5, 3.5);
            servePlaces(g);
          }
          g.players.forEach((p) => updatePlayer(g, p, now, dt));
        }
        games.forEach((g) => {
          // back to front: the far lane first
          const order = [...g.players].sort((a, b) => a.z - b.z);
          order.forEach((p, i) => writeSprite(p, g.k * 4 + i, now));
          writeBall(g, now);
        });
        flush(bodies);
        flush(shadows);
        balls.instanceMatrix.needsUpdate = true;
        ballShadows.instanceMatrix.needsUpdate = true;
        return true;
      },
      /** Row 32 (life/follow-cam.js): the padel player under a screen point, as a live position getter. */
      personAt(x, y) {
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let best = null; let bd = Infinity;
        for (const g of games) {
          for (const p of g.players) {
            tmp.set(p.x, p.c.y + 0.95, p.z).project(camera);
            const sx = (tmp.x + 1) * innerWidth / 2;
            const sy = (1 - tmp.y) * innerHeight / 2;
            const r = Math.max(14, 1.1 * innerHeight / (2 * rig.state.dist * halfTan));
            const d = Math.hypot((sx - x) * 1.6, sy - y);
            if (d < r && d < bd) { bd = d; best = p; }
          }
        }
        return best && (() => (games.some((g) => g.players.includes(best)) ? { x: best.x, z: best.z } : null));
      },
      game: (id) => games.find((g) => g.id === id) ?? null,
      debug: () => games.map((g) => ({ court: g.id, shots: g.shots, ball: !!g.traj, players: g.players.map((p) => `${p.variant}:${p.clip}:${p.role}@${p.x.toFixed(1)},${p.z.toFixed(1)}`) })),
    };
  }

  return sys;
}
