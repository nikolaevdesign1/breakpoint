// Site music (every page except booking, which has its own soundscape): one short ambient piece,
// synthesised with Web Audio, no audio files (0 KB). Slow lydian / major-seventh chords, a soft
// piano-like tone, a little shimmer and a few rare bell notes, all through a generated reverb.
// It fades in over ~2.6 s, plays about 36 s, fades out over 7 s and is silent after that. Once per session.
//
// Start: at once if the browser allows audio without a gesture, otherwise on the first gesture
// (pointerdown, keydown, touchend, click) or on the "Sound on" button in the home preloader.
// The header bars (sound.js) mute it with a 0.5 s fade and play it again from the start.

import { isMuted, setToggleHook } from './sound.js';

const DURATION = 36; // seconds from start to silence
const FADE_IN = 2.6;
const FADE_OUT = 7;
const QUICK_OUT = 0.5; // mute, leaving the page
const LEVEL = 0.9; // bus gain; the mix then peaks around 0.15 of full scale
const PLAYED_KEY = 'bp-music-played';

const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Fmaj9 > Dmaj7#11 > Bbmaj7#11 > Cmaj9 > Fmaj9. First note is the bass, the rest are voiced close.
const CHORDS = [
  [41, 53, 57, 60, 64, 67],
  [38, 50, 57, 61, 64, 68],
  [34, 46, 53, 57, 62, 64],
  [36, 48, 55, 59, 62, 64],
  [41, 53, 57, 60, 64, 67],
];
const CHORD_EVERY = 7;
const CHORD_LEN = 9.5;

let ctx = null;
let out = null; // master: bus -> dry + reverb -> analyser -> destination
let dry = null;
let send = null;
let run = null; // the piece that is playing now
let state = 'idle'; // idle | playing
let launching = false;
let gestureOn = false;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = () => !!navigator.connection?.saveData;
const wasPlayed = () => { try { return sessionStorage.getItem(PLAYED_KEY) === '1'; } catch { return false; } };
const markPlayed = () => { try { sessionStorage.setItem(PLAYED_KEY, '1'); } catch { /* private mode */ } };

// ---------- graph -------------------------------------------------------------------------------

function impulse(seconds) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c += 1) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i += 1) {
      const x = i / len;
      const k = 0.55 - 0.45 * x; // the tail gets darker
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * (1 - x) ** 2.4 * (x < 0.004 ? x / 0.004 : 1);
    }
  }
  return buf;
}

function ensureGraph() {
  if (ctx) return true;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  ctx = new AudioCtx();
  out = ctx.createGain();
  dry = ctx.createGain();
  send = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = impulse(3.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.62;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  out.gain.value = 1;
  dry.connect(out);
  send.connect(verb).connect(wet).connect(out);
  out.connect(analyser);
  analyser.connect(ctx.destination);
  if (import.meta.env.DEV) window.__bpMusic = { ctx, analyser, get state() { return state; }, get run() { return run; } };
  return true;
}

// ---------- voices ------------------------------------------------------------------------------

function voice(r, { freq, type = 'sine', t, attack, hold, release, gain, detune = 0, lp = 0, pan = 0, wet = 0.5 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + attack + hold);
  g.gain.linearRampToValueAtTime(0.0001, t + attack + hold + release);
  let node = o.connect(g);
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node = node.connect(f);
  }
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  node.connect(p);
  const d = ctx.createGain();
  d.gain.value = 1 - wet * 0.5;
  const s = ctx.createGain();
  s.gain.value = wet;
  p.connect(d).connect(r.bus);
  p.connect(s).connect(r.send);
  o.start(t);
  o.stop(t + attack + hold + release + 0.1);
  r.sources.push(o);
  return g;
}

function pad(r, chord, t) {
  chord.forEach((n, i) => {
    const bass = i === 0;
    const gain = bass ? 0.05 : 0.026;
    const common = { t, attack: 2.8, hold: CHORD_LEN - 5.8, release: 3, gain, lp: bass ? 400 : 1300, pan: bass ? 0 : rand(-0.5, 0.5), wet: bass ? 0.25 : 0.6 };
    voice(r, { ...common, freq: midiHz(n), type: 'sine', detune: rand(-5, 5) });
    if (!bass) voice(r, { ...common, freq: midiHz(n), type: 'triangle', detune: rand(5, 11), gain: gain * 0.7 });
  });
}

