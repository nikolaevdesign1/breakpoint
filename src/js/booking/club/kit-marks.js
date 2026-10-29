import { sessionBookings } from '../../shared/session-bookings.js';
import { hourState } from '../hour-state.js';
import { kitItems } from './kit.js';

// Ball kit on the court (round 10). A booking that asked for rackets, balls, a basket or the ball
// machine gets an annotation by its court at the hours of the game: "Ready on court" with what waits there.

const MIN_W = 120; // px: court width on screen

export function initKitMarks(pins) {
  function refresh() {
    const { dayKey, hour } = hourState;
    const keep = new Set();
    if (dayKey && hour !== null) {
      for (const b of sessionBookings()) {
        if (!b.kit || b.dayKey !== dayKey || hour < b.hour || hour >= b.hour + Math.ceil((b.minutes || 60) / 60) || !kitItems(b.kit).length) continue;
        const key = `kit:${b.courtId}`;
        keep.add(key);
        pins.put(key, {
          at: { court: b.courtId, corner: 'bl', dx: 24, dy: -24 },
          tone: 'light',
          rows: [{ t: 'Ready on court', cls: 'k' }, ...kitItems(b.kit).map(([, t]) => ({ t, cls: 'b' }))],
          minW: MIN_W,
        });
      }
    }
    pins.sweep('kit:', keep);
  }
  ['bp-hour', 'bp-booked', 'bp-booked-again', 'bp-hud'].forEach((e) => document.addEventListener(e, refresh));
  refresh();
}
