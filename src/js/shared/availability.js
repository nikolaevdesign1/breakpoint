import { isOwnSlot } from './session-bookings.js';
import { isTournamentCourt } from './tournaments.js';
import { KIDS_HOUR, kidsCourt } from './academy.js';
import { ALL_START_HOURS, startHoursOn } from './club-facts.js';

// Court list and mock availability shared by the 3D booking page and the home widget.
// Slots are deterministic per court/day/hour so both pages agree on what is taken.

// Every court has its own name (row 76): Florida flowers and fruit for clay, Miami neighbourhoods
// for hard, bay wildlife for padel, trees for grass. Ids stay as they were (deep links use them).
export const COURTS = [
  { id: 'clay-1', type: 'clay', label: 'Flamingo', x: -19, z: -19.5 },
  { id: 'clay-2', type: 'clay', label: 'Hibiscus', x: 0, z: -19.5 },
  { id: 'clay-3', type: 'clay', label: 'Mango', x: 19, z: -19.5 },
  { id: 'clay-4', type: 'clay', label: 'Guava', x: -19, z: 19.5 },
  { id: 'clay-5', type: 'clay', label: 'Papaya', x: 0, z: 19.5 },
  { id: 'clay-6', type: 'clay', label: 'Orchid', x: 19, z: 19.5 },
  { id: 'hard-1', type: 'hard', label: 'Brickell', x: 38, z: -19.5 },
  { id: 'hard-2', type: 'hard', label: 'Wynwood', x: 57, z: -19.5 },
  { id: 'hard-3', type: 'hard', label: 'Biscayne', x: 38, z: 19.5 },
  { id: 'hard-4', type: 'hard', label: 'Coconut Grove', x: 57, z: 19.5 },
  { id: 'padel-1', type: 'padel', label: 'Pelican', x: 4, z: -66 },
  { id: 'padel-2', type: 'padel', label: 'Manatee', x: 38, z: -66 },
  { id: 'padel-3', type: 'padel', label: 'Heron', x: 4, z: -46 },
  { id: 'padel-4', type: 'padel', label: 'Ibis', x: 38, z: -46 },
  { id: 'grass-1', type: 'grass', label: 'Banyan', x: 88, z: 8.81 },
  { id: 'grass-2', type: 'grass', label: 'Royal Palm', x: 88, z: -8.81 },
];

// Every hour a booking can start at on some day (club-facts.js). A day uses the part inside its own
// opening hours (weekdays 6 AM to 11 PM, weekends 7 AM to 10 PM); the rest of the day reads as taken.
export const HOURS = ALL_START_HOURS;
const byDay = new Map();
/** Start hours of a day (a 'YYYY-MM-DD' key). */
export function hoursOn(dayKey) {
  if (!byDay.has(dayKey)) byDay.set(dayKey, startHoursOn(new Date(`${dayKey}T12:00:00`).getDay()));
  return byDay.get(dayKey);
}
export const isOpenHour = (dayKey, hour) => hoursOn(dayKey).includes(hour);

function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Booked by other members (the mock schedule), not counting this visitor's own bookings. */
export function isTakenByClub(courtId, dayKey, hour) {
  if (!isOpenHour(dayKey, hour)) return true; // closed
  if (isTournamentCourt(courtId, dayKey)) return true; // round 7: a tournament has the show court all day
  if (hour === KIDS_HOUR && courtId === kidsCourtOn(dayKey)) return true; // round 8: the kids group (shared/academy.js)
  return hashStr(`${courtId}-${dayKey}-${hour}`)() <= 0.32;
}

/** Round 8: the academy's kids court that day, picked among the courts the schedule leaves free at 16:00. */
export const kidsCourtOn = (dayKey) => kidsCourt(dayKey, (id) => !isTournamentCourt(id, dayKey) && hashStr(`${id}-${dayKey}-${KIDS_HOUR}`)() > 0.32);

/** Taken for anyone looking: by the club schedule or by a booking made on this visit (session-bookings.js). */
export function isSlotTaken(courtId, dayKey, hour) {
  return isTakenByClub(courtId, dayKey, hour) || isOwnSlot(courtId, dayKey, hour);
}

export function dayKeyForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// First free court slot from now on, scanning up to a week ahead.
export function nextFreeSlot(type = null, now = new Date()) {
  const courts = type ? COURTS.filter((c) => c.type === type) : COURTS;
  for (let offset = 0; offset < 7; offset++) {
    const dayKey = dayKeyForOffset(offset);
    for (const hour of HOURS) {
      if (offset === 0 && hour <= now.getHours()) continue;
      const court = courts.find((c) => !isSlotTaken(c.id, dayKey, hour));
      if (court) return { court, offset, hour };
    }
  }
  return null;
}

// Deep links into the 3D booking page: /booking.html?court=clay-3&day=0&hour=18
export function bookingUrl({ courtId, offset, hour }) {
  return `/booking.html?court=${encodeURIComponent(courtId)}&day=${offset}&hour=${hour}`;
}

export function readBookingParams(search = window.location.search) {
  const q = new URLSearchParams(search);
  const court = COURTS.find((c) => c.id === q.get('court'));
  if (!court) return null;
  const offset = Math.min(6, Math.max(0, parseInt(q.get('day'), 10) || 0));
  const hour = HOURS.includes(+q.get('hour')) ? +q.get('hour') : null;
  return { courtId: court.id, offset, hour };
}
