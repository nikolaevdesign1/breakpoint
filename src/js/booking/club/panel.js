import { hourState } from '../hour-state.js';
import { renderPlay, syncYou } from './play.js';
import { renderDay, clearStops } from './day.js';
import { renderLadder } from './ladder.js';
import { gameKey } from './store.js';
import { releaseSelects } from '../../site/custom-select.js';

// The Club panel (round 10): a square black plate that opens from the dock, on the right of the map
// on wide screens and as a sheet above the dock on phones. Three tabs: open games to join, your day
// at the club, the ladder with "Report score".

const TABS = [['play', 'Open play', renderPlay], ['day', 'Your day', renderDay], ['ladder', 'Ladder', renderLadder]];
const phone = () => matchMedia('(max-width: 640px)').matches;

export function createPanel(pins) {
  const btn = document.querySelector('[data-club-open]');
  if (!btn) return null;
  const root = document.createElement('aside');
  root.className = 'club';
  root.id = 'club-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Club');
  root.inert = true;
  root.innerHTML = `
    <div class="club__head">
      <div class="club__tabs" role="tablist" aria-label="Club">${TABS.map(([id, label]) => `<button type="button" role="tab" id="club-tab-${id}" data-tab="${id}" aria-controls="club-body">${label}</button>`).join('')}</div>
      <button type="button" class="club__close" data-close aria-label="Close the club panel"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>
    </div>
    <div class="club__body" id="club-body" role="tabpanel" tabindex="-1" data-body></div>`;
  document.body.append(root);
  const body = root.querySelector('[data-body]');

  // Shared with the tabs: the open tab's state, and the helpers they use.
  const ctx = {
    pins, tab: 'play', focus: null, report: null, result: null, flip: null, adding: null, draft: {},
    render: () => render(),
    go: (tab, opts = {}) => { Object.assign(ctx, opts); show(tab); },
    inset: () => (phone() ? { bottom: Math.min(innerHeight * 0.55, 460) } : { right: 400 }), // the plate covers part of the map
    afterShow: () => { if (phone()) close(); },
  };
  let open = false;

  function render() {
    const scroll = body.scrollTop;
    releaseSelects(body);
    body.replaceChildren();
    if (ctx.tab !== 'day') clearStops(pins); // "Your day" redraws its stops; other tabs leave none
    if (ctx.tab !== 'play') pins.sweep('open:', new Set());
    const tab = TABS.find(([id]) => id === ctx.tab);
    tab[2](body, ctx);
    body.scrollTop = scroll;
    root.querySelectorAll('[data-tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.tab === ctx.tab)); b.tabIndex = b.dataset.tab === ctx.tab ? 0 : -1; });
    body.setAttribute('aria-labelledby', `club-tab-${ctx.tab}`);
  }

  /** The list builds in once per opening or tab; a redraw while the time bar moves does not replay it. */
  let freshTimer = 0;
  function fresh() {
    body.classList.add('is-fresh');
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => body.classList.remove('is-fresh'), 1600);
  }

  function show(tab) {
    ctx.tab = tab;
    fresh();
    if (!open) openPanel(); else render();
  }

  function openPanel() {
    open = true;
    root.inert = false;
    root.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    render();
  }

  function close() {
    if (!open) return;
    open = false;
    root.inert = true;
    root.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    clearStops(pins);
    pins.sweep('open:', new Set());
    if (root.contains(document.activeElement)) btn.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => { if (open) close(); else { fresh(); openPanel(); } });
  root.querySelector('[data-close]').addEventListener('click', close);
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ctx.result = null; ctx.notice = null; show(b.dataset.tab); }));
  root.querySelector('.club__tabs').addEventListener('keydown', (e) => {
    const i = TABS.findIndex(([id]) => id === ctx.tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
    if (next === undefined) return;
    ctx.result = null;
    show(TABS[(next + TABS.length) % TABS.length][0]);
    root.querySelector(`[data-tab="${ctx.tab}"]`).focus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && !document.body.classList.contains('hud-open')) close(); });
  ['bp-club', 'bp-hour', 'bp-booked', 'bp-booked-again'].forEach((e) => document.addEventListener(e, () => { if (open) render(); }));
  ['bp-club', 'bp-hour'].forEach((e) => document.addEventListener(e, () => syncYou(pins)));
  syncYou(pins);

  return {
    /** A flag on the map was tapped: open the list on that game. */
    /** A coach's slot link (club/coach-link.js): "Your day", the lesson form with the coach and time picked. */
    openLesson({ slug, hour }) {
      ctx.draft = { coach: slug, hour };
      ctx.adding = 'lesson';
      ctx.coachLink = true;
      ctx.notice = null;
      ctx.result = null;
      show('day');
    },
    openGame(g) { ctx.focus = gameKey(g); ctx.result = null; show('play'); },
    close,
    isOpen: () => open,
  };
}
