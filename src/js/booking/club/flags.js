import { COURTS, dayKeyForOffset } from '../../shared/availability.js';
import { levelLabel } from '../../shared/club-facts.js';
import { sessionBookings, playedCourts } from '../../shared/session-bookings.js';
import { hourState } from '../hour-state.js';
import { whenOf } from '../flow/invite.js';
import { openGame, isJoined } from './open-play.js';

// "Your court" (round 9, row 23) and the partner flags (row 7), as annotations (round 10): a ring on
// the court, a leader line, a label. Your bookings that ask for a partner and the club's open games
// at the hour on show; a tap on an open game's label opens it in the Club panel.

const MIN_W = 150; // px: court width on screen

export function initFlags(pins, { onOpen }) {
  function refresh() {
    const yours = new Set();
    const flags = new Set();
    for (const id of playedCourts()) {
      const key = `yours:${id}`;
      yours.add(key);
      pins.put(key, { at: { court: id, corner: 'bc', dy: -24 }, tone: 'light', minW: MIN_W, rows: [{ t: 'Your court', cls: 'b' }] });
    }
    const flagged = new Set();
    for (const bk of sessionBookings()) {
      if (!bk.partner || !whenOf(bk.dayKey, bk.hour) || flagged.has(bk.courtId) || (bk.group && bk.group[0] !== bk.courtId)) continue; // a group flies one flag
      flagged.add(bk.courtId);
      const key = `flag:${bk.courtId}`;
      flags.add(key);
      pins.put(key, { at: { court: bk.courtId, corner: 'tl', dx: 24, dy: 24 }, tone: 'clay', minW: MIN_W, rows: [{ t: `Partner wanted · ${levelLabel(bk.partner)}`, cls: 'b' }, { t: whenOf(bk.dayKey, bk.hour), cls: 's' }] });
    }
    const dayKey = hourState.dayKey ?? dayKeyForOffset(0);
    const hour = hourState.hour;
    if (hour !== null && hour !== undefined) {
      for (const c of COURTS) {
        const g = flagged.has(c.id) ? null : openGame(c.id, dayKey, hour);
        if (!g) continue;
        const into = isJoined(g);
        const key = `flag:${c.id}`;
        flags.add(key);
        pins.put(key, {
          at: { court: c.id, corner: 'tl', dx: 24, dy: 24 },
          tone: into ? 'clay' : 'dark',
          minW: MIN_W,
          rows: [{ t: `${into ? 'You are in' : 'Partner wanted'} · ${levelLabel(g.level)}`, cls: 'b' }, { t: into ? 'Open play' : 'Join a game', cls: into ? 's' : 'go' }],
          label: `${c.label}: ${into ? 'you are in an open game' : `open game, ${levelLabel(g.level).toLowerCase()}. Join a game`}`,
          onClick: () => onOpen(g),
        });
      }
    }
    pins.sweep('yours:', yours);
    pins.sweep('flag:', flags);
  }
  ['bp-hour', 'bp-booked', 'bp-booked-again', 'bp-club'].forEach((e) => document.addEventListener(e, refresh));
  refresh();
}
