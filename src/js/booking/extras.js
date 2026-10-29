import { HOURS, isSlotTaken, dayKeyForOffset } from '../shared/availability.js';
import { isPast, dateFor } from '../shared/slot-ui.js';
import { rateFor, ADDONS, PLAN, racketPrice, LEVELS as CLUB_LEVELS, levelLabel } from '../shared/club-facts.js';

// "Your game" step (row 84): length of the booking, players and what to bring to court.
// Prices live here so the step, the total and the ticket all read one table.

export const PRICES = { balls: ADDONS.balls, machine: ADDONS.machine, basket: ADDONS.basket };
export const KIT_OFF = ADDONS.kitOff; // round 10 (club/kit.js): two rackets and new balls together take $4 off
export const DURATIONS = [60, 90, 120];

// Promo codes (row 134): the club cat's code takes 10% off the whole booking. Case and spaces don't matter.
export const CAT_CODE = 'catch10';
const PROMOS = { [CAT_CODE]: 0.1 };
export const promoRate = (code) => PROMOS[String(code ?? '').trim().toLowerCase()] ?? 0;

// Members save on extra court hours by plan (club-facts.js, as on the memberships page); guests pay the rate.
// Levels for "Need a partner" (row 7) are stored as numbers and shown as words.
export const memberOff = (plan) => PLAN[plan]?.courtOff ?? 0;
export const LEVELS = CLUB_LEVELS.map((l) => l.id);
export { levelLabel, racketPrice };

export function defaultGame(court) {
  return { minutes: 60, players: court.type === 'padel' ? 4 : 2, balls: 'own', rackets: 0, basket: false, coach: false, machine: false, towels: true, partner: null };
}

/** Length choices: the usual three, plus a longer span picked by dragging over the hours (row 21). */
export const durationsFor = (minutes) => (DURATIONS.includes(minutes) ? DURATIONS : [...DURATIONS, minutes].sort((a, b) => a - b));

export const playerChoices = (court) => (court.type === 'padel' ? [2, 4] : [1, 2, 3, 4]);

/** A booking of `minutes` from `hour` needs every hour it touches free and inside opening hours. */
export function fits({ court, offset, hour }, minutes, isBooked = () => false) {
  const hours = Math.ceil(minutes / 60);
  const dayKey = dayKeyForOffset(offset);
  for (let h = hour; h < hour + hours; h++) {
    if (!HOURS.includes(h) || isPast(offset, h) || isSlotTaken(court.id, dayKey, h) || isBooked(h)) return false;
  }
  return true;
}

/**
 * Line items and total for a slot and a game, less a promo code if there is one (rounded to whole dollars).
 * Round 9: `courts` books the courts next door too (row 24); `member` is a plan whose members take its discount off court time.
 * `full` is what it would cost without either discount (the struck-through price).
 */
export function priceOf({ court, offset, hour }, game, promo = null, { courts = 1, member = null } = {}) {
  const hours = game.minutes / 60;
  const rate = rateFor(court.type, dateFor(offset), hour);
  const courtV = Math.round(rate * hours * courts);
  const items = [{ k: courts > 1 ? `Courts × ${courts} · ${game.minutes} min` : `Court · ${game.minutes} min`, v: courtV }];
  const off = memberOff(member);
  if (off) items.push({ k: `${PLAN[member].name} plan, −${Math.round(off * 100)}%`, v: -Math.round(courtV * off) });
  if (game.balls === 'new') items.push({ k: 'New balls', v: PRICES.balls });
  const racket = racketPrice(court.type);
  if (game.rackets && racket) items.push({ k: `Rackets × ${game.rackets}`, v: racket * game.rackets });
  if (game.basket) items.push({ k: 'Ball basket', v: PRICES.basket });
  if (racket && game.rackets >= 2 && game.balls === 'new') items.push({ k: `Starter kit, −$${KIT_OFF}`, v: -KIT_OFF });
  if (game.machine) items.push({ k: 'Ball machine', v: PRICES.machine });
  const subtotal = items.reduce((a, i) => a + i.v, 0);
  const promoOff = promoRate(promo);
  const discount = Math.round(subtotal * promoOff);
  const full = items.reduce((a, i) => a + Math.max(0, i.v), 0);
  return { items, subtotal, off: promoOff, discount, total: subtotal - discount, full };
}

/** Short human summary for the ticket. */
export function describeGame(game) {
  const out = [`${game.players} ${game.players === 1 ? 'player' : 'players'}`];
  out.push(game.balls === 'new' ? 'new balls' : 'own balls');
  if (game.rackets) out.push(`${game.rackets} ${game.rackets === 1 ? 'racket' : 'rackets'}`);
  if (game.basket) out.push('ball basket');
  if (game.coach) out.push('coach (billed by the coach)');
  if (game.machine) out.push('ball machine');
  if (game.towels) out.push('towels & water');
  if (game.partner) out.push(`looking for a ${levelLabel(game.partner).toLowerCase()} partner`);
  return out.join(', ');
}
