// Row 36 (round 9): in the holiday season the airliner over the club (life/plane.js) gives way to
// Santa's sleigh. Its shadow is the storybook profile everyone knows (four pairs of reindeer
// leaping ahead of the sleigh, Santa with his sack), laid on the ground along the line of flight,
// and instead of the jet's rumble sleigh bells jingle in from one side and away to the other.

/**
 * Paints the silhouette on a square mask (white on black), in metres at `s` px per metre, centred,
 * the direction of flight towards the top of the texture (as the airliner's nose).
 */
export function drawSleigh(g, s, tex) {
  g.save();
  g.translate(tex / 2, tex / 2);
  g.rotate(-Math.PI / 2); // profile +x (forward) → texture up
  g.scale(s, -s * 1.7); // profile +y up, in metres; heights stretched so the profile reads from above
  g.translate(1.5, -2); // the whole team, ~29 m, centred
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Sleigh: a deep tub with a scrolled front, on a runner that curls up at the nose.
  g.beginPath();
  g.moveTo(-15, 1.2);
  g.lineTo(-15.4, 3.6); // high back
  g.quadraticCurveTo(-15.2, 4.2, -14.4, 4.0);
  g.lineTo(-11.4, 2.6);
  g.lineTo(-9.4, 2.7);
  g.quadraticCurveTo(-8.0, 3.3, -8.3, 4.2); // scrolled dash
  g.quadraticCurveTo(-7.4, 3.9, -7.6, 2.4);
  g.quadraticCurveTo(-8.2, 1.2, -10.2, 0.9);
  g.closePath();
  g.fill();
  g.lineWidth = 0.32;
  g.beginPath(); // runner
  g.moveTo(-15.6, 0.0);
  g.lineTo(-8.4, 0.0);
  g.quadraticCurveTo(-6.6, 0.0, -6.8, 1.3);
  g.quadraticCurveTo(-7.0, 2.0, -7.7, 1.6);
  g.stroke();
  g.lineWidth = 0.26;
  for (const x of [-14, -11.2, -9.2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 0.3, 1.1); g.stroke(); }

  // Santa: round body, arm on the reins, the hat's tip flying back, a full sack behind him.
  circle(g, -11.8, 3.9, 1.25);
  circle(g, -11.5, 5.5, 0.7); // head
  g.beginPath(); // hat
  g.moveTo(-12.2, 5.9);
  g.quadraticCurveTo(-11.6, 6.9, -12.9, 7.2);
  g.lineTo(-13.4, 6.9);
  g.quadraticCurveTo(-12.9, 6.6, -12.7, 5.8);
  g.closePath();
  g.fill();
  circle(g, -13.5, 6.95, 0.32); // pom-pom
  g.beginPath(); // sack
  g.moveTo(-14.6, 3.4);
  g.quadraticCurveTo(-16.2, 4.4, -15.2, 6.0);
  g.quadraticCurveTo(-14.4, 6.6, -13.6, 5.9);
  g.quadraticCurveTo(-13.1, 4.6, -13.6, 3.6);
  g.closePath();
  g.fill();

  // Reins from his hands to the lead pair, sagging.
  g.lineWidth = 0.14;
  g.beginPath();
  g.moveTo(-10.8, 4.3);
  g.bezierCurveTo(-5, 3.2, 4, 4.4, 10.8, 4.6);
  g.stroke();

  // Four pairs of reindeer, each mid-leap, the leaders a little higher.
  [[-3.4, 0.4, 0.0], [1.4, 1.0, 0.6], [6.2, 1.6, 1.2], [11.0, 2.2, 1.8]].forEach(([x, y, ph]) => reindeer(g, x, y, ph));
  g.restore();
}

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

