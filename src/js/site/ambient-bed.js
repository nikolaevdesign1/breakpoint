// Neutral sound for every page except the booking map (which has its own bed): a very soft pad of
// slow chords and a little moving air, synthesised with Web Audio, no files. It fades in over three
// seconds, follows the shared mute (sound.js) and, if the browser still holds the audio back after a
// page change, starts on the first gesture.

import { isMuted } from './sound.js';

const LEVEL = 0.16;
const FADE = 3;
const CHORD_SECONDS = 10;
// Fmaj9 > Am7 > Dm9 > Cmaj7, low and close.
const CHORDS = [[53, 57, 60, 64, 67], [57, 60, 64, 67], [50, 57, 60, 64, 65], [48, 55, 59, 64]];
const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);

let ctx = null;
let master = null;
let started = false;
let step = 0;
let timer = 0;

function air() {
  const len = 6;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i += 1) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const g = ctx.createGain();
  g.gain.value = 0.28;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.12;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(lp).connect(g).connect(master);
  src.start();
  lfo.start();
}

function playChord(notes) {
  const t = ctx.currentTime;
  notes.forEach((n, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sine';
    o.frequency.value = midiHz(n);
    o.detune.value = (Math.random() - 0.5) * 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 3.2);
    g.gain.setValueAtTime(0.05, t + CHORD_SECONDS - 3.5);
    g.gain.linearRampToValueAtTime(0.0001, t + CHORD_SECONDS + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + CHORD_SECONDS + 2);
  });
}

function loop() {
  playChord(CHORDS[step % CHORDS.length]);
  step += 1;
  timer = setTimeout(loop, CHORD_SECONDS * 1000);
}

function begin() {
  if (started) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  started = true;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  air();
  loop();
  apply();
}

function apply() {
  if (!ctx) return;
  if (isMuted()) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.4); return; }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  master.gain.setTargetAtTime(LEVEL, ctx.currentTime, FADE / 3);
}

export function initAmbientBed() {
  if (document.body.dataset.page === 'booking') return;
  const gesture = () => { if (!isMuted()) { begin(); apply(); } };
  document.addEventListener('bp-sound-change', (e) => { if (e.detail.muted) apply(); else gesture(); });
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, gesture, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else apply();
  });
  if (!isMuted() && sessionStorage.getItem('bp-entered') === 'sound') begin(); // a page change after "Enter with sound"
}
