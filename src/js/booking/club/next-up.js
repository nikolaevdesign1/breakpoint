import { COURTS, isOpenHour, isSlotTaken, isTakenByClub } from '../../shared/availability.js';
import { isTournamentCourt } from '../../shared/tournaments.js';
import { isOwnSlot } from '../../shared/session-bookings.js';
import { fmtHour } from '../../shared/slot-ui.js';
import { hourState } from '../hour-state.js';
import { miamiNow } from '../miami-clock.js';
import { people } from './people.js';

// "Next up" annotations (round 10, the live queue). A court that is busy at the hour on the map gets a
// ring marker, leader line and label in the near corner: who plays there next, or that the court is open to walk on to
// and a tap to book it. While the map follows the clock, the board counts the minutes left in the
// current game. Boards appear once a court is large enough on screen to carry one.

const MIN_W = 150; // px: court width on screen

const minutesLeft = (hour) => Math.max(1, Math.ceil((hour + 1 - miamiNow().hours) * 60));

function lineFor(court, dayKey, next) {
  if (!isOpenHour(dayKey, next)) return { who: 'Last game of the day', free: false };
  if (isOwnSlot(court.id, dayKey, next)) return { who: 'You', free: false, mine: true };
  if (isTakenByClub(court.id, dayKey, next)) {
    const n = people(`${court.id}|${dayKey}|${next}`, 2).map((p) => p.last);
    return { who: court.type === 'padel' ? `${n[0]} + 3` : `${n[0]} / ${n[1]}`, free: false };
  }
  return { who: 'Open, walk on', free: true };
}

export function initNextUp(pins) {
  function refresh() {
    const { dayKey, hour, live, offset } = hourState;
    const keep = new Set();
    if (dayKey && isOpenHour(dayKey, hour)) {
      for (const c of COURTS) {
        if (isTournamentCourt(c.id, dayKey) || !isSlotTaken(c.id, dayKey, hour)) continue;
        const next = hour + 1;
        const { who, free, mine } = lineFor(c, dayKey, next);
        const left = live && !miamiNow().pinned ? `ends in ${minutesLeft(hour)} min` : '';
        const key = `next:${c.id}`;
        keep.add(key);
        pins.put(key, {
          at: { court: c.id, corner: 'br', dx: -24, dy: -24 },
          tone: free ? 'light' : 'dark',
          rows: [
            { t: `Next up${isOpenHour(dayKey, next) ? ` · ${fmtHour(next)}` : ''}`, cls: 'k' },
            { t: who, cls: mine ? 'b is-mine' : 'b' },
            ...(free ? [{ t: `Book ${fmtHour(next)}`, cls: 'go' }] : left ? [{ t: left, cls: 's' }] : []),
          ],
          minW: MIN_W,
          label: free ? `${c.label}: open from ${fmtHour(next)}. Book it` : `${c.label}: next up ${who}`,
          onClick: free ? () => document.dispatchEvent(new CustomEvent('bp-open-court', { detail: { courtId: c.id, offset, hour: next } })) : null,
        });
      }
    }
    pins.sweep('next:', keep);
  }
  ['bp-hour', 'bp-booked', 'bp-booked-again', 'bp-hud'].forEach((e) => document.addEventListener(e, refresh));
  setInterval(refresh, 30000); // the minutes left count down
  refresh();
  return { refresh };
}
