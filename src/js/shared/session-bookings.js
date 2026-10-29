// Bookings made on this visit (round 7, "your booking on the map"). They live in sessionStorage, so the
// map, the dock and the home widget agree that the slot is taken until the tab is closed. Every access
// is wrapped: private mode or blocked storage simply means nothing is remembered.

const KEY = 'bp-bookings';

function read() {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let cache = null;
const all = () => (cache ??= read());

/** { courtId, dayKey, hour, minutes, first, member?, partner?, group? } in the order they were made. */
export const sessionBookings = () => all().slice();

/** Every hour a booking touches, e.g. 90 minutes from 18:00 holds 18:00 and 19:00. */
export function isOwnSlot(courtId, dayKey, hour) {
  return all().some((b) => b.courtId === courtId && b.dayKey === dayKey && hour >= b.hour && hour < b.hour + Math.ceil((b.minutes || 60) / 60));
}

export function addSessionBooking(booking) {
  const list = all();
  list.push(booking);
  try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* not persisted, still held for this page */ }
  rememberPlayed(booking.courtId);
  return booking;
}

// Round 9 (row 23): courts this visitor has booked, kept across visits in localStorage, so the map
// can mark "Your court" and the dock can filter by "Played before".
const PLAYED = 'bp-played';
function readPlayed() {
  try { const l = JSON.parse(localStorage.getItem(PLAYED) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
function rememberPlayed(id) {
  const l = readPlayed();
  if (l.includes(id)) return;
  l.push(id);
  try { localStorage.setItem(PLAYED, JSON.stringify(l)); } catch { /* this visit only */ }
}
/** Court ids played (booked) before: earlier visits plus this one. */
export const playedCourts = () => new Set([...readPlayed(), ...all().map((b) => b.courtId)]);

/** The latest booking on each court (the sign on the map shows that one). */
export function latestByCourt() {
  const out = new Map();
  for (const b of all()) out.set(b.courtId, b);
  return out;
}
