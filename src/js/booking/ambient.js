// Ambient bed for the 3D map, synthesised with Web Audio — no audio files:
// wind (filtered noise with slow gusts), a quiet pad of soft chords and,
// now and then, a distant rally. Starts on the first gesture, fades in over ~2 s.
// Mute state is shared with the click sound (src/js/site/sound.js) via sessionStorage.

import { startSoundscape, rallyLevel } from './soundscape.js';

const KEY = 'bp-sound-muted';
const EVENT = 'bp-sound-change';
const LEVEL = 0.9;
const FADE_IN = 2.2;

// Fmaj9 → Am7 → Dm9 → Cmaj7, voiced low and close.
const CHORDS = [
  [53, 57, 60, 64, 67],
  [57, 60, 64, 67],
  [50, 57, 60, 64, 65],
  [48, 55, 59, 64],
];
const CHORD_SECONDS = 9;

const readMuted = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
const writeMuted = (v) => { try { sessionStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode */ } };
const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

let ctx = null;
let master = null;
let started = false;
let muted = readMuted();
const timers = new Set();

function later(fn, seconds) {
  const id = setTimeout(() => { timers.delete(id); fn(); }, seconds * 1000);
  timers.add(id);
}

function noiseBuffer(seconds, brown = false) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; } else d[i] = white;
  }
  return buf;
}

// --- Rain (row 151) ---------------------------------------------------------------
// When it rains in Miami (booking/weather.js): a soft hiss of drops, louder with heavier rain.

let rainLevel = 0;
let rainGain = null;

function startRain() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(4);
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6000;
  rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  src.connect(hp).connect(lp).connect(rainGain).connect(master);
  src.start();
  setRain(rainLevel);
}

function setRain(level, fast = false) {
  rainLevel = level;
  if (rainGain) rainGain.gain.setTargetAtTime(level * 0.22, ctx.currentTime, fast ? 0.6 : 2.5);
}
document.addEventListener('bp-weather', (e) => setRain(e.detail.rain ?? 0, e.detail.manual));

// --- Thunder (round 7) --------------------------------------------------------------
// A lightning flash on the map (life/storm.js) sends `bp-thunder` { delay, power }: after the delay a
// rumble rolls in, brown noise through a low-pass that closes as it fades, swelling two or three
// times; a strong, close strike starts with a short crack.

let thunderNoise = null;

function thunder(power) {
  if (!ctx || !started || muted || ctx.state !== 'running') return;
  thunderNoise ??= noiseBuffer(8, true);
  const t = ctx.currentTime + 0.02;
  const len = 3.5 + power * 3;
  const src = ctx.createBufferSource();
  src.buffer = thunderNoise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(320 + power * 520, t);
  lp.frequency.exponentialRampToValueAtTime(90, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34 * power, t + 0.12 + (1 - power) * 0.4);
  let at = t + 0.5;
  for (let i = 0; i < 3; i++) { // rolling swells
    g.gain.setTargetAtTime(rand(0.16, 0.42) * power, at, 0.18);
    at += rand(0.4, 0.9);
  }
  g.gain.setTargetAtTime(0.0001, at, len * 0.22);
  const p = ctx.createStereoPanner();
  p.pan.value = rand(-0.5, 0.5);
  src.connect(lp).connect(g).connect(p).connect(master);
  src.start(t, rand(0, 3));
  src.stop(t + len + 2);

  if (power > 0.8) {
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(0.4);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.7;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    crack.connect(band).connect(cg).connect(p);
    crack.start(t);
  }
}
document.addEventListener('bp-thunder', (e) => later(() => thunder(Math.min(1, e.detail?.power ?? 0.8)), e.detail?.delay ?? 2));

// --- Fireworks (round 8, life/seasons.js) -------------------------------------------------
// A shell bursting far off on July 4th sends `bp-firework` { delay, power, pan }: after the delay
// a muffled boom, a low thump in brown noise with the top cut off, and a faint crackle behind it.

function boom(power, pan) {
  if (!ctx || !started || muted || ctx.state !== 'running') return;
  thunderNoise ??= noiseBuffer(8, true);
  const t = ctx.currentTime + 0.02;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = thunderNoise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, t);
  lp.frequency.exponentialRampToValueAtTime(70, t + 1.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2 * power, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  src.connect(lp).connect(g).connect(p);
  src.start(t, rand(0, 6));
  src.stop(t + 1.6);
  const body = ctx.createOscillator();
  body.frequency.setValueAtTime(rand(52, 64), t);
  body.frequency.exponentialRampToValueAtTime(34, t + 0.5);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.16 * power, t + 0.015);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  body.connect(bg).connect(p);
  body.start(t);
  body.stop(t + 0.7);
  if (power > 0.6) { // a far crackle as the stars burn out
    hitNoise ??= noiseBuffer(0.05);
    for (let i = 0; i < 7; i++) {
      const at = t + 0.5 + rand(0, 0.9);
      const c = ctx.createBufferSource();
      c.buffer = hitNoise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = rand(1800, 3200);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, at);
      cg.gain.exponentialRampToValueAtTime(0.012 * power, at + 0.003);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      c.connect(band).connect(cg).connect(p);
      c.start(at);
    }
  }
}
document.addEventListener('bp-firework', (e) => later(() => boom(Math.min(1, e.detail?.power ?? 0.7), e.detail?.pan ?? 0), e.detail?.delay ?? 1));

