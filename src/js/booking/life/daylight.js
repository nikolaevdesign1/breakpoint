import * as THREE from 'three';
import { SUN_DIR, EXPOSURE, aimSun, lifeGrade } from '../lookdev.js';
import { miamiNow, sunElevation, setClock, fmtClock } from '../miami-clock.js';
import { hourState } from '../hour-state.js';
import { COURTS, isOpenHour, isSlotTaken } from '../../shared/availability.js';
import { rallyCourtsAt } from './rallies.js';
import './lesson-courts.js'; // registers the lesson and kids rally filters
import { weatherSky, skyLight } from './sky.js';

// Miami clock drives the light (round 7). The map follows the club's local time, or the hour picked
// on the dock's scrubber: morning (low, soft sun), midday (the original look), golden hour, dusk and
// night. After dark the floodlights burn only over courts booked at that hour, so free courts read
// as dark.
//
// The lightmaps hold the day sky, so the night is made with the exposure (everything dims the same,
// life included) while the floodlights gain the same amount back (scene.js `floodlights`), plus a
// cool, desaturated balance on the darks (lookdev.js bpTone). Sun colour, haze, fog and the balance
// follow the sun's elevation through a few keys. The static frame only changes in quantised steps:
// one degree of sun elevation, eight steps for a scrub; the sun itself turns only between four
// bands (morning, midday, evening, moon), each a single shadow-map redraw.

const DAY_SUN = 7.6;
// Keys by sun elevation (degrees). exp: exposure factor; sun: irradiance; amb: baked sky light
// (lightmaps, environment), lower at golden hour so the low sun reads; tint: display balance;
// night: how far the darks go blue-grey; light: brightness of untonemapped effects (rain).
const NIGHT = { e: -14, exp: 0.2, sun: 0.5, amb: 1, color: [0.55, 0.68, 1], haze: [0.26, 0.32, 0.46], fog: 0.0016, tint: [0.9, 0.95, 1.06], night: 1, light: 0.22 };
const BLUE = { e: -6, exp: 0.3, sun: 0, amb: 0.9, color: [0.7, 0.76, 1], haze: [0.36, 0.4, 0.56], fog: 0.0016, tint: [0.92, 0.94, 1.06], night: 0.7, light: 0.32 };
const DAY = { e: 30, exp: 1, sun: DAY_SUN, amb: 1, color: [1, 0.807, 0.572], haze: [0.5, 0.57, 0.64], fog: 0.0012, tint: [1, 1, 1], night: 0, light: 1 };
const KEYS = {
  pm: [
    NIGHT, BLUE,
    { e: -1, exp: 0.56, sun: 3.2, amb: 0.55, color: [1, 0.42, 0.22], haze: [0.58, 0.46, 0.5], fog: 0.0015, tint: [1.04, 0.94, 0.92], night: 0.2, light: 0.55 },
    { e: 6, exp: 0.8, sun: 7.4, amb: 0.58, color: [1, 0.58, 0.3], haze: [0.68, 0.56, 0.48], fog: 0.0014, tint: [1.05, 0.97, 0.88], night: 0, light: 0.85 },
    { e: 16, exp: 0.92, sun: 7.8, amb: 0.8, color: [1, 0.7, 0.45], haze: [0.6, 0.57, 0.56], fog: 0.0013, tint: [1.03, 0.99, 0.94], night: 0, light: 1 },
    DAY,
  ],
  // Morning: paler sun through a little mist, a cooler balance.
  am: [
    NIGHT,
    { ...BLUE, haze: [0.42, 0.44, 0.58], tint: [0.94, 0.95, 1.06] },
    { e: -1, exp: 0.56, sun: 2.6, amb: 0.7, color: [1, 0.58, 0.45], haze: [0.64, 0.58, 0.62], fog: 0.0024, tint: [1.02, 0.96, 0.98], night: 0.2, light: 0.55 },
    { e: 6, exp: 0.82, sun: 6.4, amb: 0.74, color: [1, 0.74, 0.56], haze: [0.7, 0.7, 0.72], fog: 0.0022, tint: [1.01, 0.99, 1], night: 0, light: 0.9 },
    { e: 16, exp: 0.93, sun: 7.2, amb: 0.88, color: [1, 0.84, 0.66], haze: [0.62, 0.65, 0.69], fog: 0.0017, tint: [1, 1, 1.01], night: 0, light: 1 },
    DAY,
  ],
};
const STORM_HAZE = [0.34, 0.37, 0.42];
const DARK_BELOW = 3; // sun elevation under which booked courts switch their floodlights on

