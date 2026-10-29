import { clubHours } from './life/clock.js';

// Time-of-day sounds for the map (round 8, "arrival"), synthesised like the rest of ambient.js and
// mixed into its master gain, so the sound toggle and fades apply. The hour is the one the map
// shows (life/clock.js: Miami clock, ?time=, or the dock's scrubber):
// - morning: sparse birdsong (cardinal-like slurred whistles, short trills, two-note calls);
// - club hours: a faint murmur from the far courts (the distant rallies in ambient.js follow it too);
// - evening: cicadas, a rhythmic buzz swelling and falling back in waves;
// - night: crickets, chirping at the rate the Miami temperature sets (Dolbear's law), and a faint
//   chorus behind them.
// Rain quiets the birds and the insects. Also: the jet passing over the club (life/plane.js).

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 before a, up to 1 by b, down again from c to d (hours, may wrap past midnight). */
function trap(h, a, b, c, d) {
  if (d < a) { if (h < a) h += 24; b += b < a ? 24 : 0; c += c < a ? 24 : 0; d += 24; }
  return Math.min(smooth(a, b, h), 1 - smooth(c, d, h));
}

const weather = { rain: 0, temp: 80 };
document.addEventListener('bp-weather', (e) => {
  weather.rain = e.detail?.rain ?? 0;
  if (typeof e.detail?.temp === 'number') weather.temp = e.detail.temp;
});

/** How present each layer is at the map's hour (0…1). */
export function scapeLevels(h = clubHours()) {
  const wet = weather.rain;
  const club = trap(h, 6.8, 8, 21.2, 22.6);
  return {
    birds: (trap(h, 5.4, 6.6, 9.2, 11.5) + 0.22 * trap(h, 9, 11.5, 17, 19.2)) * (1 - 0.8 * wet),
    murmur: club * (1 - 0.7 * wet),
    rallies: club * (1 - 0.85 * wet),
    cicadas: (trap(h, 16.6, 18.6, 20.4, 21.6) + 0.14 * trap(h, 10.5, 12, 15.5, 17)) * (1 - 0.9 * wet),
    crickets: trap(h, 19.6, 21.2, 4.4, 6.2) * (1 - 0.6 * wet),
  };
}

let audio = null; // { ctx, out, layers }
const noises = new WeakMap();

function noise(ctx, seconds = 4, brown = false) {
  const key = `${seconds}|${brown}`;
  let cache = noises.get(ctx);
  if (!cache) noises.set(ctx, cache = {});
  if (cache[key]) return cache[key];
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return (cache[key] = buf);
}

function loop(ctx, buf) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(0, Math.random() * buf.duration);
  return src;
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function gain(ctx, value = 0) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function panner(ctx, pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

const running = () => audio && audio.ctx.state === 'running';

/** setTimeout chain that keeps going but only acts while the sound is on. */
function every(fn, wait) {
  const go = () => {
    let next = 1;
    try { next = running() ? fn() : 1; } catch { next = 2; }
    setTimeout(go, Math.max(0.05, typeof next === 'number' ? next : wait()) * 1000);
  };
  setTimeout(go, wait() * 1000);
}

// --- Birds ------------------------------------------------------------------------

function note(ctx, out, at, f0, f1, len, level) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + Math.min(0.012, len * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.02);
}

const SONGS = [
  // cardinal-like: slurred whistles falling, then quicker
  (n, at, lvl) => {
    const k = 3 + Math.floor(Math.random() * 4);
    const hi = rand(3400, 4200);
    for (let i = 0; i < k; i++) {
      const len = i < 2 ? 0.17 : 0.1;
      n(at, hi, hi * 0.55, len, lvl);
      at += len + (i < 2 ? 0.09 : 0.05);
    }
  },
  // warbler trill: a quick run of short up-chirps
  (n, at, lvl) => {
    const k = 6 + Math.floor(Math.random() * 7);
    const f = rand(5200, 6400);
    for (let i = 0; i < k; i++) { n(at, f * 0.9, f * (1.02 + i * 0.004), 0.03, lvl * 0.7); at += 0.068; }
  },
  // two-note call: high then low
  (n, at, lvl) => {
    const f = rand(3800, 4600);
    n(at, f, f * 1.04, 0.14, lvl);
    n(at + 0.2, f * 0.72, f * 0.68, 0.22, lvl * 0.9);
  },
  // short chips
  (n, at, lvl) => {
    const k = 2 + Math.floor(Math.random() * 3);
    const f = rand(4800, 6000);
    for (let i = 0; i < k; i++) { n(at, f * 1.15, f * 0.8, 0.035, lvl * 0.8); at += rand(0.16, 0.3); }
  },
];

