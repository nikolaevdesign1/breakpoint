// Ball-on-strings "pock" on every click, synthesised with Web Audio — no audio files.
// A short noise snap (the strings) over a falling tone (the ball) and a soft low thump.

const KEY = 'bp-sound-muted';

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = readMuted();

function readMuted() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
function writeMuted(value) {
  try { sessionStorage.setItem(KEY, value ? '1' : '0'); } catch { /* private mode */ }
}

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  return ctx;
}

export function pock() {
  if (muted || !ensureContext()) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  const pitch = 1 + (Math.random() - 0.5) * 0.18;

  // Strings: band-passed noise snap.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600 * pitch;
  band.Q.value = 1.1;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.32, t);
  snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  snap.connect(band).connect(snapGain).connect(master);
  snap.start(t);

  // Ball: hollow tone that drops quickly.
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(1150 * pitch, t);
  tone.frequency.exponentialRampToValueAtTime(620 * pitch, t + 0.06);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, t);
  toneGain.gain.exponentialRampToValueAtTime(0.2, t + 0.004);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  tone.connect(toneGain).connect(master);
  tone.start(t);
  tone.stop(t + 0.1);

  // Body: short low thump.
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(190 * pitch, t);
  thump.frequency.exponentialRampToValueAtTime(90, t + 0.07);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.14, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  thump.connect(thumpGain).connect(master);
  thump.start(t);
  thump.stop(t + 0.09);
}

function syncToggles() {
  document.querySelectorAll('[data-sound-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!muted));
    b.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  });
}

const EVENT = 'bp-sound-change';
export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  writeMuted(muted);
  syncToggles();
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { muted } }));
}

export function initSound() {
  syncToggles();
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const toggle = e.target.closest?.('[data-sound-toggle]');
    if (toggle) return; // the toggle handles itself so unmuting gives an audible confirmation
    pock();
  }, { capture: true, passive: true });

  document.querySelectorAll('[data-sound-toggle]').forEach((b) => b.addEventListener('click', () => {
    setMuted(!muted);
    if (!muted) pock();
  }));
}
