import * as THREE from 'three';
import { sky } from '../lookdev.js';
import { weatherSky, onWeather } from './sky.js';

// Cloud shadows (round 7): large soft shadows drifting over the whole club with the wind from the
// weather. They are drawn by the finish pass over the cached frame (lookdev.js `sky.uCloud`), from
// the ground point under each pixel, so the static frame is never redrawn for them; this system only
// moves the field and sets how cloudy it is. None at night (they need the sun up); more and denser
// when it is overcast or raining: darker patches rolling over an already grey club.

// WMO code → [coverage 0…1, shadow strength 0…1]
function cover(code) {
  if (code >= 95) return [0.82, 0.34];
  if (code >= 51) return [0.74, 0.3];
  if (code === 3 || code === 45 || code === 48) return [0.66, 0.36];
  if (code >= 1) return [0.44, 0.5];
  return [0.26, 0.46]; // a clear Miami sky still has a few cumulus
}

export function createClouds(ctx, { still }) {
  const u = sky.uCloud.value;
  const want = { coverage: 0.26, strength: 0.46 };
  const vel = new THREE.Vector2(-2.4, 1.2); // m/s the field drifts (x, z)
  const offset = new THREE.Vector2(37, -81);
  let shown = 0; // strength actually drawn (eases towards want × sun)
  let staticDirty = false;

  onWeather((detail) => {
    const { code = 0, wind = 6, windDir = 90 } = detail;
    [want.coverage, want.strength] = cover(code);
    // Clouds ride faster than the breeze at ground level; slow enough to read as drifting.
    const speed = THREE.MathUtils.clamp(1.6 + wind * 0.28, 1.6, 9) * (code >= 95 ? 1.8 : 1);
    const to = THREE.MathUtils.degToRad(windDir + 180); // where the wind blows to (x east, z south)
    vel.set(Math.sin(to) * speed, -Math.cos(to) * speed);
    if (still) staticDirty = true;
  });

  return {
    name: 'clouds',
    tick(t, dt) {
      const step = Math.min(dt, 0.1);
      const target = want.strength * (weatherSky.day ?? weatherSky.sun);
      const before = shown;
      shown += (target - shown) * Math.min(1, step / 2.5);
      if (Math.abs(target - shown) < 0.002) shown = target;
      u.z += (want.coverage - u.z) * Math.min(1, step / 4);
      u.w = shown;
      if (still) {
        if (Math.abs(before - shown) > 1e-4) staticDirty = true;
        return false;
      }
      offset.addScaledVector(vel, -step); // the noise is sampled at p + offset
      u.x = offset.x;
      u.y = offset.y;
      return shown > 0.002;
    },
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    /** Dev: force a sky (coverage, strength); call with no arguments to follow the weather again. */
    set(coverage, strength) {
      if (coverage == null) return;
      want.coverage = coverage;
      want.strength = strength ?? want.strength;
    },
    debug: () => ({ coverage: +u.z.toFixed(2), strength: +u.w.toFixed(2), vel: [+vel.x.toFixed(2), +vel.y.toFixed(2)] }),
  };
}
