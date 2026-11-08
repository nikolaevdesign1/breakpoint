import gsap from 'gsap';
import { landIn } from './bounce.js';
import { createPeek, preloadPhotos } from './tournament-peek.js';
import { DUR, EASE, STAGGER } from './motion.js';
import { dayWeather, weatherHTML, weatherKind } from './day-weather.js';
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

const KIND = { singles: 'Singles', doubles: 'Doubles', padel: 'Padel', junior: 'Juniors' };
const isoKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(midnight(d), -((d.getDay() + 6) % 7));
const shortDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// Phone, week view: an event as a card (type, name, when, level, spots, fee, Apply and Details).
function weekCardHTML(e) {
  const left = spotsLeft(e);
  const low = left > 0 && left <= LOW;
  return `<article class="wc tone--${e.kind}${isPast(e) ? ' is-past' : ''}" data-wc="${e.id}">
    <div class="wc__top"><span class="wc__type"><i class="tone--${e.kind}"></i>${KIND[e.kind]}</span><span class="wc__when">${formatDates(e)}, ${formatStart(e).replace('Starts ', '')}</span></div>
    <h5 class="wc__name">${e.plain}</h5>
    <p class="wc__meta">${levelText(e)}. ${ageText(e)}.</p>
    <div class="wc__spots${low ? ' is-low' : ''}"><span>${left > 0 ? `${left} of ${e.spots} ${e.perPair ? 'pairs' : 'spots'} left` : 'Full, waitlist open'}</span><b>${feeText(e)}</b></div>
    <div class="wc__meter"><i style="--p:${(e.taken / e.spots).toFixed(3)}"></i></div>
    <div class="wc__act">
      <button class="btn btn--block" type="button" data-apply="${e.id}"${isPast(e) ? ' disabled' : ''}><span class="btn__bg"></span><span class="btn__label">${applyLabel(e)}</span></button>
      <button class="wc__more" type="button" data-wc-more aria-expanded="false">Details</button>
    </div>
    <dl class="wc__facts" hidden>
      <div><dt>Court</dt><dd>${e.surface}</dd></div>
      <div><dt>Format</dt><dd>${e.format}</dd></div>
      <div><dt>Sets</dt><dd>${e.scoring}</dd></div>
      <div><dt>Prizes</dt><dd>${e.prizes}</dd></div>
    </dl>
  </article>`;
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
  root.classList.add('is-ready');
  const agenda = $('[data-cal-agenda]');
  const narrow = window.matchMedia('(max-width: 720px)');
  const strip = $('[data-cal-strip]');
  const wk = $('[data-cal-wk]');
  const viewBtns = [...root.querySelectorAll('[data-cal-view]')];
  const hover = window.matchMedia('(hover: hover) and (pointer: fine)');

  const today = midnight(new Date());
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const state = { offset: 0, level: 'all', age: 'all', view: 'week', week: mondayOf(today), sel: today };
  const lastMonthEnd = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + MONTHS_AHEAD + 1, 0);
  const minWeek = mondayOf(today);
  const maxWeek = mondayOf(lastMonthEnd);
  const isWeek = () => narrow.matches && state.view === 'week';
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
  function renderMonth() {
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
      const inner = `<span class="cal__num">${d.getDate()}</span><span class="cal__wx" data-wx="${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}" title="" hidden></span>${ball}${list.map((e) => bandHTML(e, d, lane.get(e), events.indexOf(e))).join('')}${list.length ? `<span class="cal__dots" aria-hidden="true">${list.map((e) => `<i class="tone--${e.kind}"></i>`).join('')}</span>` : ''}`;
      html += list.length
        ? `<button class="${cls}" type="button" data-day="${key}" data-d="${key}" data-date="${longDate(d)}">${inner}</button>`
        : `<div class="${cls}" data-d="${key}">${inner}</div>`;
    }
    grid.style.setProperty('--lanes', Math.max(1, laneEnds.length));
    grid.innerHTML = html;

    paintWeather();
    plates.innerHTML = monthEvents.map((e) => plateHTML(e)).join('');
    monthEl.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    prev.disabled = state.offset === 0;
    next.disabled = state.offset === MONTHS_AHEAD;
    prev.setAttribute('aria-label', 'Previous month');
    next.setAttribute('aria-label', 'Next month');
    counter.n = 0;
    applyFilter();
  }

  // Phone, week view: a strip of seven days and, under it, the week's events as cards.
  const dayWx = (d) => (forecast ? forecast.get(isoKey(d)) : null);
  const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(state.week, i));

  function pickDay(days) {
    if (state.sel >= days[0] && state.sel <= days[6]) return state.sel;
    if (today >= days[0] && today <= days[6]) return today;
    return days.find((d) => matchingOn(dayKey(d)).length) || days[0];
  }

  function renderWeek() {
    closeCard({ restoreFocus: false });
    peek.hide();
    const days = weekDays();
    const events = EVENTS.filter((e) => e.end >= days[0] && e.start <= days[6]);
    dayEvents = new Map();
    events.forEach((e) => eventDays(e).forEach((k) => dayEvents.set(k, [...(dayEvents.get(k) || []), e])));
    state.sel = pickDay(days);
    const shown = events.filter(matches);

    strip.innerHTML = days.map((d) => {
      const key = dayKey(d);
      const list = matchingOn(key);
      const cls = ['sd', d < today && 'is-past', +d === +today && 'is-today', +d === +state.sel && 'is-sel', list.length && 'has-events'].filter(Boolean).join(' ');
      const marks = [...new Set(list.map((e) => e.kind))].map((k) => `<i class="tone--${k}"></i>`).join('');
      return `<button class="${cls}" type="button" data-sd="${key}" aria-pressed="${+d === +state.sel}" aria-label="${longDate(d)}${list.length ? `, ${list.length} ${list.length === 1 ? 'event' : 'events'}` : ''}">
        <span class="sd__dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="sd__num">${d.getDate()}</span>
        <span class="sd__wx" data-wx="${isoKey(d)}"></span><span class="sd__marks" aria-hidden="true">${marks}</span></button>`;
    }).join('');

    // events are listed once, under the first day of the week they run on
    const groups = new Map();
    shown.forEach((e) => {
      const first = e.start < days[0] ? days[0] : e.start;
      const k = dayKey(first);
      groups.set(k, [...(groups.get(k) || []), e]);
    });
    wk.innerHTML = `<div class="wk__sel" data-wk-sel></div>${[...groups].map(([k, list]) => {
      const d = days.find((x) => dayKey(x) === k);
      return `<section class="wk__day" data-wk-day="${k}"><h4 class="wk__head">${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${shortDay(d)}</h4>${list.map(weekCardHTML).join('')}</section>`;
    }).join('')}`;

    const first = days[0];
    const lastD = days[6];
    const range = first.getMonth() === lastD.getMonth() ? `${shortDay(first)}-${lastD.getDate()}` : `${shortDay(first)}-${shortDay(lastD)}`;
    countEl.textContent = `${range} · ${countText(shown.length)}`;
    monthEl.textContent = state.sel.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    prev.disabled = +state.week <= +minWeek;
    next.disabled = +state.week >= +maxWeek;
    prev.setAttribute('aria-label', 'Previous week');
    next.setAttribute('aria-label', 'Next week');
    empty.hidden = true;
    paintWeather();
    paintBanner();
  }

  // The line under the strip: the selected day, its forecast and what is on it (or the next event).
  function paintBanner() {
    const el = wk.querySelector('[data-wk-sel]');
    if (!el) return;
    const d = state.sel;
    const list = matchingOn(dayKey(d));
    const w = dayWx(d);
    let line = '';
    if (w) {
      const [, label] = weatherKind(w.code);
      line = `<p class="wk__wx">${label}, ${w.hi}° / ${w.lo}°F${w.rain >= 30 ? `, ${w.rain}% chance of rain` : ''}</p>`;
    }
    let body = '';
    if (!list.length) {
      const later = EVENTS.filter((e) => e.end > d && matches(e)).sort((a, b) => a.start - b.start)[0];
      body = `<p class="wk__none">Nothing on this day.</p>${later ? `<button class="wk__next" type="button" data-wk-jump="${isoKey(later.start > d ? later.start : d)}">Next: ${later.plain}, ${formatDates(later)}</button>` : ''}`;
    }
    el.innerHTML = `<h4 class="wk__date">${longDate(d)}</h4>${line}${body}`;
    wk.querySelectorAll('.wc').forEach((c) => c.classList.toggle('is-on', list.some((e) => e.id === c.dataset.wc)));
  }

  function selectDay(d, { scroll = true } = {}) {
    state.sel = d;
    strip.querySelectorAll('.sd').forEach((b) => {
      const on = b.dataset.sd === dayKey(d);
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
    });
    monthEl.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    paintBanner();
    if (!scroll) return;
    const target = wk.querySelector('.wc.is-on') || wk.querySelector('[data-wk-sel]');
    if (!target) return;
    const offset = -(strip.getBoundingClientRect().bottom + 12);
    const lenis = window.__lenis;
    if (lenis) lenis.scrollTo(target, { offset: offset - 0 });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function showWeek(monday, sel) {
    state.week = monday;
    if (sel) state.sel = sel;
    renderWeek();
  }

  function render() {
    root.dataset.view = isWeek() ? 'week' : 'month';
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calView === state.view)));
    if (isWeek()) renderWeek(); else renderMonth();
  }

  // Both views move with the arrows, swipes and keys: a week at a time in the week view, a month in the month view.
  function step(dir) {
    if (!isWeek()) return go(dir);
    const to = addDays(state.week, 7 * dir);
    if (to < minWeek || to > maxWeek) return false;
    state.week = to;
    state.sel = addDays(state.sel, 7 * dir);
    const swap = () => renderWeek();
    if (reducedMotion) { swap(); return true; }
    gsap.timeline()
      .to([strip, wk], { autoAlpha: 0, x: -16 * dir, duration: DUR.fast, ease: 'power2.in', overwrite: 'auto' })
      .add(swap)
      .fromTo([strip, wk], { autoAlpha: 0, x: 16 * dir }, { autoAlpha: 1, x: 0, duration: DUR.base, ease: EASE.out, clearProps: 'transform' });
    return true;
  }

  // The forecast for the days that have one (today and about two weeks ahead); filled in once it has loaded.
  let forecast = null;
  function paintWeather() {
    if (!forecast) return;
    root.querySelectorAll('.cal__wx, .sd__wx').forEach((el) => {
      const w = forecast.get(el.dataset.wx);
      if (!w) return;
      el.innerHTML = weatherHTML(w);
      el.title = `Miami: high ${w.hi}°F, low ${w.lo}°F`;
      el.hidden = false;
    });
    if (isWeek()) paintBanner();
  }
  dayWeather().then((map) => { forecast = map; paintWeather(); }).catch(() => {});

  // Dim what doesn't match, update the cells, the counter and the phone agenda.
  function applyFilter({ animate = false } = {}) {
    if (isWeek()) { renderWeek(); return; }
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
    const view = e.target.closest('[data-cal-view]');
    if (view) {
      state.view = view.dataset.calView;
      if (state.view === 'week') {
        const d = month <= today ? today : month; // first day of the month on screen, or today
        state.sel = d;
        state.week = mondayOf(d);
      } else {
        const diff = (state.sel.getFullYear() - firstMonth.getFullYear()) * 12 + state.sel.getMonth() - firstMonth.getMonth();
        state.offset = Math.min(MONTHS_AHEAD, Math.max(0, diff));
      }
      render();
      return;
    }
    const sd = e.target.closest('[data-sd]');
    if (sd) { selectDay(new Date(...sd.dataset.sd.split('-').map(Number))); return; }
    const jump = e.target.closest('[data-wk-jump]');
    if (jump) { const d = midnight(new Date(`${jump.dataset.wkJump}T00:00`)); showWeek(mondayOf(d), d); selectDay(d, { scroll: false }); return; }
    const more = e.target.closest('[data-wc-more]');
    if (more) {
      const expand = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(expand));
      more.textContent = expand ? 'Less' : 'Details';
      more.closest('.wc').querySelector('.wc__facts').hidden = !expand;
      return;
    }
    const day = e.target.closest('[data-day]');
    const phoneDay = narrow.matches && e.target.closest('.cal__day[data-d], [data-cal-agenda] [data-day]');
    if (phoneDay) {
      // phone month view: a day (or an agenda line) leads to its week
      const [y, m, dd] = (phoneDay.dataset.d || phoneDay.dataset.day).split('-').map(Number);
      const d = new Date(y, m, dd);
      state.view = 'week';
      state.sel = d < today ? today : d;
      state.week = mondayOf(state.sel);
      render();
      return;
    }
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
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

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
  [body, strip].forEach((host) => {
    host.addEventListener('touchstart', (e) => { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    host.addEventListener('touchend', (e) => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch[0];
      const dy = e.changedTouches[0].clientY - touch[1];
      touch = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  });
  // Crossing the phone breakpoint switches between the week view and the full month grid.
  narrow.addEventListener('change', () => render());

  // ← → change the month while the calendar has focus, or while it fills the screen and nothing else does.
  const inView = () => { const r = root.getBoundingClientRect(); return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.hidden && !document.querySelector('[data-apply-modal]:not([hidden])')) { closeCard(); return; }
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('[data-apply-modal]:not([hidden])') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const focusHere = root.contains(document.activeElement) && !card.contains(document.activeElement);
    const idle = document.activeElement === document.body || !document.activeElement;
    if (!focusHere && !(idle && inView())) return;
    if (step(e.key === 'ArrowRight' ? 1 : -1)) e.preventDefault();
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
