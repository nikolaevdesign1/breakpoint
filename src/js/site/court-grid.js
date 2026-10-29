import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// "A court is a grid of squares." One square size for the whole site (1/24 of the viewport,
// 1/8 on phones); photos assemble from it, glitch on hover, get stepped corners, section
// edges dissolve into it and page changes sweep across it.

export const COLORS = {
  ink: '#121211',
  ink2: '#1e1e1e',
  paper: '#ffffff',
  paper2: '#f1f1ef',
  sun: '#fff3da',
  clay: '#9c441f',
  finch: '#646544',
  wood: '#36251b',
};

const PHOTO_MIX = [['ink', 5], ['paper2', 3], ['sun', 2], ['clay', 1.2], ['finch', 1.2], ['wood', 0.8]];

export function cellSize() {
  const w = window.innerWidth;
  return w < 640 ? Math.round(w / 12) : Math.round(w / 40); // row 86: smaller squares, less cut-off
}

// Small deterministic RNG so every frame keeps its own pattern between reloads.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function weighted(rand, mix) {
  const total = mix.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [k, w] of mix) { if ((r -= w) <= 0) return COLORS[k]; }
  return COLORS[mix[0][0]];
}

function makeCanvas(host, cls = 'cells') {
  const canvas = document.createElement('canvas');
  canvas.className = cls;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  return canvas;
}
function fit(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* ------------------------------------------------------------------ photos */

class PhotoCells {
  constructor(frame, index, reduced) {
    this.frame = frame;
    this.img = frame.querySelector('img');
    this.rand = rng(index * 7919 + 13);
    this.reduced = reduced;
    this.canvas = makeCanvas(frame);
    this.progress = reduced ? 1 : 0;
    this.glitches = [];
    this.layout();
    new ResizeObserver(() => { this.layout(); this.draw(); }).observe(frame);

    if (!reduced) {
      ScrollTrigger.create({ trigger: frame, start: 'top 88%', once: true, onEnter: () => this.assemble() });
      frame.addEventListener('pointerenter', () => this.glitch());
    }
    this.draw();
  }

  layout() {
    const { width: w, height: h } = this.frame.getBoundingClientRect();
    if (!w || !h) return;
    this.w = w; this.h = h;
    this.small = this.frame.dataset.cells === 'small';
    this.size = this.small ? Math.max(8, w / 8) : Math.max(18, Math.min(cellSize(), w / 6));
    this.cols = Math.ceil(w / this.size);
    this.rows = Math.ceil(h / this.size);
    this.ctx = fit(this.canvas, w, h);

    if (!this.cells) {
      const r = this.rand;
      // Stepped corner: a single corner loses a short staircase of cells, so the photo stays readable.
      // data-cells-corner pins the stepped corner (e.g. away from a header or a button); otherwise random.
      const corner = this.frame.dataset.cellsCorner || gsap.utils.shuffle(['tl', 'tr', 'br', 'bl'])[0];
      // Small frames (thumbnails, the About cloud) keep their full shape: assembly and glitch only.
      // Frames with .cut already have a cut corner (cut.css): no staircase on top of it.
      this.steps = this.small || this.frame.classList.contains('cut') ? [] : [{ corner, stair: r() < 0.6 ? [2, 1] : [1] }];
      this.cells = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          this.cells.push({ x, y, at: r(), color: weighted(r, PHOTO_MIX), flash: weighted(r, PHOTO_MIX) });
        }
      }
      // A couple of coloured squares sit on each staircase.
      this.accents = [];
      this.steps.forEach(({ corner, stair }) => {
        const n = 1;
        for (let i = 0; i < n; i++) {
          const row = Math.floor(r() * stair.length);
          const col = stair[row];
          this.accents.push({ corner, col, row, color: weighted(r, [['ink', 2], ['sun', 2], ['clay', 1.5], ['finch', 1.5]]) });
        }
      });
    }
    if (this.steps.length) this.frame.style.clipPath = this.clipPolygon();
  }

  // Polygon in px, clockwise, with staircase notches at the chosen corners.
  // A stair like [3, 2, 1] removes 3 cells from the edge row, 2 from the next, 1 from the third.
  clipPolygon() {
    const s = this.size, w = this.w, h = this.h;
    const stair = (c) => this.steps.find((st) => st.corner === c)?.stair;
    const tl = stair('tl'), tr = stair('tr'), br = stair('br'), bl = stair('bl');
    const pts = [];
    pts.push(tl ? [tl[0] * s, 0] : [0, 0]);
    if (tr) { tr.forEach((n, i) => { pts.push([w - n * s, i * s], [w - n * s, (i + 1) * s]); }); pts.push([w, tr.length * s]); }
    else pts.push([w, 0]);
    if (br) { pts.push([w, h - br.length * s]); for (let i = br.length - 1; i >= 0; i--) pts.push([w - br[i] * s, h - (i + 1) * s], [w - br[i] * s, h - i * s]); }
    else pts.push([w, h]);
    if (bl) { bl.forEach((n, i) => { pts.push([n * s, h - i * s], [n * s, h - (i + 1) * s]); }); pts.push([0, h - bl.length * s]); }
    else pts.push([0, h]);
    if (tl) { pts.push([0, tl.length * s]); for (let i = tl.length - 1; i >= 0; i--) pts.push([tl[i] * s, (i + 1) * s], [tl[i] * s, i * s]); }
    return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
  }

  // The cell that sits just inside a staircase step, where an accent square lands.
  accentRect(a) {
    const s = this.size;
    const x = a.corner.includes('l') ? a.col * s : this.w - (a.col + 1) * s;
    const y = a.corner.includes('t') ? a.row * s : this.h - (a.row + 1) * s;
    return [x, y, s, s];
  }

  assemble(duration = 2.2) {
    gsap.to(this, { progress: 1, duration, ease: 'sine.inOut', overwrite: true, onUpdate: () => this.draw() });
  }

  // Re-run the assembly, e.g. when the photo inside the frame changes.
  replay() {
    if (this.reduced || !this.cells) return; // not laid out yet (hidden frame)
    this.progress = 0;
    this.cells.forEach((c) => { c.at = Math.random(); });
    this.assemble(1.4);
  }

  glitch() {
    if (!this.cells || this.progress < 1 || !this.img?.complete) return;
    const r = Math.random;
    const n = 4 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      // Mostly along the edges, the odd one inside.
      const edge = r() < 0.75;
      const x = edge ? (r() < 0.5 ? 0 : this.cols - 1 - Math.floor(r() * 2)) : Math.floor(r() * this.cols);
      const y = Math.floor(r() * this.rows);
      const g = { x, y, color: weighted(r, PHOTO_MIX), shift: r() < 0.45 ? [Math.round((r() - 0.5) * 4), Math.round((r() - 0.5) * 3)] : null };
      this.glitches.push(g);
      gsap.delayedCall(r() * 0.18, () => this.draw());
      gsap.delayedCall(0.12 + r() * 0.3, () => { this.glitches.splice(this.glitches.indexOf(g), 1); this.draw(); });
    }
  }

  // Map a canvas rect onto the photo's natural pixels (object-fit: cover + any transform on the img).
  sourceRect(x, y, w, h) {
    const img = this.img;
    const fr = this.frame.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const scale = Math.max(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
    const ox = ir.left - fr.left + (ir.width - img.naturalWidth * scale) / 2;
    const oy = ir.top - fr.top + (ir.height - img.naturalHeight * scale) / 2;
    return [(x - ox) / scale, (y - oy) / scale, w / scale, h / scale];
  }

  draw() {
    const { ctx, size: s } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);

    // Assembly: cells whose turn hasn't come stay solid; cells just turning flash another colour.
    if (this.progress < 1) {
      const p = this.progress * 1.15;
      this.cells.forEach((c) => {
        if (c.at < p - 0.15) return;
        ctx.fillStyle = c.at < p ? c.flash : c.color;
        ctx.fillRect(c.x * s, c.y * s, s + 0.5, s + 0.5);
      });
    }

    this.accents.forEach((a) => { ctx.fillStyle = a.color; ctx.fillRect(...this.accentRect(a)); });

    this.glitches.forEach((g) => {
      const x = g.x * s, y = g.y * s;
      if (g.shift && this.img.naturalWidth) {
        try { ctx.drawImage(this.img, ...this.sourceRect(x + g.shift[0] * s, y + g.shift[1] * s, s, s), x, y, s, s); }
        catch { ctx.fillStyle = g.color; ctx.fillRect(x, y, s, s); }
      } else {
        ctx.fillStyle = g.color;
        ctx.fillRect(x, y, s, s);
      }
    });
  }
}

