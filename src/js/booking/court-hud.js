import gsap from 'gsap';
import { COURTS, HOURS, hoursOn, isSlotTaken, dayKeyForOffset } from '../shared/availability.js';
import { fmtHour, dateFor, dayName, weekday, isPast, DAYS_AHEAD } from '../shared/slot-ui.js';
import { rateFor } from '../site/content.js';
import { pixelReveal } from './pixel-reveal.js';
import { revealText } from '../site/type-reveal.js';
import { PRICES, LEVELS, levelLabel, racketPrice, memberOff, defaultGame, durationsFor, playerChoices, fits, priceOf, describeGame } from './extras.js';
import { CANCEL, COACH_RATE, PLAN } from '../shared/club-facts.js';
import { createPlayerForm } from './player-form.js';
import { addSessionBooking, isOwnSlot } from '../shared/session-bookings.js';
import { loadForecast, forecastAt, windWord, isWet } from './forecast.js';
import { inviteUrl } from './flow/invite.js';
import { renderTip } from './club/weather-tip.js';
import { renderKit, kitOf } from './club/kit.js';
import '../../css/booking-flow.css';

// Booking "on the court" (rows 59, 84): after the camera dives onto a court, three steps float over
// it as solid tiles that assemble from squares: 1) day and time, 2) your game (length, players,
// balls, rackets, extras), 3) your details. The confirmation lands on the court too. The map around
// is dimmed and blocked while it is open: "Back to area", a click on the dimmed map, Esc or "Done"
// after booking all leave the same way, with the camera pulling back out (row 67).
//
// Round 9: drag across the hours for a longer game (row 21), the forecast for the picked hour
// (row 11), courts next door for a group (row 24), "Need a partner" (row 7), the member price as
// soon as a card number is in (row 35), and after booking a link for the second player (row 6) and
// the same slot a week on (row 8).

const SURFACES = {
  clay: { type: 'Red clay', meta: 'Outdoor · lit until 23:00' },
  hard: { type: 'Hard court', meta: 'Indoor · 72°F all year' },
  padel: { type: 'Padel', meta: 'Covered · doubles' },
  grass: { type: 'Grass court', meta: 'Outdoor · cut to 8 mm daily' },
};

