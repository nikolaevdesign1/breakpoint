// Club rules (about.html): rows open one at a time. A click, Enter or Space opens a row and closes the
// last one; the cursor label says what the next click does. Without script every row stays open.
export function initRules() {
  const list = document.querySelector('.rules__list');
  if (!list) return;
  const rows = [...list.querySelectorAll('.rules__row')];
  list.classList.add('is-live');
  const label = (row) => { row.dataset.cursor = row.classList.contains('is-open') ? 'Close' : 'Open'; };
  const toggle = (row) => {
    const open = !row.classList.contains('is-open');
    rows.forEach((r) => { r.classList.remove('is-open'); r.setAttribute('aria-expanded', 'false'); label(r); });
    if (open) { row.classList.add('is-open'); row.setAttribute('aria-expanded', 'true'); label(row); }
  };
  rows.forEach((row, i) => {
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', 'false');
    label(row);
    row.addEventListener('click', () => toggle(row));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(row); } });
    if (i === 0) toggle(row);
  });
}
