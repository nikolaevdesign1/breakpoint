import '../../../css/booking-mapfun.css';
import { COURTS } from '../../shared/availability.js';
import { peekCourt, saveView, restoreView, courtCenter, courtScreenRect } from '../scene.js';

// Round 9 (row 10): what the surfaces feel like. Hovering a surface filter in the dock lights the
// nearest court of that kind, nudges the drone towards it when it is off screen, and a one-line
// note over the button says how the surface plays. Leaving puts the camera back, but only if the
// visitor has not moved it in the meantime (and never when the filter was clicked: that frames
// the courts itself). Pointer devices only; keyboard focus shows the note and the light, no move.

const NOTES = {
  clay: 'Slower ball, easier on the knees',
  hard: 'Fast and true bounce',
  padel: 'Walls in play, 2 vs 2',
  grass: 'Low skidding bounce, short season',
};
const DELAY = 140; // ms: sweeping across the filters does not swing the camera at every one
const MOVE = 0.9; // s
const BACK = 0.8; // s
const SETTLE = 400; // ms the camera must have stood still before a nudge (a fly-to or follow is never cut short)

export function initSurfacePeek({ dock, isBusy = () => false }) {
  const root = document.querySelector('[data-dock]');
  if (!root) return;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tag = document.createElement('p');
  tag.className = 'surface-note';
  tag.hidden = true;
  tag.setAttribute('aria-live', 'polite');
  tag.innerHTML = '<span class="surface-note__line"></span><span class="surface-note__court"></span>';
  document.body.append(tag);
  const line = tag.querySelector('.surface-note__line');
  const court = tag.querySelector('.surface-note__court');

  // Camera moves of the visitor's own (drag, wheel, pinch, keys) cancel any restore.
  let userMovedAt = 0;
  const canvas = document.getElementById('scene');
  for (const t of ['pointerdown', 'wheel', 'touchstart']) canvas?.addEventListener(t, () => { userMovedAt = performance.now(); }, { passive: true });
  window.addEventListener('keydown', (e) => { if (/^Arrow|^[+-]$/.test(e.key)) userMovedAt = performance.now(); });

  // When did the camera last move at all?
  let lastView = saveView();
  let viewChangedAt = 0;
  const watch = () => {
    const v = saveView();
    if (Math.abs(v.x - lastView.x) + Math.abs(v.z - lastView.z) + Math.abs(v.dist - lastView.dist) > 0.01) viewChangedAt = performance.now();
    lastView = v;
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);

  let state = null; // { home, target, since, type }
  let timer = 0;
  let shown = null;

  function nearest(type, from) {
    let best = null;
    let bd = Infinity;
    for (const c of COURTS) {
      if (c.type !== type) continue;
      const p = courtCenter(c.id);
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Is the court comfortably on screen (clear of the dock and the top bar)? */
  function inView(id) {
    const r = courtScreenRect(id);
    return r.left > 24 && r.right < innerWidth - 24 && r.top > 72 && r.bottom < innerHeight - 120;
  }

  function placeTag(btn) {
    const b = btn.getBoundingClientRect();
    const w = tag.offsetWidth;
    const left = Math.max(12, Math.min(b.left, innerWidth - w - 12));
    const bottom = innerHeight - b.top + 12;
    tag.style.left = `${Math.round(left / 2) * 2}px`;
    tag.style.bottom = `${Math.round(bottom / 2) * 2}px`;
  }

  function showTag(btn, type, c) {
    line.textContent = NOTES[type];
    court.textContent = `Closest: ${c.label}`;
    if (shown !== type) {
      shown = type;
      tag.hidden = false;
      tag.classList.remove('is-in');
      placeTag(btn);
      void tag.offsetWidth; // restart the spring
      tag.classList.add('is-in');
    } else placeTag(btn);
  }
  function hideTag() {
    if (!shown) return;
    shown = null;
    tag.classList.remove('is-in');
    setTimeout(() => { if (!shown) tag.hidden = true; }, 240);
  }

  function enter(btn, { move }) {
    const type = btn.dataset.filter;
    if (!NOTES[type] || isBusy()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const home = state?.home ?? saveView();
      const c = nearest(type, home);
      if (!c) return;
      showTag(btn, type, c);
      peekCourt(c.id);
      // Sweeping on to the next filter keeps the first view as home and the latest nudge as target.
      let target = state?.target ?? null;
      const since = state?.since ?? performance.now();
      const settled = performance.now() - viewChangedAt > SETTLE || !!state?.target;
      if (move && !reduced && settled && userMovedAt < since && !inView(c.id)) {
        // A nudge, not a cut: most of the way towards the court, at the same height.
        const p = courtCenter(c.id);
        target = { x: home.x + (p.x - home.x) * 0.85, z: home.z + (p.z - home.z) * 0.85, dist: home.dist };
        restoreView(target, MOVE);
      }
      state = { home, target, since, type };
    }, DELAY);
  }

  function leave({ clicked = false } = {}) {
    clearTimeout(timer);
    hideTag();
    peekCourt(null);
    if (!state) return;
    const { home, target, since } = state;
    state = null;
    if (!target || clicked) return;
    // Only when the visitor has not taken the camera over since (drag, wheel, pinch, keys).
    if (userMovedAt < since) restoreView(home, BACK);
  }

  root.querySelectorAll('[data-filter]').forEach((btn) => {
    if (!NOTES[btn.dataset.filter]) return;
    if (fine) {
      btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') enter(btn, { move: true }); });
      btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') leave(); });
    }
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) enter(btn, { move: false }); });
    btn.addEventListener('blur', () => leave());
    btn.addEventListener('click', () => leave({ clicked: true }));
  });
  document.addEventListener('bp-hud', (e) => { if (e.detail?.open) leave({ clicked: true }); });

  return { leave };
}
