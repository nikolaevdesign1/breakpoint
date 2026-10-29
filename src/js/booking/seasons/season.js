import { miamiNow } from '../miami-clock.js';

// Holiday decor on the booking map (round 8, "seasons"). The club dresses up by the date in Miami:
// Halloween (Oct 20 to Nov 1), the December holidays (Dec 1 to Jan 6) and the Fourth of July
// (Jul 1 to Jul 5). The visitor can force any of them, or none, from the top bar (season-menu.js);
// the choice lasts for the session. `?season=halloween|holidays|july4|off|auto` sets it from a link.
// Every change goes out as `bp-season` { mode, season }.

export const SEASONS = ['halloween', 'holidays', 'july4'];
export const MODES = ['auto', ...SEASONS, 'off'];
export const SEASON_NAMES = { halloween: 'Halloween', holidays: 'Holidays', july4: 'July 4th' };

const KEY = 'bp-season';
const EVENT = 'bp-season';

/** Season for a Miami calendar date (month 1…12), or null. */
export function seasonForDate({ m, d }) {
  if ((m === 10 && d >= 20) || (m === 11 && d <= 1)) return 'halloween';
  if (m === 12 || (m === 1 && d <= 6)) return 'holidays';
  if (m === 7 && d <= 5) return 'july4';
  return null;
}

const valid = (v) => (MODES.includes(v) ? v : null);
const read = () => { try { return valid(sessionStorage.getItem(KEY)); } catch { return null; } };
const write = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

let mode = valid(new URLSearchParams(location.search).get('season')?.toLowerCase()) ?? read() ?? 'auto';

export const seasonMode = () => mode;

/** Season shown now: the forced one, or the date's (null: no decor). */
export function currentSeason() {
  if (mode === 'off') return null;
  if (mode !== 'auto') return mode;
  return seasonForDate(miamiNow());
}

/** The season the date gives, whatever the visitor picked. */
export const datedSeason = () => seasonForDate(miamiNow());

export function setSeasonMode(next) {
  if (!valid(next) || next === mode) return;
  mode = next;
  write(mode);
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { mode, season: currentSeason() } }));
}

/** Calls `fn(season, mode)` now and on every change. */
export function onSeason(fn) {
  fn(currentSeason(), mode);
  document.addEventListener(EVENT, (e) => fn(e.detail.season, e.detail.mode));
}
