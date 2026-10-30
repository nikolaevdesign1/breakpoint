import gsap from 'gsap';
import { landIn } from './bounce.js';
import { createPeek, preloadPhotos } from './tournament-peek.js';
import { DUR, EASE, STAGGER } from './motion.js';
import {
  EVENTS, LEVELS, AGES, dayKey, eventDays, formatDates, formatStart, levelText, ageText, feeText, spotsLeft, isPast,
} from './tournaments-data.js';

// Tournament calendar (rows 75, 126): a month grid with events drawn as bands across their days.
// Bands fill up with the spots taken and flag the last few; filters dim what doesn't fit and bounce what does;
// the grid stays flat; the events stand on it as plates that tilt toward the pointer, and the same events
// are listed as plates above it (arrows, horizontal swipe or wheel, ← → keys); hovering a day
// assembles the event photo inside it; clicking opens the event card next to the date.

const MONTHS_AHEAD = 4;
const CARD_GAP = 12;
const LOW = 5; // "3 left" from this many spots down
const DAY = 864e5;
const CLOSE_SVG = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>';

const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const countText = (n) => (n ? `${n} ${n === 1 ? 'event' : 'events'}` : 'No events');

function chipsHTML(options) {
  return options.map((o, i) => `<button class="cal__chip" type="button" data-value="${o.id}" aria-pressed="${i === 0}">${o.label}</button>`).join('');
}

function applyLabel(e) {
  if (isPast(e)) return 'Finished';
  return spotsLeft(e) > 0 ? 'Apply' : 'Join the waitlist';
}

function cardHTML(list, index) {
  const e = list[index];
  const left = spotsLeft(e);
  const tabs = list.length > 1
    ? `<div class="tcard__tabs" role="tablist" aria-label="Events on this day">${list.map((x, i) => `<button class="tcard__tab" type="button" role="tab" aria-selected="${i === index}" data-tab="${i}">${x.plain}</button>`).join('')}</div>`
    : '';
  const no = String(EVENTS.indexOf(e) + 1).padStart(2, '0');
  return `
    ${tabs}
    <div class="tcard__head">
      <p class="tcard__date"><span>Order of play</span>${formatDates(e)}</p>
      <button class="tcard__close" type="button" data-tcard-close aria-label="Close the event card">${CLOSE_SVG}</button>
    </div>
    <h3 class="tcard__name" tabindex="-1">${e.name}</h3>
    <dl class="tcard__sched">
      <div><dt>Match</dt><dd>${no}</dd></div>
      <div><dt>Court</dt><dd>${e.surface}</dd></div>
      <div><dt>Time</dt><dd>${formatStart(e).replace('Starts ', '')}</dd></div>
    </dl>
    <ul class="tcard__tags">
      <li><span class="tone-dot tone--${e.kind}"></span>${e.entries.join(' and ')}</li>
      <li>${levelText(e)}</li>
      <li>${ageText(e)}</li>
    </ul>
    <div class="tcard__spots${left <= 4 ? ' is-low' : ''}">
      <p><span><b>${e.taken}</b> of ${e.spots} ${e.perPair ? 'pairs' : 'spots'} taken</span><span class="tcard__left">${left ? `${left} left` : 'Full, waitlist open'}</span></p>
      <div class="tcard__meter"><i style="--p:${(e.taken / e.spots).toFixed(3)}"></i></div>
    </div>
    <dl class="tcard__facts">
      <div><dt>Entry fee</dt><dd>${feeText(e)}</dd></div>
      <div><dt>Format</dt><dd>${e.format}</dd></div>
      <div><dt>Sets</dt><dd>${e.scoring}</dd></div>
      <div><dt>Prizes</dt><dd>${e.prizes}</dd></div>
    </dl>
    <button class="btn btn--block tcard__apply" type="button" data-apply="${e.id}"${isPast(e) ? ' disabled' : ''}><span class="btn__bg"></span><span class="btn__label">${applyLabel(e)}</span></button>`;
}

