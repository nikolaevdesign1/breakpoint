// One Open-Meteo request for the whole booking page (row 48): the current weather (top bar, rain on
// the map) and the hourly forecast (best-time band, booking panel, postcard) used to be two calls.
// The answer is shared in memory and kept in sessionStorage for 10 minutes, so a reload or another
// visit to the page in the same tab asks nothing. Resolves to { current, hourly } or rejects offline.

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=25.73&longitude=-80.23'
  + '&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m'
  + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m'
  + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=9';
const KEY = 'bp-open-meteo';
const FRESH = 10 * 60 * 1000;

let memo = null; // { at, promise }

function stored() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    return v && Date.now() - v.at < FRESH ? v : null;
  } catch { return null; }
}

export function openMeteo() {
  if (memo && Date.now() - memo.at < FRESH) return memo.promise;
  const hit = stored();
  if (hit) { memo = { at: hit.at, promise: Promise.resolve(hit.data) }; return memo.promise; }
  const at = Date.now();
  const promise = fetch(URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ at, data })); } catch { /* private mode */ }
      return data;
    });
  memo = { at, promise };
  promise.catch(() => { if (memo?.promise === promise) memo = null; });
  return promise;
}
