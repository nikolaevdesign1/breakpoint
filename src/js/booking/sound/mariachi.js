import { ambientBus } from '../ambient.js';
import { createListener } from './listener.js';
import { currentSeason } from '../seasons/season.js';
import { holidayById } from '../seasons/calendar.js';

// Mariachi on the terrace for Cinco de Mayo (round 11, row 14). While a holiday with `music:
// 'mariachi'` is on (calendar.js: May 1 to 6, or forced with ?season=cinco-de-mayo) this plays
// instead of the café music (sound/cafe-music.js lets go of the deck): a son in G at 6/8, all
// synthesised in WebAudio, no files:
//   guitarrón   a deep plucked string, root and fifth (Karplus-Strong, rendered once per note)
//   vihuela     a bright strummed guitar, the off-beat chuck
//   trumpets    a pair in thirds on a diatonic line, a soft swell (two saws, a low-pass opening)
//   strings     a slow pad under the choruses
//   shaker      eighths with an accent on the beats
// The tune is not a loop: phrases of eight bars (11.5 s) are built on the fly from a handful of
// progressions and a melody that walks the chord tones, and strung into a form (quiet, verses,
// choruses, a guitar break) of about two and a half minutes that is drawn again each round.
// It sits in the ambient bus, so the sound toggle, the tab going to the background and the
// browser's wait for a first click silence it. Quieter than the café; a little in the air over the
// whole club, clearer toward the terrace and the flags as the drone comes down.

const DECK = { x: 55, z: -47 }; // the café terrace (model metres)
const WALK = { x0: -24, x1: 58 }; // the papel picado walkway: the nearest point of it to the middle of the view
const EIGHTH = 0.24; // s: 6/8 at about 83 dotted quarters a minute
const BAR = EIGHTH * 6;
const LOOK = 0.4; // s scheduled ahead
const LEVEL = 0.036;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// G major by scale degree (0 = G3), so the harmony and the melody stay in key.
const KEY = 55;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const note = (deg) => KEY + 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];

// Eight bars of chord roots (degrees: 0 G, 1 A, 3 C, 4 D7, 5 Em).
const PROGRESSIONS = [
  [0, 3, 4, 0, 0, 3, 4, 0],
  [0, 5, 1, 4, 0, 3, 4, 0],
  [3, 0, 4, 0, 1, 4, 0, 0],
  [0, 0, 3, 3, 4, 4, 0, 0],
  [5, 3, 0, 4, 5, 3, 4, 0],
  [0, 3, 0, 4, 0, 1, 4, 0],
];
// Strums over the six eighths of a bar: [eighth, down?, velocity]
const STRUMS = [
  [[0, 1, 1], [2, 0, 0.55], [3, 1, 0.9], [5, 0, 0.5]],
  [[0, 1, 1], [3, 1, 0.85], [4, 0, 0.5], [5, 0, 0.6]],
  [[0, 1, 1], [1, 0, 0.4], [3, 1, 0.9], [4, 0, 0.5], [5, 1, 0.55]],
  [[0, 1, 1], [2, 1, 0.6], [3, 1, 0.9], [4, 0, 0.5]],
];
const RHYTHMS = [[3, 3], [2, 1, 3], [3, 1, 2], [2, 2, 2], [1, 2, 3], [3, 2, 1], [6]];
const SHAKE = [1, 0.4, 0.55, 0.85, 0.4, 0.55];
const KINDS = {
  quiet: { guitar: 0.7, tpt: 0, pad: 0, shake: 0.5, bass: 0.8, pick: false },
  verse: { guitar: 1, tpt: 0.6, pad: 0, shake: 0.8, bass: 1, pick: false },
  chorus: { guitar: 1, tpt: 1, pad: 1, shake: 1, bass: 1, pick: false },
  break: { guitar: 0.45, tpt: 0, pad: 0, shake: 0.9, bass: 1, pick: true },
};

/** A form of phrase kinds, 12 to 15 of them (about 2.5 minutes), quiet at both ends. */
function makeForm() {
  const form = ['quiet'];
  const n = 11 + Math.floor(Math.random() * 3);
  while (form.length < n) form.push('verse', 'chorus', Math.random() < 0.45 ? 'break' : 'verse', 'chorus');
  form.length = n;
  form.push('quiet');
  return form;
}

