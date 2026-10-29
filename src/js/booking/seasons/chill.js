import { currentSeason } from './season.js';

// Cold at the club (round 10, row 5): below ~60°F by the Open-Meteo reading, or forced by the
// Holidays decor, or by `?cold=1` (`?cold=0` never). Heaters stand on the courts and people wear
// jackets while it is on (life/cold.js). Every change goes out as `bp-chill` { on }.

export const COLD_F = 60;
const param = new URLSearchParams(location.search).get('cold');
let temp = null; // °F, from the last `bp-weather`
let on = false;

function update() {
  const next = param === '1' || (param !== '0' && (currentSeason() === 'holidays' || (temp != null && temp <= COLD_F)));
  if (next === on) return;
  on = next;
  document.dispatchEvent(new CustomEvent('bp-chill', { detail: { on } }));
}

document.addEventListener('bp-weather', (e) => { temp = e.detail.temp ?? temp; update(); });
document.addEventListener('bp-season', update);
update();

export const isChill = () => on;

/** Calls `fn(on)` now and on every change. */
export function onChill(fn) {
  fn(on);
  document.addEventListener('bp-chill', (e) => fn(e.detail.on));
}
