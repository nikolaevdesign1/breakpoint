import { fmtHour } from '../../shared/slot-ui.js';

// Round 9 (row 21): after a drag across the time scrubber, a plate over the dock reads
// "18:00–20:00 · 2 h · 5 courts free" with "Book" (the first court free for the whole span, or click
// any court on the map) and a close cross. It stands over the span and springs in.

export function createRangePlate(dock, { onBook, onClear }) {
  const el = document.createElement('div');
  el.className = 'dock-range';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Selected hours');
  el.hidden = true;
  el.innerHTML = `<p class="dock-range__when"><b data-when></b><span data-free></span></p>
    <button class="dock-range__book" type="button" data-book>Book</button>
    <button class="dock-range__clear" type="button" data-clear aria-label="Clear the hours"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>`;
  document.body.append(el);
  const when = el.querySelector('[data-when]');
  const free = el.querySelector('[data-free]');
  const book = el.querySelector('[data-book]');
  const track = dock.querySelector('[data-time-track]');
  let current = null;

  function place() {
    if (!current) return;
    const t = track.getBoundingClientRect();
    const mid = t.left + ((current.from + current.to + 1) / 2) * 8;
    const w = el.offsetWidth;
    const x = Math.max(12, Math.min(innerWidth - 12 - w, mid - w / 2));
    el.style.left = `${Math.round(x)}px`;
    el.style.bottom = `${Math.round(innerHeight - dock.getBoundingClientRect().top + 8)}px`;
  }

  function show(info) {
    current = info;
    if (!info) {
      el.classList.remove('is-in');
      setTimeout(() => { if (!current) el.hidden = true; }, 260);
      return;
    }
    when.textContent = `${fmtHour(info.from)}–${fmtHour(info.to + 1)}`;
    free.textContent = info.free ? ` · ${info.hours} h · ${info.free} ${info.free === 1 ? 'court' : 'courts'} free` : ` · ${info.hours} h · no court free for all of it`;
    book.disabled = !info.free;
    el.hidden = false;
    place();
    requestAnimationFrame(() => el.classList.add('is-in'));
  }

  book.addEventListener('click', () => onBook?.());
  el.querySelector('[data-clear]').addEventListener('click', () => onClear?.());
  addEventListener('resize', place);
  return { show };
}
