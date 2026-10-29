import { weatherSky, onWeather } from './sky.js';
import { windForce } from './wind.js';

// Storm mode (round 7): when Miami reports a thunderstorm (WMO 95+, `?weather=storm`, or the third
// click on the weather widget) the sky darkens, the wind leans on the palms and, every 8–20 s, a
// lightning flash lights the whole club for a moment: a few flickers of exposure over the cached
// frame (life/daylight.js), never a re-render. Thunder follows 1–4 s later through the ambient
// sound bed (`bp-thunder`, ambient.js). Reduced motion: the dark sky and the rain, no flashes.

const STEPS = 4; // storm darkness changes the static light in a few steps
const WIND = { calm: 1, rain: 1.35, storm: 2.6 };
const rand = (a, b) => a + Math.random() * (b - a);

export function createStorm(ctx, { still }) {
  let storm = false;
  let level = 0; // 0…1 darkness of the storm sky
  let step = 0;
  let wind = WIND.calm;
  let next = Infinity; // time of the next flash (s)
  let flash = null; // { start, pulses: [[at, peak, decay]] }

  onWeather((detail) => {
    const was = storm;
    storm = (detail.code ?? 0) >= 95;
    wind = storm ? WIND.storm : detail.rain ? WIND.rain : WIND.calm;
    if (storm && !was) next = performance.now() / 1000 + rand(2.5, 5); // the first one soon after it turns
    if (!storm) next = Infinity;
  });

  function strike(now, hold = 0) {
    // Return strokes: a main flash and one to three flickers in the next half second.
    const pulses = [[0, rand(0.7, 1), hold || 0.07]];
    const n = Math.floor(rand(1, 4));
    let at = 0;
    for (let i = 0; i < (hold ? 0 : n); i++) {
      at += rand(0.07, 0.18);
      pulses.push([at, rand(0.35, 0.9), rand(0.05, 0.12)]);
    }
    flash = { start: now, pulses, end: at + 0.6 + hold * 3 };
    const power = rand(0.55, 1);
    document.dispatchEvent(new CustomEvent('bp-thunder', { detail: { delay: rand(1, 4) * (1.2 - power * 0.4), power } }));
    next = now + rand(8, 20);
  }

  return {
    name: 'storm',
    tick(t, dt) {
      const now = performance.now() / 1000;
      const k = Math.min(1, Math.min(dt, 0.1) / 3);
      level += ((storm ? 1 : 0) - level) * k;
      if (Math.abs(level - (storm ? 1 : 0)) < 0.01) level = storm ? 1 : 0;
      const want = Math.round(level * STEPS);
      if (want !== step) {
        step = want;
        weatherSky.storm = step / STEPS;
        weatherSky.changed = true;
      }
      // Wind on the trees: a uniform, eased so the palms lean into it.
      windForce.value += (wind - windForce.value) * Math.min(1, Math.min(dt, 0.1) / 2.5);

      if (!still && storm && now >= next && !flash) strike(now);
      let f = 0;
      if (flash) {
        const e = now - flash.start;
        for (const [at, peak, decay] of flash.pulses) if (e >= at) f = Math.max(f, peak * Math.exp(-(e - at) / decay));
        if (e > flash.end) flash = null;
      }
      weatherSky.flash = f;
      return !!flash || Math.abs(windForce.value - wind) > 0.01;
    },
    /** Dev: a flash right now (`hold`: seconds it takes to fade, for screenshots). */
    strike: (hold) => strike(performance.now() / 1000, hold),
    debug: () => ({ storm, level: +level.toFixed(2), wind: +windForce.value.toFixed(2), next: next === Infinity ? null : +(next - performance.now() / 1000).toFixed(1) }),
  };
}
