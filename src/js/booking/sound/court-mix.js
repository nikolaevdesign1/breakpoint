import { ambientBus, setCourtShape } from '../ambient.js';
import { createListener } from './listener.js';

// Closer to a court, more of its sound (round 9, row 33). Zoomed out the map is the club's general
// bed (wind, pad, the murmur and distant rallies in ambient.js / soundscape.js). As the drone comes
// down over a court, that court's hits get louder, brighter and wider in the stereo field, and you
// start to hear the players: footsteps (a gritty scuff on clay, a soft thud and now and then a shoe
// squeak on hard courts) and short calls when a point ends ("Out!", "Come on!"), all synthesised.
//
// Hits come from life/players.js through ambient.js courtHit(), shaped here by the zoom. Footsteps
// and calls are read from the rallies (players.game(id), read only): how fast each player moves,
// and when a point is over.

const rand = (a, b) => a + Math.random() * (b - a);
const STEP_MIN = 0.35; // m/s: slower than this is standing
const VOWELS = { // formants (Hz): F1, F2, F3
  a: [720, 1240, 2600],
  o: [520, 900, 2450],
  u: [360, 820, 2350],
  uh: [620, 1180, 2550],
  e: [560, 1720, 2550],
};

export function createCourtMix({ rig, players }) {
  if (!players) return null;
  const ear = createListener(rig);

  // Hits: louder and brighter close up, near silent zoomed out (the bed carries the far courts).
  setCourtShape((level, pan) => {
    const n = ear.near();
    return { level: level * (0.06 + 0.94 * n), pan: pan * (0.55 + 0.45 * n), near: n };
  });

  const track = new WeakMap(); // player → { x, z, v, phase }
  const points = new Map(); // court id → was a point over last frame
  let noise = null;
  let noiseCtx = null;
  let last = performance.now() / 1000;
  const counts = { steps: 0, calls: 0 };

  function noiseBuf(ctx) {
    if (noise && noiseCtx === ctx) return noise;
    noiseCtx = ctx;
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function outAt(bus, pan) {
    const p = bus.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(bus.out);
    setTimeout(() => p.disconnect(), 1500);
    return p;
  }

  function burst(bus, out, at, { type, f, q = 0.8, len, level }) {
    const { ctx } = bus;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(flt).connect(g).connect(out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + len + 0.02);
  }

  /** One footfall: clay crunches (two grains), hard courts thud, sometimes with a squeak. */
  function step(bus, surface, level, pan, braking) {
    const { ctx } = bus;
    const at = ctx.currentTime + 0.01;
    const out = outAt(bus, pan);
    if (surface === 'clay') {
      burst(bus, out, at, { type: 'bandpass', f: rand(1100, 1600), q: 0.9, len: 0.05, level: 0.05 * level });
      burst(bus, out, at + rand(0.012, 0.02), { type: 'bandpass', f: rand(2200, 3200), q: 1.2, len: 0.035, level: 0.028 * level });
    } else {
      burst(bus, out, at, { type: 'lowpass', f: 520, q: 0.7, len: 0.06, level: 0.07 * level });
      if (braking || Math.random() < 0.06) { // rubber on acrylic
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f0 = rand(2300, 2900);
        o.frequency.setValueAtTime(f0, at);
        o.frequency.linearRampToValueAtTime(f0 * rand(1.15, 1.3), at + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.022 * level, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + 0.1);
      }
    }
    counts.steps++;
  }

  /**
   * A short shout: a buzzy glottal source (sawtooth) through three formant filters that glide from
   * one vowel to the next, with a pitch contour. Far from intelligible, close enough to read as
   * "Out!" or "Come on!" across a court.
   */
  function call(bus, pan, level) {
    const { ctx } = bus;
    const out = outAt(bus, pan);
    const high = Math.random() < 0.4;
    const f0 = high ? rand(200, 240) : rand(115, 145);
    const kind = Math.random() < 0.45 ? 'out' : 'come';
    // syllables: [from vowel, to vowel, seconds, pitch from × f0, pitch to × f0, consonant before]
    const parts = kind === 'out'
      ? [['a', 'u', 0.22, 1.25, 0.85, null]]
      : [['uh', 'uh', 0.09, 1.1, 1.15, 'k'], ['a', 'o', 0.24, 1.3, 0.8, 'm']];
    let at = ctx.currentTime + 0.02;
    for (const [v0, v1, len, p0, p1, cons] of parts) {
      if (cons === 'k') { burst(bus, out, at, { type: 'bandpass', f: 1800, q: 1.2, len: 0.03, level: 0.03 * level }); at += 0.035; }
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(f0 * p0, at);
      src.frequency.exponentialRampToValueAtTime(f0 * p1, at + len);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level * (cons === 'm' ? 0.05 : 0.06), at + (cons === 'm' ? 0.04 : 0.02));
      env.gain.setTargetAtTime(0.0001, at + len * 0.7, len * 0.18);
      VOWELS[v0].forEach((f, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = [7, 9, 11][i];
        bp.frequency.setValueAtTime(f * (high ? 1.12 : 1), at);
        bp.frequency.linearRampToValueAtTime(VOWELS[v1][i] * (high ? 1.12 : 1), at + len);
        const g = ctx.createGain();
        g.gain.value = [1, 0.6, 0.25][i];
        src.connect(bp).connect(g).connect(env);
      });
      env.connect(out);
      src.start(at);
      src.stop(at + len + 0.3);
      if (kind === 'out') burst(bus, out, at + len - 0.01, { type: 'highpass', f: 3500, q: 0.7, len: 0.025, level: 0.02 * level }); // the t
      at += len + 0.02;
    }
    counts.calls++;
  }

  return {
    name: 'courtmix',
    tick() {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      if (dt <= 0) return false;
      const near = ear.near();
      const bus = near > 0.02 ? ambientBus() : null;
      for (const id of players.courts?.() ?? []) {
        const game = players.game(id);
        if (!game) continue;
        const surface = id.startsWith('clay') ? 'clay' : 'hard';
        // Calls: a point has just ended.
        const over = !!game.pointOver;
        if (over && !points.get(id) && bus && Math.random() < 0.6) {
          const who = game.winner ?? game.players[0];
          const level = near * ear.reach(who.x, who.z);
          if (level > 0.05) setTimeout(() => { const b = ambientBus(); if (b) call(b, ear.pan(who.x, who.z), level); }, rand(250, 700));
        }
        points.set(id, over);
        // Footsteps.
        for (const p of game.players) {
          let t = track.get(p);
          if (!t) track.set(p, t = { x: p.x, z: p.z, v: 0, phase: Math.random() });
          const v = Math.hypot(p.x - t.x, p.z - t.z) / dt;
          const braking = (t.v - v) / dt > 7; // a hard stop: m/s²
          t.x = p.x; t.z = p.z;
          t.v += (v - t.v) * Math.min(1, dt * 10);
          if (p.gone || t.v < STEP_MIN) { t.phase = 0.6; continue; }
          t.phase += dt * Math.min(3.4, 1.3 + 0.55 * t.v);
          if (t.phase < 1) continue;
          t.phase -= 1;
          if (!bus) continue;
          const level = near * ear.reach(p.x, p.z) * Math.min(1, 0.5 + t.v * 0.2);
          if (level > 0.06) step(bus, surface, level, ear.pan(p.x, p.z), braking && t.v > 2);
        }
      }
      return false;
    },
    debug: () => ({ near: +ear.near().toFixed(2), ...counts }),
  };
}
