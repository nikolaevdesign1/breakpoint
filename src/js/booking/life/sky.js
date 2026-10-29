// Shared sky state (round 7). The weather systems write it, life/daylight.js turns it into light:
// - overcast 0…1: rain's grey sky (life/rain.js, quantised steps)
// - storm 0…1: thunderstorm darkness (life/storm.js, quantised steps)
// - flash ≥ 0: a lightning flash this frame (life/storm.js; exposure only, never a re-bake)
// - sun 0…1: how much direct sun there is right now; day 0…1: the same for a clear sky (→ clouds)
// `changed` asks daylight to recompose the static light on its next tick.

export const weatherSky = { overcast: 0, storm: 0, flash: 0, sun: 1, day: 1, changed: false, last: null };

// The latest weather, for systems that start after it was announced (they load after the first frame).
document.addEventListener('bp-weather', (e) => { weatherSky.last = e.detail; });

/** Calls `fn(detail)` with the latest weather now (if any) and on every change. */
export function onWeather(fn) {
  if (weatherSky.last) fn(weatherSky.last);
  document.addEventListener('bp-weather', (e) => fn(e.detail));
}

/** Holiday decor asks the clubhouse for warm windows by day too: 0…1 (seasons/winter.js writes it, life/clubhouse.js reads it). */
export const decorLight = { windows: 0, nightKeeper: false }; // nightKeeper: Death works after dark too (seasons/death.js, life/keeper.js)

/** Display-space brightness of effects drawn without tone mapping (rain streaks, puddle sheen). */
export const skyLight = { value: 1 };