// One day's slice of a band. The fill runs across the whole event: on a three-day event two thirds
// full, the first two slices are solid and the third is empty. The name sits twice, once on the empty
// track and once on the clipped fill, so it stays readable on both.
function plateHTML(e) {
  const left = spotsLeft(e);
  const fill = Math.round((e.taken / e.spots) * 100);
  return `<button class="cal__plate tone--${e.kind}" type="button" data-plate="${e.id}">
    <span class="cal__plate-in">
      <span class="cal__plate-dates">${formatDates(e)}</span>
      <span class="cal__plate-name">${e.plain}</span>
      <span class="cal__plate-meta">${levelText(e)}</span>
      <span class="cal__plate-meter" style="--fill:${fill}%"><i></i></span>
      <span class="cal__plate-spots">${left > 0 ? `${left} of ${e.spots} spots left` : 'Full, waitlist open'}</span>
    </span>
  </button>`;
}

function bandHTML(e, d, lane, order) {
  const seg = Math.round((d - e.start) / DAY);
  const start = seg === 0;
  const end = +d === +e.end;
  const fill = Math.min(1, Math.max(0, (e.taken / e.spots) * e.days - seg));
  const left = spotsLeft(e);
  const labelled = start || d.getDay() === 1;
  const tag = start && left <= LOW ? `<span class="cal__band-tag">${left ? `${left} left` : 'Full'}</span>` : '';
  const name = labelled ? `<span class="cal__band-name">${e.plain}</span>` : '';
  const cls = ['cal__band', `tone--${e.kind}`, start && 'is-start', end && 'is-end', isPast(e) && 'is-past', tag && 'has-tag'].filter(Boolean).join(' ');
  return `<span class="${cls}" data-event="${e.id}" style="--lane:${lane};--fill:${fill.toFixed(3)};--seg:${seg};--i:${order}">${name}<span class="cal__band-fill">${name}</span>${tag}</span>`;
}

// A short hop for a band that was already showing: lift, land with a squash, settle.
function hop(el, delay) {
  return gsap.timeline({ delay, onComplete: () => gsap.set(el, { clearProps: 'transform,transformOrigin' }) })
    .set(el, { transformOrigin: '50% 100%' })
    .to(el, { y: -8, scaleY: 1.12, scaleX: 0.96, duration: DUR.fast * 0.6, ease: EASE.out })
    .to(el, { y: 0, scaleY: 1, scaleX: 1, duration: DUR.fast * 0.5, ease: 'power2.in' })
    .to(el, { scaleY: 0.8, scaleX: 1.04, duration: DUR.fast * 0.2, ease: 'power1.out' })
    .to(el, { scaleY: 1, scaleX: 1, duration: DUR.base, ease: EASE.spring });
}

