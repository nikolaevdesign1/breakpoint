// Miami wall clock and sun (round 7, "daylight"). The map's light follows the club's local time
// (America/New_York), whatever the visitor's own time zone. `?time=07:30` (or __bp.setTime in dev)
// pins the clock for previews; `bp-clock` goes out whenever the pinned time changes.

const TZ = 'America/New_York';
const LAT = 25.73;
const LON = -80.23;
const RAD = Math.PI / 180;

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});

function parseTime(s) {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = +m[1] + (+m[2] || 0) / 60;
  return h >= 0 && h < 24 ? h : null;
}

let pinned = parseTime(new URLSearchParams(location.search).get('time'));

/** Pins the clock to "HH:MM" (null: back to the real time). */
export function setClock(time) {
  pinned = time == null ? null : parseTime(time);
  document.dispatchEvent(new CustomEvent('bp-clock', { detail: { pinned } }));
  return pinned;
}

/** Miami now: calendar date, hours as a float (14.5 = 14:30), and the UTC offset in hours. */
export function miamiNow(date = new Date()) {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  const y = +p.year;
  const mo = +p.month;
  const d = +p.day;
  const real = +p.hour + +p.minute / 60 + +p.second / 3600;
  const wall = Date.UTC(y, mo - 1, d, +p.hour, +p.minute, +p.second);
  const offset = Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 36e5);
  return { y, m: mo, d, hours: pinned ?? real, offset, pinned: pinned !== null };
}

export const miamiHour = () => Math.floor(miamiNow().hours);
export const fmtClock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 + 1e-6)).padStart(2, '0')}`;

/**
 * Sun elevation in degrees over the club for a Miami date and local hour (NOAA's short-form
 * equations: declination and equation of time per day of year; good to a few minutes).
 */
export function sunElevation({ y, m, d, offset }, hours) {
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const decl = -23.44 * Math.cos((360 / 365) * (n + 10) * RAD);
  const b = (360 / 365) * (n - 81) * RAD;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const solar = hours + (4 * (LON - 15 * offset) + eot) / 60;
  const ha = 15 * (solar - 12) * RAD;
  const s = Math.sin(LAT * RAD) * Math.sin(decl * RAD) + Math.cos(LAT * RAD) * Math.cos(decl * RAD) * Math.cos(ha);
  return { elevation: Math.asin(Math.max(-1, Math.min(1, s))) / RAD, afternoon: solar >= 12 };
}
