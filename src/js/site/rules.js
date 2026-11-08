// Club rules (about.html): rows open one at a time. A click, Enter or Space opens a row and closes the
// last one; the +/- square at the right of the row says what the next click does (drawn in CSS, so no cursor
// plate covers the title). Without script every row stays open.
// Title heights are measured once, after the fonts are ready, and pinned: opening a row never re-measures the
// titles, so they cannot move. They are measured again only when the width of the list changes.
export function initRules() {
  const list = document.querySelector('.rules__list');
  if (!list) return;
  const rows = [...list.querySelectorAll('.rules__row')];
  const titles = rows.map((r) => r.querySelector('b'));

  const pin = () => {
    titles.forEach((t) => t.style.removeProperty('min-height'));
    const heights = titles.map((t) => t.getBoundingClientRect().height);
    titles.forEach((t, i) => { t.style.minHeight = `${Math.ceil(heights[i])}px`; });
  };
  let width = 0;
  const watch = () => {
    pin();
    width = list.clientWidth;
    let t;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (list.clientWidth !== width) { width = list.clientWidth; pin(); } }, 160);
    });
  };
  document.fonts.ready.then(watch);

  list.classList.add('is-live');
  const toggle = (row) => {
    const open = !row.classList.contains('is-open');
    rows.forEach((r) => { r.classList.remove('is-open'); r.setAttribute('aria-expanded', 'false'); });
    if (open) { row.classList.add('is-open'); row.setAttribute('aria-expanded', 'true'); }
  };
  rows.forEach((row, i) => {
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', 'false');
    row.addEventListener('click', () => toggle(row));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(row); } });
    if (i === 0) toggle(row);
  });
}
