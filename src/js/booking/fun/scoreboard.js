import '../../../css/booking-mapfun.css';
import { SHOW_COURT } from '../../shared/tournaments.js';
import { addPoint, pointText } from '../life/tournament.js';
import { hourState } from '../hour-state.js';
import { rng } from '../life/shared.js';
import { courtPick } from './court-pick.js';

// Round 9 (row 13): hovering a court with a rally on it shows the score of that match in a small
// board pinned inside the court's top-left corner (the coach tag takes the top-right). The score
// is kept the tournament's way (life/tournament.js addPoint / pointText): every point the rally on
// the map plays goes on the board. A court picks up mid-match (seeded by court, day and hour, so
// it reads the same on a revisit); after match point a new pair starts. The show court on a
// tournament day has its own big board by the stands and is left to it.

const NAMES = ['Alvarez', 'Brooks', 'Castillo', 'Dorsey', 'Estrada', 'Fischer', 'Gallo', 'Herrera', 'Ibarra', 'Jansen', 'Kowal', 'Lopez', 'Mendes', 'Nakamura', 'Ortiz', 'Price', 'Quinn', 'Rossi', 'Santos', 'Torres', 'Vega', 'Walsh'];
const NEXT_MATCH = 8; // s after match point

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A match already under way: one set played or not, a few games into the next, some points in. */
function midMatch(id, doubles) {
  const r = rng(seedOf(`${id}|${hourState.dayKey}|${hourState.hour}`));
  const pick = () => NAMES[Math.floor(r() * NAMES.length)];
  const used = new Set();
  const name = () => { let n = pick(); while (used.has(n)) n = pick(); used.add(n); return n; };
  const names = [0, 1].map(() => (doubles ? `${name()} / ${name()}` : name()));
  const sets = [];
  const won = [0, 0];
  if (r() < 0.55) {
    const w = r() < 0.5 ? 0 : 1;
    const set = [0, 0];
    set[w] = 6;
    set[1 - w] = Math.floor(r() * 5);
    sets.push(set);
    won[w] = 1;
  }
  sets.push([Math.floor(r() * 5), Math.floor(r() * 5)]);
  return { names, sets, won, points: [Math.floor(r() * 4), Math.floor(r() * 4)], over: false };
}

