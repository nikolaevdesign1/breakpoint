// Daily forecast for Miami (Open-Meteo, the same free service the booking map uses: no key, Google has no open
// weather feed). One request covers the next 16 days; the answer is kept in sessionStorage for 30 minutes.
// Resolves to a Map of 'YYYY-MM-DD' → { code, hi, lo, rain } (°F, rain chance in %), or rejects offline.

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=25.73&longitude=-80.23'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  + '&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16';
const KEY = 'bp-day-weather';
const FRESH = 30 * 60 * 1000;

let memo = null;

function read() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    return v && Date.now() - v.at < FRESH ? v.data : null;
  } catch { return null; }
}

function toMap(data) {
  const d = data.daily;
  return new Map(d.time.map((day, i) => [day, {
    code: d.weather_code[i], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] ?? 0,
  }]));
}

export function dayWeather() {
  if (memo) return memo;
  const hit = read();
  if (hit) return (memo = Promise.resolve(toMap(hit)));
  memo = fetch(URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* private mode */ }
      return toMap(data);
    });
  memo.catch(() => { memo = null; });
  return memo;
}

const SUN = '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>';
const CLOUD = '<path d="M4.5 12.5h7a2.8 2.8 0 0 0 .3-5.6A4 4 0 0 0 4 7.4a2.6 2.6 0 0 0 .5 5.1z"/>';
const ICONS = {
  clear: SUN,
  part: '<circle cx="5.5" cy="5.5" r="2.2"/><path d="M5.5 1v1.2M1 5.5h1.2M2.3 2.3l.9.9M8.7 2.3l-.9.9"/><path d="M6.5 13h5a2.2 2.2 0 0 0 .2-4.4A3.2 3.2 0 0 0 5.5 9.6 1.7 1.7 0 0 0 6.5 13z"/>',
  cloud: CLOUD,
  fog: '<path d="M2 5h12M3.5 8h9M2 11h12"/>',
  rain: `${CLOUD.replace('12.5', '10.5').replace('5.6', '5.6')}<path d="M5.5 13l-.7 1.6M8.5 13l-.7 1.6M11.5 13l-.7 1.6"/>`,
  storm: `${CLOUD.replace('12.5', '10')}<path d="M8.6 10.5l-1.6 2.6h2l-1.2 2.2"/>`,
  snow: `${CLOUD}`,
};

export function weatherKind(code) {
  if (code === 0) return ['clear', 'Clear'];
  if (code <= 2) return ['part', 'Partly cloudy'];
  if (code === 3) return ['cloud', 'Cloudy'];
  if (code <= 48) return ['fog', 'Fog'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['rain', 'Rain'];
  if (code >= 95) return ['storm', 'Thunderstorm'];
  if (code <= 77) return ['snow', 'Snow'];
  return ['rain', 'Showers'];
}

export function weatherHTML(w) {
  const [kind, label] = weatherKind(w.code);
  const rain = w.rain >= 30 ? `<i>${w.rain}%</i>` : '';
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg><b>${w.hi}°</b>${rain}<span class="visually-hidden">${label}, high ${w.hi}, low ${w.lo} degrees${w.rain >= 30 ? `, ${w.rain} percent chance of rain` : ''}</span>`;
}