// --- Wind ----------------------------------------------------------------------

function startWind() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(6, true);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = 0.16;
  src.connect(filter).connect(gain).connect(master);
  src.start();

  // A gust every few seconds: the filter opens and the level swells, then settles.
  const gust = () => {
    const t = ctx.currentTime;
    const len = rand(2.5, 6);
    filter.frequency.setTargetAtTime(rand(520, 1100), t, len * 0.35);
    gain.gain.setTargetAtTime(rand(0.2, 0.32), t, len * 0.35);
    filter.frequency.setTargetAtTime(rand(300, 460), t + len * 0.6, len * 0.4);
    gain.gain.setTargetAtTime(rand(0.11, 0.16), t + len * 0.6, len * 0.4);
    later(gust, len + rand(1, 4));
  };
  gust();
}

// --- Pad -------------------------------------------------------------------------

let padBus = null;

function startPad() {
  padBus = ctx.createGain();
  padBus.gain.value = 0.05;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 900;
  // Short feedback delay for a little room.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.37;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  padBus.connect(tone).connect(master);
  tone.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(master);

  let i = 0;
  const next = () => {
    playChord(CHORDS[i % CHORDS.length], CHORD_SECONDS);
    i++;
    later(next, CHORD_SECONDS - 1.5); // chords overlap while one fades out
  };
  next();
}

function playChord(notes, seconds) {
  const t = ctx.currentTime;
  notes.forEach((n, k) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2 / notes.length, t + 2.6 + k * 0.15);
    env.gain.setTargetAtTime(0, t + seconds - 2.5, 1.1);
    env.connect(padBus);
    for (const [type, detune] of [['sine', -4], ['triangle', 5]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midiHz(n);
      osc.detune.value = detune;
      osc.connect(env);
      osc.start(t);
      osc.stop(t + seconds + 4);
    }
  });
}

// --- Distant rally ------------------------------------------------------------------

let hitNoise = null;

function hit(when, pan, level = 1, near = 0) {
  const src = ctx.createBufferSource();
  src.buffer = hitNoise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = rand(1400, 1900);
  band.Q.value = 1.4;
  const far = ctx.createBiquadFilter(); // distance takes the edge off
  far.type = 'lowpass';
  far.frequency.value = 2400 + 5200 * near; // round 9 (row 33): close up the edge comes back
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(rand(0.05, 0.09) * level, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(band).connect(far).connect(g).connect(p).connect(master);
  src.start(when);

  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(rand(520, 640), when);
  body.frequency.exponentialRampToValueAtTime(300, when + 0.06);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, when);
  bg.gain.exponentialRampToValueAtTime(0.035 * level, when + 0.005);
  bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
  body.connect(bg).connect(p);
  body.start(when);
  body.stop(when + 0.1);
}

/** Round 7 (life/parrots.js): the running context and the ambient bus for a voice of its own, or null while silent. */
export function ambientBus() {
  return ctx && started && !muted && ctx.state === 'running' ? { ctx, out: master } : null;
}

/** A ball struck on one of the map's courts (life/players.js): level 0..1 by distance, pan −1..1. */
export function courtHit(level, pan) {
  if (!ctx || !started || muted || ctx.state !== 'running') return;
  let near = 0;
  if (courtShape) ({ level, pan, near } = courtShape(level, pan)); // round 9 (row 33)
  if (level < 0.015) return;
  hit(ctx.currentTime + 0.005, pan, Math.min(1.6, level * 1.6), near);
}

// Round 9 (row 33): sound/court-mix.js shapes the court hits by how close the camera is.
let courtShape = null;
/** fn(level, pan) → { level, pan, near } */
export function setCourtShape(fn) { courtShape = fn; }

// --- Crowd (round 7, life/tournament.js) ------------------------------------------------
// Applause from the stands on a tournament day. A few hundred claps (short bursts of filtered noise,
// each its own tone and loudness) are scattered over four seconds and mixed once into a buffer;
// every round of applause plays it from a random point with its own swell and fade.

let applauseBuf = null;

function applauseBuffer() {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 4);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < 900; k++) {
      const at = Math.floor(Math.random() * (len - rate * 0.05));
      const tone = rand(0.2, 0.7); // one-pole smoothing: lower is a duller, cupped clap
      const amp = rand(0.12, 0.45);
      const decay = rand(0.003, 0.008) * rate;
      let lp = 0;
      for (let i = 0; i < decay * 5; i++) {
        lp += (Math.random() * 2 - 1 - lp) * tone;
        d[at + i] += lp * amp * Math.exp(-i / decay);
      }
    }
  }
  return buf;
}

