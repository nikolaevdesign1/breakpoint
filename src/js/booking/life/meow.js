// The club cat's "mi-aow" (row 141), synthesised with Web Audio: no audio files.
// A buzzy voice (sawtooth) glides up then down; three formant filters move from a closed "m/i"
// to an open "a" and round off into "w", so the vowel changes the way a real meow does.
// A touch of vibrato and breath, soft edges, and every call comes out a little different.
// Respects the shared mute (sessionStorage 'bp-sound-muted', event 'bp-sound-change').

const KEY = 'bp-sound-muted';
const EVENT = 'bp-sound-change';
const LEVEL = 0.5;
const rand = (a, b) => a + Math.random() * (b - a);

// Formants for a small vocal tract: [frequency, Q, gain] for F1..F3 at each vowel.
const VOWELS = {
  m: [[520, 6, 0.6], [1500, 8, 0.14], [3000, 10, 0.04]],
  i: [[640, 6, 0.8], [2500, 9, 0.5], [3600, 10, 0.18]],
  a: [[1150, 5, 1], [1900, 7, 0.6], [3300, 9, 0.22]],
  w: [[600, 6, 0.7], [1100, 8, 0.3], [2800, 10, 0.06]],
};

let ctx = null;
let out = null;
let noise = null;
let muted = readMuted();

function readMuted() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try { ctx = new AudioCtx(); } catch { return null; }
  // Gentle top end: the voice should never sound sharp, even on laptop speakers.
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 5200;
  soft.Q.value = 0.5;
  out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(soft).connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

document.addEventListener(EVENT, (e) => {
  if (typeof e.detail?.muted !== 'boolean') return;
  muted = e.detail.muted;
  if (muted && ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.03); // cut a meow in progress
});

/** Ramp a param through [time fraction, value] points over `len` seconds from `t`. */
function glide(param, t, len, points) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(points[0][1], t);
  for (const [f, v] of points.slice(1)) param.linearRampToValueAtTime(v, t + f * len);
}

export function meow() {
  // sound.js flips the stored flag without an event: read it fresh as well.
  if (muted || readMuted() || !ensureContext()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime + 0.01;
  const len = rand(0.52, 0.7);
  const pitch = rand(0.9, 1.12);
  const peak = rand(0.3, 0.42); // where the "a" opens fully
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(LEVEL, t);

  // Voice: rise from "m" into "a", then sag down into "w".
  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  const f0 = 560 * pitch;
  glide(voice.frequency, t, len, [[0, f0 * 0.92], [0.12, f0], [peak, f0 * rand(1.28, 1.42)], [0.72, f0 * 1.12], [1, f0 * 0.78]]);
  // Vibrato, a little wider towards the end like a held note.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rand(5.5, 7);
  const depth = ctx.createGain();
  glide(depth.gain, t, len, [[0, 6], [0.5, 14], [1, 22]]); // cents
  lfo.connect(depth).connect(voice.detune);

  // Mouth: three formants in parallel, sliding m → i → a → w.
  const mouth = ctx.createGain();
  mouth.gain.value = 1;
  const steps = [[0, 'm'], [0.12, 'i'], [peak, 'a'], [0.7, 'a'], [1, 'w']];
  for (let k = 0; k < 3; k++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const g = ctx.createGain();
    glide(bp.frequency, t, len, steps.map(([f, v]) => [f, VOWELS[v][k][0] * pitch]));
    glide(bp.Q, t, len, steps.map(([f, v]) => [f, VOWELS[v][k][1]]));
    glide(g.gain, t, len, steps.map(([f, v]) => [f, VOWELS[v][k][2]]));
    voice.connect(bp).connect(g).connect(mouth);
  }

  // Breath: a whisper of noise through the same opening.
  const breath = ctx.createBufferSource();
  breath.buffer = noise;
  breath.playbackRate.value = rand(0.9, 1.1);
  const air = ctx.createBiquadFilter();
  air.type = 'bandpass';
  air.Q.value = 0.9;
  glide(air.frequency, t, len, [[0, 1800], [peak, 3200], [1, 1600]]);
  const airGain = ctx.createGain();
  glide(airGain.gain, t, len, [[0, 0], [0.1, 0.05], [peak, 0.07], [1, 0]]);
  breath.connect(air).connect(airGain).connect(mouth);

  // Envelope: soft nasal onset, swell on the "a", a slow fade through the "w".
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
  env.gain.linearRampToValueAtTime(0.9, t + peak * len);
  env.gain.linearRampToValueAtTime(0.7, t + 0.72 * len);
  env.gain.exponentialRampToValueAtTime(0.0001, t + len);
  mouth.connect(env).connect(out);

  const end = t + len + 0.05;
  [voice, lfo, breath].forEach((n) => { n.start(t); n.stop(end); });
  voice.onended = () => env.disconnect();
}