/** The events of one phrase of eight bars: [eighths from its start, voice, [notes…], eighths long, velocity]. */
function makePhrase(kind, last) {
  const k = KINDS[kind];
  let prog;
  do prog = pick(PROGRESSIONS); while (prog === last && PROGRESSIONS.length > 1);
  const ev = [];
  const strum = pick(STRUMS);
  let top = 7 + Math.floor(Math.random() * 3); // the melody's starting degree (G4 to B4)
  for (let bar = 0; bar < 8; bar++) {
    const r = prog[bar];
    const at = bar * 6;
    const seventh = r === 4;
    const tones = [r, r + 2, r + 4, ...(seventh ? [r + 6] : [])];
    const next = prog[(bar + 1) % 8];
    // guitarrón: root on the beat, the fifth on the second, a step into the next root on the last bar of a pair
    if (k.bass) {
      ev.push([at, 'bass', [note(r - 7)], 2.6, k.bass]);
      ev.push([at + 3, 'bass', [note(r - 7 + 4)], 2.6, k.bass * 0.85]);
      if (bar % 2 === 1 && Math.random() < 0.55 && next !== r) ev.push([at + 5, 'bass', [note(next - 7 + (next > r ? -1 : 1))], 0.9, 0.6]);
    }
    // vihuela: the chuck, or in the break a picked line
    if (k.pick) {
      const run = [r, r + 2, r + 4, r + 7, r + 9, r + 7, r + 4, r + 2];
      let j = Math.floor(Math.random() * 3);
      for (let e = 0; e < 6; e++) {
        if (Math.random() < 0.12) continue;
        ev.push([at + e, 'pluck', [note(run[(j++) % run.length] + 7)], 1.6, k.guitar * rand(0.75, 1)]);
      }
    } else {
      const chord = tones.slice(0, 3).map((d) => note(d + 7)).concat(note(r + 14));
      for (const [e, down, vel] of strum) ev.push([at + e, down ? 'strum' : 'strumUp', down ? chord : chord.slice(1), 1.4, vel * k.guitar * rand(0.85, 1)]);
    }
    if (k.shake) SHAKE.forEach((v, e) => ev.push([at + e, 'shake', [], 0.4, v * k.shake * rand(0.8, 1)]));
    // trumpets: a line that walks towards the chord tones, a third above its partner
    if (k.tpt && (kind === 'chorus' || Math.random() < 0.7)) {
      const rhythm = pick(RHYTHMS);
      let e = 0;
      rhythm.forEach((len, i) => {
        const aim = tones[(i + bar) % tones.length] + 7;
        const dir = Math.sign(aim - top) || (Math.random() < 0.5 ? 1 : -1);
        top += Math.random() < 0.65 ? dir : dir * 2;
        top = Math.min(14, Math.max(7, top));
        if (bar === 7 && i === rhythm.length - 1) top = 7;
        const long = len >= 3 || (bar === 7 && i === rhythm.length - 1);
        ev.push([at + e, 'tpt', [note(top), note(top - 2)], long ? len * 0.96 : len * 0.8, k.tpt * (long ? 1 : 0.85)]);
        e += len;
      });
    }
    // strings: the chord held for the bar, an octave over the strum
    if (k.pad) ev.push([at, 'pad', [note(r + 14), note(r + 16), note(r + 18)], 6.2, k.pad]);
  }
  return { ev: ev.sort((a, b) => a[0] - b[0]), prog };
}

