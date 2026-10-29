// Dev-only grid overlay: press G to toggle the 12 columns (see css/site/grid.css, docs/grid.md).
// Imported behind import.meta.env.DEV in site.js, so it never reaches the production build.

const css = `
.grid-dev { position: fixed; inset: 0; z-index: 9999; display: none; pointer-events: none; padding-inline: var(--edge); }
.grid-dev.is-on { display: block; }
.grid-dev__cols { height: 100%; display: grid; grid-template-columns: repeat(var(--grid-cols), minmax(0, 1fr)); column-gap: var(--grid-gap); }
.grid-dev__cols i { background: rgba(156, 68, 31, 0.1); box-shadow: inset 1px 0 rgba(156, 68, 31, 0.35), inset -1px 0 rgba(156, 68, 31, 0.35); }
`;

export function initGridDev() {
  const style = document.createElement('style');
  style.textContent = css;
  const overlay = document.createElement('div');
  overlay.className = 'grid-dev';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="grid-dev__cols">${'<i></i>'.repeat(12)}</div>`;
  document.head.append(style);
  document.body.append(overlay);
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    overlay.classList.toggle('is-on');
  });
}
