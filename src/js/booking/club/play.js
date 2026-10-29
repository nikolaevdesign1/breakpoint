import { COURTS, dayKeyForOffset } from '../../shared/availability.js';
import { levelLabel } from '../../shared/club-facts.js';
import { fmtHour, dayName } from '../../shared/slot-ui.js';
import { hourState } from '../hour-state.js';
import { frameCourts } from '../scene.js';
import { openGames, isJoined, isPastGame, join, leave } from './open-play.js';
import { joinNames } from './people.js';
import { gameKey, club } from './store.js';

// Club panel, "Open play" (round 10, "Join a game"): the games on the map that are looking for
// players, for the day on the dock. One tap joins; you appear on the court as a small "You" plate.

const SURFACE = { clay: 'Red clay', hard: 'Hard, indoor', padel: 'Padel, covered', grass: 'Grass' };

export function renderPlay(box, ctx) {
  const dayKey = hourState.dayKey ?? dayKeyForOffset(0);
  const day = dayName(hourState.offset ?? 0).toLowerCase();
  const list = openGames(dayKey).filter((g) => !isPastGame(g) || isJoined(g));
  const head = document.createElement('p');
  head.className = 'cl-lead';
  head.textContent = list.length
    ? `Players are looking for a game ${day}. Join one and you are on court, no booking needed. The drop-in fee is paid at the desk.`
    : `No open games left ${day}. Book a court and ask for a partner, and your flag goes up on the map.`;
  const ul = document.createElement('ul');
  ul.className = 'cl-list';
  list.forEach((g, i) => {
    const court = COURTS.find((c) => c.id === g.courtId);
    const into = isJoined(g);
    const need = into ? g.spots - 1 : g.spots;
    const who = into
      ? `${joinNames([...g.host, 'you'])} ${need ? `are in, ${need} more needed` : 'are in, the game is full'}`
      : `${joinNames(g.host)} ${g.host.length > 1 ? 'need' : 'needs'} ${g.spots} more`;
    const li = document.createElement('li');
    li.className = 'cl-row';
    li.style.setProperty('--i', i);
    if (ctx.focus === gameKey(g)) li.classList.add('is-focus');
    li.dataset.key = gameKey(g);
    li.innerHTML = `
      <span class="cl-row__time">${fmtHour(g.hour)}</span>
      <div class="cl-row__body">
        <button type="button" class="cl-link" data-show>${court.label}</button>
        <small>${SURFACE[court.type]} · ${levelLabel(g.level)}</small>
        <p>${who}</p>
      </div>
      <button type="button" class="cl-btn${into ? ' is-on' : ''}" data-join aria-pressed="${into}" aria-label="${into ? `You are in, ${court.label} at ${fmtHour(g.hour)}. Leave` : `Join ${court.label} at ${fmtHour(g.hour)}, $${g.fee}`}">
        ${into ? '<span class="cl-btn__rest">You are in</span><span class="cl-btn__alt">Leave</span>' : `Join · $${g.fee}`}
      </button>`;
    li.querySelector('[data-join]').addEventListener('click', () => (into ? leave(g) : join(g)));
    li.querySelector('[data-show]').addEventListener('click', () => { ctx.focus = gameKey(g); frameCourts([court], ctx.inset(), 1.4); ctx.render(); ctx.afterShow(); });
    ul.append(li);
  });
  box.append(head, ul);
  // The game on show gets a plate on its court when its flag is not up (the map shows another hour).
  const on = list.find((g) => gameKey(g) === ctx.focus && !isJoined(g) && !(g.dayKey === hourState.dayKey && g.hour === hourState.hour));
  if (on) ctx.pins.put(`open:${ctx.focus}`, { at: { court: on.courtId, corner: 'tr', dx: -24, dy: 24 }, tone: 'dark', minW: 90, rows: [{ t: 'Open game', cls: 'b' }, { t: `${fmtHour(on.hour)} · ${levelLabel(on.level)}`, cls: 's' }] });
  ctx.pins.sweep('open:', new Set(on ? [`open:${ctx.focus}`] : []));
  box.querySelector('.is-focus')?.scrollIntoView({ block: 'nearest' });
}

/** "You" plates on the map for the open games joined on the shown day. */
export function syncYou(pins) {
  const { dayKey } = hourState;
  const keep = new Set();
  for (const j of club().joined) {
    if (j.dayKey !== dayKey) continue;
    const key = `you:${gameKey(j)}`;
    keep.add(key);
    pins.put(key, { at: { court: j.courtId, corner: 'tr', dx: -24, dy: 24 }, tone: 'light', minW: 90, rows: [{ t: 'You', cls: 'b' }, { t: `${fmtHour(j.hour)} · open play`, cls: 's' }] });
  }
  pins.sweep('you:', keep);
}

