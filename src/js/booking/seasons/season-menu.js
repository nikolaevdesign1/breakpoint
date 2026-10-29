import '../../../css/booking-seasons.css';
import { MODES, SEASON_NAMES, seasonMode, setSeasonMode, currentSeason, datedSeason } from './season.js';

// Holiday decor switcher (round 8, "seasons"): a square button in the top bar, beside the postcard,
// opens a small menu. "Auto" follows the date in Miami; the others force a look for the session.
// A menu button with radio items: arrows, Home / End, Enter / Space, Esc and Tab all work.
// Round 9 (row 2): the button names what is on ("Halloween"), and a plate under the top
// bar says so for a few seconds whenever decor turns on, the first time too.

const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.75 3.75c3.5 3.4 9 3.4 12.5 0"/><path d="M4.75 6.25v1.5M8 7.25v1.5M11.25 6.25v1.5"/><rect class="bp-season__bulb" x="3.75" y="8.25" width="2" height="3"/><rect class="bp-season__bulb" x="7" y="9.25" width="2" height="3"/><rect class="bp-season__bulb" x="10.25" y="8.25" width="2" height="3"/></svg>';

const HINTS = {
  halloween: 'Pumpkins and orange lights',
  holidays: 'Lights, a tree and gifts',
  july4: 'Bunting, flags, fireworks at night',
  off: 'No decor',
};
const LABELS = { auto: 'Auto', ...SEASON_NAMES, off: 'Off' };
const NOTES = {
  halloween: ['Halloween at the club', 'Pumpkins at every gate, orange lights at night'],
  holidays: ['Holidays at the club', 'Lights, a tree, and a sleigh overhead'],
  july4: ['July 4th at the club', 'Flags on the walkway, fireworks after dark'],
};
const NOTE_MS = 4200;

function autoHint() {
  const s = datedSeason();
  return s ? `By date, ${SEASON_NAMES[s]} now` : 'By date, nothing today';
}

export function initSeasonMenu() {
  const bar = document.querySelector('.bp-right');
  if (!bar) return null;

  const root = document.createElement('div');
  root.className = 'bp-season';
  root.innerHTML = `
    <button class="bp-season__btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="bp-season-menu" data-cursor="Decor">${ICON}<span class="bp-season__label" aria-hidden="true"></span></button>
    <div class="bp-season__menu" id="bp-season-menu" role="menu" aria-label="Holiday decor" hidden>
      <p class="bp-season__title" aria-hidden="true">Holiday decor</p>
      ${MODES.map((m) => `
        <button class="bp-season__item" type="button" role="menuitemradio" tabindex="-1" data-mode="${m}" aria-checked="false">
          <i class="bp-season__mark" aria-hidden="true"></i>
          <span class="bp-season__name">${LABELS[m]}</span>
          <span class="bp-season__hint">${m === 'auto' ? autoHint() : HINTS[m] ?? ''}</span>
        </button>`).join('')}
    </div>
    <div class="bp-season__note" role="status" aria-live="polite" hidden><p class="bp-season__note-title"></p><p class="bp-season__note-hint"></p></div>`;
  bar.insertBefore(root, bar.querySelector('[data-sound-toggle]'));

  const btn = root.querySelector('.bp-season__btn');
  const menu = root.querySelector('.bp-season__menu');
  const items = [...menu.querySelectorAll('.bp-season__item')];
  const label = root.querySelector('.bp-season__label');
  const note = root.querySelector('.bp-season__note');
  let open = false;
  let closing = null;
  let noteTimer = 0;
  let noteHide = 0;

  function sync() {
    const mode = seasonMode();
    const shown = currentSeason();
    items.forEach((it) => { if (it.dataset.mode) it.setAttribute('aria-checked', String(it.dataset.mode === mode)); });
    btn.classList.toggle('is-on', !!shown);
    label.textContent = shown ? SEASON_NAMES[shown] : 'Decor';
    btn.setAttribute('aria-label', `Decor: ${LABELS[mode]}${mode === 'auto' ? `, ${shown ? SEASON_NAMES[shown] : 'none today'}` : ''}`);
  }

  // The plate under the top bar: what just turned on, for a few seconds.
  function announce(key) {
    const text = NOTES[key];
    if (!text) return;
    note.querySelector('.bp-season__note-title').textContent = text[0];
    note.querySelector('.bp-season__note-hint').textContent = text[1];
    clearTimeout(noteTimer);
    clearTimeout(noteHide);
    note.hidden = false;
    note.classList.remove('is-in');
    void note.offsetWidth; // restart the spring when one note replaces another
    note.classList.add('is-in');
    noteTimer = setTimeout(hideNote, NOTE_MS);
  }
  function hideNote() {
    note.classList.remove('is-in');
    noteHide = setTimeout(() => { note.hidden = true; }, 320);
  }

  function show(focus = 'checked') {
    if (open) return;
    open = true;
    clearTimeout(closing);
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('is-open'));
    const i = focus === 'last' ? items.length - 1 : focus === 'first' ? 0 : Math.max(0, items.findIndex((it) => it.dataset.mode === seasonMode()));
    items[i].focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
  }

  function hide(returnFocus = true) {
    if (!open) return;
    open = false;
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    closing = setTimeout(() => { menu.hidden = true; }, 240);
    document.removeEventListener('pointerdown', outside, true);
    if (returnFocus) btn.focus({ preventScroll: true });
  }

  const outside = (e) => { if (!root.contains(e.target)) hide(false); };

  btn.addEventListener('click', () => (open ? hide() : show()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); show('checked'); }
    if (e.key === 'ArrowUp') { e.preventDefault(); show('last'); }
  });

  menu.addEventListener('keydown', (e) => {
    const i = items.indexOf(document.activeElement);
    const go = (k) => { e.preventDefault(); items[(k + items.length) % items.length].focus({ preventScroll: true }); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === 'Tab') hide(false);
  });

  items.forEach((it) => it.addEventListener('click', () => {
    const before = currentSeason();
    setSeasonMode(it.dataset.mode);
    const now = currentSeason();
    if (now && now !== before) announce(now);
    else if (!now && !note.hidden) hideNote();
    hide();
  }));

  document.addEventListener('bp-season', sync);
  // First visit of the season: once the loader lifts, say what the club is dressed for.
  const loading = document.getElementById('loading');
  const greet = () => {
    const s = currentSeason();
    if (s) announce(s);
  };
  if (!loading || loading.hidden) setTimeout(greet, 600);
  else {
    const mo = new MutationObserver(() => { if (loading.hidden) { mo.disconnect(); setTimeout(greet, 900); } });
    mo.observe(loading, { attributes: true, attributeFilter: ['hidden'] });
  }
  note.addEventListener('pointerenter', () => clearTimeout(noteTimer));
  note.addEventListener('pointerleave', () => { noteTimer = setTimeout(hideNote, 1600); });
  // The booking panel takes over the screen: the menu steps away with the rest of the top bar.
  new MutationObserver(() => { if (document.body.classList.contains('hud-open')) hide(false); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
  return { show, hide, isOpen: () => open };
}
