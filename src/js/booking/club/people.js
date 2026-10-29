import { rng } from '../life/shared.js';

// Made-up members for the open games, the boards and the ladder. Stable: the same seed gives the
// same people on every visit.

const FIRST = ['Marta', 'Leo', 'Omar', 'Nina', 'Chris', 'Elena', 'Ravi', 'Julia', 'Tomas', 'Ana', 'Dmitri', 'Sam', 'Lucia', 'Ben', 'Keiko', 'Marcus'];
const LAST = ['Alvarez', 'Brooks', 'Castillo', 'Dorsey', 'Estrada', 'Fischer', 'Gallo', 'Herrera', 'Ibarra', 'Jansen', 'Kowal', 'Lopez', 'Mendes', 'Nakamura', 'Ortiz', 'Price', 'Quinn', 'Rossi', 'Santos', 'Torres', 'Vega', 'Walsh'];

export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** `n` different people for a seed, as { first, last }. */
export function people(seed, n) {
  const r = rng(seedOf(seed));
  const out = [];
  const used = new Set();
  while (out.length < n) {
    const p = { first: FIRST[Math.floor(r() * FIRST.length)], last: LAST[Math.floor(r() * LAST.length)] };
    if (used.has(p.last) || used.has(p.first)) continue;
    used.add(p.last);
    used.add(p.first);
    out.push(p);
  }
  return out;
}

export const joinNames = (list) => (list.length < 2 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

/** The club ladder before you play: name, points, wins and losses this season. */
export const LADDER = [
  { name: 'Elena Park', pts: 312, w: 18, l: 4 },
  { name: 'Marcus Hale', pts: 286, w: 16, l: 6 },
  { name: 'Ravi Menon', pts: 251, w: 14, l: 7 },
  { name: 'Lucia Ferrer', pts: 224, w: 12, l: 7 },
  { name: 'Tomas Berg', pts: 196, w: 11, l: 9 },
  { name: 'Keiko Mori', pts: 168, w: 9, l: 9 },
  { name: 'Sam Doyle', pts: 141, w: 7, l: 10 },
  { name: 'Nina Roy', pts: 118, w: 6, l: 11 },
  { name: 'Omar Haddad', pts: 92, w: 4, l: 12 },
];
