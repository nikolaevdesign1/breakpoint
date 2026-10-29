import { rallyFilters } from './rallies.js';
import { lessonsAt } from '../interact/coach-hover.js';
import { COURTS, isOpenHour, kidsCourtOn } from '../../shared/availability.js';
import { KIDS_HOUR } from '../../shared/academy.js';
import { isTournamentCourt } from '../../shared/tournaments.js';

// Which courts host a coaching lesson or the kids group at a day and hour. Small and in the first
// load on purpose: the rallies (and the floodlights that follow them) have to keep off these courts
// from the first frame, while the lesson and kids systems themselves load later (row 48).

export const MAX_LESSONS = 4; // lessons drawn at once
export const forcedLessons = new Set(); // dev: lessons on these courts whatever the schedule says
export const kidsForced = { court: null }; // dev: the kids group on this court

/** The kids' court at the map's day and hour, or null. */
export function kidsCourtAt(dayKey, hour) {
  return kidsForced.court ?? (hour === KIDS_HOUR ? kidsCourtOn(dayKey) : null);
}

/** Clay and hard courts with a lesson at a day and hour (no more than MAX_LESSONS). */
export function lessonCourtsAt(dayKey, hour) {
  if (!isOpenHour(dayKey, hour)) return [...forcedLessons];
  const ids = Object.keys(lessonsAt(dayKey, hour)).filter((id) => {
    const c = COURTS.find((x) => x.id === id);
    return (c.type === 'clay' || c.type === 'hard') && !(hour === KIDS_HOUR && id === kidsCourtOn(dayKey)) && !isTournamentCourt(id, dayKey);
  });
  return [...new Set([...forcedLessons, ...ids])].slice(0, MAX_LESSONS);
}

// No rally where a lesson or the kids group is on.
rallyFilters.push((id, dayKey, hour) => lessonCourtsAt(dayKey, hour).includes(id));
rallyFilters.push((id, dayKey, hour) => id === kidsCourtAt(dayKey, hour));
