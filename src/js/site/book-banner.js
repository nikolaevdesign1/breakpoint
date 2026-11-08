import { COURTS, nextFreeSlot, bookingUrl, isSlotTaken, isOpenHour, dayKeyForOffset } from '../shared/availability.js';
import { fmtHour, dayName } from '../shared/slot-ui.js';

// Booking banner (row 51): a strip of tonight's hours with the number of free courts, surface filters,
// and a Book button that deep-links into the 3D map with the chosen hour and surface.

const EVENING = [16, 17, 18, 19, 20, 21, 22]; // the strip shows the evening hours the club is open for
const SURFACES = ['clay', 'hard', 'grass', 'padel'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function initBookBanner() {
  const root = document.querySelector('.book-banner');
  if (!root) return;
  const q = (s) => root.querySelector(s);
  const slotsEl = q('[data-banner-slots]');
  const surfEl = q('[data-banner-surfaces]');
  const whenEl = q('[data-banner-when]');
  const bookEl = q('[data-banner-book]');
  const nextEl = q('[data-banner-next]');

  // After the last hour of the day the strip shows tomorrow.
  const nowH = new Date().getHours();
  const tonight = EVENING.filter((h) => isOpenHour(dayKeyForOffset(0), h));
  const offset = tonight.some((h) => h > nowH) ? 0 : 1;
  const dayKey = dayKeyForOffset(offset);
  const HOURS = EVENING.filter((h) => isOpenHour(dayKey, h));
  const open = (h) => offset === 1 || h > nowH;
  const free = (h, type) => COURTS.filter((c) => (!type || c.type === type) && !isSlotTaken(c.id, dayKey, h));

  const state = { hour: HOURS.find((h) => open(h) && h >= 18) ?? HOURS.find(open), type: null };

  slotsEl.innerHTML = HOURS.map((h) => `
    <li><button class="bb-slot" type="button" data-hour="${h}" aria-pressed="false">
      <span class="bb-slot__n"></span><span class="bb-slot__t">${fmtHour(h)}</span></button></li>`).join('');
  surfEl.innerHTML = SURFACES.map((t) => `
    <li><button class="bb-surf" type="button" data-type="${t}" aria-pressed="false">
      <span>${cap(t)}</span><b></b></button></li>`).join('');

  function render() {
    whenEl.textContent = `${offset ? 'Tomorrow' : 'Tonight'}, ${fmtHour(state.hour)}`;
    slotsEl.querySelectorAll('.bb-slot').forEach((b) => {
      const h = +b.dataset.hour;
      const n = free(h, state.type).length;
      b.disabled = !open(h);
      b.classList.toggle('is-out', open(h) && !n);
      b.setAttribute('aria-pressed', String(h === state.hour));
      if (h === state.hour && !b.dataset.seen) { b.dataset.seen = '1'; slotsEl.scrollTo({ left: Math.max(0, b.offsetLeft - slotsEl.offsetLeft - 8) }); }
      b.querySelector('.bb-slot__n').textContent = open(h) ? n : '';
      b.setAttribute('aria-label', `${fmtHour(h)}, ${n} courts free`);
    });
    surfEl.querySelectorAll('.bb-surf').forEach((b) => {
      const n = free(state.hour, b.dataset.type).length;
      b.setAttribute('aria-pressed', String(b.dataset.type === state.type));
      b.querySelector('b').textContent = n;
      b.setAttribute('aria-label', `${cap(b.dataset.type)}, ${n} free`);
    });
    const court = free(state.hour, state.type)[0];
    bookEl.href = court ? bookingUrl({ courtId: court.id, offset, hour: state.hour }) : '/booking.html';
    bookEl.querySelector('.btn__label').textContent = court ? 'Book a court' : 'Fully booked, open the map';
    const next = nextFreeSlot(state.type);
    if (next) {
      nextEl.textContent = `Next free: ${next.court.label}, ${dayName(next.offset).toLowerCase()} ${fmtHour(next.hour)}`;
      nextEl.href = bookingUrl({ courtId: next.court.id, offset: next.offset, hour: next.hour });
    }
  }

  slotsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.bb-slot');
    if (b && !b.disabled) { state.hour = +b.dataset.hour; render(); }
  });
  surfEl.addEventListener('click', (e) => {
    const b = e.target.closest('.bb-surf');
    if (b) { state.type = state.type === b.dataset.type ? null : b.dataset.type; render(); }
  });
  render();
}