// Soft piano-like tone: a few partials, the upper ones die faster, a short attack, long reverb.
function piano(r, midi, t, vel) {
  const f = midiHz(midi);
  const partials = [[1, 1], [2, 0.42], [3, 0.2], [4.01, 0.1], [5.03, 0.05]];
  const pan = rand(-0.45, 0.45);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  lp.connect(p);
  const d = ctx.createGain();
  d.gain.value = 0.7;
  const s = ctx.createGain();
  s.gain.value = 0.7;
  p.connect(d).connect(r.bus);
  p.connect(s).connect(r.send);
  partials.forEach(([k, a]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * k;
    const g = ctx.createGain();
    const peak = 0.09 * vel * a;
    const life = 3.4 / (1 + (k - 1) * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + life);
    o.connect(g).connect(lp);
    o.start(t);
    o.stop(t + life + 0.1);
    r.sources.push(o);
  });
}

// Rare high bell: two-operator FM with a decaying index, very quiet.
function bell(r, midi, t) {
  const f = midiHz(midi);
  const c = ctx.createOscillator();
  const m = ctx.createOscillator();
  c.frequency.value = f;
  m.frequency.value = f * 3.5;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 0.9, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 1.6);
  m.connect(mg).connect(c.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
  const p = ctx.createStereoPanner();
  p.pan.value = rand(-0.7, 0.7);
  c.connect(g).connect(p);
  const s = ctx.createGain();
  s.gain.value = 1;
  p.connect(s).connect(r.send);
  const d = ctx.createGain();
  d.gain.value = 0.25;
  p.connect(d).connect(r.bus);
  c.start(t);
  m.start(t);
  c.stop(t + 5.2);
  m.stop(t + 5.2);
  r.sources.push(c, m);
}

// Shimmer: two high sines that breathe slowly, and a veil of filtered air.
function shimmer(r, t0) {
  [[91, 0.2], [98, 0.31], [102, 0.26]].forEach(([n, rate], i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midiHz(n);
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.value = 0.004;
    lfo.connect(lg).connect(g.gain);
    const sw = ctx.createGain();
    sw.gain.setValueAtTime(0.0001, t0 + 2 + i * 3);
    sw.gain.linearRampToValueAtTime(1, t0 + 7 + i * 3);
    o.connect(g).connect(sw).connect(r.send);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + DURATION + 1);
    lfo.stop(t0 + DURATION + 1);
    r.sources.push(o, lfo);
  });
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5200;
  const g = ctx.createGain();
  g.gain.value = 0.0035;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.09;
  const lg = ctx.createGain();
  lg.gain.value = 0.003;
  lfo.connect(lg).connect(g.gain);
  n.connect(hp).connect(g).connect(r.bus);
  n.start(t0);
  lfo.start(t0);
  n.stop(t0 + DURATION + 1);
  lfo.stop(t0 + DURATION + 1);
  r.sources.push(n, lfo);
}

function compose(r, t0) {
  CHORDS.forEach((chord, i) => {
    const t = t0 + i * CHORD_EVERY;
    pad(r, chord, t);
    // Two to four soft notes over each chord, never on the first beat, with rests between.
    const tones = chord.slice(1).flatMap((n) => [n + 12, n + 12, n + 24]);
    let at = t + rand(3.2, 4.2);
    const count = i === 0 ? 2 : Math.round(rand(2, 4));
    for (let k = 0; k < count && at < t + CHORD_EVERY - 0.4; k += 1) {
      piano(r, pick(tones), at, rand(0.6, 1));
      at += rand(1.1, 2.3);
    }
  });
  [rand(9, 13), rand(17, 22), rand(25, 29)].forEach((s) => {
    const chord = CHORDS[Math.min(CHORDS.length - 1, Math.floor(s / CHORD_EVERY))];
    bell(r, pick(chord.slice(2)) + 36, t0 + s);
  });
  shimmer(r, t0);
}

// ---------- control -----------------------------------------------------------------------------

function curve(from, to, steps = 64) {
  // Smoothstep: no click at either end of a fade.
  return Float32Array.from({ length: steps }, (_, i) => {
    const x = i / (steps - 1);
    return from + (to - from) * x * x * (3 - 2 * x);
  });
}

function setState(next) {
  state = next;
  document.querySelectorAll('[data-sound-toggle]').forEach((b) => {
    b.dataset.soundState = next;
    if (!isMuted()) b.setAttribute('aria-label', next === 'playing' ? 'Turn sound off' : 'Play music');
  });
  document.dispatchEvent(new CustomEvent('bp-music-state', { detail: { state: next } }));
}

function silence(seconds) {
  const r = run;
  if (!r) return;
  run = null;
  clearInterval(r.timer);
  const t = ctx.currentTime;
  r.bus.gain.cancelScheduledValues(t);
  r.bus.gain.setValueAtTime(r.bus.gain.value, t);
  r.bus.gain.linearRampToValueAtTime(0, t + seconds);
  // The reverb tail would ring on for seconds, so the master goes down with the voices.
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(out.gain.value, t);
  out.gain.linearRampToValueAtTime(0, t + seconds);
  setTimeout(() => {
    r.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    r.bus.disconnect();
    r.send.disconnect();
  }, seconds * 1000 + 150);
}

