import { COURTS, HOURS, isOpenHour, isTakenByClub, dayKeyForOffset } from '../../shared/availability.js';
import { isTournamentCourt } from '../../shared/tournaments.js';
import { isOwnSlot } from '../../shared/session-bookings.js';
import { LEVELS } from '../extras.js';
import { miamiNow } from '../miami-clock.js';
import { club, save, gameKey } from './store.js';
import { people, seedOf } from './people.js';

// Open play (round 10, "Join a game"). Some of the club's own bookings are looking for players:
// they fly a partner flag on the map (flow/marks.js) and are listed in the Club panel. Which ones is
// decided by the same seed the flags always used, so a flag and its row are one game.

export const ODDS = 0.22; // share of club bookings that look for players
export const FEE = { tennis: 12, padel: 14 }; // USD, drop-in, paid at the desk

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** The open game on a court at a day and hour: { level, host: [first names], spots, fee } or null. */
export function openGame(courtId, dayKey, hour) {
  if (!isOpenHour(dayKey, hour) || isTournamentCourt(courtId, dayKey) || !isTakenByClub(courtId, dayKey, hour) || isOwnSlot(courtId, dayKey, hour)) return null;
  const r = hash(`${courtId}|${dayKey}|${hour}`);
  if (r > ODDS) return null;
  const court = COURTS.find((c) => c.id === courtId);
  const padel = court.type === 'padel';
  const total = padel || seedOf(`${courtId}${dayKey}${hour}`) % 2 ? 4 : 2; // padel is doubles; tennis is singles or doubles
  const have = padel ? 3 : total === 2 ? 1 : 2;
  return {
    courtId, dayKey, hour, total,
    level: LEVELS[Math.floor((r / ODDS) * LEVELS.length)],
    host: people(`${courtId}|${dayKey}|${hour}`, have).map((p) => p.first),
    spots: total - have,
    fee: padel ? FEE.padel : FEE.tennis,
  };
}

export const isJoined = (g) => club().joined.some((j) => gameKey(j) === gameKey(g));
/** A game more than half an hour in (or over) can no longer be joined. */
export const isPastGame = (g) => g.dayKey === dayKeyForOffset(0) && g.hour + 0.5 <= miamiNow().hours;

/** Every open game of a day, in time order. */
export function openGames(dayKey) {
  const out = [];
  for (const hour of HOURS) {
    for (const c of COURTS) {
      const g = openGame(c.id, dayKey, hour);
      if (g) out.push(g);
    }
  }
  return out;
}

export function join(g) {
  if (isJoined(g) || isPastGame(g)) return;
  save({ joined: [...club().joined, { courtId: g.courtId, dayKey: g.dayKey, hour: g.hour, level: g.level, with: g.host }] });
  document.dispatchEvent(new CustomEvent('bp-joined', { detail: { courtId: g.courtId, dayKey: g.dayKey, hour: g.hour } }));
}

export function leave(g) {
  save({ joined: club().joined.filter((j) => gameKey(j) !== gameKey(g)) });
}
