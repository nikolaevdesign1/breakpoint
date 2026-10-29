import { miamiNow, fmtClock } from './miami-clock.js';

// Miami right now (row 151): local time and the current weather in the booking top bar, next to the
// sound toggle. Data: Open-Meteo (free, no key), refreshed every 15 minutes. When it rains in Miami it
// rains on the map too: the state goes out as a `bp-weather` event that life/rain.js listens to.
// Preview any weather with ?weather=rain | storm | drizzle | clear. A click on the widget swaps sun and
// rain on the map (row 156); the temperature and the clock stay real.

import { openMeteo } from './open-meteo.js';
import './seasons/chill.js'; // listens for the same `bp-weather`: heaters and jackets below ~60°F

const TZ = 'America/New_York';
const EVERY = 15 * 60 * 1000;

// WMO weather codes → label, icon, rain intensity 0…1.
function describe(code) {
  if (code === 0) return { label: 'Clear', icon: 'sun', rain: 0 };
  if (code <= 2) return { label: 'Partly cloudy', icon: 'cloud-sun', rain: 0 };
  if (code === 3) return { label: 'Overcast', icon: 'cloud', rain: 0 };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'cloud', rain: 0 };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain', rain: 0.35 };
  if (code === 61 || code === 80) return { label: 'Light rain', icon: 'rain', rain: 0.55 };
  if (code === 63 || code === 66 || code === 81) return { label: 'Rain', icon: 'rain', rain: 0.75 };
  if (code === 65 || code === 67 || code === 82) return { label: 'Heavy rain', icon: 'rain', rain: 1 };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'storm', rain: 1 };
  return { label: 'Cloudy', icon: 'cloud', rain: 0 };
}

const PREVIEW = { clear: 0, drizzle: 51, rain: 63, storm: 95 };
// Round 7: a click steps the map's sky clear → rain → storm → clear.
const CYCLE = [
  { code: PREVIEW.clear, cursor: 'Make it rain', next: 'rain' },
  { code: PREVIEW.rain, cursor: 'Bring the storm', next: 'a storm' },
  { code: PREVIEW.storm, cursor: 'Bring the sun', next: 'sun' },
];
const stage = (code) => (code >= 95 ? 2 : describe(code).rain ? 1 : 0);

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  'cloud-sun': '<path d="M8 4v2M3 9h2M4.5 5.5l1.4 1.4M12.6 6.9a4 4 0 0 0-7 2.7"/><path d="M8 20h10a4 4 0 0 0 0-8h-.5A6 6 0 0 0 6 13.5 3.3 3.3 0 0 0 8 20z"/>',
  cloud: '<path d="M7 19h11a4 4 0 0 0 0-8h-.5A6 6 0 0 0 5 12.5 3.3 3.3 0 0 0 7 19z"/>',
  rain: '<path d="M7 15h11a4 4 0 0 0 0-8h-.5A6 6 0 0 0 5 8.5 3.3 3.3 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  storm: '<path d="M7 14h11a4 4 0 0 0 0-8h-.5A6 6 0 0 0 5 7.5 3.3 3.3 0 0 0 7 14z"/><path d="M12 15l-2 4h3l-2 4"/>',
};

export function initWeather(root = document.querySelector('[data-weather]')) {
  if (!root) return;
  const el = {
    icon: root.querySelector('[data-weather-icon]'),
    temp: root.querySelector('[data-weather-temp]'),
    label: root.querySelector('[data-weather-label]'),
    time: root.querySelector('[data-weather-time]'),
  };
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const preview = new URLSearchParams(location.search).get('weather');

  // Clock: ticks on the minute.
  const tick = () => {
    el.time.textContent = miamiNow().pinned ? fmtClock(miamiNow().hours) : clock.format(new Date());
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  };
  tick();
  document.addEventListener('bp-clock', () => { el.time.textContent = miamiNow().pinned ? fmtClock(miamiNow().hours) : clock.format(new Date()); });

  let last = { temp: null, code: preview in PREVIEW ? PREVIEW[preview] : 0, wind: 0, windDir: 0 }; // what Miami reports
  let forced = null; // code picked by a click, overrides the live weather until the next click

  function show(data, manual = false) {
    last = data;
    const { temp, wind = 0, windDir = 0 } = data;
    const code = forced ?? data.code;
    const w = describe(code);
    el.icon.innerHTML = ICONS[w.icon];
    el.temp.textContent = temp == null ? '' : `${Math.round(temp)}°F`;
    el.label.textContent = w.label;
    const { next, cursor } = CYCLE[stage(code)];
    root.setAttribute('aria-label', `Miami ${clock.format(new Date())}, ${w.label}${temp == null ? '' : `, ${Math.round(temp)}°F`}. Switch the map to ${next}`);
    root.dataset.cursor = cursor;
    root.setAttribute('aria-pressed', String(forced !== null));
    root.classList.add('is-ready');
    announce({ ...w, code, temp, wind, windDir, manual: manual || forced !== null });
  }

  // Round 9 (row 26): dry to wet, the map first sees the front come over (life/rain-front.js draws a
  // dark band of cloud sweeping across), and the rain starts behind it. Not on the first report:
  // if Miami is already wet when the map opens, it simply rains.
  let wetSent = null; // rain level last announced (null: nothing yet)
  let pending = null; // { timer, detail }
  function announce(detail) {
    const send = (d) => { wetSent = d.rain ?? 0; document.dispatchEvent(new CustomEvent('bp-weather', { detail: d })); };
    if (pending) {
      if (detail.rain > 0) { pending.detail = detail; return; } // still coming: the newer weather rides in behind the front
      clearTimeout(pending.timer);
      pending = null;
      document.dispatchEvent(new CustomEvent('bp-rain-front', { detail: { cancel: true } }));
      send(detail);
      return;
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (wetSent === 0 && detail.rain > 0 && !still) {
      const delay = detail.manual ? 3.4 : 9;
      pending = { detail, timer: setTimeout(() => { const d = pending.detail; pending = null; send(d); }, delay * 1000) };
      document.dispatchEvent(new CustomEvent('bp-rain-front', { detail: { delay, manual: detail.manual, wind: detail.wind, windDir: detail.windDir, storm: detail.code >= 95 } }));
      return;
    }
    send(detail);
  }

  async function load() {
    try {
      const c = (await openMeteo()).current;
      const code = preview in PREVIEW ? PREVIEW[preview] : c.weather_code;
      show({ temp: c.temperature_2m, code, wind: c.wind_speed_10m, windDir: c.wind_direction_10m });
    } catch {
      // Offline or blocked: keep the clock, show the preview weather if one was asked for.
      if (preview in PREVIEW) show({ temp: null, code: PREVIEW[preview] });
    }
  }
  // Click: sun ⇄ rain on the map. The widget squashes like a pressed tile and the icon swaps in.
  root.addEventListener('click', () => {
    forced = CYCLE[(stage(forced ?? last.code) + 1) % CYCLE.length].code;
    show(last, true);
    el.icon.animate?.([{ transform: 'translateY(6px) scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  });

  load();
  setInterval(load, EVERY);
}