export function createScoreboard(ctx, { players, padel, tournament }) {
  const { rig } = ctx;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pick = courtPick(ctx);
  if (!pick.all().length) return null;

  // --- The board ---
  const el = document.createElement('aside');
  el.className = 'rally-board';
  el.hidden = true;
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<p class="rally-board__k"><span data-court></span><em data-set></em></p><ul class="rally-board__rows"><li class="rally-board__row"></li><li class="rally-board__row"></li></ul>';
  document.body.append(el);
  const ui = { court: el.querySelector('[data-court]'), set: el.querySelector('[data-set]'), rows: [...el.querySelectorAll('.rally-board__row')] };

  // --- Scores, one per court with a rally ---
  const matches = new Map(); // id -> { game, seen, s, restartAt, doubles }
  function live(id) {
    if (tournament?.debug?.()?.playing && id === SHOW_COURT) return null; // the stands' board has it
    const tennis = players?.game?.(id);
    const pad = !tennis ? padel?.game?.(id) : null;
    const game = tennis ?? pad;
    if (!game || (tennis && game.ended)) return null;
    let m = matches.get(id);
    if (!m || m.game !== game) {
      m = { game, doubles: !!pad, seen: pad ? game.points : (game.played ?? 0), s: midMatch(id, !!pad), restartAt: 0 };
      matches.set(id, m);
    }
    return m;
  }

  /** New points since the last look go on the board. */
  function follow(m) {
    const now = performance.now() / 1000;
    if (m.s.over) {
      if (now > m.restartAt) { m.s = midMatch(`${m.game.court?.id ?? m.game.id}|${Math.floor(now)}`, m.doubles); m.s.sets = [[0, 0]]; m.s.won = [0, 0]; m.s.points = [0, 0]; }
      return false;
    }
    const count = m.doubles ? m.game.points : (m.game.played ?? 0);
    if (count === m.seen) return false;
    const n = Math.min(4, count - m.seen);
    m.seen = count;
    for (let i = 0; i < n && !m.s.over; i++) {
      // The near player (or pair) wins it? The tennis rally knows; padel: a fair coin.
      const near = !m.doubles && m.game.winner ? m.game.winner === m.game.players[0] : Math.random() < 0.5;
      addPoint(m.s, near ? 0 : 1);
    }
    if (m.s.over) m.restartAt = now + NEXT_MATCH;
    return true;
  }

  let shownFor = null;
  let lastText = '';
  function render(court, m, bump) {
    const s = m.s;
    ui.court.textContent = court.label;
    ui.set.textContent = s.over ? `${s.names[s.winner].split(' / ')[0]} wins` : `Set ${s.sets.length}`;
    const text = JSON.stringify([s.sets, s.points, s.over]);
    ui.rows.forEach((row, i) => {
      const sets = s.sets.map((set, k) => `<span class="rally-board__set${k === s.sets.length - 1 && !s.over ? ' is-now' : ''}">${set[i]}</span>`).join('');
      row.innerHTML = `<span class="rally-board__name"></span>${sets}<span class="rally-board__pts${bump && text !== lastText ? ' is-bump' : ''}">${pointText(s, i)}</span>`;
      row.firstChild.textContent = s.names[i];
    });
    lastText = text;
  }

  function place(box) {
    const pts = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.min.x, box.max.z], [box.max.x, box.max.z]].map(([x, z]) => rig.screenOf(x, z));
    const left0 = Math.min(...pts.map((p) => p.x));
    const top0 = Math.min(...pts.map((p) => p.y));
    const w = el.offsetWidth || 208;
    const h = el.offsetHeight || 96;
    const left = Math.max(12, Math.min(left0 + 16, innerWidth - w - 12));
    const top = Math.max(62, Math.min(top0 + 16, innerHeight - h - 120));
    el.style.translate = `${Math.round(left / 2) * 2}px ${Math.round(top / 2) * 2}px`;
  }

  function show(hit) {
    const { court, box } = hit;
    const m = live(court.id);
    if (!m) { hide(); return; }
    follow(m);
    if (shownFor !== court.id) {
      shownFor = court.id;
      render(court, m, false);
      el.hidden = false;
      el.classList.remove('is-in');
      place(box);
      void el.offsetWidth; // restart the spring
      el.classList.add('is-in');
    }
  }
  function hide() {
    if (!shownFor) return;
    shownFor = null;
    el.classList.remove('is-in');
    setTimeout(() => { if (!shownFor) el.hidden = true; }, 240);
  }

  // --- Hover ---
  let hovered = null; // { court, box }
  let blocked = false;
  pick.on((hit) => {
    hovered = fine && !blocked ? hit : null;
    if (hovered) show(hovered); else hide();
  });
  const block = (e) => { blocked = !!e.detail?.open; if (blocked) { hovered = null; hide(); } };
  document.addEventListener('bp-hud', block);
  document.addEventListener('bp-postcard', block);

  return {
    name: 'scoreboard',
    tick() {
      if (!shownFor || !hovered) return false;
      const m = live(shownFor);
      if (!m) { hide(); return false; }
      if (follow(m)) render(hovered.court, m, true);
      place(hovered.box); // the drone may glide on
      return false;
    },
    debug: () => ({ shown: shownFor, matches: [...matches].map(([id, m]) => `${id} ${m.s.sets.map((s) => s.join('-')).join(' ')} · ${m.s.points.join('-')}`) }),
    /** Dev: show the board for a court as if hovered. */
    peek(id) {
      hovered = pick.byId(id);
      if (hovered) show(hovered);
      return shownFor === id;
    },
  };
}