/** The voices, built on a context and a destination (the bus, or an offline context in a test). */
function createVoices(ctx, dest) {
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Karplus-Strong strings, one buffer per pitch and kind, made on first use.
  const strings = new Map();
  function string(n, kind) {
    const key = `${kind}${n}`;
    let b = strings.get(key);
    if (b) return b;
    const sr = ctx.sampleRate;
    const f = midi(n);
    const len = Math.max(2, Math.round(sr / f));
    const secs = kind === 'bass' ? 1.4 : 1.1;
    const loss = kind === 'bass' ? 0.9992 : 0.9972;
    const data = new Float32Array(Math.floor(sr * secs));
    let prev = 0;
    for (let i = 0; i < len; i++) { prev += (Math.random() * 2 - 1 - prev) * (kind === 'bass' ? 0.45 : 0.8); data[i] = prev; } // the pluck: a softened burst
    for (let i = len; i < data.length; i++) data[i] = loss * 0.5 * (data[i - len] + data[i - len + 1]);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const g = peak ? 0.9 / peak : 1;
    for (let i = 0; i < data.length; i++) data[i] *= g;
    b = ctx.createBuffer(1, data.length, sr);
    b.copyToChannel(data, 0);
    strings.set(key, b);
    return b;
  }

  function plucked(at, n, vel, kind, level, cut) {
    const src = ctx.createBufferSource();
    src.buffer = string(n, kind);
    src.detune.value = rand(-5, 5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut * 1.8, at);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.7, at + 0.5);
    const g = ctx.createGain();
    g.gain.value = level * vel;
    src.connect(lp).connect(g).connect(dest);
    src.start(at);
    src.stop(at + (kind === 'bass' ? 1.4 : 1.1));
  }

  function voice(at, n, len, { level, cut, attack, vib, detune, saw = 2 }) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(cut * 0.45, at);
    lp.frequency.linearRampToValueAtTime(cut, at + attack + 0.06);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + attack);
    g.gain.setTargetAtTime(level * 0.8, at + attack, 0.25);
    g.gain.setTargetAtTime(0.0001, at + len, 0.09);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vib;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(midi(n) * 0.006, at + Math.max(0.4, attack * 2)); // the vibrato comes in late
    lfo.connect(depth);
    const end = at + len + 0.5;
    for (let i = 0; i < saw; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = (i - (saw - 1) / 2) * detune;
      depth.connect(o.frequency);
      o.connect(lp);
      o.start(at);
      o.stop(end);
    }
    lfo.start(at);
    lfo.stop(end);
    lp.connect(g).connect(dest);
  }

  function shaker(at, vel) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 8200;
    bp.gain.value = 5;
    const g = ctx.createGain();
    const len = 0.07 + 0.05 * vel;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.05 * vel, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(hp).connect(bp).connect(g).connect(dest);
    src.start(at, Math.random() * 0.3);
    src.stop(at + len + 0.02);
  }

  const TPT = { level: 0.05, cut: 2600, attack: 0.045, vib: 5.4, detune: 7 };
  const PAD = { level: 0.028, cut: 1500, attack: 0.55, vib: 4.6, detune: 11, saw: 3 };
  const play = {
    bass: (at, [n], len, vel) => plucked(at, n, vel, 'bass', 0.62, 900),
    pluck: (at, [n], len, vel) => plucked(at, n, vel, 'gtr', 0.5, 4200),
    strum: (at, chord, len, vel) => chord.forEach((n, i) => plucked(at + i * rand(0.009, 0.016), n, vel * (0.8 + 0.2 * (i / chord.length)), 'gtr', 0.36, 3800)),
    strumUp: (at, chord, len, vel) => [...chord].reverse().forEach((n, i) => plucked(at + i * rand(0.007, 0.012), n, vel * 0.7, 'gtr', 0.3, 4200)),
    shake: (at, _n, len, vel) => shaker(at, vel),
    tpt: (at, [a, b], len, vel) => { voice(at, a, len * EIGHTH, { ...TPT, level: TPT.level * vel }); voice(at + 0.012, b, len * EIGHTH, { ...TPT, level: TPT.level * vel * 0.85 }); },
    pad: (at, notes, len, vel) => notes.forEach((n) => voice(at, n, len * EIGHTH, { ...PAD, level: PAD.level * vel })),
  };
  return play;
}

/** The mix: a light compressor, a little plaza reverb, the tone and the gain that follow the camera. */
function createMix(ctx, out) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const tone = ctx.createBiquadFilter(); // outdoor speakers, heard from a distance
  tone.type = 'lowpass';
  tone.frequency.value = 1500;
  const pan = ctx.createStereoPanner();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const mix = ctx.createGain();
  const verb = ctx.createConvolver(); // a courtyard: noise with a decay of about 1.6 s
  const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.6), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3.2 * (i < 400 ? i / 400 : 1);
  }
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  mix.connect(comp);
  mix.connect(verb).connect(wet).connect(comp);
  comp.connect(tone).connect(gain).connect(pan).connect(out);
  return { mix, gain, tone, pan };
}