const q = (sel) => document.querySelector(sel);
const VIEWS = ['pick', 'game', 'details', 'done'];
const byId = (id) => COURTS.find((c) => c.id === id);
const NEXT_DOOR = 24; // m between court centres
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCourtHud({ onBack, onBooked, onGroup }) {
  const el = {
    root: q('[data-hud]'),
    back: q('[data-hud-back]'),
    scrim: q('[data-hud-scrim]'),
    finish: q('[data-hud-finish]'),
    view: { pick: q('[data-hud-pick]'), game: q('[data-hud-game]'), details: q('[data-hud-details]'), done: q('[data-hud-done]') },
    type: q('[data-hud-type]'),
    title: q('[data-hud-title]'),
    meta: q('[data-hud-meta]'),
    days: q('[data-hud-days]'),
    times: q('[data-hud-times]'),
    total: q('[data-hud-total]'),
    book: q('[data-hud-book]'),
    sums: [q('[data-hud-sum]'), q('[data-hud-sum2]')],
    totals: [q('[data-hud-total2]'), q('[data-hud-total3]')],
    opts: q('[data-hud-game]'),
    confirm: q('[data-hud-confirm]'),
    ticket: q('[data-hud-ticket]'),
    ics: q('[data-hud-ics]'),
    forecast: q('[data-hud-forecast]'),
    tip: q('[data-hud-tip]'),
    kit: q('[data-hud-kit]'),
    group: q('[data-hud-group]'),
    groupOpts: q('[data-group-opts]'),
    invite: q('[data-hud-invite]'),
    again: q('[data-hud-again]'),
  };
  // group: courts next door booked together with `court`; member: a valid card number (or null).
  const state = { court: null, offset: 0, hour: null, open: false, view: 'pick', game: null, promo: null, group: [], member: null, last: null };
  // Held on this visit (sessionStorage): the dock, the map sign and these tiles all read the same list.
  const isBooked = (h) => isOwnSlot(state.court.id, dayKeyForOffset(state.offset), h);
  const courts = () => [state.court, ...state.group.map(byId)];
  const hoursOf = (minutes) => Math.ceil(minutes / 60);

  const isFree = (hour) => {
    const dayKey = dayKeyForOffset(state.offset);
    return !isPast(state.offset, hour) && !isSlotTaken(state.court.id, dayKey, hour) && !isBooked(hour);
  };
  /** A court fits the whole game from `hour` (any court, this day). */
  const fitsOn = (court, hour, minutes, offset = state.offset) => fits({ court, offset, hour }, minutes, (h) => isOwnSlot(court.id, dayKeyForOffset(offset), h));

  const form = createPlayerForm(el.view.details, {
    onSubmit: () => confirm(),
    onPromo: (code) => { state.promo = code; if (state.game) renderSums(); }, // row 134
    onMember: (card, plan) => { state.member = card ? { card, plan } : null; if (state.court) { renderTotal(); if (state.hour !== null) renderSums(); } }, // round 9 row 35
  });
  state.member = form.memberCard() ? { card: form.memberCard(), plan: form.memberPlan() } : null;

  // --- Step 1: day and time -----------------------------------------------------------

  function tile(tag, cls, html) {
    const t = document.createElement(tag);
    t.className = `hud-tile ${cls}`;
    t.innerHTML = html;
    if (tag === 'button') t.type = 'button';
    return t;
  }

  function renderDays() {
    el.days.replaceChildren(...Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const t = tile('button', 'hud-day', `<small>${weekday(i)}</small><b>${dateFor(i).getDate()}</b>`);
      t.setAttribute('aria-pressed', String(i === state.offset));
      t.setAttribute('aria-label', dateFor(i).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
      t.addEventListener('click', () => { state.offset = i; state.hour = null; renderPick(); settle(el.days); });
      return t;
    }));
  }

  function renderTimes() {
    el.times.replaceChildren(...hoursOn(dayKeyForOffset(state.offset)).map((hour) => {
      const free = isFree(hour);
      const t = tile('button', 'hud-time', fmtHour(hour));
      t.dataset.hour = hour;
      t.disabled = !free;
      t.setAttribute('aria-label', `${fmtHour(hour)}${free ? '' : ', taken'}`);
      t.addEventListener('click', () => {
        if (dragged) return;
        state.hour = hour;
        if (state.game.minutes > 120 || !fitsOn(state.court, hour, state.game.minutes)) state.game.minutes = 60;
        afterTime();
        settle(el.times);
      });
      return t;
    }));
    markTimes();
  }

  /** The hours the game covers are the dark tiles (a drag can cover several, row 21). */
  function markTimes() {
    const span = state.hour === null ? 0 : hoursOf(state.game.minutes);
    el.times.querySelectorAll('.hud-time').forEach((t) => {
      const h = Number(t.dataset.hour);
      const on = state.hour !== null && h >= state.hour && h < state.hour + span;
      t.setAttribute('aria-pressed', String(on));
      t.classList.toggle('is-span', on && span > 1);
      t.classList.toggle('is-span-start', on && span > 1 && h === state.hour);
      t.classList.toggle('is-span-end', on && span > 1 && h === state.hour + span - 1);
    });
  }

  // Drag across the hours (mouse and pen; a tap picks one hour): 18:00 to 20:00 in one stroke.
  let drag = null;
  let dragged = false;
  function spanTo(h) {
    const from = drag.from;
    const dir = h >= from ? 1 : -1;
    let end = from;
    while (end !== h && isFree(end + dir)) end += dir; // stop at the first taken hour
    const lo = Math.min(from, end);
    state.hour = lo;
    state.game.minutes = (Math.abs(end - from) + 1) * 60;
    afterTime();
  }
  el.times.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const t = e.target.closest('.hud-time');
    if (!t || t.disabled) return;
    drag = { from: Number(t.dataset.hour), at: Number(t.dataset.hour) };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!(e.buttons & 1)) { drag = null; return; }
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.hud-time');
    if (!t || !el.times.contains(t)) return;
    const h = Number(t.dataset.hour);
    if (h === drag.at) return;
    drag.at = h;
    dragged = true;
    spanTo(h);
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (dragged) settle(el.times, true);
    drag = null;
    setTimeout(() => { dragged = false; }, 0); // swallow the click that ends the drag
  });

  /** A new hour or span: drop group courts that are not free for it, then redraw what depends on it. */
  function afterTime() {
    const before = state.group.length;
    state.group = state.group.filter((id) => fitsOn(byId(id), state.hour, state.game.minutes));
    markTimes();
    renderGroup();
    renderTotal();
    renderForecast();
    if (state.group.length !== before) onGroup?.(courts().map((c) => c.id));
  }

  const when = () => `${dayName(state.offset)}, ${dateFor(state.offset).getDate()}`;
  const planOf = () => state.member?.plan ?? null;
  const memberNote = () => (memberOff(planOf()) ? ` · ${PLAN[planOf()].name} price` : '');

  function renderTotal() {
    if (state.hour === null) {
      el.total.innerHTML = `<small>${when()}</small><b>Pick a time</b>`;
      el.book.disabled = true;
      return;
    }
    el.book.disabled = false;
    const n = courts().length;
    const { minutes } = state.game;
    if (n === 1 && minutes === 60) {
      const rate = rateFor(state.court.type, dateFor(state.offset), state.hour);
      const price = memberOff(planOf()) ? `$${Math.round(rate * (1 - memberOff(planOf())))} / hour <s><span class="visually-hidden">was </span>$${rate}</s>` : `$${rate} / hour`;
      el.total.innerHTML = `<small>${when()} · from ${fmtHour(state.hour)}${memberNote()}</small><b>${price}</b>`;
      return;
    }
    const bare = { ...defaultGame(state.court), minutes, towels: false };
    const { total, full } = priceOf(slot(), bare, null, { courts: n, member: planOf() });
    const what = [`${fmtHour(state.hour)}–${endOf(minutes)}`, n > 1 ? `${n} courts` : null].filter(Boolean).join(' · ');
    el.total.innerHTML = `<small>${when()} · ${what}${memberNote()}</small><b>$${total}${full > total ? ` <s><span class="visually-hidden">was </span>$${full}</s>` : ''}</b>`;
  }

  /** Row 11 and the weather-smart tip under it (round 10). */
  function renderForecast() {
    drawForecast();
    renderTip(el.tip, { court: state.court, offset: state.offset, hour: state.hour, minutes: state.game.minutes, fitsOn });
  }

  /** Row 11: "18:00 · 82°F · light breeze", and a plain warning when rain is likely. */
  function drawForecast() {
    const box = el.forecast;
    box.classList.remove('is-wet');
    if (state.hour === null) { box.innerHTML = '<span class="hud-forecast__line">Pick a time to see the forecast</span>'; box.classList.add('is-quiet'); return; }
    box.classList.remove('is-quiet');
    const f = forecastAt(state.offset, state.hour);
    if (!f) { box.innerHTML = `<span class="hud-forecast__line">${fmtHour(state.hour)} · forecast on its way</span>`; box.classList.add('is-quiet'); return; }
    const wet = isWet(f);
    box.classList.toggle('is-wet', wet);
    const line = `${fmtHour(state.hour)} · ${Math.round(f.temp)}°F · ${windWord(f.wind)}`;
    box.innerHTML = `<span class="hud-forecast__line">${line}</span><span class="hud-forecast__rain">${f.rain ? `Rain ${f.rain}%` : 'Dry'}</span>`
      + (wet ? `<span class="hud-forecast__note">Rain is likely. You can move it for free up to ${CANCEL.hours} hours before.</span>` : '');
  }

  // --- Group booking: courts next door (row 24) -----------------------------------------------

  function neighbours() {
    const members = courts();
    return COURTS
      .filter((c) => c.type === state.court.type && c.id !== state.court.id
        && (state.group.includes(c.id) || members.some((m) => Math.hypot(m.x - c.x, m.z - c.z) <= NEXT_DOOR)))
      .sort((a, b) => Math.hypot(a.x - state.court.x, a.z - state.court.z) - Math.hypot(b.x - state.court.x, b.z - state.court.z))
      .slice(0, 3);
  }

  function renderGroup() {
    const list = neighbours();
    el.group.hidden = !list.length;
    el.groupOpts.replaceChildren(...list.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      const on = state.group.includes(c.id);
      const ok = state.hour === null || fitsOn(c, state.hour, state.game.minutes);
      b.innerHTML = on ? c.label : `<span aria-hidden="true">+ </span>${c.label}`;
      b.disabled = !on && !ok;
      b.title = ok ? '' : `${c.label} is taken then`;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${c.label}${ok ? '' : ', taken at that time'}`);
      b.addEventListener('click', () => {
        state.group = on ? state.group.filter((id) => id !== c.id) : [...state.group, c.id];
        renderGroup();
        renderTotal();
        settle(el.groupOpts);
        onGroup?.(courts().map((x) => x.id)); // the drone frames them together
      });
      return b;
    }));
  }

  function renderPick() {
    renderDays();
    renderTimes();
    renderGroup();
    renderTotal();
    renderForecast();
  }

  /** The tile that just became selected settles with a small spring. */
  function settle(box, all = false) {
    if (still()) return;
    const cells = all ? box.querySelectorAll('[aria-pressed="true"]') : [box.querySelector('[aria-pressed="true"]')].filter(Boolean);
    if (cells.length) gsap.fromTo(cells, { scale: 0.9 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', stagger: 0.03, clearProps: 'transform' });
  }

  // --- Step 2: your game ------------------------------------------------------------------

  const slot = () => ({ court: state.court, offset: state.offset, hour: state.hour });
  const endOf = (minutes) => {
    const end = state.hour * 60 + minutes;
    return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  };
  const names = () => courts().map((c) => c.label).join(' + ');
  const summary = () => `${names()} · ${when()} · ${fmtHour(state.hour)}–${endOf(state.game.minutes)}`;
  const lengthLabel = (m) => (m > 120 ? `${m / 60} h` : `${m} min`);

  function seg(name, choices) {
    const box = el.opts.querySelector(`[data-opt="${name}"]`);
    box.replaceChildren(...choices.map(({ value, label, disabled }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = label;
      b.disabled = !!disabled;
      b.setAttribute('aria-pressed', String(state.game[name] === value));
      b.addEventListener('click', () => { state.game[name] = value; renderGame(); settle(box); });
      return b;
    }));
  }

  function renderGame() {
    const g = state.game;
    const fitsAll = (m) => courts().every((c) => fitsOn(c, state.hour, m));
    seg('minutes', durationsFor(g.minutes).map((m) => ({ value: m, label: lengthLabel(m), disabled: !fitsAll(m) })));
    seg('players', playerChoices(state.court).map((n) => ({ value: n, label: String(n) })));
    seg('balls', [{ value: 'own', label: 'My own' }, { value: 'new', label: `New can <small>+$${PRICES.balls}</small>` }]);
    seg('partner', [{ value: null, label: 'No' }, ...LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))]);
    renderKit(el.kit, g, renderGame, state.court.type); // round 10: ball kit & rental
    el.opts.querySelector('[data-rackets]').textContent = g.rackets;
    el.opts.querySelector('[data-rackets]').closest('.hud-field').querySelector('.hud-field__k small').textContent = racketPrice(state.court.type) ? `$${racketPrice(state.court.type)} each` : 'Padel rackets are free';
    el.opts.querySelector('[data-step="-1"]').disabled = g.rackets === 0;
    el.opts.querySelector('[data-step="1"]').disabled = g.rackets === 4;
    const adds = [
      ['coach', 'Add a coach', `$${COACH_RATE.from}–${COACH_RATE.to}, billed by the coach`],
      ['machine', 'Ball machine', `+$${PRICES.machine}`],
      ['towels', 'Towels & water', 'Free'],
    ];
    el.opts.querySelector('[data-opt="adds"]').replaceChildren(...adds.map(([key, label, price]) => {
      const t = tile('button', 'hud-add', `<span>${label}</span><small>${price}</small>`);
      t.setAttribute('aria-pressed', String(g[key]));
      t.addEventListener('click', () => { g[key] = !g[key]; renderGame(); });
      return t;
    }));
    renderSums();
  }

  const price = () => priceOf(slot(), state.game, state.promo, { courts: courts().length, member: planOf() });

  /** Totals on steps 2 and 3 and the Confirm button; a promo or the member price shows the old price struck through. */
  function renderSums() {
    const { total, full } = price();
    const shown = full > total ? `$${total} <s><span class="visually-hidden">was </span>$${full}</s>` : `$${total}`;
    const n = courts().length;
    const g = state.game;
    el.sums.forEach((s) => { s.textContent = summary(); });
    el.totals.forEach((t) => {
      t.innerHTML = `<small>${lengthLabel(g.minutes)} · ${g.players} ${g.players === 1 ? 'player' : 'players'}${n > 1 ? ` · ${n} courts` : ''}${memberNote()}</small><b>${shown}</b>`;
    });
    el.confirm.textContent = `Confirm · $${total}`;
  }

  el.opts.querySelector('[data-opt="rackets"]').addEventListener('click', (e) => {
    const step = Number(e.target.closest('[data-step]')?.dataset.step);
    if (!step) return;
    state.game.rackets = Math.min(4, Math.max(0, state.game.rackets + step));
    renderGame();
  });

  // --- Views and motion ----------------------------------------------------------------------

  /** Tiles assemble from squares of their own colour, top to bottom. */
  function assemble(view) {
    const tiles = [...view.querySelectorAll('.hud-tile')].filter((t) => !t.closest('[hidden]'));
    gsap.set(tiles, { autoAlpha: 1 });
    const tl = gsap.timeline();
    tiles.forEach((t, i) => {
      tl.add(pixelReveal(t, { cell: 8, color: getComputedStyle(t).backgroundColor, whole: true }), 0.04 + i * 0.022);
    });
    return tl;
  }

  function scatter(view) {
    const tiles = [...view.querySelectorAll('.hud-tile')];
    return gsap.to(tiles, { autoAlpha: 0, y: 14, scale: 0.94, duration: 0.22, ease: 'power2.in', stagger: { amount: 0.14, from: 'random' }, clearProps: 'transform' });
  }

  /** Swap step: the current tiles scatter, the next ones build. */
  function go(view) {
    if (view === state.view) return;
    const from = el.view[state.view];
    state.view = view;
    scatter(from).then(() => {
      VIEWS.forEach((v) => { el.view[v].hidden = v !== view; });
      gsap.set(el.view[view].querySelectorAll('.hud-tile'), { autoAlpha: 0 });
      assemble(el.view[view]);
      if (view === 'details') form.focusFirst();
    });
  }

  function show(view) {
    state.view = view;
    VIEWS.forEach((v) => { el.view[v].hidden = v !== view; });
  }

  // Slight parallax: rows sit at different depths and drift against the pointer.
  const onPointer = (e) => {
    if (e.pointerType !== 'mouse') return;
    const dx = (e.clientX / innerWidth - 0.5) * 2;
    const dy = (e.clientY / innerHeight - 0.5) * 2;
    el.root.querySelectorAll('[data-depth]').forEach((r) => {
      const d = Number(r.dataset.depth);
      gsap.to(r, { x: -dx * 9 * d, y: -dy * 6 * d, duration: 0.9, ease: 'power3.out', overwrite: 'auto' });
    });
  };

  function fillHead(court) {
    const s = SURFACES[court.type];
    el.type.textContent = s.type;
    el.title.textContent = court.label;
    el.meta.textContent = s.meta;
  }

  // --- API -----------------------------------------------------------------------------------

  /** `minutes`: a span picked on the dock's scrubber (row 21). */
  function open(courtId, { offset = 0, hour = null, minutes = 60 } = {}) {
    const court = COURTS.find((c) => c.id === courtId);
    if (!court) return;
    const switching = state.open && state.court?.id !== court.id;
    Object.assign(state, { court, offset, hour: null, game: defaultGame(court), group: [] });
    if (hour !== null && isFree(hour)) {
      state.hour = hour;
      if (minutes > 60 && fitsOn(court, hour, minutes)) state.game.minutes = minutes;
    }
    fillHead(court);
    renderPick();
    show('pick');
    loadForecast(); // lazily, the first time a court opens

    if (!state.open) {
      state.open = true;
      document.dispatchEvent(new CustomEvent('bp-hud', { detail: { open: true } })); // the cat popups step aside
      el.root.hidden = false;
      document.body.classList.add('hud-open');
      window.addEventListener('pointermove', onPointer);
      gsap.fromTo(el.back, { autoAlpha: 0, x: 12 }, { autoAlpha: 1, x: 0, duration: 0.7, delay: 0.5, ease: 'expo.out' });
      revealText(el.back.querySelector('.hud-back__text'), { delay: 0.5, duration: 0.35 });
      gsap.to(el.scrim, { opacity: 1, duration: 0.9, delay: 0.2, ease: 'power2.out', overwrite: true });
    }
    // Let the camera start its dive, then build the tiles over the court.
    gsap.set(el.view.pick.querySelectorAll('.hud-tile'), { autoAlpha: 0 });
    gsap.delayedCall(switching ? 0.35 : 0.75, () => assemble(el.view.pick));
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    document.dispatchEvent(new CustomEvent('bp-hud', { detail: { open: false } }));
    window.removeEventListener('pointermove', onPointer);
    document.body.classList.remove('hud-open');
    gsap.to(el.back, { autoAlpha: 0, x: 12, duration: 0.3, ease: 'power2.in' });
    gsap.to(el.scrim, { opacity: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
    scatter(el.view[state.view]).then(() => { el.root.hidden = true; });
    onBack?.();
  }

  function toGame() {
    if (state.hour === null) return;
    if (!courts().every((c) => fitsOn(c, state.hour, state.game.minutes))) state.game.minutes = 60;
    renderGame();
    go('game');
  }

  function confirm() {
    const { court, offset, hour, game } = state;
    const { total, full, discount, off } = price();
    const player = form.value();
    const ids = courts().map((c) => c.id);
    const first = String(player.name || '').trim().split(/\s+/)[0].slice(0, 16);
    const dayKey = dayKeyForOffset(offset);
    // Your booking on the map (round 7): the slot is held for this visit, and the court gets its sign.
    // Round 9: one booking per court of a group; the member mark and the partner flag ride along.
    const made = ids.map((courtId) => addSessionBooking({
      courtId, dayKey, hour, minutes: game.minutes, first,
      ...(player.card ? { member: true } : {}),
      ...(game.partner ? { partner: game.partner } : {}),
      ...(kitOf(game) ? { kit: kitOf(game) } : {}), // round 10: what waits on court (club/kit-marks.js)
      ...(ids.length > 1 ? { group: ids } : {}),
    }));
    made.forEach((b) => document.dispatchEvent(new CustomEvent('bp-booked', { detail: b })));
    const priceText = full > total ? `$${total} <s><span class="visually-hidden">was </span>$${full}</s>` : `$${total}`;
    const head = [
      [ids.length > 1 ? 'Courts' : 'Court', `${names()} · ${SURFACES[court.type].type}`],
      ['When', `${dayName(offset)}, ${dateFor(offset).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${fmtHour(hour)}–${endOf(game.minutes)}`],
      ['Game', describeGame(game)],
    ];
    const name = player.card ? `${player.name} · member` : player.name;
    // With a promo the code sits next to the total it lowered; an odd last row runs full width (CSS).
    const rows = discount
      ? [...head, ['Name', name], ['Promo', `${state.promo}, −${Math.round(off * 100)}%`], ['Total', priceText], ['Confirmation to', player.email]]
      : [...head, ['Total', priceText], ['Name', name], ['Confirmation to', player.email]];
    el.ticket.replaceChildren(...rows.map(([k, v]) => tile('div', 'hud-ticket__row', `<dt>${k}</dt><dd>${v}</dd>`)));
    el.view.done.dataset.ics = JSON.stringify({ label: names(), offset, hour, minutes: game.minutes });
    state.last = { ids, offset, hour, minutes: game.minutes, first, dayKey, extra: { ...(player.card ? { member: true } : {}), ...(game.partner ? { partner: game.partner } : {}), ...(kitOf(game) ? { kit: kitOf(game) } : {}) } };
    prepareMore();
    go('done');
    gsap.delayedCall(0.3, () => {
      const tick = el.view.done.querySelector('.hud-check path');
      gsap.fromTo(tick, { strokeDashoffset: 40 }, { strokeDashoffset: 0, duration: 0.5, delay: 0.45, ease: 'power2.out' });
    });
    onBooked?.({ ...made[0], group: ids });
  }

  // --- After booking: invite a friend (row 6), same time next week (row 8) ---------------------------

  function setMore(btn, label, sub, { pressed = false, disabled = false } = {}) {
    btn.querySelector('[data-label]').textContent = label;
    btn.querySelector('[data-sub]').textContent = sub;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.disabled = disabled;
  }
  const pop = (btn) => { if (!still()) gsap.fromTo(btn, { scale: 0.94 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', clearProps: 'transform' }); };
  const longDay = (offset) => dateFor(offset).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  /** Next week's slot: the same hour if every court is free then, else the nearest hour that is. */
  function againSlot() {
    const { ids, offset, hour, minutes } = state.last;
    const ok = (h) => ids.every((id) => fitsOn(byId(id), h, minutes, offset + 7));
    const order = HOURS.slice().sort((a, b) => Math.abs(a - hour) - Math.abs(b - hour) || a - b);
    const h = order.find(ok);
    return h === undefined ? null : { offset: offset + 7, hour: h, same: h === hour };
  }

  function prepareMore() {
    setMore(el.invite, 'Invite a friend', 'A link that opens the map on your court');
    const next = againSlot();
    if (!next) setMore(el.again, 'Same time next week', 'Fully booked that day', { disabled: true });
    else if (next.same) setMore(el.again, 'Same time next week', `${longDay(next.offset)} · ${fmtHour(next.hour)}`);
    else setMore(el.again, 'Same court next week', `${fmtHour(state.last.hour)} is taken, book ${fmtHour(next.hour)}`);
  }

  async function invite() {
    const { ids, dayKey, hour, first } = state.last;
    const url = inviteUrl({ courtId: ids[0], dayKey, hour, first });
    const text = `${first || 'I'} booked ${byId(ids[0]).label} at Break Point, ${fmtHour(hour)}. Join me:`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'Break Point, Miami', text, url }); setMore(el.invite, 'Invite sent', 'Your friend lands on your court', { pressed: true }); pop(el.invite); return; } catch { /* closed the sheet: copy instead */ }
    }
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch {
      const t = document.createElement('textarea');
      t.value = url;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
      document.body.append(t);
      t.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      t.remove();
    }
    el.invite.dataset.url = url;
    setMore(el.invite, copied ? 'Link copied' : 'Your link', copied ? 'Paste it to your partner' : url, { pressed: copied });
    pop(el.invite);
  }

  function bookAgain() {
    const next = againSlot();
    if (!next) return;
    const { ids, minutes, first, extra } = state.last;
    const dayKey = dayKeyForOffset(next.offset);
    ids.forEach((courtId) => addSessionBooking({ courtId, dayKey, hour: next.hour, minutes, first, ...extra, ...(ids.length > 1 ? { group: ids } : {}) }));
    document.dispatchEvent(new CustomEvent('bp-booked-again', { detail: { ids, dayKey, hour: next.hour } }));
    setMore(el.again, 'Booked for next week', `${longDay(next.offset)} · ${fmtHour(next.hour)}`, { pressed: true, disabled: true });
    pop(el.again);
  }

  function downloadIcs() {
    const { label, offset, hour, minutes = 60 } = JSON.parse(el.view.done.dataset.ics || '{}');
    if (!label) return;
    const d = dateFor(offset);
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const stamp = (m) => `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Break Point//Booking//EN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@breakpoint.club`, `DTSTART:${stamp(hour * 60)}`, `DTEND:${stamp(hour * 60 + minutes)}`,
      `SUMMARY:Tennis on ${label}, Break Point`, 'LOCATION:2150 Bayshore Drive, Miami, FL 33133', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `break-point-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  el.back.addEventListener('click', close);
  el.scrim.addEventListener('click', close);
  el.finish.addEventListener('click', close);
  el.book.addEventListener('click', toGame);
  q('[data-hud-next2]').addEventListener('click', () => { renderSums(); go('details'); });
  q('[data-hud-prev]').addEventListener('click', () => { renderPick(); go('pick'); });
  q('[data-hud-prev2]').addEventListener('click', () => { renderGame(); go('game'); });
  el.ics.addEventListener('click', downloadIcs);
  el.invite.addEventListener('click', invite);
  el.again.addEventListener('click', bookAgain);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  el.scrim.addEventListener('wheel', (e) => e.preventDefault(), { passive: false }); // the map stays put
  document.addEventListener('bp-forecast', () => { if (state.open && state.view === 'pick') renderForecast(); });
  // The weather-smart tip (round 10) moves the game to a nearby hour; a move to another court goes through the page (`bp-open-court`).
  document.addEventListener('bp-tip-time', (e) => {
    const hour = e.detail?.hour;
    if (!state.open || state.view !== 'pick' || !HOURS.includes(hour) || !isFree(hour)) return;
    state.hour = hour;
    if (!fitsOn(state.court, hour, state.game.minutes)) state.game.minutes = 60;
    afterTime();
    settle(el.times);
  });

  return { open, close, isOpen: () => state.open, current: () => state.court, group: () => (state.court ? courts().map((c) => c.id) : []) };
}