const PHOTO_FRAMES = '[data-cells]';

export function initPhotoCells({ reducedMotion }) {
  document.querySelectorAll(PHOTO_FRAMES).forEach((frame, i) => {
    if (frame.__cells) return;
    frame.__cells = new PhotoCells(frame, i + 1, reducedMotion);
  });
}

/* ----------------------------------------------------------- section edges */

// A band of squares over the seam between a light and a dark section (after Cantor8):
// squares of the dark colour climb into the light side and click in one by one on scroll.
class EdgeBand {
  constructor(section, side, color, index, reduced) {
    this.section = section;
    this.side = side; // 'top' | 'bottom'
    this.color = color;
    this.rand = rng(index * 104729 + (side === 'top' ? 1 : 2));
    this.canvas = makeCanvas(section, `cells cells--edge cells--${side}`);
    this.progress = reduced ? 1 : 0;
    this.layout();
    new ResizeObserver(() => { this.layout(); this.draw(); }).observe(section);
    if (!reduced) {
      ScrollTrigger.create({
        trigger: section,
        start: side === 'top' ? 'top 95%' : 'bottom 95%',
        end: side === 'top' ? 'top 45%' : 'bottom 45%',
        scrub: 1.2,
        onUpdate: (st) => { this.progress = st.progress; this.draw(); },
      });
    }
    this.draw();
  }