function startBirds(ctx, bus) {
  // a hint of space: the birds sit in the trees around the club
  const echo = ctx.createDelay(0.5);
  echo.delayTime.value = 0.11;
  const fb = gain(ctx, 0.22);
  const wet = gain(ctx, 0.35);
  const hp = filter(ctx, 'highpass', 1600);
  hp.connect(bus);
  hp.connect(echo);
  echo.connect(fb).connect(echo);
  echo.connect(wet).connect(bus);
  every(() => {
    const lvl = audio.levels.birds;
    if (lvl < 0.03) return rand(4, 8);
    const pan = panner(ctx, rand(-0.85, 0.85));
    pan.connect(hp);
    const n = (at, f0, f1, len, l) => note(ctx, pan, at, f0, f1, len, l);
    const song = SONGS[Math.floor(Math.random() * SONGS.length)];
    song(n, ctx.currentTime + 0.05, rand(0.018, 0.034));
    setTimeout(() => pan.disconnect(), 4000);
    return rand(1.6, 5.5) / Math.max(0.35, lvl);
  }, () => rand(1, 3));
}

// --- Murmur from the far courts ---------------------------------------------------------

function startMurmur(ctx, bus) {
  const src = loop(ctx, noise(ctx, 5, true));
  const voices = [[380, 0.9, 1], [1050, 1.6, 0.45]].map(([f, q, w]) => {
    const g = gain(ctx, 0);
    src.connect(filter(ctx, 'bandpass', f, q)).connect(g).connect(bus);
    return { g, w };
  });
  // the level wanders: groups of people talking, a court finishing a set
  every(() => {
    const t = ctx.currentTime;
    voices.forEach(({ g, w }) => g.gain.setTargetAtTime(rand(0.35, 1) * w * 0.07, t, rand(0.6, 1.4)));
    return rand(1.2, 2.6);
  }, () => 1);
}

// --- Cicadas ----------------------------------------------------------------------------

function startCicadas(ctx, bus) {
  const src = loop(ctx, noise(ctx, 3));
  [[-0.55, 4700, 41], [0.5, 5300, 47]].forEach(([p, f, rate]) => {
    const band = filter(ctx, 'bandpass', f, 5);
    const am = gain(ctx, 0.5);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = rate;
    const depth = gain(ctx, 0.45);
    lfo.connect(depth).connect(am.gain);
    lfo.start();
    const env = gain(ctx, 0);
    src.connect(band).connect(am).connect(env).connect(panner(ctx, p)).connect(bus);
    // waves: swell over a few seconds, hold, fall back, a pause
    every(() => {
      const t = ctx.currentTime;
      const up = rand(2.5, 5);
      const hold = rand(3, 8);
      const down = rand(1.8, 3.2);
      env.gain.cancelScheduledValues(t);
      env.gain.setTargetAtTime(rand(0.6, 1) * 0.12, t, up / 3);
      env.gain.setTargetAtTime(0.0001, t + up + hold, down / 3);
      lfo.frequency.setTargetAtTime(rate * rand(0.92, 1.08), t, 2);
      return up + hold + down + rand(1.5, 6);
    }, () => rand(0.2, 3));
  });
}

// --- Crickets ---------------------------------------------------------------------------

function startCrickets(ctx, bus) {
  // a far chorus under the near ones
  const chorus = gain(ctx, 0);
  const am = gain(ctx, 0.5);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 27;
  const depth = gain(ctx, 0.5);
  lfo.connect(depth).connect(am.gain);
  lfo.start();
  loop(ctx, noise(ctx, 3)).connect(filter(ctx, 'bandpass', 4300, 9)).connect(am).connect(chorus).connect(bus);
  chorus.gain.value = 0.05;

  [[-0.6, 4400], [0.15, 4750], [0.7, 4150]].forEach(([p, f], i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = gain(ctx, 0);
    o.connect(g).connect(panner(ctx, p)).connect(bus);
    o.start();
    let until = 0; // scheduled up to (ctx time)
    let restUntil = 0;
    const level = rand(0.035, 0.055) * (i === 1 ? 1 : 0.7);
    every(() => {
      const now = ctx.currentTime;
      if (audio.levels.crickets < 0.03) { until = now; return 1; }
      if (now < restUntil) return 0.5;
      if (Math.random() < 0.04) { restUntil = now + rand(2, 7); return 0.5; } // a cricket falls quiet now and then
      // Dolbear: chirps per minute ≈ 4 × °F − 160
      const perSec = Math.min(3.4, Math.max(1, (4 * weather.temp - 160) / 60)) * rand(0.94, 1.06);
      let at = Math.max(until, now + 0.05);
      while (at < now + 1) {
        for (let k = 0; k < 3; k++) {
          const s = at + k * 0.034;
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(level, s + 0.006);
          g.gain.linearRampToValueAtTime(0, s + 0.02);
        }
        at += 1 / perSec;
      }
      until = at;
      return 0.5;
    }, () => rand(0.1, 1));
  });
}

