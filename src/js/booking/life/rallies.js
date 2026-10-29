import { COURTS as ALL_COURTS, hoursOn, isOpenHour, isSlotTaken, dayKeyForOffset } from '../../shared/availability.js';

// Which courts have a rally on them (split out of players.js, row 48, so the first load carries
// this small table and the sprite system itself loads after the first frame).
// Rallies play on courts that are actually booked right now (the ones the map shows as busy),
// never on a court the visitor could book. Tennis surfaces only; fixed fallback if too few are busy.
const FALLBACK = ['clay-2', 'clay-4', 'hard-1', 'hard-4'];
function busyCourts(n = 4) {
  const now = new Date().getHours() + 1;
  const today = hoursOn(dayKeyForOffset(0));
  const hour = today.find((h) => h >= now) ?? today[today.length - 1]; // club hours of the day (weekends differ)
  // Players are rendered facing ±z only, so rallies run on courts laid out along z: clay and hard.
  // (Padel is a different game; the two grass courts run along x and would put players across the court.)
  const busy = ALL_COURTS.filter((c) => (c.type === 'clay' || c.type === 'hard') && isSlotTaken(c.id, dayKeyForOffset(0), hour)).map((c) => c.id);
  return [...busy, ...FALLBACK.filter((id) => !busy.includes(id))].slice(0, n);
}
/** Courts with a rally on them: their floodlights stay on (row 130, scene.js). */
export const RALLY_COURTS = busyCourts();

/**
 * Round 7: rallies follow the map's hour (dock scrubber, hour-state.js): the clay and hard courts
 * booked at that hour, no fallback; none outside club hours.
 */
export function rallyCourtsAt(dayKey, hour, n = 4) {
  if (!isOpenHour(dayKey, hour)) return []; // before opening and after closing nobody plays
  return ALL_COURTS.filter((c) => (c.type === 'clay' || c.type === 'hard') && isSlotTaken(c.id, dayKey, hour) && !rallyFilters.some((f) => f(c.id, dayKey, hour))).map((c) => c.id).slice(0, n);
}
/** Round 8: other uses of a booked court (life/lessons.js: a lesson, the kids group); (id, dayKey, hour) → true keeps the rally off it. */
export const rallyFilters = [];