  layout() {
    const w = this.section.getBoundingClientRect().width;
    this.s = cellSize();
    this.cols = Math.ceil(w / this.s);
    this.rows = window.innerWidth < 640 ? 2 : 3;
    this.w = w; this.h = this.rows * this.s;
    this.ctx = fit(this.canvas, w, this.h);
    const r = this.rand;
    this.cells = [];
    for (let x = 0; x < this.cols; x++) {
      // Staircase: deeper rows (further from the seam) are sparser.
      for (let row = 0; row < this.rows; row++) {
        const chance = [0.62, 0.3, 0.12][row];
        if (r() < chance) this.cells.push({ x, row, at: r() * 0.8 + row * 0.08, accent: r() < 0.06 ? weighted(r, [['sun', 2], ['clay', 1], ['finch', 1]]) : null });
      }
    }
  }

  draw() {
    const { ctx, s } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.cells.forEach((c) => {
      if (c.at > this.progress) return;
      // Row 0 touches the seam.
      const y = this.side === 'top' ? this.h - (c.row + 1) * s : c.row * s;
      ctx.fillStyle = c.accent || this.color;
      ctx.fillRect(c.x * s, y, s + 0.5, s + 0.5);
    });
  }
}

export function initSectionEdges({ reducedMotion }) {
  document.querySelectorAll('[data-edge]').forEach((section, i) => {
    const color = getComputedStyle(section).backgroundColor;
    const sides = section.dataset.edge === 'both' ? ['top', 'bottom'] : [section.dataset.edge];
    sides.forEach((side) => new EdgeBand(section, side, color, i + 1, reducedMotion));
  });
}

/* --------------------------------------------------------- hero top edge */

