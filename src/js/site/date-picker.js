import { placePopover } from './popover.js';

// Date picker (row 61) in place of the system calendar. The native <input type="date"> stays inside, hidden:
// it holds the ISO value, min / max and fires input + change, so forms and validation keep working.
// Button + dialog with a month grid (title switches to a page of years, for birth dates); arrows move by
// day and week, PageUp / PageDown by month, Home / End along the week, Enter picks, Esc closes.
const NS = 'http://www.w3.org/2000/svg';
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const FULL = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (v) => (v ? new Date(`${v}T00:00:00`) : null);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const arrow = (dir) => `<svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="${dir < 0 ? 'M13 5H1M5 1L1 5l4 4' : 'M1 5h12M9 1l4 4-4 4'}"/></svg>`;

let uid = 0;

function enhance(input) {
  if (input.dataset.dp) return;
  input.dataset.dp = '1';
  const n = ++uid;
  const id = input.id || `dp-${n}`;
  const label = input.id && document.querySelector(`label[for="${input.id}"]`);
  const placeholder = input.dataset.placeholder || 'Pick a date';

  const wrap = document.createElement('div');
  wrap.className = 'cs dp-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = `cs__btn ${input.className}`.trim();
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  if (label) { label.id ||= `${id}-label`; btn.setAttribute('aria-labelledby', `${label.id} ${id}-value`); }
  btn.innerHTML = `<span class="cs__value" id="${id}-value"></span><svg class="dp__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1.5 3.5h13v11h-13zM1.5 7h13M5 1.5v3M11 1.5v3"/></svg>`;
  const pop = document.createElement('div');
  pop.className = 'dp';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Choose a date');
  pop.setAttribute('data-lenis-prevent', '');
  const scrim = document.createElement('div');
  scrim.className = 'cs__scrim';

  input.removeAttribute('id');
  input.className = 'cs__native';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.before(wrap);
  wrap.append(btn, input);
  document.body.append(scrim, pop);

  let mode = 'days'; // days | years
  let view = new Date(); // the month shown (day is 1)
  let focus = new Date(); // the day the keyboard sits on
  const isOpen = () => pop.classList.contains('is-open');
  const bounds = () => ({ min: parse(input.min), max: parse(input.max) });
  const ok = (d) => { const { min, max } = bounds(); return (!min || d >= min) && (!max || d <= max); };

  function sync() {
    const d = parse(input.value);
    btn.querySelector('.cs__value').textContent = d ? LONG.format(d) : placeholder;
    btn.classList.toggle('is-empty', !d);
    btn.disabled = input.disabled;
  }

  function render(refocus = false) {
    const sel = parse(input.value);
    const today = new Date();
    const head = (title, prevLabel, nextLabel) => `
      <div class="dp__head">
        <button type="button" class="dp__nav" data-nav="-1" aria-label="${prevLabel}">${arrow(-1)}</button>
        <button type="button" class="dp__title" data-title aria-live="polite">${title}</button>
        <button type="button" class="dp__nav" data-nav="1" aria-label="${nextLabel}">${arrow(1)}</button>
      </div>`;
    if (mode === 'years') {
      const y0 = view.getFullYear() - (view.getFullYear() % 12);
      const { min, max } = bounds();
      pop.innerHTML = head(`${y0} to ${y0 + 11}`, 'Earlier years', 'Later years') + '<div class="dp__years">' +
        Array.from({ length: 12 }, (_, i) => {
          const y = y0 + i;
          const off = (min && y < min.getFullYear()) || (max && y > max.getFullYear());
          return `<button type="button" class="dp__year${y === view.getFullYear() ? ' is-sel' : ''}" data-year="${y}" ${off ? 'disabled' : ''}>${y}</button>`;
        }).join('') + '</div>';
    } else {
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const lead = (first.getDay() + 6) % 7; // Monday first
      const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push('<span class="dp__day dp__day--blank"></span>');
      for (let day = 1; day <= count; day++) {
        const d = new Date(view.getFullYear(), view.getMonth(), day);
        const cls = ['dp__day'];
        if (sel && iso(d) === iso(sel)) cls.push('is-sel');
        if (iso(d) === iso(today)) cls.push('is-today');
        cells.push(`<button type="button" class="${cls.join(' ')}" role="gridcell" data-day="${iso(d)}" tabindex="${iso(d) === iso(focus) ? 0 : -1}" aria-label="${FULL.format(d)}" aria-selected="${cls.includes('is-sel')}" ${ok(d) ? '' : 'disabled'}>${day}</button>`);
      }
      pop.innerHTML = head(MONTH.format(view), 'Previous month', 'Next month') +
        `<div class="dp__week" aria-hidden="true">${DAYS.map((d) => `<span>${d}</span>`).join('')}</div><div class="dp__grid" role="grid" aria-label="${MONTH.format(view)}">${cells.join('')}</div>`;
    }
    if (refocus) (pop.querySelector('[tabindex="0"]') || pop.querySelector('.dp__day:not(:disabled)'))?.focus({ preventScroll: true });
  }

  const reposition = () => pop.classList.toggle('is-up', placePopover(btn, pop));
  const outside = (e) => { if (!wrap.contains(e.target) && !pop.contains(e.target)) close(false); };

  function open() {
    if (isOpen() || input.disabled) return;
    const d = step(parse(input.value) || new Date());
    focus = d;
    view = new Date(d.getFullYear(), d.getMonth(), 1);
    mode = 'days';
    render();
    pop.inert = scrim.inert = false; // a modal makes the body's children inert while it is open
    pop.classList.add('is-open');
    scrim.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    reposition();
    pop.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
    addEventListener('resize', reposition);
    addEventListener('scroll', reposition, { capture: true, passive: true });
    document.addEventListener('pointerdown', outside, true);
  }

  function close(refocus = true) {
    if (!isOpen()) return;
    pop.classList.remove('is-open');
    scrim.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    removeEventListener('resize', reposition);
    removeEventListener('scroll', reposition, { capture: true });
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) btn.focus({ preventScroll: true });
  }

  function pick(d) {
    if (!ok(d)) return;
    const changed = input.value !== iso(d);
    input.value = iso(d);
    sync();
    if (changed) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  }

  const step = (d) => { // keep the keyboard day inside the allowed range
    const { min, max } = bounds();
    return min && d < min ? min : max && d > max ? max : d;
  };
  const moveTo = (d) => { focus = step(d); view = new Date(focus.getFullYear(), focus.getMonth(), 1); render(true); };

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !isOpen()) { e.preventDefault(); open(); } });
  scrim.addEventListener('click', () => close());
  pop.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.day) pick(parse(t.dataset.day));
    else if (t.dataset.nav) { view = mode === 'years' ? new Date(view.getFullYear() + 12 * +t.dataset.nav, view.getMonth(), 1) : addMonths(view, +t.dataset.nav); render(); pop.querySelector(`[data-nav="${t.dataset.nav}"]`)?.focus({ preventScroll: true }); }
    else if ('title' in t.dataset) { mode = mode === 'days' ? 'years' : 'days'; render(); pop.querySelector('[data-title]')?.focus({ preventScroll: true }); }
    else if (t.dataset.year) { view = new Date(+t.dataset.year, view.getMonth(), 1); focus = step(new Date(+t.dataset.year, view.getMonth(), Math.min(focus.getDate(), 28))); mode = 'days'; render(); pop.querySelector('[data-title]')?.focus({ preventScroll: true }); }
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { requestAnimationFrame(() => { if (!pop.contains(document.activeElement)) close(false); }); return; }
    if (!e.target.closest('.dp__day')) return;
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in keys) { e.preventDefault(); moveTo(addDays(focus, keys[e.key])); }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); moveTo(new Date(focus.getFullYear(), focus.getMonth() + (e.key === 'PageDown' ? 1 : -1), Math.min(focus.getDate(), 28))); }
    else if (e.key === 'Home') { e.preventDefault(); moveTo(addDays(focus, -((focus.getDay() + 6) % 7))); }
    else if (e.key === 'End') { e.preventDefault(); moveTo(addDays(focus, 6 - ((focus.getDay() + 6) % 7))); }
  });
  input.addEventListener('change', sync);
  input.form?.addEventListener('reset', () => setTimeout(sync));
  new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'min', 'max'] });

  // `input.value = x` from page code fires no event: mirror it.
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
  sync();
}

export function initDatePickers(root = document) {
  root.querySelectorAll('input[type="date"]').forEach(enhance);
}
