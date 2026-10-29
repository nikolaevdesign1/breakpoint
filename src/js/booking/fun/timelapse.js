import '../../../css/booking-mapsound.css';
import { hourState, setHourState } from '../hour-state.js';
import { fmtClock, miamiNow } from '../miami-clock.js';

// Timelapse (round 9, row 34): a small play button on the dock's time bar runs a whole day over the
// club in about 20 seconds, from the hour on the map round to the same hour the next day: the sun
// comes up, the courts fill, the sunset, the floodlights and the café lights, the night. It drives
// the same hour state as the scrubber (hour-state.js `bp-hour`, with `instant` so the light jumps
// with it instead of easing), moves the scrubber's thumb along, then puts the map back exactly as
// it was. Any input (a press, a key, the wheel) stops it there.

const DAY_SECONDS = 20;
const STEP = 0.15; // h between updates (about eight a second)
const CELL = 8; // px per hour on the scrubber (time-scrubber.js)
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.6 2.6l1.3 3.6 3.5-1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.6 5.6l3.6 2.4-3.6 2.4z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="6" height="6" fill="currentColor"/></svg>';

export function initTimelapse(root = document.querySelector('[data-time]')) {
  if (!root) return null;
  const thumb = root.querySelector('[data-time-thumb]');
  const label = root.querySelector('[data-time-label]');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dock__lapse';
  btn.innerHTML = ICON_PLAY;
  btn.setAttribute('aria-label', 'Play a whole day in 20 seconds');
  btn.setAttribute('aria-pressed', 'false');
  btn.dataset.cursor = 'Play the day';
  root.querySelector('[data-time-reset]')?.before(btn);

  let run = null; // { held, from, start, lastSent, thumb, label, raf }
  let stoppedAt = 0;

  function frame() {
    if (!run) return;
    const p = Math.min(1, (performance.now() - run.start) / (DAY_SECONDS * 1000));
    const time = run.from + 24 * p;
    const shown = ((time % 24) + 24) % 24;
    thumb.style.transform = `translateX(${Math.round(shown * CELL) - 1}px)`;
    label.textContent = fmtClock(shown);
    if (Math.abs(time - run.lastSent) >= STEP || p >= 1) {
      run.lastSent = time;
      setHourState({ ...run.held, hour: Math.floor(shown), time: shown, live: false, instant: true });
    }
    if (p >= 1) { stop(true); return; }
    run.raf = requestAnimationFrame(frame);
  }

  const onInput = (e) => {
    if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    if (btn.contains(e.target)) stoppedAt = performance.now(); // the button's own press: no restart on its click
    stop(false);
  };
  const INPUTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];

  function start() {
    if (run) return;
    const held = { ...hourState, instant: false };
    const from = held.live || held.time == null ? miamiNow().hours : held.time;
    run = { held, from, start: performance.now(), lastSent: -99, thumb: thumb.style.transform, label: label.textContent, raf: 0 };
    root.classList.add('is-lapse');
    btn.classList.add('is-on');
    btn.innerHTML = ICON_STOP;
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Stop the day');
    btn.dataset.cursor = 'Stop';
    INPUTS.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: true }));
    document.dispatchEvent(new CustomEvent('bp-timelapse', { detail: { on: true } }));
    run.raf = requestAnimationFrame(frame);
  }

  function stop(done) {
    if (!run) return;
    const r = run;
    run = null;
    cancelAnimationFrame(r.raf);
    INPUTS.forEach((t) => window.removeEventListener(t, onInput, { capture: true }));
    // Back to the hour that was on the map (a full day on, the light is where it started).
    setHourState({ ...r.held, instant: !!done });
    hourState.instant = false;
    thumb.style.transform = r.thumb;
    label.textContent = r.label;
    root.classList.remove('is-lapse');
    btn.classList.remove('is-on');
    btn.innerHTML = ICON_PLAY;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Play a whole day in 20 seconds');
    btn.dataset.cursor = 'Play the day';
    document.dispatchEvent(new CustomEvent('bp-timelapse', { detail: { on: false, done: !!done } }));
  }

  btn.addEventListener('click', () => {
    if (performance.now() - stoppedAt < 600) return;
    if (run) stop(false); else start();
  });

  return { start, stop: () => stop(false), running: () => !!run };
}
