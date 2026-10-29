import { COURTS, dayKeyForOffset } from '../../shared/availability.js';
import { sessionBookings } from '../../shared/session-bookings.js';
import { fmtHour } from '../../shared/slot-ui.js';
import { miamiNow } from '../miami-clock.js';

// Countdown to today's game (round 9, row 22). With a booking for today, the top bar gains a plate:
// "Your game in 2 h 14 min" (Miami time; `?time=` pins it for previews). A click flies to the court's
// board. From ten minutes before the start the plate pulses and the board on the court blinks
// (interact/booked-sign.js listens to `bp-sign-blink`); during the game it reads "Your game is on".

const SOON = 10; // minutes

function nextGame() {
  const today = dayKeyForOffset(0);
  const now = miamiNow().hours;
  return sessionBookings()
    .filter((b) => b.dayKey === today && b.hour + (b.minutes || 60) / 60 > now)
    .sort((a, b) => a.hour - b.hour)[0] ?? null;
}

function inWords(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function initCountdown() {
  const bar = document.querySelector('.bp-right');
  if (!bar) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bp-countdown';
  btn.hidden = true;
  btn.innerHTML = '<span class="bp-countdown__k">Your game </span><span data-left></span>';
  bar.insertBefore(btn, bar.firstChild);
  const left = btn.querySelector('[data-left]');
  let blinkOn = null; // court id blinking now

  // Sent on every update while it is soon: the boards may be built after the first one (life starts late).
  function blink(id) {
    if (blinkOn && blinkOn !== id) document.dispatchEvent(new CustomEvent('bp-sign-blink', { detail: { courtId: blinkOn, on: false } }));
    blinkOn = id;
    if (id) document.dispatchEvent(new CustomEvent('bp-sign-blink', { detail: { courtId: id, on: true } }));
  }

  function update() {
    const g = nextGame();
    if (!g) { btn.hidden = true; blink(null); return; }
    const wasHidden = btn.hidden;
    btn.hidden = false;
    const now = miamiNow().hours;
    const min = Math.ceil((g.hour - now) * 60);
    const court = COURTS.find((c) => c.id === g.courtId);
    btn.dataset.court = g.courtId;
    if (min > 0) {
      left.textContent = `in ${inWords(min)}`;
      btn.setAttribute('aria-label', `Your game on ${court?.label} starts at ${fmtHour(g.hour)}, in ${inWords(min)}. Show the court`);
    } else {
      const end = g.hour * 60 + (g.minutes || 60);
      left.textContent = `is on · until ${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      btn.setAttribute('aria-label', `Your game on ${court?.label} is on. Show the court`);
    }
    const soon = min > 0 && min <= SOON;
    btn.classList.toggle('is-soon', soon);
    blink(soon ? g.courtId : null);
    if (wasHidden) btn.animate?.([{ transform: 'translateY(-8px) scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  }

  btn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('bp-sign-focus', { detail: { courtId: btn.dataset.court } })));
  ['bp-booked', 'bp-booked-again', 'bp-clock'].forEach((e) => document.addEventListener(e, update));
  setInterval(update, 5000);
  update();
  return { update };
}
