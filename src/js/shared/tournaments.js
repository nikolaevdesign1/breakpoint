import { EVENTS } from '../site/tournaments-data.js';

// Tournament days on the booking map (round 7). The calendar is the one the tournaments page draws
// (site/tournaments-data.js); events played on red clay take over the show court for their days:
// stands with a crowd, flags on the fences and a scoreboard (booking/life/tournament.js), and the
// court can't be booked.

/** Guava: the strip of lawn on its west side has room for temporary stands. */
export const SHOW_COURT = 'clay-4';

// Days keyed like availability.js (`YYYY-MM-DD`).
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CLAY = EVENTS.filter((e) => /clay/i.test(e.surface));
const BY_DAY = new Map();
for (const e of CLAY) {
  for (const d = new Date(e.start); d <= e.end; d.setDate(d.getDate() + 1)) BY_DAY.set(keyOf(d), e);
}

/** The clay event on a day key, or null. */
export const tournamentOn = (dayKey) => BY_DAY.get(dayKey) ?? null;

/** The clay event on the day `offset` days from today (local calendar), or null. */
export function tournamentOnOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return tournamentOn(keyOf(d));
}

/** Is `courtId` given over to a tournament that day? */
export const isTournamentCourt = (courtId, dayKey) => courtId === SHOW_COURT && BY_DAY.has(dayKey);

/** The next clay event that hasn't finished (for previews), else the first one. */
export function nextClayEvent(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return CLAY.find((e) => e.end >= today) ?? CLAY[0];
}