// The sun turns between four bands only (each a shadow-map redraw); azimuths stay near the baked
// one, so the pre-rendered shadows of players, cars and birds still fall the same way.
const AZ0 = Math.atan2(SUN_DIR.x, SUN_DIR.z);
const towards = (dAz, elev) => {
  const a = AZ0 + THREE.MathUtils.degToRad(dAz);
  const e = THREE.MathUtils.degToRad(elev);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
};
const BANDS = {
  mid: { dir: SUN_DIR.clone(), radius: 3 },
  am: { dir: towards(14, 16), radius: 6 }, // long and soft
  pm: { dir: towards(-24, 11), radius: 4 }, // long and warm
  moon: { dir: towards(30, 52), radius: 8 },
};
const bandFor = (e, pm) => (e >= 22 ? 'mid' : e < -7 ? 'moon' : pm ? 'pm' : 'am');

const FLASH_TINT = new THREE.Vector3(0.9, 0.96, 1.12); // lightning is blue-white
const SCRUB_STEPS = 8;
const SCRUB_TIME = 0.9; // s

function mixKeys(keys, e) {
  const x = THREE.MathUtils.clamp(e, keys[0].e, keys[keys.length - 1].e);
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1].e) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (x - a.e) / (b.e - a.e);
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = Array.isArray(a[k]) ? a[k].map((v, j) => v + (b[k][j] - v) * t) : a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

/** Basis of a card facing `n` (impostors.js sunCard). */
function cardBasis(n) {
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const right = new THREE.Vector3().crossVectors(up, n);
  return new THREE.Matrix4().makeBasis(right, up, n);
}

