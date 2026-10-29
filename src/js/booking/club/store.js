// What the visitor does at the club (round 10): open games joined, extras on "Your day", reported
// matches. No backend: it lives in localStorage and survives reloads. Every access is wrapped, so
// private mode just means nothing is remembered. `bp-club` goes out on every change.

const KEY = 'bp-club';
let cache = null;

function read() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}

/** { joined: [{ courtId, dayKey, hour, level, with }], day: [{ id, kind, dayKey, hour, ... }], reports: [...] } */
export const club = () => (cache ??= { joined: [], day: [], reports: [], ...read() });

export function save(patch) {
  Object.assign(club(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(club())); } catch { /* this visit only */ }
  document.dispatchEvent(new CustomEvent('bp-club'));
}

export const gameKey = (g) => `${g.courtId}|${g.dayKey}|${g.hour}`;
