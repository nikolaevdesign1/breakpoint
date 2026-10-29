import { HOURS, isOpenHour, dayKeyForOffset } from '../shared/availability.js';
import { miamiNow, sunElevation, fmtClock } from './miami-clock.js';
import { hourScore, sunsetHour, miamiDay } from './forecast.js';

// Time scrubber in the dock (round 7): 24 hour cells on a hairline track, brighter while the sun is
// up, taller while the club is open. Drag or click to pick an hour, arrows step through them, "Now"
// goes back to the live Miami clock. The map (light, floodlights, rallies, court tint) follows.
//
// Round 9:
// - Best time (row 9): a 2px band along the top of the open hours, brighter where the hour is quiet
//   (courts free), cooler (Open-Meteo forecast) and without a low sun in the eyes; hovering an hour
//   says why. The three best bookable hours are solid.
// - Sunset (row 12): a small half sun sits on the band at the sunset minute. Hovering it shows the
//   map in that light for as long as the pointer stays (onPreview), a click picks that hour.
// - Several hours (row 21): a drag across the track selects a span (18:00 to 20:00); Shift + arrows
//   stretch it from the keyboard. The dock offers to book it (onRange).

const CELL = 8; // px per hour
const ICONS = {
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  low: '<path d="M1.5 11.5h13M4.5 11.5a3.5 3.5 0 0 1 7 0M8 4.5V6M3.2 6.7l1 1M12.8 6.7l-1 1"/>',
  moon: '<path d="M12.5 10.2A5.2 5.2 0 0 1 5.8 3.5a5.2 5.2 0 1 0 6.7 6.7z"/>',
};
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

