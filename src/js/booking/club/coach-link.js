import { HOURS } from '../../shared/availability.js';
import { DAYS_AHEAD } from '../../shared/slot-ui.js';
import { COACHES } from '../../site/coaches-data.js';

// A coach's card on the site (coaches-profile.js) links to /booking.html?coach=<slug>&slot=2026-10-30T17:30.
// `slot` is a local date and time; the lesson runs on whole hours, so 17:30 means 17:00. Dates
// outside the week the map shows, or before today, fall back to today and the nearest open hour.

/** { slug, offset, hour } from the page's URL, or null without a known coach. */
export function readCoachLink(search = location.search) {
  const q = new URLSearchParams(search);
  const coach = COACHES.find((c) => c.slug === q.get('coach'));
  if (!coach) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{1,2}):(\d{2}))?/.exec(q.get('slot') ?? '');
  let offset = 0;
  let hour = null; // no time in the link: the first open hour
  if (m) {
    const now = new Date();
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    offset = Math.min(DAYS_AHEAD - 1, Math.max(0, Math.round((day - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5)));
    if (m[4] !== undefined) hour = Math.min(HOURS.at(-1), Math.max(HOURS[0], +m[4]));
  }
  return { slug: coach.slug, offset, hour };
}
