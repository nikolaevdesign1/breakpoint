// Split-flap lettering for the preloader: every letter sits in its own mask cell. `flapIn` drops each
// letter through a few random neighbours, stepwise, before it locks on the real glyph (left to right).
// `slideIn` / `slideOut` move whole letters through the mask (used for the small line).

const POOL = 'abcdefghijklmnopqrstuvwxyz';
const STEPS = 6;

// Wrap letters in mask cells, keeping each word in a no-wrap group so lines break between words.
export function splitCells(el) {
  const text = el.textContent;
  el.textContent = '';
  const cells = [];
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) { el.append(' '); return; }
    const word = document.createElement('span');
    word.className = 'fl-word';
    [...part].forEach((ch) => {
      const cell = document.createElement('span');
      const inner = document.createElement('span');
      cell.className = 'fl';
      inner.textContent = ch;
      cell.appendChild(inner);
      word.appendChild(cell);
      cells.push({ cell, inner, ch });
    });
    el.appendChild(word);
  });
  return cells;
}

// A random stand-in must not change the cell width, so each cell is pinned to its real glyph.
export function pinCells(cells) {
  const widths = cells.map(({ cell }) => cell.getBoundingClientRect().width);
  cells.forEach(({ cell }, i) => { cell.style.width = `${widths[i]}px`; });
}

export const hideCells = (cells) => cells.forEach(({ inner }) => { inner.style.transform = 'translateY(-110%)'; });

/** Flip letters in. Returns a promise that resolves when the last one has locked. */
export function flapIn(cells, { delay = 0, stagger = 0.05, duration = 0.9 } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = new Array(cells.length).fill(-1);
    const frame = (now) => {
      const t = (now - start) / 1000 - delay;
      let active = false;
      cells.forEach((c, i) => {
        const p = Math.min(1, Math.max(0, (t - i * stagger) / duration));
        if (p <= 0) { active = true; return; }
        const k = Math.min(STEPS - 1, Math.floor(p * STEPS));
        if (p < 1) active = true;
        if (k !== step[i]) {
          step[i] = k;
          c.inner.textContent = k === STEPS - 1 ? c.ch : POOL[(Math.random() * POOL.length) | 0];
        }
        const frac = p * STEPS - k; // 0..1 inside the current step: each flap drops in from above
        const drop = p >= 1 ? 0 : -(1 - frac) * (1 - frac) * 70;
        c.inner.style.transform = drop ? `translateY(${drop.toFixed(1)}%)` : '';
      });
      if (active) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
