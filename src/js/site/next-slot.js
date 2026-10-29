import { nextFreeSlot, bookingUrl } from '../shared/availability.js';
import { fmtHour, dateFor, dayName } from '../shared/slot-ui.js';
import { rateFor } from './content.js';

// Hero note (rows 40, 44): the next free court as a small holographic alert in the corner. It opens after the
// intro (show()), links to booking with the court and hour preselected, and closes for the rest of the visit.
const CLOSED = 'bp-hero-alert';
const closedBefore = () => { try { return sessionStorage.getItem(CLOSED) === '1'; } catch { return false; } };

export function initNextSlotCard({ reducedMotion = false } = {}) {
  const note = document.querySelector('[data-next-slot]');
  if (!note) return null;
  const link = note.querySelector('a');
  const court = note.querySelector('[data-slot-court]');
  const when = note.querySelector('[data-slot-when]');
  const price = note.querySelector('[data-slot-price]');
  const slot = nextFreeSlot('clay') || nextFreeSlot();
  if (!slot) {
    court.textContent = 'Fully booked this week';
    when.hidden = true;
    price.parentElement.hidden = true;
  } else {
    const at = `${dayName(slot.offset)}, ${fmtHour(slot.hour)}`;
    const usd = rateFor(slot.court.type, dateFor(slot.offset), slot.hour);
    court.textContent = slot.court.label;
    when.textContent = at;
    price.textContent = `$${usd} an hour`;
    link.href = bookingUrl({ courtId: slot.court.id, offset: slot.offset, hour: slot.hour });
    link.dataset.cursor = `Book ${slot.court.label}`;
    link.setAttribute('aria-label', `Next free court: ${slot.court.label}, ${at}, $${usd} an hour. Book`);
  }

  const hide = () => {
    note.classList.remove('is-in');
    try { sessionStorage.setItem(CLOSED, '1'); } catch { /* storage blocked */ }
    setTimeout(() => { note.hidden = true; }, reducedMotion ? 0 : 900);
  };
  note.querySelector('[data-slot-close]').addEventListener('click', hide);

  return {
    show() {
      if (closedBefore()) return;
      note.hidden = false;
      setTimeout(() => note.classList.add('is-in'), reducedMotion ? 0 : 900);
    },
  };
}

export { initBookBanner } from './book-banner.js'; // the banner moved to its own module (row 51)
