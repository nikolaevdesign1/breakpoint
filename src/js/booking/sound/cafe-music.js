import { ambientBus } from '../ambient.js';
import { createListener } from './listener.js';

// Music from the café (round 9, row 17). When the café deck is serving in the evening (its string
// lights on: life/clubhouse.js, open until 22:00), a quiet lounge loop plays from the terrace:
// electric piano (a soft FM bell over a sine), a round bass, brushes and a shaker, at 84 bpm over
// Dm9, G13, Cmaj9, A7. All synthesised, nothing downloaded. Quiet from across the club, clearer as
// the drone comes down to the clubhouse, panned to where the terrace is on screen. Mixed into the
// ambient bus, so the sound toggle and the tab going to the background silence it.

const DECK = { x: 55, z: -47 }; // the café terrace (model metres)
const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOK = 0.35; // s scheduled ahead
const LEVEL = 0.16;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

// Two bars per chord: [bass root, piano voicing]
const CHORDS = [
  [38, [53, 57, 60, 64]], // Dm9: F A C E over D
  [43, [53, 57, 59, 64]], // G13: F A B E over G
  [36, [52, 55, 59, 62]], // Cmaj9: E G B D over C
  [45, [55, 59, 61, 65]], // A7 (b13): G B C# F over A
];
// Piano comping in eighths across two bars: [eighth index, length in eighths, velocity]
const COMP = [[0, 3, 1], [3, 2, 0.7], [7, 2, 0.6], [8, 3, 0.9], [11, 4, 0.65]];
// Bass: [eighth, semitones over the root, length in eighths]
const BASS = [[0, 0, 3], [3, 7, 1], [4, 12, 2], [6, 7, 2], [8, 0, 3], [11, 7, 1], [12, 10, 2], [14, 7, 2]];

export function createCafeMusic({ rig, clubhouse }) {
  if (!clubhouse) return null;
  const ear = createListener(rig);
  let audio = null; // { ctx, out, gain, pan, tone, room }
  let nextAt = 0; // ctx time of the next eighth to schedule
  let eighth = 0;
  let level = 0;
  let lastCheck = 0;
  let noise = null;

  function build(bus) {
    const { ctx } = bus;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const tone = ctx.createBiquadFilter(); // outdoor speakers, heard from a distance
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    const pan = ctx.createStereoPanner();
    const room = ctx.createDelay(0.5); // a little terrace slap-back
    room.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    const mix = ctx.createGain();
    mix.connect(tone);
    mix.connect(room);
    room.connect(fb).connect(room);
    room.connect(wet).connect(tone);
    tone.connect(gain).connect(pan).connect(bus.out);
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return { ctx, out: bus.out, gain, pan, tone, mix };
  }

  /** Electric piano note: sine body plus a two-operator bell that fades fast (the tine). */
  function piano(at, note, len, vel) {
    const { ctx, mix } = audio;
    const f = midi(note);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.05 * vel, at + 0.008);
    env.gain.setTargetAtTime(0.022 * vel, at + 0.02, 0.35);
    env.gain.setTargetAtTime(0.0001, at + len, 0.12);
    const body = ctx.createOscillator();
    body.frequency.value = f;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 14; // the tine's metallic edge
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 1.4 * vel, at);
    idx.gain.exponentialRampToValueAtTime(1, at + 0.25);
    mod.connect(idx).connect(car.frequency);
    const bell = ctx.createGain();
    bell.gain.value = 0.35;
    body.connect(env);
    car.connect(bell).connect(env);
    env.connect(mix);
    const end = at + len + 0.6;
    for (const o of [body, car, mod]) { o.start(at); o.stop(end); }
  }

  function bass(at, note, len) {
    const { ctx, mix } = audio;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(note);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    g.gain.setTargetAtTime(0.06, at + 0.05, 0.2);
    g.gain.setTargetAtTime(0.0001, at + len - 0.03, 0.04);
    o.connect(lp).connect(g).connect(mix);
    o.start(at);
    o.stop(at + len + 0.3);
  }

  function brush(at, len, lvl, f = 7000) {
    const { ctx, mix } = audio;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(lvl, at + Math.min(0.03, len * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(bp).connect(g).connect(mix);
    src.start(at, Math.random() * 0.3);
    src.stop(at + len + 0.02);
  }

  function kick(at) {
    const { ctx, mix } = audio;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, at);
    o.frequency.exponentialRampToValueAtTime(48, at + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(mix);
    o.start(at);
    o.stop(at + 0.25);
  }

  /** Everything that starts on this eighth of the loop (16 eighths per chord, 4 chords). */
  function play(at, i) {
    const e8 = BEAT / 2;
    const swing = i % 2 ? e8 * 0.12 : 0; // a little lilt on the off-beats
    const chord = CHORDS[Math.floor(i / 16) % CHORDS.length];
    const k = i % 16;
    const t = at + swing;
    for (const [pos, len, vel] of COMP) {
      if (pos !== k) continue;
      chord[1].forEach((n, j) => piano(t + j * 0.012, n, len * e8, vel * rand(0.85, 1)));
    }
    for (const [pos, semi, len] of BASS) if (pos === k) bass(t, chord[0] + semi, len * e8);
    if (k % 4 === 0) kick(t);
    if (k % 4 === 2) brush(t, 0.22, 0.03, 5200); // brushes on 2 and 4
    brush(t, 0.05, i % 2 ? 0.008 : 0.012, 9000); // shaker in eighths
  }

  function schedule() {
    const { ctx } = audio;
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + LOOK) {
      play(nextAt, eighth);
      eighth = (eighth + 1) % (16 * CHORDS.length);
      nextAt += BEAT / 2;
    }
  }

  return {
    name: 'cafemusic',
    tick() {
      const now = performance.now() / 1000;
      if (now - lastCheck < 0.1) return false;
      lastCheck = now;
      const bus = ambientBus();
      const open = clubhouse.debug?.().cafe ?? 0; // the deck serving: dark and open (string lights)
      const close = ear.reach(DECK.x, DECK.z, 1.4); // heard across the club, much clearer up close
      const want = bus ? open * (0.12 + 0.88 * close) * (0.55 + 0.45 * ear.near()) : 0;
      if (bus && !audio && want > 0.01) audio = build(bus);
      if (!audio) return false;
      level += (want - level) * 0.25;
      if (level < 0.004 && want < 0.004) { level = 0; audio.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.3); return false; }
      const t = audio.ctx.currentTime;
      audio.gain.gain.setTargetAtTime(level * LEVEL, t, 0.35);
      audio.tone.frequency.setTargetAtTime(1300 + 4200 * close * ear.near(), t, 0.4);
      audio.pan.pan.setTargetAtTime(ear.pan(DECK.x, DECK.z), t, 0.3);
      if (bus) schedule(); // muted or hidden: nothing new is scheduled
      return false;
    },
    debug: () => ({ level: +level.toFixed(3), cafe: clubhouse.debug?.().cafe ?? null, playing: !!audio && level > 0.004 }),
  };
}