/** One reindeer in profile, facing +x, body centre (x, y), legs gathered or stretched by `ph`. */
function reindeer(g, x, y, ph) {
  g.save();
  g.translate(x, y + 2.2);
  g.scale(1.5, 1.5); // storybook proportions: the team reads as reindeer from the drone
  g.beginPath(); // body
  g.ellipse(0, 0, 1.55, 0.62, -0.06, 0, Math.PI * 2);
  g.fill();
  g.beginPath(); // neck and head
  g.moveTo(0.9, 0.2);
  g.lineTo(1.75, 1.35);
  g.quadraticCurveTo(2.15, 1.55, 2.75, 1.25);
  g.lineTo(2.8, 1.0);
  g.lineTo(2.1, 0.95);
  g.lineTo(1.5, -0.2);
  g.closePath();
  g.fill();
  g.lineWidth = 0.17; // antlers
  g.beginPath();
  g.moveTo(1.9, 1.5); g.lineTo(1.55, 2.4); g.lineTo(1.05, 2.75);
  g.moveTo(1.55, 2.4); g.lineTo(1.95, 2.85);
  g.moveTo(1.7, 1.95); g.lineTo(1.25, 2.05);
  g.stroke();
  g.lineWidth = 0.15; // tail
  g.beginPath(); g.moveTo(-1.5, 0.2); g.lineTo(-1.85, 0.5); g.stroke();
  // Legs: front pair reaching forward, hind pair kicking back, opening and closing along the team.
  const k = 0.55 + 0.45 * Math.sin(ph * 2.1);
  g.lineWidth = 0.2;
  const leg = (hx, hy, kx, ky, fx, fy) => { g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke(); };
  leg(1.0, -0.4, 1.6 + 0.4 * k, -1.0, 2.3 + 0.5 * k, -0.9 - 0.3 * (1 - k));
  leg(0.8, -0.4, 1.1 + 0.6 * k, -1.1, 1.3 + 1.0 * k, -1.6 + 0.4 * k);
  leg(-1.1, -0.4, -1.8 - 0.4 * k, -1.0, -2.6 - 0.5 * k, -1.2 + 0.2 * k);
  leg(-0.9, -0.4, -1.4 - 0.5 * k, -1.2, -1.6 - 1.0 * k, -1.7 + 0.5 * k);
  g.restore();
}

// --- Sleigh bells -----------------------------------------------------------------------------
// A bell is a few inharmonic partials with a fast decay; a shake is half a dozen of them within a
// few hundredths of a second. One shake is synthesised into a buffer once, then replayed at the
// team's gallop, a little detuned each time, swelling as the sleigh passes and panned across.

let shakeBuffer = null;

function shake(ctx) {
  if (shakeBuffer) return shakeBuffer;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.5);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const bells = 7;
  for (let b = 0; b < bells; b++) {
    const start = Math.floor(sr * (Math.random() * 0.06));
    const f0 = 2200 + Math.random() * 1600;
    const parts = [[1, 1], [2.32, 0.5], [3.17, 0.32], [4.6, 0.16]];
    const amp = 0.12 + Math.random() * 0.08;
    for (let i = start; i < len; i++) {
      const t = (i - start) / sr;
      const env = Math.exp(-t * (16 + Math.random() * 0.01)) * Math.min(1, t * 900);
      let v = 0;
      for (const [m, a] of parts) v += a * Math.sin(2 * Math.PI * f0 * m * t);
      d[i] += v * env * amp;
    }
  }
  shakeBuffer = buf;
  return buf;
}

/** Jingle bells over the club: in for `lead` s, at their loudest as the shadow passes, then gone. */
export function sleighBells({ ctx, out }, { lead = 6, pass = 8, pan0 = 0.6, pan1 = -0.6, level = 1 } = {}) {
  const t = ctx.currentTime + 0.05;
  const peak = t + lead + pass * 0.5;
  const end = t + lead + pass + 5;
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(pan0, t);
  pan.pan.linearRampToValueAtTime(pan0 * 0.2, peak);
  pan.pan.linearRampToValueAtTime(pan1, end);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.12 * level, t + lead * 0.7);
  master.gain.exponentialRampToValueAtTime(0.5 * level, peak);
  master.gain.exponentialRampToValueAtTime(0.08 * level, end - 2);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  master.connect(hp).connect(pan).connect(out);
  const buf = shake(ctx);
  // A gallop: two shakes close together, then a gap (about 2.6 strides a second).
  for (let s = t, k = 0; s < end - 0.5; k++) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ctx.createGain();
    g.gain.value = k % 2 ? 0.7 : 1;
    src.connect(g).connect(master);
    src.start(s);
    s += k % 2 ? 0.27 : 0.12;
  }
  setTimeout(() => pan.disconnect(), (end - t + 1) * 1000);
}
