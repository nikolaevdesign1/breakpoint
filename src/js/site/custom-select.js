// Custom selects (row 11) and drawn checkboxes (row 8), shared by every site form.
// A <select> stays in the DOM as the source of truth (value, change event, form data, validation) and is
// hidden; a button + listbox sits in front of it. Programmatic `select.value = x` and rebuilt <option>s
// are picked up, so page scripts keep working untouched.

import { initDatePickers } from './date-picker.js';
import { placePopover } from './popover.js';

const NS = 'http://www.w3.org/2000/svg';
const TICK_CHECK = 'M5 12.5l4.5 4.5L19 7';
const TICK_ITEM = 'M2 8.5l4 4L14 3.5';
const CHEVRON = '<svg class="cs__chev" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1 1.5l5 5 5-5"/></svg>';

const tickSvg = (cls, d, box) => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', box);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('pathLength', '1'); // dash length 1 = the whole stroke, so the draw is one number
  svg.append(p);
  return svg;
};

/** Put the drawing tick inside every `.check__box` (the box itself is styled in components.css). */
export function initChecks(root = document) {
  root.querySelectorAll('.check__box:not(:has(svg))').forEach((b) => b.append(tickSvg('check__tick', TICK_CHECK, '0 0 24 24')));
}

let uid = 0;

function enhance(select) {
  if (select.multiple || select.dataset.cs) return;
  select.dataset.cs = '1';
  const n = ++uid;
  const label = select.id && document.querySelector(`label[for="${select.id}"]`);
  const id = select.id || `cs-${n}`;
  const listId = `${id}-list`;

  const wrap = document.createElement('div');
  wrap.className = 'cs';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = `cs__btn ${select.className}`.trim();
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', listId);
  if (label) { label.id ||= `${id}-label`; btn.setAttribute('aria-labelledby', `${label.id} ${id}-value`); }
  btn.innerHTML = `<span class="cs__value" id="${id}-value"></span>${CHEVRON}`;
  const list = document.createElement('ul');
  list.className = 'cs__list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('data-lenis-prevent', '');
  if (label) list.setAttribute('aria-labelledby', label.id);
  const scrim = document.createElement('div');
  scrim.className = 'cs__scrim';

  select.removeAttribute('id');
  select.className = 'cs__native';
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.before(wrap);
  wrap.append(btn, select);
  select._cs = [scrim, list];
  document.body.append(scrim, list); // body level: a transformed ancestor (the apply modal) would otherwise shift `position: fixed`

  let items = [];
  let active = -1;
  let typed = '';
  let typedAt = 0;
  const isOpen = () => wrap.classList.contains('is-open');

  function build() {
    list.textContent = '';
    items = [...select.options].filter((o) => o.value !== '').map((o, i) => {
      const li = document.createElement('li');
      li.className = 'cs__opt';
      li.id = `${id}-o${i}`;
      li.setAttribute('role', 'option');
      li.dataset.value = o.value;
      li.setAttribute('aria-disabled', String(o.disabled));
      li.append(Object.assign(document.createElement('span'), { textContent: o.textContent }), tickSvg('cs__tick', TICK_ITEM, '0 0 16 16'));
      list.append(li);
      return li;
    });
    sync();
  }

  function sync() {
    const cur = select.selectedOptions[0];
    const empty = !cur || cur.value === '';
    btn.querySelector('.cs__value').textContent = cur ? cur.textContent : '';
    btn.classList.toggle('is-empty', empty);
    btn.disabled = select.disabled;
    items.forEach((li) => li.setAttribute('aria-selected', String(!empty && li.dataset.value === select.value)));
  }

  function setActive(i, scroll = true) {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, k) => li.classList.toggle('is-active', k === active));
    btn.setAttribute('aria-activedescendant', items[active]?.id || '');
    if (scroll) items[active]?.scrollIntoView({ block: 'nearest' });
  }

  const place = () => list.classList.toggle('is-up', placePopover(btn, list, { match: true, maxH: 320 }));

  const reposition = () => place();
  const outside = (e) => { if (!wrap.contains(e.target)) close(false); };

  function open() {
    if (isOpen() || select.disabled || !items.length) return;
    wrap.classList.add('is-open');
    list.inert = scrim.inert = false; // a modal makes the body's children inert while it is open
    list.classList.add('is-open');
    scrim.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    place();
    setActive(Math.max(0, items.findIndex((li) => li.getAttribute('aria-selected') === 'true')));
    addEventListener('resize', reposition);
    addEventListener('scroll', reposition, { capture: true, passive: true });
    document.addEventListener('pointerdown', outside, true);
  }

  function close(refocus = true) {
    if (!isOpen()) return;
    wrap.classList.remove('is-open');
    list.classList.remove('is-open');
    scrim.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
    removeEventListener('resize', reposition);
    removeEventListener('scroll', reposition, { capture: true });
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) btn.focus({ preventScroll: true });
  }

  function commit(i) {
    const li = items[i];
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    const changed = select.value !== li.dataset.value;
    select.value = li.dataset.value;
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  }

  const cur = () => items.findIndex((li) => li.getAttribute('aria-selected') === 'true');
  function typeahead(ch) {
    const now = performance.now();
    typed = now - typedAt > 700 ? ch : typed + ch;
    typedAt = now;
    const from = typed.length === 1 ? (isOpen() ? active : cur()) + 1 : isOpen() ? active : cur();
    const order = [...items.keys()].map((k) => (k + Math.max(from, 0)) % items.length);
    const hit = order.find((k) => items[k].textContent.toLowerCase().startsWith(typed.toLowerCase()));
    if (hit === undefined) return;
    if (isOpen()) setActive(hit);
    else { setActive(hit, false); commit(hit); btn.focus({ preventScroll: true }); }
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (['ArrowDown', 'ArrowUp'].includes(k)) {
      e.preventDefault();
      if (!isOpen()) return open();
      setActive(active + (k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      if (!isOpen()) open();
      setActive(k === 'Home' ? 0 : items.length - 1);
    } else if (k === 'Enter' || k === ' ') {
      if (typed && k === ' ' && performance.now() - typedAt < 700) { e.preventDefault(); return typeahead(' '); }
      e.preventDefault();
      isOpen() ? commit(active) : open();
    } else if (k === 'Escape') {
      if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
    } else if (k === 'Tab') {
      close(false);
    } else if (k.length === 1) {
      typeahead(k);
    }
  });
  list.addEventListener('pointermove', (e) => { const li = e.target.closest('.cs__opt'); if (li) setActive(items.indexOf(li), false); });
  list.addEventListener('click', (e) => { const li = e.target.closest('.cs__opt'); if (li) commit(items.indexOf(li)); });
  scrim.addEventListener('click', () => close());
  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => setTimeout(sync));
  new MutationObserver(build).observe(select, { childList: true, subtree: true, characterData: true });
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });

  // `select.value = x` from page code fires no event: mirror it.
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });

  build();
}

/** Drop the body-level list and scrim of selects inside `root` before the markup is thrown away (the booking panel re-renders). */
export function releaseSelects(root) {
  root.querySelectorAll('select').forEach((s) => s._cs?.forEach((el) => el.remove()));
}

export function initSelects(root = document) {
  root.querySelectorAll('select').forEach(enhance);
}

export function initFormControls(root = document) {
  initChecks(root);
  initSelects(root);
  initDatePickers(root);
}