function begin() {
  if (run) silence(0.05);
  const bus = ctx.createGain();
  const sendBus = ctx.createGain();
  bus.connect(dry);
  sendBus.connect(send);
  const t0 = ctx.currentTime + 0.05;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(1, ctx.currentTime);
  const r = { bus, send: sendBus, sources: [], t0, timer: 0 };
  bus.gain.setValueAtTime(0, t0);
  bus.gain.setValueCurveAtTime(curve(0, LEVEL), t0, FADE_IN);
  bus.gain.setValueAtTime(LEVEL, t0 + DURATION - FADE_OUT);
  bus.gain.setValueCurveAtTime(curve(LEVEL, 0), t0 + DURATION - FADE_OUT, FADE_OUT);
  compose(r, t0);
  run = r;
  markPlayed();
  setState('playing');
  // ctx.currentTime stands still while the tab is hidden, so the end follows the audio clock.
  r.timer = setInterval(() => {
    if (ctx.currentTime < t0 + DURATION + 0.2) return;
    clearInterval(r.timer);
    r.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    r.bus.disconnect();
    r.send.disconnect();
    if (run === r) { run = null; setState('idle'); }
  }, 400);
}

// Resolves true once the context is running (inside a gesture, or when the browser allows it).
async function unlock() {
  if (!ensureGraph()) return false;
  if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
  return ctx.state === 'running';
}

export async function startMusic({ force = false } = {}) {
  if (launching || state === 'playing') return state === 'playing';
  if (!force && (isMuted() || wasPlayed())) return false;
  launching = true;
  try {
    if (!(await unlock())) return false;
    if (!force && (isMuted() || wasPlayed())) return false;
    begin();
    stopWaiting();
    return true;
  } finally {
    launching = false;
  }
}

function onGesture(e) {
  if (e.target.closest?.('[data-sound-toggle]')) return; // the bars decide for themselves
  startMusic();
}
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'];
function waitForGesture() {
  if (gestureOn) return;
  gestureOn = true;
  GESTURES.forEach((ev) => window.addEventListener(ev, onGesture, { capture: true, passive: true }));
}
function stopWaiting() {
  if (!gestureOn) return;
  gestureOn = false;
  GESTURES.forEach((ev) => window.removeEventListener(ev, onGesture, { capture: true }));
}

// "Sound on" in the home preloader: appears only if the music did not start by itself.
function initPreloaderButton() {
  const btn = document.querySelector('[data-music-start]');
  if (!btn) return;
  const pre = document.querySelector('.preloader');
  let gone = false;
  const hide = () => {
    if (gone) return;
    gone = true;
    btn.classList.remove('is-shown');
    setTimeout(() => btn.remove(), 800);
    clearInterval(watch);
  };
  const watch = setInterval(() => { if (!pre || !pre.isConnected || pre.classList.contains('is-done')) hide(); }, 300);
  btn.addEventListener('click', () => { startMusic({ force: true }); hide(); });
  document.addEventListener('bp-music-state', (e) => { if (e.detail.state === 'playing') hide(); });
  setTimeout(() => {
    if (gone || state === 'playing' || isMuted() || wasPlayed() || !pre?.isConnected) return hide();
    btn.hidden = false;
    requestAnimationFrame(() => btn.classList.add('is-shown'));
  }, 700);
}

export function initAmbientMusic() {
  if (document.body.dataset.page === 'booking') return;

  // The header bars: a click while the piece plays mutes it; once it has finished, a click plays it again.
  setToggleHook(() => {
    if (!isMuted() && state === 'idle') { startMusic({ force: true }); return true; }
    return false;
  });
  document.addEventListener('bp-sound-change', (e) => {
    if (e.detail.muted) { silence(QUICK_OUT); setState('idle'); } else startMusic({ force: true });
  });

  // A tab in the background pauses the audio clock; coming back resumes it.
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !run) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  // Leaving for another page: a quick fade instead of a cut.
  const leave = () => { if (run) silence(0.2); };
  window.addEventListener('pagehide', leave);
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && url.pathname !== location.pathname) leave();
  });

  if (reduced() || saveData() || wasPlayed()) { document.querySelector('[data-music-start]')?.remove(); return; }
  if (isMuted()) { document.querySelector('[data-music-start]')?.remove(); return; }

  // Try to start at once. getAutoplayPolicy says whether the browser would allow it without a gesture
  // (where it is missing, trying costs nothing: the context just stays suspended).
  const policy = navigator.getAutoplayPolicy?.('audiocontext');
  if (policy === 'allowed' || policy === undefined) startMusic();
  waitForGesture();
  initPreloaderButton();
}
