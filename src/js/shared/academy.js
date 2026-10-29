import { SHOW_COURT, tournamentOn } from './tournaments.js';

// The junior academy's kids group (round 8): every day from 16:00 to 17:00 on one clay or hard
// court, the same court all day long but not the same every day. The court is one the member
// schedule leaves free at that hour; availability.js then counts it as taken, so the map shows it
// busy and nobody can book over the kids. The booking map draws the group (booking/life/kids.js).

export const KIDS_HOUR = 16;
const COURTS = ['clay-5', 'clay-6', 'clay-2', 'clay-3', 'hard-3', 'clay-1', 'hard-4', 'hard-1', 'clay-4', 'hard-2'];

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const cache = new Map();

/**
 * The kids' court on `dayKey`: the first court, in an order turned by the day, that `free(courtId)`
 * says is open at 16:00 (and isn't the show court on a tournament day); the turned first otherwise.
 */
export function kidsCourt(dayKey, free = () => true) {
  if (!dayKey) return null;
  if (cache.has(dayKey)) return cache.get(dayKey);
  const turn = seedOf(dayKey) % COURTS.length;
  const order = [...COURTS.slice(turn), ...COURTS.slice(0, turn)].filter((id) => !(id === SHOW_COURT && tournamentOn(dayKey)));
  const id = order.find((c) => free(c)) ?? order[0];
  cache.set(dayKey, id);
  return id;
}