// --- Control ----------------------------------------------------------------------------

/** Called once by ambient.js when the sound bed starts. */
export function startSoundscape(ctx, out) {
  if (audio) return;
  const layers = {};
  for (const name of ['birds', 'murmur', 'cicadas', 'crickets']) {
    layers[name] = gain(ctx, 0);
    layers[name].connect(out);
  }
  audio = { ctx, out, layers, levels: scapeLevels() };
  startBirds(ctx, layers.birds);
  startMurmur(ctx, layers.murmur);
  startCicadas(ctx, layers.cicadas);
  startCrickets(ctx, layers.crickets);
  const mix = (fast) => {
    audio.levels = scapeLevels();
    const t = ctx.currentTime;
    for (const [name, g] of Object.entries(layers)) g.gain.setTargetAtTime(audio.levels[name], t, fast ? 0.8 : 3);
  };
  mix(true);
  setInterval(() => mix(false), 2000);
  ['bp-hour', 'bp-clock', 'bp-weather'].forEach((e) => document.addEventListener(e, () => mix(true)));
}

/** How loud the distant rallies are at the map's hour (ambient.js). */
export const rallyLevel = () => (audio ? audio.levels.rallies : scapeLevels().rallies);

// --- Jet over the club (life/plane.js) -----------------------------------------------------
// A passenger jet on approach to Miami International passes a few hundred metres up: a low rumble
// swells for several seconds, peaks just after the shadow has crossed (sound lags the plane), and
// rolls away; a softer roar on top bends down in pitch as it passes. Pans across with the track.

/**
 * @param bus    ambient.js ambientBus(): { ctx, out }
 * @param lead   s from now to the plane overhead
 * @param pan0   where it comes from (−1 left … 1 right), pan1 where it goes
 */
export function jetFlyover({ ctx, out }, { lead = 9, pan0 = 0.6, pan1 = -0.6, level = 1 } = {}) {
  const t = ctx.currentTime + 0.05;
  const peak = t + lead + 1.6;
  const end = peak + rand(13, 17);
  const pan = panner(ctx, pan0);
  pan.pan.setValueAtTime(pan0, t);
  pan.pan.linearRampToValueAtTime(pan0 * 0.25, peak - 1.2);
  pan.pan.linearRampToValueAtTime(pan1, end);
  pan.connect(out);

  // air turbulence: the level breathes a little
  const breathe = gain(ctx, 1);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rand(0.25, 0.45);
  const lfoDepth = gain(ctx, 0.16);
  lfo.connect(lfoDepth).connect(breathe.gain);
  lfo.start(t);
  lfo.stop(end + 0.5);
  breathe.connect(pan);

  const rumble = ctx.createBufferSource();
  rumble.buffer = noise(ctx, 6, true);
  rumble.loop = true;
  const lp = filter(ctx, 'lowpass', 140, 0.8);
  lp.frequency.setValueAtTime(140, t);
  lp.frequency.exponentialRampToValueAtTime(560, peak);
  lp.frequency.exponentialRampToValueAtTime(120, end);
  const rg = gain(ctx, 0.0001);
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.06 * level, t + lead * 0.6);
  rg.gain.exponentialRampToValueAtTime(0.32 * level, peak);
  rg.gain.exponentialRampToValueAtTime(0.11 * level, peak + 4); // rolls away slowly, then fades out
  rg.gain.exponentialRampToValueAtTime(0.0001, end);
  rumble.connect(lp).connect(rg).connect(breathe);
  rumble.start(t, rand(0, 5));
  rumble.stop(end + 0.2);

  const roar = ctx.createBufferSource();
  roar.buffer = noise(ctx, 4);
  roar.loop = true;
  const band = filter(ctx, 'bandpass', 1300, 1.1);
  band.frequency.setValueAtTime(1300, t);
  band.frequency.setTargetAtTime(1150, t, lead * 0.5);
  band.frequency.setTargetAtTime(720, peak - 0.6, 1.1); // doppler: the pitch drops as it passes
  const hg = gain(ctx, 0.0001);
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.exponentialRampToValueAtTime(0.035 * level, peak - 0.4);
  hg.gain.exponentialRampToValueAtTime(0.0001, end - 3);
  roar.connect(band).connect(hg).connect(breathe);
  roar.start(t, rand(0, 3));
  roar.stop(end);
  setTimeout(() => pan.disconnect(), (end - t + 1) * 1000);
}
