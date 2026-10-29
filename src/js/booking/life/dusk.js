import * as THREE from 'three';
import { miamiNow, sunElevation } from '../miami-clock.js';
import { hourState } from '../hour-state.js';
import { weatherSky } from './sky.js';

// The light time as the life layer sees it (round 8, "wetnight"): the hour the map shows (Miami
// clock or the dock's scrubber, the same rule as life/daylight.js), eased over a scrub the way
// the light is, the sun's elevation at that time, how dark it is, and the colour of the sky a
// puddle mirrors. Read-only: it never touches the light itself. One shared state, recomputed at
// most a few times a second (Intl date parts are not free).

const EASE = 0.9; // s, like daylight's scrub
const SAMPLE = 0.2; // s between recomputes when nothing moves

// Sky a puddle mirrors, display space, by sun elevation (degrees): the lower sky (h), the sky
// higher up (z) and a warm lobe around the sun (sun). Golden at the end of the day, pink right
// after sunset, deep blue at dusk, near black at night.
const SKY = [
  { e: -16, h: [0.035, 0.045, 0.075], z: [0.018, 0.024, 0.042], sun: [0, 0, 0] },
  { e: -8, h: [0.13, 0.17, 0.34], z: [0.06, 0.085, 0.2], sun: [0.04, 0.04, 0.08] },
  { e: -3, h: [0.62, 0.38, 0.44], z: [0.22, 0.24, 0.44], sun: [0.4, 0.2, 0.16] },
  { e: 1, h: [0.94, 0.58, 0.38], z: [0.5, 0.44, 0.6], sun: [0.7, 0.36, 0.14] },
  { e: 8, h: [0.92, 0.74, 0.5], z: [0.5, 0.58, 0.7], sun: [0.5, 0.36, 0.16] },
  { e: 24, h: [0.66, 0.73, 0.8], z: [0.42, 0.55, 0.72], sun: [0.16, 0.14, 0.1] },
];

function mixSky(e) {
  const x = THREE.MathUtils.clamp(e, SKY[0].e, SKY[SKY.length - 1].e);
  let i = 0;
  while (i < SKY.length - 2 && x > SKY[i + 1].e) i++;
  const a = SKY[i];
  const b = SKY[i + 1];
  const t = (x - a.e) / (b.e - a.e);
  const lerp = (u, v) => u.map((c, k) => c + (v[k] - c) * t);
  return { h: lerp(a.h, b.h), z: lerp(a.z, b.z), sun: lerp(a.sun, b.sun) };
}

const state = {
  hours: 12,
  elevation: 60,
  afternoon: true,
  /** 0 by day … 1 at full night (sun 6° below the horizon), storms count as dusk. */
  dark: 0,
  skyH: new THREE.Color(),
  skyZ: new THREE.Color(),
  skySun: new THREE.Color(),
  /** Towards the sun, horizontal-ish (for the sun lobe in the reflections). */
  sunDir: new THREE.Vector3(-0.6, 0.1, 0.4).normalize(),
};

let shown = null; // hours shown now
let tween = null; // { from, to, start }
let lastTarget = null;
let lastSample = -1;

const targetHours = () => (hourState.live || hourState.time == null ? miamiNow().hours : hourState.time);

function compute(now) {
  const want = targetHours();
  if (shown == null) shown = want;
  if (lastTarget == null || Math.abs(want - lastTarget) > 0.02) {
    if (lastTarget != null && Math.abs(want - shown) > 0.05 && !hourState.instant) tween = { from: shown, to: want, start: now }; // round 9: no easing in the timelapse
    else shown = want;
    lastTarget = want;
  }
  if (tween) {
    const p = Math.min(1, (now - tween.start) / EASE);
    shown = tween.from + (tween.to - tween.from) * (1 - (1 - p) ** 2);
    if (p >= 1) tween = null;
  }
  const { elevation, afternoon } = sunElevation(miamiNow(), shown);
  state.hours = shown;
  state.elevation = elevation;
  state.afternoon = afternoon;
  const storm = weatherSky.storm ?? 0;
  state.dark = Math.max(THREE.MathUtils.smoothstep(-elevation, -4, 6), storm * 0.75);

  // The sky colour, greyed under rain cloud (a sunset keeps some of its colour) and darker in a storm.
  const s = mixSky(elevation);
  const grey = (c, k) => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return c.map((v) => v + (l * 0.86 - v) * k); };
  const o = (weatherSky.overcast ?? 0) * 0.22;
  const dim = 1 - 0.65 * storm;
  state.skyH.setRGB(...grey(s.h, o)).multiplyScalar(dim);
  state.skyZ.setRGB(...grey(s.z, o)).multiplyScalar(dim);
  state.skySun.setRGB(...s.sun).multiplyScalar((1 - o) * dim);
  // Sun azimuth: west-south-west in the evening, east-south-east in the morning (the camera looks
  // north, -z): only the side matters for the lobe.
  state.sunDir.set(afternoon ? -0.85 : 0.85, Math.max(0.02, Math.sin(THREE.MathUtils.degToRad(elevation))), 0.35).normalize();
}

/** The shared dusk state, fresh for this frame. */
export function dusk() {
  const now = performance.now() / 1000;
  if (tween || now - lastSample > SAMPLE) { lastSample = now; compute(now); }
  return state;
}

/** True while an hour change is still easing in (the reflections and the lights follow it). */
export const duskMoving = () => !!tween;
