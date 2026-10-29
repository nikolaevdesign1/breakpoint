import gsap from 'gsap';
import { COLORS, cellSize } from './court-grid.js';
import { photoUrl } from './tournaments-data.js';
import { DUR, EASE } from './motion.js';

// Calendar hover (row 126): the event photo assembles inside the day cell from the site's squares,
// spreading from where the pointer came in, with a small "spots taken" meter at the bottom.
// One peek element is reused and moved from cell to cell, so hovering costs one small canvas.

const FLASH = [COLORS.ink, COLORS.paper2, COLORS.sun, COLORS.clay, COLORS.finch];
const photos = new Map();

function photo(url) {
  if (!photos.has(url)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    photos.set(url, img);
  }
  return photos.get(url);
}

export const preloadPhotos = (events) => events.forEach((e) => photo(photoUrl(e)));

// Deterministic 0..1 noise per square, so the pattern doesn't flicker between frames.
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

export function createPeek({ reducedMotion }) {
  const el = document.createElement('span');
  el.className = 'cal__peek';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<canvas></canvas><span class="cal__peek-meter"><span class="cal__peek-text"></span><i></i></span>';
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const text = el.querySelector('.cal__peek-text');
  const bar = el.querySelector('.cal__peek-meter i');
  const st = { p: 0, w: 0, h: 0, s: 0, cols: 0, rows: 0, img: null, origin: [0, 0] };
  let cell = null;
  let tween = null;

  function draw() {
    const { w, h, s, img, p } = st;
    ctx.clearRect(0, 0, w, h);
    if (!img?.naturalWidth || p <= 0) return;
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const ox = (w - img.naturalWidth * k) / 2;
    const oy = (h - img.naturalHeight * k) / 2;
    if (p >= 1) { ctx.drawImage(img, ox, oy, img.naturalWidth * k, img.naturalHeight * k); return; }
    const maxD = Math.hypot(st.cols, st.rows);
    for (let y = 0; y < st.rows; y++) {
      for (let x = 0; x < st.cols; x++) {
        // Squares near the pointer arrive first; a square flashes a palette colour just before the photo lands.
        const at = (Math.hypot(x - st.origin[0], y - st.origin[1]) / maxD) * 0.7 + hash(x, y) * 0.3;
        const t = p * 1.25 - at;
        if (t <= 0) continue;
        const dx = x * s, dy = y * s;
        if (t < 0.18) {
          ctx.fillStyle = FLASH[Math.floor(hash(y, x) * FLASH.length)];
          ctx.fillRect(dx, dy, s, s);
        } else {
          ctx.drawImage(img, (dx - ox) / k, (dy - oy) / k, s / k, s / k, dx, dy, s, s);
        }
      }
    }
  }

  function show(target, event, point) {
    if (cell === target) return;
    cell?.classList.remove('is-peek');
    cell = target;
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st.w = w; st.h = h;
    st.s = Math.max(14, Math.round(cellSize() / 4) * 2); // half a site square, kept even
    st.cols = Math.ceil(w / st.s);
    st.rows = Math.ceil(h / st.s);
    const r = target.getBoundingClientRect();
    st.origin = point ? [(point[0] - r.left) / st.s, (point[1] - r.top) / st.s] : [0, 0];
    st.img = photo(photoUrl(event));
    if (!st.img.complete) st.img.addEventListener('load', draw, { once: true });

    const left = event.spots - event.taken;
    text.textContent = left ? `${event.taken}/${event.spots} taken` : 'Full';
    bar.style.setProperty('--p', (event.taken / event.spots).toFixed(3));
    el.classList.toggle('is-low', left <= 5);
    target.prepend(el);
    target.classList.add('is-peek');

    tween?.kill();
    st.p = 0;
    if (reducedMotion) { st.p = 1; draw(); return; }
    tween = gsap.to(st, { p: 1, duration: DUR.base, ease: EASE.out, onUpdate: draw });
  }

  function hide() {
    if (!cell) return;
    const from = cell;
    cell = null;
    from.classList.remove('is-peek');
    tween?.kill();
    const done = () => { if (!cell) el.remove(); };
    if (reducedMotion) { done(); return; }
    tween = gsap.to(st, { p: 0, duration: DUR.fast, ease: EASE.inOut, onUpdate: draw, onComplete: done });
  }

  return { show, hide, get cell() { return cell; } };
}
