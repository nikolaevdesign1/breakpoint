import { ambientBus } from '../ambient.js';
import { createListener } from './listener.js';

// The sound of a drinking fountain (round 10, row 36): a soft trickle of filtered noise with a few
// plinks where the jet falls into the bowl. It sits on the ambient bus, so it goes quiet with the
// site's sound toggle, and it is louder and wider in the stereo field the closer the drone is.

export function createWaterSound({ rig }) {
  const ear = createListener(rig);
  let noise = null;
  let noiseCtx = null;

  function buffer(ctx) {
    if (noise && noiseCtx === ctx) return noise;
    noiseCtx = ctx;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  /** The trickle for `seconds`, from a ground point; silent when the map is muted or out of earshot. */
  return function play(x, z, seconds = 3) {
    const bus = ambientBus();
    if (!bus) return;
    const level = 0.25 + 0.75 * ear.near() * 0.6 + 0.4 * ear.reach(x, z, 0.8);
    if (level < 0.12) return;
    const { ctx, out } = bus;
    const t = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner();
    pan.pan.value = ear.pan(x, z);
    pan.connect(out);
    const src = ctx.createBufferSource();
    src.buffer = buffer(ctx);
    src.loop = true;
    const hi = ctx.createBiquadFilter();
    hi.type = 'bandpass';
    hi.frequency.value = 3200;
    hi.Q.value = 0.7;
    const lo = ctx.createBiquadFilter();
    lo.type = 'highpass';
    lo.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022 * level, t + 0.25);
    g.gain.setValueAtTime(0.022 * level, t + seconds - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    // The flow breathes a little.
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 6.5;
    lg.gain.value = 600;
    lfo.connect(lg).connect(hi.frequency);
    src.connect(hi).connect(lo).connect(g).connect(pan);
    src.start(t, Math.random());
    lfo.start(t);
    src.stop(t + seconds + 0.05);
    lfo.stop(t + seconds + 0.05);
    // Plinks in the bowl.
    for (let i = 0; i < Math.floor(seconds * 3); i++) {
      const at = t + 0.2 + Math.random() * (seconds - 0.5);
      const o = ctx.createOscillator();
      const pg = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1500 + Math.random() * 1800, at);
      pg.gain.setValueAtTime(0.0001, at);
      pg.gain.exponentialRampToValueAtTime(0.006 * level, at + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      o.connect(pg).connect(pan);
      o.start(at);
      o.stop(at + 0.06);
    }
    setTimeout(() => pan.disconnect(), (seconds + 0.5) * 1000);
  };
}