export function initCalendar({ reducedMotion }) {
  const root = document.querySelector('[data-cal]');
  if (!root) return;
  const $ = (sel) => root.querySelector(sel);
  const grid = $('[data-cal-grid]');
  const body = $('[data-cal-body]');
  const card = $('[data-tcard]');
  const monthEl = $('[data-cal-month]');
  const countEl = $('[data-cal-count]');
  const prev = $('[data-cal-prev]');
  const next = $('[data-cal-next]');
  const empty = $('[data-cal-empty]');
  const plates = document.createElement('div'); // this month's events as tilting plates
  plates.className = 'cal__plates';
  body.before(plates);
  const agenda = $('[data-cal-agenda]');
  const narrow = window.matchMedia('(max-width: 720px)');
  const hover = window.matchMedia('(hover: hover) and (pointer: fine)');

  const today = midnight(new Date());
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const state = { offset: 0, level: 'all', age: 'all' };
  const open = { list: null, index: 0, opener: null };
  const counter = { n: 0 };
  let month = firstMonth;
  let dayEvents = new Map();
  let monthEvents = [];

  const peek = createPeek({ reducedMotion });
  $('[data-filter="level"]').insertAdjacentHTML('beforeend', chipsHTML([{ id: 'all', label: 'Any' }, ...LEVELS]));
  $('[data-filter="age"]').insertAdjacentHTML('beforeend', chipsHTML([{ id: 'all', label: 'Any' }, ...AGES]));

  // Tilt: a plate (above the grid or standing on a day) leans toward the pointer, up to 9 degrees.
  if (!reducedMotion && hover.matches) {
    const lean = (e) => {
      const el = e.target.closest('.cal__plate, .cal__band');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      el.style.setProperty('--bx', `${(-ny * 9).toFixed(1)}deg`);
      el.style.setProperty('--by', `${(nx * 9).toFixed(1)}deg`);
      el.style.setProperty('--gx', `${((nx + 1) * 50).toFixed(0)}%`);
    };
    const rest = (e) => {
      const el = e.target.closest('.cal__plate, .cal__band');
      if (el) { el.style.removeProperty('--bx'); el.style.removeProperty('--by'); }
    };
    [plates, grid].forEach((host) => {
      host.addEventListener('pointermove', lean);
      host.addEventListener('pointerout', rest);
    });
  }
  // A plate opens the event card on its first day.
  plates.addEventListener('click', (e) => {
    const plate = e.target.closest('[data-plate]');
    if (!plate) return;
    const ev = EVENTS.find((x) => x.id === plate.dataset.plate);
    const first = eventDays(ev).find((k) => grid.querySelector(`[data-day="${k}"]:not(.is-out)`)) || eventDays(ev)[0];
    grid.querySelector(`[data-day="${first}"]`)?.click();
  });

  const matches = (e) => (state.level === 'all' || e.levels.includes(state.level)) && (state.age === 'all' || e.ages.includes(state.age));
  const matchingOn = (key) => (dayEvents.get(key) || []).filter(matches);

  // Every event in view is drawn, so lanes stay put while filters change; filters only dim bands.
  function render() {
    closeCard({ restoreFocus: false });
    peek.hide();
    month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + state.offset, 1);
    const y = month.getFullYear();
    const m = month.getMonth();
    const gridStart = new Date(y, m, 1 - ((month.getDay() + 6) % 7));
    const last = new Date(y, m + 1, 0);
    const gridEnd = new Date(y, m + 1, 6 - ((last.getDay() + 6) % 7));

    const events = EVENTS.filter((e) => e.end >= gridStart && e.start <= gridEnd);
    monthEvents = events.filter((e) => e.end >= month && e.start <= last);

    // Lanes keep a multi-day band on the same row of every cell it crosses.
    const laneEnds = [];
    const lane = new Map();
    events.forEach((e) => {
      let l = laneEnds.findIndex((end) => end < e.start);
      if (l < 0) l = laneEnds.push(e.end) - 1;
      else laneEnds[l] = e.end;
      lane.set(e, l);
    });
    dayEvents = new Map();
    events.forEach((e) => eventDays(e).forEach((k) => dayEvents.set(k, [...(dayEvents.get(k) || []), e])));

    let html = '';
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      const list = dayEvents.get(key) || [];
      const isToday = +d === +today;
      const cls = ['cal__day', d.getMonth() !== m && 'is-out', d < today && 'is-past', isToday && 'is-today', list.length && 'has-events'].filter(Boolean).join(' ');
      const ball = isToday ? '<span class="cal__ball" aria-hidden="true"></span>' : '';
      const inner = `<span class="cal__num">${d.getDate()}</span>${ball}${list.map((e) => bandHTML(e, d, lane.get(e), events.indexOf(e))).join('')}`;
      html += list.length
        ? `<button class="${cls}" type="button" data-day="${key}" data-date="${longDate(d)}">${inner}</button>`
        : `<div class="${cls}">${inner}</div>`;
    }
    grid.style.setProperty('--lanes', Math.max(1, laneEnds.length));
    grid.innerHTML = html;

    plates.innerHTML = monthEvents.map((e) => plateHTML(e)).join('');
    monthEl.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    prev.disabled = state.offset === 0;
    next.disabled = state.offset === MONTHS_AHEAD;
    counter.n = 0;
    applyFilter();
  }

  // Dim what doesn't match, update the cells, the counter and the phone agenda.
  function applyFilter({ animate = false } = {}) {
    const bounced = new Set();
    grid.querySelectorAll('.cal__band').forEach((band) => {
      const e = EVENTS.find((x) => x.id === band.dataset.event);
      const fits = matches(e);
      const was = !band.classList.contains('is-dim');
      band.classList.toggle('is-dim', !fits);
      if (!animate || !fits || reducedMotion) return;
      bounced.add(e);
      const delay = [...bounced].indexOf(e) * STAGGER.base;
      band.classList.add('is-hopping'); // CSS transitions would fight the tween
      const tl = was ? hop(band, delay) : landIn(band, { delay });
      tl.eventCallback('onComplete', () => {
        gsap.set(band, { clearProps: 'transform,transformOrigin,opacity,visibility' });
        band.classList.remove('is-hopping');
      });
    });

    grid.querySelectorAll('button.cal__day').forEach((cell) => {
      const list = matchingOn(cell.dataset.day);
      cell.classList.toggle('has-match', list.length > 0);
      cell.setAttribute('aria-label', list.length ? `${cell.dataset.date}: ${list.map((e) => e.plain).join(', ')}` : `${cell.dataset.date}: nothing at this level`);
      cell.toggleAttribute('aria-disabled', !list.length);
      if (list.length) cell.dataset.cursor = 'View draw';
      else delete cell.dataset.cursor;
    });

    const shown = monthEvents.filter(matches);
    empty.hidden = shown.length > 0;
    if (reducedMotion) countEl.textContent = countText(shown.length);
    else gsap.to(counter, { n: shown.length, duration: DUR.base, ease: EASE.out, overwrite: true, onUpdate: () => { countEl.textContent = countText(Math.round(counter.n)); } });
    agenda.innerHTML = shown.map((e) => `
      <li><button class="cal__agenda-item" type="button" data-day="${dayKey(e.start)}" data-event="${e.id}">
        <span class="tone-dot tone--${e.kind}"></span><span class="cal__agenda-date">${formatDates(e)}</span><span class="cal__agenda-name">${e.plain}</span>
      </button></li>`).join('');
  }

  function go(dir) {
    const to = state.offset + dir;
    if (to < 0 || to > MONTHS_AHEAD) return false;
    state.offset = to;
    const focusInGrid = grid.contains(document.activeElement);
    const swap = () => {
      render();
      if (focusInGrid) grid.querySelector('.cal__day.has-match, .cal__day')?.focus({ preventScroll: true });
    };
    if (reducedMotion) { swap(); return true; }
    gsap.timeline()
      .to([grid, plates], { autoAlpha: 0, y: 12 * dir, duration: DUR.fast, ease: 'power2.in', overwrite: 'auto' })
      .add(swap)
      .fromTo([grid, plates], { autoAlpha: 0, y: -12 * dir }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out });
    gsap.fromTo(monthEl, { autoAlpha: 0, x: 24 * dir }, { autoAlpha: 1, x: 0, duration: DUR.base, delay: DUR.fast, ease: EASE.out });
    return true;
  }

  // Event card: next to the date on wide screens, under the grid on phones.
  function placeCard(anchor) {
    if (narrow.matches || !anchor) { card.style.left = ''; card.style.top = ''; return 'center top'; }
    const b = body.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const right = a.right - b.left + CARD_GAP;
    const onRight = right + w <= b.width;
    const left = onRight ? right : Math.max(0, a.left - b.left - CARD_GAP - w);
    const top = Math.min(Math.max(0, a.top - b.top - 24), Math.max(0, b.height - h));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    return `${onRight ? 'left' : 'right'} ${Math.round(a.top - b.top - top + a.height / 2)}px`;
  }

  function showCard(list, index, opener, { animate = true } = {}) {
    open.list = list;
    open.index = index;
    open.opener = opener;
    grid.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    const cell = opener?.closest('.cal__day');
    cell?.classList.add('is-selected');
    card.innerHTML = cardHTML(list, index);
    card.hidden = false;
    const origin = placeCard(cell || opener);
    if (animate && !reducedMotion) {
      gsap.fromTo(card, { opacity: 0, scale: 0.9, y: 10, transformOrigin: origin }, { opacity: 1, scale: 1, y: 0, duration: DUR.base, ease: EASE.spring, overwrite: true });
    }
    if (narrow.matches) {
      const lenis = window.__lenis;
      if (lenis) lenis.scrollTo(card, { offset: -96 });
      else card.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    card.querySelector('.tcard__name').focus({ preventScroll: true });
  }

  function closeCard({ restoreFocus = true } = {}) {
    if (card.hidden) return;
    const opener = open.opener;
    open.list = null;
    grid.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    const done = () => { card.hidden = true; card.innerHTML = ''; };
    if (reducedMotion || !restoreFocus) done();
    else gsap.to(card, { opacity: 0, scale: 0.96, duration: DUR.fast, ease: EASE.inOut, overwrite: true, onComplete: done });
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  root.addEventListener('click', (e) => {
    const chip = e.target.closest('.cal__chip');
    if (chip) {
      const group = chip.closest('[data-filter]');
      group.querySelectorAll('.cal__chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      state[group.dataset.filter] = chip.dataset.value;
      closeCard({ restoreFocus: false });
      applyFilter({ animate: true });
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      const list = matchingOn(day.dataset.day);
      const at = Math.max(0, list.findIndex((x) => x.id === day.dataset.event));
      const anchor = grid.querySelector(`.cal__day[data-day="${day.dataset.day}"]`) || day;
      if (list.length) { peek.hide(); showCard(list, at, anchor); }
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) { showCard(open.list, +tab.dataset.tab, open.opener, { animate: false }); return; }
    if (e.target.closest('[data-tcard-close]')) { closeCard(); return; }
    if (e.target.closest('[data-cal-reset]')) {
      state.level = 'all';
      state.age = 'all';
      root.querySelectorAll('[data-filter] .cal__chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === 'all')));
      applyFilter({ animate: true });
    }
  });
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  // Hover (mouse) or keyboard focus on a day: lift the cell and assemble the event photo inside it.
  const peekCell = (target) => target.closest?.('button.cal__day.has-match');
  grid.addEventListener('pointerover', (e) => {
    if (!hover.matches || e.pointerType !== 'mouse') return;
    const cell = peekCell(e.target);
    if (cell && cell !== peek.cell && card.hidden) peek.show(cell, matchingOn(cell.dataset.day)[0], [e.clientX, e.clientY]);
    else if (!cell) peek.hide();
  });
  grid.addEventListener('pointerleave', () => peek.hide());
  grid.addEventListener('focusin', (e) => {
    const cell = peekCell(e.target);
    if (cell && document.documentElement.classList.contains('is-pointer') === false) peek.show(cell, matchingOn(cell.dataset.day)[0]);
  });
  grid.addEventListener('focusout', (e) => { if (!grid.contains(e.relatedTarget)) peek.hide(); });

  // Horizontal swipe and horizontal wheel/trackpad change the month; one step per gesture.
  let wheelX = 0;
  let wheelLock = 0;
  body.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    wheelX += e.deltaX;
    if (Math.abs(wheelX) > 60) {
      go(Math.sign(wheelX));
      wheelX = 0;
      wheelLock = now + 700;
    }
  }, { passive: false });
  let touch = null;
  body.addEventListener('touchstart', (e) => { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch[0];
    const dy = e.changedTouches[0].clientY - touch[1];
    touch = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ← → change the month while the calendar has focus, or while it fills the screen and nothing else does.
  const inView = () => { const r = root.getBoundingClientRect(); return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.hidden && !document.querySelector('[data-apply-modal]:not([hidden])')) { closeCard(); return; }
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('[data-apply-modal]:not([hidden])') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const focusHere = root.contains(document.activeElement) && !card.contains(document.activeElement);
    const idle = document.activeElement === document.body || !document.activeElement;
    if (!focusHere && !(idle && inView())) return;
    if (go(e.key === 'ArrowRight' ? 1 : -1)) e.preventDefault();
  });

  // Click outside closes the card (the application modal handles its own Esc first).
  document.addEventListener('pointerdown', (e) => {
    if (card.hidden || card.contains(e.target) || e.target.closest('[data-day]') || e.target.closest('[data-apply-modal]')) return;
    closeCard({ restoreFocus: false });
  });
  window.addEventListener('resize', () => { if (!card.hidden) placeCard(grid.querySelector('.is-selected')); });

  render();

  // Bands fill up the first time the calendar comes into view; photos load then too.
  if (reducedMotion) { grid.classList.add('is-live'); preloadPhotos(EVENTS); return; }
  new IntersectionObserver((entries, io) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    io.disconnect();
    grid.classList.add('is-live');
    if (hover.matches) preloadPhotos(EVENTS);
  }, { threshold: 0.2 }).observe(grid);
}