export function createTimeScrubber(root, { onPick, onNow, onRange, onPreview, isPast = () => false }) {
  const track = root.querySelector('[data-time-track]');
  const thumb = root.querySelector('[data-time-thumb]');
  const label = root.querySelector('[data-time-label]');
  const icon = root.querySelector('[data-time-icon]');
  const reset = root.querySelector('[data-time-reset]');

  const cells = Array.from({ length: 24 }, (_, h) => {
    const c = document.createElement('i');
    c.className = 'dock__cell';
    if (HOURS.includes(h)) c.classList.add('is-open');
    track.insertBefore(c, thumb);
    return c;
  });

  // Best-time band, span bar and sunset mark live on the track too (absolutely placed).
  const band = document.createElement('span');
  band.className = 'dock__band';
  band.setAttribute('aria-hidden', 'true');
  const segs = HOURS.map((h) => {
    const s = document.createElement('i');
    s.style.left = `${h * CELL}px`;
    band.append(s);
    return s;
  });
  const span = document.createElement('span');
  span.className = 'dock__span';
  span.setAttribute('aria-hidden', 'true');
  const sunset = document.createElement('button');
  sunset.type = 'button';
  sunset.className = 'dock__sunset';
  sunset.innerHTML = '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5.5a4 4 0 0 1 8 0z"/></svg>';
  const tip = document.createElement('span');
  tip.className = 'dock__tip';
  tip.setAttribute('role', 'status');
  track.append(band, span, sunset);
  root.append(tip);

  let shown = { hour: 0, live: true, offset: 0 };
  let range = null; // { from, to } inclusive hours
  let scores = new Map();
  let sunsetAt = 19;

  // Daylight cells for the day on show (sunrise and sunset move through the year).
  function paintDay(offset) {
    const day = miamiDay(offset);
    const key = dayKeyForOffset(offset);
    cells.forEach((c, h) => c.classList.toggle('is-open', isOpenHour(key, h)));
    cells.forEach((c, h) => c.classList.toggle('is-day', sunElevation(day, h + 0.5).elevation > -2));
    return day;
  }

  /** Row 9: shade the band by how good each hour is; the best three bookable hours go solid. */
  function paintBand(offset) {
    scores = new Map(HOURS.map((h) => [h, hourScore(offset, h)]));
    const open = HOURS.filter((h) => !isPast(offset, h));
    const best = new Set(open.slice().sort((a, b) => scores.get(b).score - scores.get(a).score).slice(0, 3));
    HOURS.forEach((h, i) => {
      const past = !open.includes(h);
      const s = scores.get(h);
      segs[i].style.opacity = past ? '0.12' : (0.18 + 0.62 * s.score).toFixed(2);
      segs[i].classList.toggle('is-best', best.has(h));
      s.best = best.has(h);
      s.past = past;
    });
    // Row 12: the sunset minute on the same line.
    sunsetAt = sunsetHour(offset);
    sunset.style.transform = `translateX(${Math.round(sunsetAt * CELL) - 8}px)`;
    sunset.setAttribute('aria-label', `Sunset at ${fmtClock(sunsetAt)}. Preview the light, or pick that hour`);
  }

  function why(h) {
    const s = scores.get(h);
    if (!s) return hh(h);
    if (s.past) return `${hh(h)} · ${isOpenHour(dayKeyForOffset(shown.offset), h) ? 'gone for today' : 'closed'}`;
    const sun = s.glare ? 'low sun, some glare' : s.sunUp ? 'no glare' : 'under the lights';
    const parts = [s.best ? 'Best time' : null, `${s.free} courts free`, s.temp === null ? null : `${s.temp}°F`, sun, s.rain >= 40 ? `rain ${s.rain}%` : null];
    return `${hh(h)} · ${parts.filter(Boolean).join(', ')}`;
  }

  function showTip(text, x) {
    tip.textContent = text;
    const left = track.offsetLeft + x;
    tip.style.setProperty('--x', `${Math.round(left)}px`);
    tip.classList.add('is-on');
  }
  const hideTip = () => tip.classList.remove('is-on');

  function paintRange() {
    span.classList.toggle('is-on', !!range);
    cells.forEach((c, h) => c.classList.toggle('is-span', !!range && h >= range.from && h <= range.to));
    if (range) {
      span.style.transform = `translateX(${range.from * CELL}px)`;
      span.style.width = `${(range.to - range.from + 1) * CELL}px`;
    }
  }

  /** Clamp a span to bookable hours; null when it is less than two of them. */
  function clampRange(a, b, offset) {
    let from = Math.min(a, b);
    let to = Math.max(a, b);
    from = Math.max(from, HOURS[0]);
    to = Math.min(to, HOURS[HOURS.length - 1]);
    while (from <= to && isPast(offset, from)) from++;
    return to - from >= 1 ? { from, to } : null;
  }

  function setRange(next, notify = true) {
    const same = (range && next && range.from === next.from && range.to === next.to) || (!range && !next);
    range = next;
    paintRange();
    if (notify && !same) onRange?.(range);
  }

  /** Shows an hour (live: the clock's exact time). */
  function render({ hour, live, offset }) {
    const day = paintDay(offset);
    if (offset !== shown.offset || !scores.size) paintBand(offset);
    if (offset !== shown.offset || live) setRange(null);
    const time = live ? miamiNow().hours : hour + 0.5;
    const first = !thumb.style.transform;
    thumb.classList.toggle('is-instant', first);
    thumb.style.transform = `translateX(${Math.round((live ? time : hour + 0.5) * CELL) - 1}px)`;
    label.textContent = live ? fmtClock(time) : `${String(hour).padStart(2, '0')}:00`;
    const e = sunElevation(day, time).elevation;
    icon.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${ICONS[e > 6 ? 'sun' : e > -6 ? 'low' : 'moon']}</svg>`;
    cells.forEach((c, h) => c.classList.toggle('is-on', h === hour));
    track.setAttribute('aria-valuenow', String(hour));
    track.setAttribute('aria-valuetext', `${label.textContent}${live ? ', now' : ''}`);
    reset.tabIndex = live ? -1 : 0; // stays in the layout (visibility only), so the track never shifts under the pointer
    root.classList.toggle('is-live', live);
    shown = { hour, live, offset };
  }

  // --- Pointer: press anywhere on the track, drag through the hours (and select them, row 21) ---
  const hourAt = (x) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(23, Math.floor((x - r.left) / CELL)));
  };
  let dragging = null; // { from }
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.dock__sunset')) return;
    const h = hourAt(e.clientX);
    dragging = { from: h };
    track.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    setRange(null, false);
    if (h !== shown.hour || shown.live) onPick(h);
  });
  track.addEventListener('pointermove', (e) => {
    const h = hourAt(e.clientX);
    cells.forEach((c, i) => c.classList.toggle('is-hover', i === h));
    if (e.pointerType === 'mouse' && !e.target.closest('.dock__sunset')) showTip(dragging && range ? `${hh(range.from)}–${hh(range.to + 1)} · let go to book` : why(h), h * CELL + CELL / 2);
    if (!dragging) return;
    if (h !== shown.hour || shown.live) onPick(h);
    const r = clampRange(dragging.from, h, shown.offset);
    range = r;
    paintRange();
  });
  const end = () => {
    if (!dragging) return;
    dragging = null;
    root.classList.remove('is-dragging');
    const r = range;
    range = null;
    setRange(r);
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('pointerleave', () => { cells.forEach((c) => c.classList.remove('is-hover')); if (!dragging) hideTip(); });

  // --- Keys (Shift stretches a span) ---
  track.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -3, PageUp: 3 }[e.key];
    if (step && e.shiftKey && Math.abs(step) === 1) {
      e.preventDefault();
      const anchor = range ? (step > 0 ? range.from : range.to) : shown.hour;
      const tip2 = range ? (step > 0 ? range.to + 1 : range.from - 1) : shown.hour + step;
      const r = clampRange(anchor, tip2, shown.offset);
      if (r) setRange(r);
      return;
    }
    let h = null;
    if (step) h = Math.max(0, Math.min(23, shown.hour + step));
    else if (e.key === 'Home') h = HOURS[0];
    else if (e.key === 'End') h = HOURS[HOURS.length - 1];
    else if (e.key === 'Escape' && range) { setRange(null); return; }
    if (h === null) return;
    e.preventDefault();
    setRange(null);
    onPick(h);
  });

  // --- Sunset: hover or focus previews the light, a click picks that hour ---
  let previewing = false;
  const startPreview = () => {
    if (previewing) return;
    previewing = true;
    sunset.classList.add('is-on');
    showTip(`Sunset ${fmtClock(sunsetAt)} · the courts in that light`, sunsetAt * CELL);
    onPreview?.(sunsetAt);
  };
  const endPreview = () => {
    if (!previewing) return;
    previewing = false;
    sunset.classList.remove('is-on');
    hideTip();
    onPreview?.(null);
  };
  sunset.addEventListener('pointerenter', startPreview);
  sunset.addEventListener('pointerleave', endPreview);
  sunset.addEventListener('focus', startPreview);
  sunset.addEventListener('blur', endPreview);
  sunset.addEventListener('pointerdown', (e) => e.stopPropagation());
  sunset.addEventListener('click', () => {
    previewing = false; // the pick keeps the light, nothing to restore
    sunset.classList.remove('is-on');
    hideTip();
    onPreview?.(null, true);
    onPick(Math.floor(sunsetAt));
  });

  reset.addEventListener('click', () => onNow());
  document.addEventListener('bp-forecast', () => paintBand(shown.offset));
  document.addEventListener('bp-booked', () => paintBand(shown.offset));

  return { render, range: () => range, clearRange: () => setRange(null), repaint: () => paintBand(shown.offset) };
}