// Squares of page white hang into the top of the hero video and slowly reshuffle.
export function initHeroEdge(card, { reducedMotion }) {
  if (!card) return;
  const canvas = makeCanvas(card, 'cells cells--hero');
  const r = rng(424242);
  let s, cols, ctx, cells = [], w;
  const layout = () => {
    w = card.getBoundingClientRect().width;
    s = cellSize();
    cols = Math.ceil(w / s);
    ctx = fit(canvas, w, s * 4);
    cells = [];
    for (let x = 0; x < cols; x++) {
      for (let row = 0; row < 4; row++) {
        const chance = [0.36, 0.13, 0.04, 0][row];
        cells.push({ x, row, on: r() < chance, alpha: r() < 0.3 ? 0.55 : 1, chance });
      }
    }
  };
  const draw = (reveal = 1) => {
    ctx.clearRect(0, 0, w, s * 4);
    cells.forEach((c, i) => {
      if (!c.on || i / cells.length > reveal) return;
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(c.x * s, c.row * s, s + 0.5, s + 0.5);
    });
    ctx.globalAlpha = 1;
  };
  layout();
  draw(reducedMotion ? 1 : 0);
  window.addEventListener('resize', () => { layout(); draw(); });
  if (reducedMotion) return { show() {} };

  // Every so often a few squares flip, so the edge feels alive without moving much.
  const tick = () => {
    for (let k = 0; k < 3; k++) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      c.on = Math.random() < c.chance * 1.4;
    }
    draw();
  };
  return {
    show() {
      const st = { p: 0 };
      gsap.to(st, { p: 1, duration: 2, ease: 'sine.inOut', onUpdate: () => draw(st.p), onComplete: () => gsap.ticker.add(throttle(tick, 1400)) });
    },
  };
}

function throttle(fn, ms) {
  let last = 0;
  return () => { const now = performance.now(); if (now - last > ms) { last = now; fn(); } };
}

/* --------------------------------------------------------- page transitions */

const TRANSITION_KEY = 'bp-transition';

// Leaving: squares flood the screen in a wave from the click, like a bounce spreading across the court.
// Arriving: the same squares clear in a wave from the centre.
export function initPageTransitions({ reducedMotion }) {
  if (reducedMotion) return;
  const canvas = makeCanvas(document.body, 'cells cells--page');
  let ctx, s, cols, rows, w, h;
  const layout = () => {
    w = window.innerWidth; h = window.innerHeight;
    s = cellSize();
    cols = Math.ceil(w / s); rows = Math.ceil(h / s);
    ctx = fit(canvas, w, h);
  };
  layout();
  window.addEventListener('resize', layout);

  const paint = (origin, t, covering) => {
    ctx.clearRect(0, 0, w, h);
    const maxD = Math.hypot(Math.max(origin[0], cols - origin[0]), Math.max(origin[1], rows - origin[1]));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot(x - origin[0], y - origin[1]) / maxD;
        const jitter = ((x * 73856093) ^ (y * 19349663)) % 100 / 100 * 0.18;
        const on = covering ? d + jitter < t * 1.2 : d + jitter > t * 1.2;
        if (!on) continue;
        const accent = ((x * 31 + y * 17) % 41) === 0;
        ctx.fillStyle = accent ? COLORS.clay : COLORS.ink;
        ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    }
  };

  // Arrival
  let arriving = null;
  try { arriving = JSON.parse(sessionStorage.getItem(TRANSITION_KEY) || 'null'); sessionStorage.removeItem(TRANSITION_KEY); } catch {}
  if (arriving) {
    canvas.classList.add('is-active');
    const st = { t: 0 };
    paint([cols / 2, rows / 2], 0, false);
    gsap.to(st, { t: 1, duration: 1.5, delay: 0.2, ease: 'sine.inOut', onUpdate: () => paint([cols / 2, rows / 2], st.t, false), onComplete: () => canvas.classList.remove('is-active') });
  }

  // Departure
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname) return; // same page (anchors) scroll instead
    e.preventDefault();
    canvas.classList.add('is-active');
    const origin = [e.clientX / s, e.clientY / s];
    const st = { t: 0 };
    gsap.to(st, {
      t: 1, duration: 1.1, ease: 'sine.inOut',
      onUpdate: () => paint(origin, st.t, true),
      onComplete: () => {
        try { sessionStorage.setItem(TRANSITION_KEY, '1'); } catch {}
        window.location.href = url.href;
      },
    });
  });

  // Coming back via the browser's back button restores a covered page from cache; clear it.
  window.addEventListener('pageshow', (e) => { if (e.persisted) { ctx.clearRect(0, 0, w, h); canvas.classList.remove('is-active'); } });
}
