import { COURTS, HOURS, dayKeyForOffset } from '../../shared/availability.js';
import { fmtHour, weekday, DAYS_AHEAD } from '../../shared/slot-ui.js';

// Invite a friend (round 9, row 6). After a booking the panel offers a link for the second player:
// /booking.html?invite=clay-2&date=2026-10-22&hour=18&from=Alex. No backend: everything the friend's
// map needs is in the link. Opening it flies to that court, a board there reads
// "Alex is waiting for you · 18:00" and the walk from the car park is drawn (flow/marks.js).

export function inviteUrl({ courtId, dayKey, hour, first }) {
  const q = new URLSearchParams({ invite: courtId, date: dayKey, hour: String(hour) });
  if (first) q.set('from', first);
  return `${location.origin}/booking.html?${q}`;
}

/** The invite in this page's URL, or null. The name is cut to letters, 16 at most. */
export function readInvite(search = location.search) {
  const q = new URLSearchParams(search);
  const court = COURTS.find((c) => c.id === q.get('invite'));
  const hour = Number(q.get('hour'));
  const dayKey = q.get('date');
  if (!court || !HOURS.includes(hour) || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey ?? '')) return null;
  const first = (q.get('from') ?? '').replace(/[^\p{L}' -]/gu, '').trim().slice(0, 16);
  return { courtId: court.id, dayKey, hour, first, invite: true };
}

/** "18:00" today, "Tomorrow 18:00" / "Fri 18:00" later in the week, null when outside the week. */
export function whenOf(dayKey, hour) {
  for (let i = 0; i < DAYS_AHEAD; i++) {
    if (dayKeyForOffset(i) === dayKey) return i === 0 ? fmtHour(hour) : `${i === 1 ? 'Tomorrow' : weekday(i)} ${fmtHour(hour)}`;
  }
  return null;
}

export const inviteText = (inv) => `${inv.first || 'Your partner'} is waiting for you · ${whenOf(inv.dayKey, inv.hour) ?? fmtHour(inv.hour)}`;

// The page says when the invited court is on screen (after the loader); the sign and the walk wait for it.
let shown = false;
const waiting = [];
export function markInviteShown() {
  if (shown) return;
  shown = true;
  waiting.splice(0).forEach((fn) => fn());
}
export function onInviteShown(fn) {
  if (shown) fn();
  else waiting.push(fn);
}