/** Light-relevant date: Miami today plus `offset` days. */
function dayFor(offset) {
  const now = miamiNow();
  if (!offset) return now;
  const d = new Date(Date.UTC(now.y, now.m - 1, now.d + offset));
  return { ...now, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function createDaylight({ scene, renderer, refreshShadows, sun, floodlights }, { still }) {
  if (!sun) scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o; });
  const baseCards = cardBasis(SUN_DIR.clone().normalize()).invert();
  let band = 'mid';
  let key = '';
  let staticDirty = false;
  let baseExposure = renderer.toneMappingExposure;
  let current = null; // composed key values
  let lightTime = null; // hours the light shows
  let scrub = null; // { from, to, start }
  let playersGain = 1;
  let lastPoll = 0;
  let lastPlayers = 0;
  let baseNight = 0;
  const baseTint = new THREE.Vector3(1, 1, 1);
  let flashTinted = false;

  // The impostor trees cast through sun-facing cards: turn them with the sun.
  function aimCards(dir) {
    const r = cardBasis(dir.clone().normalize()).multiply(baseCards);
    const q = new THREE.Quaternion().setFromRotationMatrix(r);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.userData.shadowOnly) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        m4.decompose(p, q0, s);
        o.setMatrixAt(i, m4.compose(p, q, s));
      }
      o.instanceMatrix.needsUpdate = true;
      o.computeBoundingSphere();
    });
  }

  // Baked sky light: every lightmapped material, with its own base intensity.
  const baked = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (m.lightMap && !baked.has(m)) baked.set(m, m.lightMapIntensity);
  });

  // Players stand on lit courts after dark: their cards take the floodlight's gain.
  function lightPlayers() {
    scene.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith('life_players') || o.name.includes('shadow')) return;
      const m = o.material;
      m.userData.lift ??= m.color.r;
      const want = m.userData.lift * playersGain;
      if (Math.abs(m.color.r - want) > 1e-3) m.color.setScalar(want);
    });
  }

  function targetTime() {
    return hourState.live || hourState.time == null ? miamiNow().hours : hourState.time;
  }

  function compose(time) {
    const day = dayFor(hourState.live ? 0 : hourState.offset);
    const { elevation, afternoon } = sunElevation(day, time);
    const e = Math.min(30, Math.round(elevation));
    const o = weatherSky.overcast;
    const s = weatherSky.storm;
    const hour = hourState.hour ?? Math.floor(time);
    const dayKey = hourState.dayKey;
    const k = `${e}|${afternoon}|${o.toFixed(2)}|${s.toFixed(2)}|${dayKey}|${hour}|${still}`;
    if (k === key) return;
    key = k;
    const c = current = mixKeys(afternoon ? KEYS.pm : KEYS.am, e);

    // Sun: band (direction, a shadow redraw) and strength.
    const b = bandFor(e, afternoon);
    if (b !== band) {
      band = b;
      aimSun(sun, BANDS[b].dir);
      aimCards(BANDS[b].dir);
      sun.shadow.radius = BANDS[b].radius;
      refreshShadows();
    }
    sun.intensity = c.sun * (1 - 0.6 * o) * (1 - 0.8 * s);
    sun.color.setRGB(...c.color);
    weatherSky.sun = Math.min(1, sun.intensity / DAY_SUN);
    weatherSky.day = THREE.MathUtils.clamp(c.sun / DAY_SUN, 0, 1) * (elevation > 0 ? 1 : 0); // sun up, whatever the weather

    // Air: haze, fog, sky light.
    const haze = new THREE.Color(...c.haze);
    haze.lerp(new THREE.Color(...STORM_HAZE).multiplyScalar(Math.max(0.3, c.exp)), Math.max(o * 0.4, s * 0.8));
    if (scene.fog) {
      scene.fog.color.copy(haze);
      scene.fog.density = c.fog * (1 + 1.6 * o + 0.6 * s);
    }
    if (scene.background?.isColor) scene.background.copy(haze);
    scene.environmentIntensity = c.amb * (1 - 0.18 * o) * (1 - 0.3 * s);
    baked.forEach((base, m) => { m.lightMapIntensity = base * c.amb; });

    // Exposure and balance; lights gain back what the exposure takes.
    const exp = c.exp * (1 - 0.4 * s);
    baseExposure = EXPOSURE * exp;
    lifeGrade.uTint.value.set(...c.tint).lerp(new THREE.Vector3(0.94, 0.97, 1.04), s);
    baseTint.copy(lifeGrade.uTint.value);
    baseNight = lifeGrade.uNight.value = Math.max(c.night, s * 0.35);
    skyLight.value = THREE.MathUtils.clamp(c.light * (1 - 0.3 * s), 0.2, 1);
    const boost = 1 / Math.min(1, exp);
    floodlights?.setBoost(boost);

    // Floodlights: after dark every court booked at the hour; by day the courts with a rally (row 130).
    const dark = elevation < DARK_BELOW || s >= 0.75; // a black storm sky switches them on too
    const booked = dayKey && isOpenHour(dayKey, hour) ? COURTS.filter((ct) => isSlotTaken(ct.id, dayKey, hour)).map((ct) => ct.id) : [];
    floodlights?.setLit(dark ? booked : (still ? [] : rallyCourtsAt(dayKey, hour)));
    playersGain = dark ? Math.min(boost * 1.1, 6) : 1;
    lightPlayers();
    staticDirty = true;
  }

  function startScrub() {
    const to = targetTime();
    if (lightTime == null || still || hourState.instant || Math.abs(to - lightTime) < 0.05) { // round 9: the timelapse (fun/timelapse.js) jumps
      scrub = null;
      lightTime = to;
      compose(lightTime);
      return;
    }
    scrub = { from: lightTime, to, start: performance.now() / 1000 };
  }

  document.addEventListener('bp-hour', startScrub);
  document.addEventListener('bp-clock', startScrub);

  if (import.meta.env.DEV) {
    window.__bp ??= {};
    Object.assign(window.__bp, {
      setTime: (t) => setClock(t),
      light: () => ({ time: lightTime == null ? null : fmtClock(lightTime), band, exposure: +baseExposure.toFixed(3), sun: +sun.intensity.toFixed(2), lit: floodlights?.lit(), ...current }),
    });
  }

  startScrub();

  return {
    name: 'daylight',
    tick(t) {
      const now = performance.now() / 1000;
      if (scrub) {
        const p = Math.min(1, (now - scrub.start) / SCRUB_TIME);
        const step = Math.ceil(p * SCRUB_STEPS) / SCRUB_STEPS; // a few quantised steps, not every frame
        lightTime = scrub.from + (scrub.to - scrub.from) * (1 - (1 - step) ** 2);
        if (p >= 1) { lightTime = scrub.to; scrub = null; }
        compose(lightTime);
      } else if (now - lastPoll > 20) {
        // Live clock: the sun moves a degree every few minutes.
        lastPoll = now;
        if (hourState.live || hourState.time == null) { lightTime = targetTime(); compose(lightTime); }
      }
      if (playersGain !== 1 && now - lastPlayers > 2) { lastPlayers = now; lightPlayers(); } // atlases load late

      if (weatherSky.changed) { weatherSky.changed = false; compose(lightTime); }
      // Lightning: exposure only, the cached frame stays as it is.
      const f = weatherSky.flash;
      const gain = f > 0 ? 1 + f * THREE.MathUtils.clamp(1.7 / (baseExposure / EXPOSURE), 1.6, 6) : 1;
      renderer.toneMappingExposure = baseExposure * gain;
      lifeGrade.uNight.value = baseNight * (1 - Math.min(1, f)); // the flash shows colour
      if (f > 0 || flashTinted) {
        lifeGrade.uTint.value.copy(baseTint).lerp(FLASH_TINT, Math.min(1, f));
        flashTinted = f > 0;
      }
      return !!scrub;
    },
    takeStaticChange() {
      const c = staticDirty;
      staticDirty = false;
      return c;
    },
    debug: () => ({ time: lightTime == null ? null : fmtClock(lightTime), band, exposure: +baseExposure.toFixed(3) }),
  };
}
