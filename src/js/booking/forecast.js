import { COURTS, isSlotTaken, dayKeyForOffset } from '../shared/availability.js';
import { miamiNow, sunElevation } from './miami-clock.js';

// Hourly Miami forecast for the booking flow (round 9, rows 9, 11, 18). Open-Meteo, free, no key,
// fetched once per page (lazily, after the map is up) and shared: the "best time" band over the
// time scrubber, the forecast line in the booking panel and the postcard frame all read it.
// `?weather=rain` forces a wet forecast for previews. Offline: every reader falls back quietly.

import { openMeteo } from './open-meteo.js';

const PREVIEW_RAIN = new URLSearchParams(location.search).get('weather');

let table = null; // 'YYYY-MM-DDTHH' → { temp, rain, code, wind }
let pending = null;

/** Starts the fetch once; resolves to true when there is data. Fires `bp-forecast` when it lands. */
export function loadForecast() {
  pending ??= openMeteo()
    .then(({ hourly: h }) => {
      table = new Map();
      h.time.forEach((t, i) => table.set(t.slice(0, 13), {
        temp: h.temperature_2m[i], rain: h.precipitation_probability[i] ?? 0, code: h.weather_code[i], wind: h.wind_speed_10m[i],
      }));
      document.dispatchEvent(new CustomEvent('bp-forecast'));
      return true;
    })
    .catch(() => false);
  return pending;
}

/** Miami calendar day `offset` days from today, as { y, m, d, offset } (sunElevation's input). */
export function miamiDay(offset = 0) {
  const now = miamiNow();
  const d = new Date(Date.UTC(now.y, now.m - 1, now.d + offset));
  return { ...now, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

const key = ({ y, m, d }, hour) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}`;

/** Forecast for an hour of a day, or null (not loaded, offline, too far ahead). */
export function forecastAt(offset, hour) {
  const f = table?.get(key(miamiDay(offset), hour));
  if (!f) return null;
  if (PREVIEW_RAIN === 'rain' || PREVIEW_RAIN === 'storm') return { ...f, rain: Math.max(f.rain, 70), code: PREVIEW_RAIN === 'storm' ? 95 : 63 };
  if (PREVIEW_RAIN === 'clear') return { ...f, rain: 0, code: 0 };
  return f;
}

export const windWord = (mph) => (mph < 4 ? 'still air' : mph < 10 ? 'light breeze' : mph < 18 ? 'breezy' : 'windy');
export const isWet = (f) => !!f && (f.rain >= 40 || (f.code >= 51 && f.code < 100 && f.code !== 71));

/** Sunset of a day in hours (18.7 = 18:42), found by stepping the sun down through the horizon. */
export function sunsetHour(offset = 0) {
  const day = miamiDay(offset);
  let prev = sunElevation(day, 12).elevation;
  for (let t = 12.05; t < 22; t += 0.05) {
    const e = sunElevation(day, t).elevation;
    if (prev > -0.83 && e <= -0.83) return t - 0.05 * ((-0.83 - e) / (prev - e));
    prev = e;
  }
  return 19;
}

/**
 * How good an hour is for a game (row 9): quiet (courts free), cool (forecast), no low sun in the
 * eyes. 0…1 per part plus a total; the band over the scrubber shades by `score`.
 */
export function hourScore(offset, hour) {
  const dayKey = dayKeyForOffset(offset);
  const free = COURTS.filter((c) => !isSlotTaken(c.id, dayKey, hour)).length;
  const quiet = free / COURTS.length;
  const f = forecastAt(offset, hour);
  const cool = f ? Math.min(1, Math.max(0, (90 - f.temp) / 12)) : 0.5;
  const dry = f ? 1 - Math.min(1, f.rain / 80) : 1;
  const e = sunElevation(miamiDay(offset), hour + 0.5).elevation;
  const glare = e > 0 && e < 16; // low sun straight down the court
  const score = (0.45 * quiet + 0.3 * cool + 0.25 * (glare ? 0 : 1)) * (0.4 + 0.6 * dry);
  return { score, free, quiet, temp: f ? Math.round(f.temp) : null, rain: f?.rain ?? null, glare, sunUp: e > 0 };
}
