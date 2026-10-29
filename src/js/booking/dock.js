import gsap from 'gsap';
import { COURTS, HOURS, hoursOn, isOpenHour, isSlotTaken, dayKeyForOffset } from '../shared/availability.js';
import { fmtHour, dayName, dateFor, weekday, DAYS_AHEAD } from '../shared/slot-ui.js';
import { pixelReveal } from './pixel-reveal.js';
import { miamiNow, miamiHour } from './miami-clock.js';
import { setHourState, hourState } from './hour-state.js';
import { createTimeScrubber } from './time-scrubber.js';
import { fits } from './extras.js';
import { playedCourts } from '../shared/session-bookings.js';
import { loadForecast } from './forecast.js';
import { createRangePlate } from './flow/range-plate.js';

// Bottom dock: surface filter, day stepper, live count and a "next free" shortcut.
// It owns the filter state and tells the scene which courts to fade.

export function createDock({ onChange, onNext }) {
  const root = document.querySelector('[data-dock]');
  // hour: the hour picked on the time scrubber; live: following the Miami clock (round 7).
  const state = { filter: 'all', offset: 0, hour: null, live: true };

  let filters = root.querySelectorAll('[data-filter]');
  const dayLabel = root.querySelector('[data-day-label]');
  const count = root.querySelector('[data-count]');
  const next = root.querySelector('[data-next]');
  const nextLabel = root.querySelector('[data-next-label]');

  // Hour the dock talks about (round 7): the scrubber's, else the hour it is now in Miami. The map
  // shows the same hour: its light, its floodlights, its rallies, its busy courts.
  const shownHour = () => (state.live ? miamiHour() : state.hour);
  function focusHour() {
    const h = shownHour();
    return isOpenHour(dayKeyForOffset(state.offset), h) ? h : null;
  }
  const scrubber = createTimeScrubber(root.querySelector('[data-time]'), {
    onPick: (hour) => { state.hour = hour; state.live = false; update(); },
    onNow: () => { state.live = true; update(); },
    onRange: (r) => { state.range = r; plate.show(r && rangeInfo(r)); }, // round 9 row 21
    onPreview: preview, // round 9 row 12
    isPast: (offset, h) => (offset === 0 && h <= miamiHour()) || !isOpenHour(dayKeyForOffset(offset), h),
  });

  // Round 9 (row 21): a span dragged on the scrubber; the plate over the dock offers a court free for all of it.
  state.range = null;
  const plate = createRangePlate(root, { onBook: () => { const n = rangeCourt(); if (n) onNext?.(n); }, onClear: () => scrubber.clearRange() });
  function rangeCourt() {
    const r = state.range;
    if (!r) return null;
    const minutes = (r.to - r.from + 1) * 60;
    const court = COURTS.find((c) => matches(c) && fits({ court: c, offset: state.offset, hour: r.from }, minutes));
    return court ? { court, offset: state.offset, hour: r.from, minutes } : null;
  }
  function rangeInfo(r) {
    const minutes = (r.to - r.from + 1) * 60;
    const free = COURTS.filter((c) => matches(c) && fits({ court: c, offset: state.offset, hour: r.from }, minutes)).length;
    return { ...r, hours: r.to - r.from + 1, free };
  }

  // Round 9 (row 12): hovering the sunset mark shows the map in that light, then puts it back.
  let held = null;
  function preview(time, keep = false) {
    if (time !== null) {
      held ??= { ...hourState };
      setHourState({ ...held, hour: Math.floor(time), time, live: false });
    } else if (held) {
      const back = held;
      held = null;
      if (!keep) setHourState(back);
    }
  }
  // The live clock moves on: follow it across the hour (and a pinned preview time, ?time= / __bp.setTime).
  let lastLiveHour = miamiHour();
  setInterval(() => { if (state.live && miamiHour() !== lastLiveHour) update(); }, 20000);
  document.addEventListener('bp-clock', () => { if (state.live) update(); });

  // Round 9 (row 23): "Played before" keeps the courts this visitor has booked.
  const matches = (c) => state.filter === 'all' || (state.filter === 'played' ? playedCourts().has(c.id) : c.type === state.filter);
  const playedBtn = document.createElement('button');
  playedBtn.type = 'button';
  playedBtn.className = 'dock__item dock__filter dock__filter--played';
  playedBtn.dataset.filter = 'played';
  playedBtn.dataset.dockItem = '';
  playedBtn.textContent = 'Played before';
  playedBtn.setAttribute('aria-pressed', 'false');
  root.querySelector('.dock__filters').append(playedBtn);
  const syncPlayed = () => {
    playedBtn.hidden = playedCourts().size === 0;
    if (playedBtn.hidden && state.filter === 'played') state.filter = 'all';
  };
  syncPlayed();

  function nextFree() {
    for (let offset = state.offset; offset < DAYS_AHEAD; offset++) {
      const dayKey = dayKeyForOffset(offset);
      for (const hour of HOURS) {
        if (offset === 0 && hour <= miamiHour()) continue;
        const court = COURTS.find((c) => matches(c) && !isSlotTaken(c.id, dayKey, hour));
        if (court) return { court, offset, hour };
      }
    }
    return null;
  }

  function update() {
    filters = root.querySelectorAll('[data-filter]');
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    const d = dateFor(state.offset);
    dayLabel.textContent = state.offset < 2 ? dayName(state.offset) : `${weekday(state.offset)} ${d.getDate()}`;
    root.querySelector('[data-day-step="-1"]').disabled = state.offset === 0;
    root.querySelector('[data-day-step="1"]').disabled = state.offset === DAYS_AHEAD - 1;

    const hour = focusHour();
    const dayKey = dayKeyForOffset(state.offset);
    const pool = COURTS.filter(matches);
    const free = hour === null ? [] : pool.filter((c) => !isSlotTaken(c.id, dayKey, hour));
    const at = shownHour();
    count.innerHTML = hour !== null
      ? `<b>${free.length}</b> free ${state.live ? 'now' : `at ${fmtHour(hour)}`}`
      : state.live ? `Opens at ${fmtHour(hoursOn(dayKey)[0])}` : `Closed at ${fmtHour(at)}`;

    const n = nextFree();
    nextLabel.innerHTML = n
      ? `<span class="dock__next-court">${n.court.label} · </span>${n.offset ? weekday(n.offset) + ' ' : ''}${fmtHour(n.hour)}`
      : 'Fully booked';
    next.disabled = !n;

    // Fade what doesn't match the filter or is busy at the focus hour.
    const taken = (c) => hour !== null && isSlotTaken(c.id, dayKey, hour);
    const faded = COURTS.filter((c) => !matches(c) || taken(c)).map((c) => c.id);
    const busy = COURTS.filter((c) => matches(c) && taken(c)).map((c) => c.id); // a softer tint than filtered out
    onChange?.({ ...state, faded, busy, pool, next: n });
    lastLiveHour = miamiHour();
    scrubber.render({ hour: at, live: state.live, offset: state.offset });
    setHourState({ offset: state.offset, dayKey, hour: at, time: state.live ? miamiNow().hours : at + 0.5, live: state.live });
    document.dispatchEvent(new CustomEvent('bp-day', { detail: { offset: state.offset } })); // round 7: life/tournament.js
  }

  /** Entrance: the bar slides up, then each item assembles from squares, left to right. */
  function reveal() {
    const items = [...root.querySelectorAll('[data-dock-item]')].filter((el) => el.offsetParent);
    const tl = gsap.timeline();
    tl.set(root, { autoAlpha: 1 })
      .fromTo(root, { yPercent: 160 }, { yPercent: 0, duration: 0.9, ease: 'expo.out' });
    items.forEach((el, i) => tl.add(pixelReveal(el), 0.35 + i * 0.07));
    return tl;
  }

  root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; update(); }));
  document.addEventListener('bp-booked', () => { const was = playedBtn.hidden; syncPlayed(); if (was && !playedBtn.hidden) playedBtn.animate?.([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); scrubber.clearRange(); });
  document.addEventListener('bp-booked-again', () => update());
  setTimeout(loadForecast, 1500); // round 9: the best-time band fills in once the forecast is here
  root.querySelectorAll('[data-day-step]').forEach((b) => b.addEventListener('click', () => {
    state.offset = Math.min(DAYS_AHEAD - 1, Math.max(0, state.offset + Number(b.dataset.dayStep)));
    update();
  }));
  next.addEventListener('click', () => { const n = nextFree(); if (n) onNext?.(n); });

  /** The slot the scrubber points at, when it is one that can still be booked (else null). */
  function pickedSlot() {
    if (state.range) return { offset: state.offset, hour: state.range.from, minutes: (state.range.to - state.range.from + 1) * 60 }; // round 9 row 21
    if (state.live || !isOpenHour(dayKeyForOffset(state.offset), state.hour)) return null;
    if (state.offset === 0 && state.hour <= miamiHour()) return null;
    return { offset: state.offset, hour: state.hour };
  }

  return { update, reveal, state, focusHour, pickedSlot };
}
