// Opening hours in Miami time (row 118): "Open now · closes at 11 PM", a ticking clock and today's
// line in the hours list. Everything is computed in America/New_York, whatever the visitor's zone.

import { hoursOn, hourText } from '../shared/club-facts.js';

const TZ = 'America/New_York';

const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
const ZONE = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' });
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function miamiNow(date = new Date()) {
  const p = Object.fromEntries(PARTS.formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: DAYS.indexOf(p.weekday), h: +p.hour % 24, m: +p.minute, s: +p.second };
}

export function clubStatus(now = miamiNow()) {
  const [opens, closes] = hoursOn(now.day);
  const min = now.h * 60 + now.m;
  if (min >= opens * 60 && min < closes * 60) {
    const soon = closes * 60 - min <= 60;
    return { open: true, soon, text: `${soon ? 'Closing soon' : 'Open now'} · closes at ${hourText(closes)}` };
  }
  if (min < opens * 60) return { open: false, text: `Closed · opens at ${hourText(opens)}` };
  return { open: false, text: `Closed · opens tomorrow at ${hourText(hoursOn((now.day + 1) % 7)[0])}` };
}

// Each character of the clock sits in its own slot; a changed digit rolls in from below.
function renderClock(el, text) {
  const slots = el.children;
  if (slots.length !== text.length) {
    el.innerHTML = [...text].map((ch) => `<span class="clock__ch">${ch}</span>`).join('');
    return;
  }
  [...text].forEach((ch, i) => {
    const slot = slots[i];
    if (slot.textContent === ch) return;
    slot.textContent = ch;
    slot.classList.remove('is-tick');
    void slot.offsetWidth; // restart the roll
    slot.classList.add('is-tick');
  });
}

export function initClubStatus(root = document) {
  const box = root.querySelector('[data-club-status]');
  const clock = root.querySelector('[data-clock]');
  const hours = [...root.querySelectorAll('[data-hours] [data-days]')];
  if (!box && !clock && !hours.length) return;
  const zone = root.querySelector('[data-tz]');
  if (zone) zone.textContent = ZONE.formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';

  let lastMinute = -1;
  const tick = () => {
    const date = new Date();
    if (clock) renderClock(clock, CLOCK.format(date));
    const now = miamiNow(date);
    if (now.m === lastMinute) return;
    lastMinute = now.m;
    const status = clubStatus(now);
    if (box) {
      box.querySelector('[data-status-text]').textContent = status.text;
      box.classList.toggle('is-open', status.open);
      box.classList.toggle('is-soon', Boolean(status.soon));
    }
    hours.forEach((li) => {
      li.classList.toggle('is-today', li.dataset.days.split(',').map(Number).includes(now.day));
    });
  };
  tick();
  setInterval(tick, 1000);
}