/** Plays the form on a context: `step()` schedules what falls in the next LOOK seconds. */
function createPlayer(play) {
  let form = [];
  let phrase = null; // { ev, start (ctx time), cursor, len }
  let last = null;
  let nextStart = 0;
  const begin = () => {
    if (!form.length) form = makeForm();
    const kind = form.shift();
    const p = makePhrase(kind, last);
    last = p.prog;
    phrase = { ev: p.ev, start: nextStart, cursor: 0 };
    nextStart += BAR * 8;
  };
  return {
    step(now, ahead = LOOK) {
      if (!phrase) { nextStart = now + 0.08; begin(); }
      if (nextStart < now - 0.2) { phrase = null; nextStart = now + 0.08; begin(); } // paused for a while: start fresh, do not play the past
      for (let guard = 0; guard < 400; guard++) {
        const e = phrase.ev[phrase.cursor];
        if (!e) { if (phrase.start + BAR * 8 < now + ahead) { begin(); continue; } break; }
        const at = phrase.start + e[0] * EIGHTH;
        if (at > now + ahead) break;
        phrase.cursor++;
        if (at < now - 0.05) continue;
        play[e[1]](at, e[2], e[3], e[4]);
      }
    },
    reset() { phrase = null; },
  };
}

export function createMariachi({ rig }) {
  const ear = createListener(rig);
  let audio = null; // { ctx, mix, gain, tone, pan, player }
  let level = 0;
  let lastCheck = 0;
  let near = 0;

  const on = () => holidayById(currentSeason())?.music === 'mariachi';

  function build(bus) {
    const m = createMix(bus.ctx, bus.out);
    const player = createPlayer(createVoices(bus.ctx, m.mix));
    return { ctx: bus.ctx, ...m, player };
  }

  // Dev: renders a minute of the form offline and reports its level, to check without listening.
  if (import.meta.env.DEV) {
    window.__bp ??= {};
    window.__bp.mariachi = {
      async render(seconds = 40, wav = false) {
        const off = new OfflineAudioContext(2, 44100 * seconds, 44100);
        const m = createMix(off, off.destination);
        m.gain.gain.value = 1;
        const player = createPlayer(createVoices(off, m.mix));
        for (let t = 0; t < seconds; t += 0.25) {
          // schedule in quarter-second slices of an offline clock: step() is told the time and a long look-ahead
          player.step(t, 0.3);
        }
        const buf = await off.startRendering();
        const a = buf.getChannelData(0);
        let peak = 0; let sum = 0;
        for (let i = 0; i < a.length; i++) { peak = Math.max(peak, Math.abs(a[i])); sum += a[i] * a[i]; }
        let pcm;
        if (wav) {
          const bytes = new Uint8Array(Int16Array.from(a.filter((_, i) => i % 2 === 0), (v) => Math.max(-1, Math.min(1, v)) * 32000).buffer);
          pcm = '';
          for (let i = 0; i < bytes.length; i += 8192) pcm += String.fromCharCode(...bytes.subarray(i, i + 8192));
          pcm = btoa(pcm);
        }
        return { pcm, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / a.length).toFixed(4), seconds, nan: a.some(Number.isNaN) };
      },
      debug: () => ({ level: +level.toFixed(3), on: on(), playing: !!audio && level > 0.004 }),
    };
  }

  return {
    name: 'mariachi',
    tick() {
      const now = performance.now() / 1000;
      if (now - lastCheck < 0.1) return false;
      lastCheck = now;
      const bus = ambientBus();
      const s = rig.state;
      // The terrace and the flagged walkway are where it is loudest; the walkway point is the nearest one to the middle of the view.
      const walkX = Math.min(WALK.x1, Math.max(WALK.x0, s.x));
      const close = Math.max(ear.reach(DECK.x, DECK.z, 1.4), ear.reach(walkX, 0, 1.1) * 0.8);
      near = ear.near();
      const want = bus && on() ? (0.14 + 0.86 * close) * (0.55 + 0.45 * near) : 0;
      if (bus && !audio && want > 0.01) audio = build(bus);
      if (!audio) return false;
      level += (want - level) * 0.2;
      const t = audio.ctx.currentTime;
      if (level < 0.004 && want < 0.004) { level = 0; audio.gain.gain.setTargetAtTime(0, t, 0.3); audio.player.reset(); return false; }
      audio.gain.gain.setTargetAtTime(level * LEVEL, t, 0.4);
      audio.tone.frequency.setTargetAtTime(1400 + 4300 * close * near, t, 0.4);
      const pointX = ear.reach(DECK.x, DECK.z, 1.4) >= ear.reach(walkX, 0, 1.1) * 0.8 ? DECK.x : walkX;
      audio.pan.pan.setTargetAtTime(ear.pan(pointX, pointX === DECK.x ? DECK.z : 0), t, 0.3);
      if (bus && want > 0.004) audio.player.step(t);
      return false;
    },
    debug: () => ({ level: +level.toFixed(3), on: on(), playing: !!audio && level > 0.004 }),
  };
}
