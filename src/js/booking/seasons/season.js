import { miamiNow } from '../miami-clock.js';
import { SEASONS, SEASON_NAMES, holidayForDate, resolveId, holidayById } from './calendar.js';

// Holiday decor on the booking map (round 8, "seasons"; row 1 of round 11 widened it to the whole
// year). The club dresses up by the date in Miami, by the registry in calendar.js: Halloween, the
// December holidays, July 4th, New Year, Valentine's Day, … The visitor can force any of them, or
// none, from the top bar (season-menu.js); the choice lasts for the session.
// `?season=<id>|off|auto` sets it from a link (`?season=new-year`, `?season=cinco-de-mayo`; the
// ids are in calendar.js, spelling is forgiven) and the address follows the choice.
// Every change goes out as `bp-season` { mode, season }.

export { SEASONS, SEASON_NAMES };
export const MODES = ['auto', ...SEASONS, 'off'];
export const seasonInfo = holidayById;

const KEY = 'bp-season';
const EVENT = 'bp-season';

/** Season for a Miami calendar date { y, m, d }, or null. */
export const seasonForDate = (date) => holidayForDate(date);

const valid = (v) => (v === 'auto' || v === 'off' ? v : resolveId(v));
const read = () => { try { return valid(sessionStorage.getItem(KEY)); } catch { return null; } };
const write = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

let mode = valid(new URLSearchParams(location.search).get('season')) ?? read() ?? 'auto';

export const seasonMode = () => mode;

/** Season shown now: the forced one, or the date's (null: no decor). */
export function currentSeason() {
  if (mode === 'off') return null;
  if (mode !== 'auto') return mode;
  return seasonForDate(miamiNow());
}

/** The season the date gives, whatever the visitor picked. */
export const datedSeason = () => seasonForDate(miamiNow());

function syncUrl() {
  try {
    const u = new URL(location.href);
    if (mode === 'auto') u.searchParams.delete('season'); else u.searchParams.set('season', mode);
    history.replaceState(history.state, '', u);
  } catch { /* sandboxed frame */ }
}

export function setSeasonMode(next) {
  next = valid(next);
  if (!next || next === mode) return;
  mode = next;
  write(mode);
  syncUrl();
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { mode, season: currentSeason() } }));
}

/** Calls `fn(season, mode)` now and on every change. */
export function onSeason(fn) {
  fn(currentSeason(), mode);
  document.addEventListener(EVENT, (e) => fn(e.detail.season, e.detail.mode));
}
