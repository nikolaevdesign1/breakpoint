import { ambientBus } from '../ambient.js';

// Round 9: small voices for the map details, played through the ambient bus (silent while the
// sound is off): a ball into the net (row 15), the contactor of a floodlight mast (row 14), pigeons taking off (row 28).

let noise = null;
function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(ctx, out, when, { type, freq, q = 1, peak, attack, decay }) {
  noise ??= noiseBuffer(ctx, 0.5);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  src.connect(f).connect(g).connect(out);
  src.start(when, Math.random() * 0.3);
  src.stop(when + attack + decay + 0.02);
}

function panned(ctx, out, pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
  p.connect(out);
  return p;
}

/**
 * A ball into the net: the soft thump of the tape and mesh taking it, then the mesh shivering
 * (a few quick, fading rattles of filtered noise). `level` 0..1, `pan` −1..1.
 */
export function netCatch(level, pan) {
  const bus = ambientBus();
  if (!bus || level < 0.02) return;
  const { ctx, out } = bus;
  const p = panned(ctx, out, pan);
  const t = ctx.currentTime + 0.005;
  burst(ctx, p, t, { type: 'lowpass', freq: 420, peak: 0.16 * level, attack: 0.004, decay: 0.12 });
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(140, t);
  body.frequency.exponentialRampToValueAtTime(70, t + 0.14);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.1 * level, t + 0.006);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  body.connect(bg).connect(p);
  body.start(t);
  body.stop(t + 0.18);
  for (let i = 0; i < 5; i++) {
    burst(ctx, p, t + 0.03 + i * 0.045 + Math.random() * 0.01, { type: 'bandpass', freq: 1700 + Math.random() * 900, q: 2.2, peak: 0.05 * level * (1 - i / 6), attack: 0.003, decay: 0.03 });
  }
}

/** The contactor of a floodlight mast closing: a dry clunk and a short rising mains hum. */
export function relayClunk(level, pan) {
  const bus = ambientBus();
  if (!bus || level < 0.02) return;
  const { ctx, out } = bus;
  const p = panned(ctx, out, pan);
  const t = ctx.currentTime + 0.005;
  burst(ctx, p, t, { type: 'bandpass', freq: 900, q: 1.4, peak: 0.12 * level, attack: 0.002, decay: 0.05 });
  burst(ctx, p, t, { type: 'lowpass', freq: 260, peak: 0.1 * level, attack: 0.003, decay: 0.09 });
  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 120;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.exponentialRampToValueAtTime(0.018 * level, t + 0.35);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  hum.connect(lp).connect(hg).connect(p);
  hum.start(t);
  hum.stop(t + 1.45);
}

/** Pigeons taking off together: the clatter of wings, a quick run of claps per bird, overlapping. */
export function wingClatter(level, pan, birds = 4) {
  const bus = ambientBus();
  if (!bus || level < 0.02) return;
  const { ctx, out } = bus;
  const p = panned(ctx, out, pan);
  const t = ctx.currentTime + 0.01;
  for (let b = 0; b < birds; b++) {
    const start = t + b * (0.03 + Math.random() * 0.08);
    const claps = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < claps; i++) {
      const fade = 1 - i / (claps + 1);
      burst(ctx, p, start + i * (0.075 + Math.random() * 0.02), { type: 'bandpass', freq: 700 + Math.random() * 500, q: 0.9, peak: 0.07 * level * fade, attack: 0.004, decay: 0.05 });
    }
  }
}
