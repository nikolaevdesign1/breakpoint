import gsap from 'gsap';
import { COLORS, cellSize } from './court-grid.js';
import { DUR, EASE } from './motion.js';

// Month change (row 126): a wave of squares runs across the calendar in the direction of travel,
// covers the old month, the grid is swapped underneath, and the same wave clears onto the new one.

// Mostly pale squares, so the month dissolves rather than blacks out; a few court colours ride the wave.
const MIX = [...Array(9).fill(COLORS.paper2), ...Array(4).fill(COLORS.sun), COLORS.ink, COLORS.clay];
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

export function createWave(grid) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cal__wave';
  canvas.setAttribute('aria-hidden', 'true');
  grid.after(canvas);
  const ctx = canvas.getContext('2d');
  const st = { t: 0, dir: 1, w: 0, h: 0, s: 0, cols: 0, rows: 0 };
  let tl = null;

  function layout() {
    const w = grid.offsetWidth;
    const h = grid.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.left = `${grid.offsetLeft}px`;
    canvas.style.top = `${grid.offsetTop}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st.w = w; st.h = h;
    st.s = Math.round(cellSize() / 2) * 2;
    st.cols = Math.ceil(w / st.s);
    st.rows = Math.ceil(h / st.s);
  }

  // t 0..1 covers, 1..2 clears. Each square's turn depends on its column, with a little noise.
  function paint() {
    const { s, cols, rows, t } = st;
    ctx.clearRect(0, 0, st.w, st.h);
    for (let x = 0; x < cols; x++) {
      const along = st.dir > 0 ? x / cols : 1 - x / cols;
      for (let y = 0; y < rows; y++) {
        const at = along * 0.72 + hash(x, y) * 0.28;
        const on = t <= 1 ? at < t : at > t - 1;
        if (!on) continue;
        ctx.fillStyle = MIX[Math.floor(hash(y + 7, x + 3) * MIX.length)];
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  return function play(dir, swap) {
    tl?.progress(1);
    st.dir = dir;
    st.t = 0;
    layout();
    canvas.classList.add('is-active');
    tl = gsap.timeline({ onComplete: () => { ctx.clearRect(0, 0, st.w, st.h); canvas.classList.remove('is-active'); } })
      .to(st, { t: 1, duration: DUR.fast, ease: 'power1.in', onUpdate: paint })
      .add(() => { swap(); layout(); paint(); }) // the new month can have one week more or less
      .to(st, { t: 2, duration: DUR.base, ease: EASE.out, onUpdate: paint });
  };
}