/** A round of applause from the stands: level 0..1 (distance and how good the point was), pan −1..1. */
export function crowdApplause(level, pan = 0, seconds = 2.6) {
  if (!ctx || !started || muted || ctx.state !== 'running' || level < 0.03) return;
  applauseBuf ??= applauseBuffer();
  const t = ctx.currentTime + 0.02;
  const src = ctx.createBufferSource();
  src.buffer = applauseBuf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 380;
  const far = ctx.createBiquadFilter(); // the further the stands, the softer the edge
  far.type = 'lowpass';
  far.frequency.value = 2200 + 4200 * Math.min(1, level);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setTargetAtTime(Math.min(1, level) * 0.2, t, 0.18);
  g.gain.setTargetAtTime(0.0001, t + seconds, 0.55);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(hp).connect(far).connect(g).connect(p).connect(master);
  src.start(t, Math.random() * 3.5);
  src.stop(t + seconds + 3.5);
}

/**
 * A ball bouncing on a court close by (interact/ball-tap.js): a short thud, duller on clay and grass,
 * sharper on hard courts. `level` 0..1 (impact speed and distance), `pan` −1..1.
 */
const BOUNCE_TONE = { clay: [900, 170], hard: [2600, 230], padel: [1800, 210], grass: [700, 150] };
let bounceNoise = null;
export function ballBounce(level, pan, surface = 'hard') {
  if (!ctx || !started || muted || ctx.state !== 'running' || level < 0.02) return;
  const [cut, pitch] = BOUNCE_TONE[surface] ?? BOUNCE_TONE.hard;
  const when = ctx.currentTime + 0.005;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  bounceNoise ??= noiseBuffer(0.04);
  const src = ctx.createBufferSource();
  src.buffer = bounceNoise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cut;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.09 * level, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  src.connect(lp).connect(g).connect(p);
  src.start(when);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(pitch * rand(0.95, 1.08), when);
  body.frequency.exponentialRampToValueAtTime(pitch * 0.55, when + 0.07);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, when);
  bg.gain.exponentialRampToValueAtTime(0.12 * level, when + 0.004);
  bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
  body.connect(bg).connect(p);
  body.start(when);
  body.stop(when + 0.12);
}

function startRallies() {
  hitNoise = noiseBuffer(0.05);
  const rally = () => {
    const shots = 2 + Math.floor(Math.random() * 5);
    const side = rand(-0.7, 0.7);
    const level = rallyLevel(); // round 8: club hours only (soundscape.js)
    let t = ctx.currentTime + 0.05;
    for (let s = 0; s < shots && level > 0.05; s++) {
      hit(t, side + (s % 2 ? 0.18 : -0.18), level);
      t += rand(1.05, 1.45);
    }
    later(rally, shots * 1.25 + rand(5, 12));
  };
  later(rally, rand(3, 6));
}

// --- Control ------------------------------------------------------------------------

function ensureContext() {
  if (ctx) return true;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return true;
}

function start() {
  if (started || !ensureContext()) return;
  started = true;
  startWind();
  startPad();
  startRallies();
  startRain();
  startSoundscape(ctx, master); // round 8: birds, far courts, cicadas, crickets by the map's hour
}

function fadeTo(level, seconds) {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(level, t + seconds);
}

function sync() {
  if (!ctx) return;
  if (muted || document.hidden) {
    fadeTo(0, 0.4);
    later(() => { if ((muted || document.hidden) && ctx.state === 'running') ctx.suspend(); }, 0.45);
  } else {
    ctx.resume();
    start();
    fadeTo(LEVEL, FADE_IN);
  }
}

function setMuted(value, { broadcast = false } = {}) {
  if (value === muted && !broadcast) return;
  muted = value;
  writeMuted(muted);
  if (broadcast) document.dispatchEvent(new CustomEvent(EVENT, { detail: { muted } }));
  sync();
}

export function initAmbient() {
  // Browsers only allow audio after a gesture: the first one unlocks and starts the bed.
  const unlock = (e) => {
    ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.removeEventListener(t, unlock, true));
    if (!ensureContext()) return;
    // A press on the sound toggle decides for itself (its click flips the state).
    if (e.target.closest?.('[data-sound-toggle]')) return;
    sync();
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, unlock, { capture: true, passive: true }));

  // The toggle is shared with sound.js, which flips its own state and the stored flag on click;
  // read the stored value right after so both stay in step.
  document.querySelectorAll('[data-sound-toggle]').forEach((b) => b.addEventListener('click', () => {
    queueMicrotask(() => {
      const stored = readMuted();
      setMuted(stored === muted ? !muted : stored, { broadcast: true });
    });
  }));

  document.addEventListener(EVENT, (e) => {
    if (typeof e.detail?.muted === 'boolean' && e.detail.muted !== muted) setMuted(e.detail.muted);
  });
  document.addEventListener('visibilitychange', sync);
}
