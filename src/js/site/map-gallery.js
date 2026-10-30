import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GALLERY, TILES } from './gallery-data.js';

// Club life: one big field of small pictures, laid out like a map. Over the field the cursor is a "+":
// a click zooms the whole field in on that spot until three to five pictures fill the frame; a click on
// those, or any picture, zooms in further, down to a single picture filling the frame. While zoomed the page
// does not scroll: the wheel, a drag or the arrow keys move along the map instead. The Back button or Esc
// returns to the overview, and the page scrolls on again. Hovering a picture lifts and enlarges it.
//
// The field is FW x FH design units; one transform (x, y, scale) on it does all the zooming.

const FW = 1600;
const FH = 900;
const GAP = 4;
const GROUP_MIN = 3; // pictures that fill the frame after a zoom: three to five
const GROUP_MAX = 5;
const GROUP_W = 380; // widest and tallest area a group may cover, in field units
const GROUP_H = 250;
const PAD = 0.1; // share of the frame left empty around the group
const WIDTHS = [46, 56, 66, 78, 92, 110];

// Small deterministic generator, so the map looks the same on every visit.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// An organic blob: three overlapping ellipses, like the reference's cluster.
const inBlob = (x, y) => [[0.3, 0.46, 0.3, 0.42], [0.58, 0.54, 0.34, 0.4], [0.82, 0.4, 0.2, 0.34]]
  .some(([cx, cy, rx, ry]) => (((x / FW - cx) / rx) ** 2 + ((y / FH - cy) / ry) ** 2) < 1);

function layout() {
  const rand = rng(20261030);
  const placed = [];
  const order = GALLERY.map((_, i) => i).sort(() => rand() - 0.5);
  let n = 0;
  for (let tries = 0; placed.length < TILES && tries < 6000; tries += 1) {
    const src = GALLERY[order[n % order.length]];
    const w = WIDTHS[Math.floor(rand() * WIDTHS.length)];
    const h = Math.round(w / src.ar);
    const x = Math.round(rand() * (FW - w));
    const y = Math.round(rand() * (FH - h));
    if (![[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]].every(([px, py]) => inBlob(px, py))) continue;
    if (placed.some((p) => x < p.x + p.w + GAP && x + w + GAP > p.x && y < p.y + p.h + GAP && y + h + GAP > p.y)) continue;
    placed.push({ x, y, w, h, src, pos: `${Math.round(rand() * 40 + 30)}% ${Math.round(rand() * 30 + 10)}%` });
    n += 1;
  }
  return placed;
}

export function initMapGallery({ reducedMotion }) {
  const root = document.querySelector('[data-mapg]');
  if (!root) return;
  const stage = root.querySelector('[data-mapg-stage]');
  const field = root.querySelector('[data-mapg-field]');
  const back = root.querySelector('[data-mapg-back]');

  const tiles = layout().map((t) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mapg__tile';
    el.style.cssText = `left:${(t.x / FW) * 100}%;top:${(t.y / FH) * 100}%;width:${(t.w / FW) * 100}%;height:${(t.h / FH) * 100}%`;
    el.setAttribute('aria-label', t.src.alt ? `Zoom in: ${t.src.alt}` : 'Zoom in on this part of the club');
    el.innerHTML = t.src.video
      ? `<video muted loop playsinline preload="none" poster="${t.src.src}" data-src="${t.src.video}" style="object-position:${t.pos}"></video>`
      : `<img src="${t.src.src}" alt="" loading="lazy" decoding="async" style="object-position:${t.pos}" />`;
    field.append(el);
    return { ...t, el, cx: t.x + t.w / 2, cy: t.y + t.h / 2 };
  });
  const videos = [...field.querySelectorAll('video')];

  let sw = 0;
  let sh = 0;
  let focus = null; // tiles in frame while zoomed
  const view = (scale, cx, cy) => ({ scale, x: sw / 2 - cx * scale, y: sh / 2 - cy * scale });
  const overview = () => view(Math.min(sw / FW, sh / FH), FW / 2, FH / 2);
  const go = (v, instant) => {
    gsap.to(field, { x: v.x, y: v.y, scale: v.scale, duration: instant || reducedMotion ? 0 : 1.15, ease: 'power3.inOut', overwrite: true });
  };

  const measure = () => {
    sw = stage.clientWidth; sh = stage.clientHeight;
    field.style.width = `${FW}px`; field.style.height = `${FH}px`;
    if (focus) zoom(focus, true); else go(overview(), true);
  };

  function zoom(group, instant) {
    focus = group;
    const x0 = Math.min(...group.map((t) => t.x)); const x1 = Math.max(...group.map((t) => t.x + t.w));
    const y0 = Math.min(...group.map((t) => t.y)); const y1 = Math.max(...group.map((t) => t.y + t.h));
    const scale = Math.min(sw / (x1 - x0), sh / (y1 - y0)) * (1 - PAD * 2);
    go(view(Math.min(scale, 7), (x0 + x1) / 2, (y0 + y1) / 2), instant);
    root.classList.add('is-zoomed');
    back.hidden = false;
    window.__lenis?.stop(); // the page waits while the map is zoomed
    tiles.forEach((t) => { t.el.dataset.cursor = group.length === 1 && group[0] === t ? 'Back' : '+'; });
  }
  function reset() {
    focus = null;
    go(overview());
    root.classList.remove('is-zoomed');
    back.hidden = true;
    window.__lenis?.start();
    tiles.forEach((t) => { t.el.dataset.cursor = '+'; });
  }
  // The pictures around a point: the closest first, then more while the group stays compact.
  const nearest = (fx, fy) => {
    const sorted = [...tiles].sort((a, b) => Math.hypot(a.cx - fx, a.cy - fy) - Math.hypot(b.cx - fx, b.cy - fy));
    const group = [sorted[0]];
    for (const t of sorted.slice(1)) {
      if (group.length >= GROUP_MAX) break;
      const all = [...group, t];
      const w = Math.max(...all.map((g) => g.x + g.w)) - Math.min(...all.map((g) => g.x));
      const h = Math.max(...all.map((g) => g.y + g.h)) - Math.min(...all.map((g) => g.y));
      if ((w <= GROUP_W && h <= GROUP_H) || group.length < GROUP_MIN) group.push(t);
    }
    return group;
  };

  const toField = (e) => {
    const r = stage.getBoundingClientRect();
    const s = gsap.getProperty(field, 'scale');
    return [(e.clientX - r.left - gsap.getProperty(field, 'x')) / s, (e.clientY - r.top - gsap.getProperty(field, 'y')) / s];
  };

  let dragged = false;
  tiles.forEach((t) => {
    t.el.dataset.cursor = '+';
    t.el.addEventListener('click', (e) => {
      if (dragged) { e.preventDefault(); return; }
      if (focus?.length === 1 && focus[0] === t) { reset(); return; } // a single picture in frame: a click leaves
      if (focus?.includes(t)) { zoom([t]); return; } // a picture of the group: closer, down to that picture alone
      const [fx, fy] = e.detail ? toField(e) : [t.cx, t.cy]; // keyboard: around the tile itself
      const around = nearest(fx, fy);
      zoom(around.includes(t) ? around : nearest(t.cx, t.cy));
    });
  });
  back.addEventListener('click', reset);
  document.addEventListener('keydown', (e) => {
    if (!focus) return;
    if (e.key === 'Escape') reset();
    else if (e.key === 'ArrowRight') pan(-160, 0);
    else if (e.key === 'ArrowLeft') pan(160, 0);
    else if (e.key === 'ArrowDown') pan(0, -160);
    else if (e.key === 'ArrowUp') pan(0, 160);
  });
  // Moving along the map while zoomed: the wheel (any direction) goes sideways, a drag goes any way.
  const bound = (v, size, view) => (size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, v)));
  function pan(dx, dy) {
    const sc = gsap.getProperty(field, 'scale');
    gsap.to(field, { x: bound(gsap.getProperty(field, 'x') + dx, FW * sc, sw), y: bound(gsap.getProperty(field, 'y') + dy, FH * sc, sh), duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
  }
  stage.addEventListener('wheel', (e) => {
    if (!focus) return; // not zoomed: the page scrolls on as usual
    e.preventDefault();
    pan(-(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY), 0);
  }, { passive: false });
  let grab = null;
  stage.addEventListener('pointerdown', (e) => { if (focus) grab = { x: e.clientX, y: e.clientY, fx: gsap.getProperty(field, 'x'), fy: gsap.getProperty(field, 'y') }; dragged = false; });
  window.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const dx = e.clientX - grab.x;
    const dy = e.clientY - grab.y;
    if (Math.hypot(dx, dy) > 6) dragged = true;
    if (!dragged) return;
    const sc = gsap.getProperty(field, 'scale');
    gsap.set(field, { x: bound(grab.fx + dx, FW * sc, sw), y: bound(grab.fy + dy, FH * sc, sh) });
  });
  window.addEventListener('pointerup', () => { grab = null; setTimeout(() => { dragged = false; }, 0); });

  // Clips play only while the map is on screen.
  new IntersectionObserver(([en]) => {
    videos.forEach((v) => {
      if (en.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
    });
  }, { threshold: 0.15 }).observe(stage);

  gsap.set(field, { transformOrigin: '0 0' });
  measure();
  new ResizeObserver(measure).observe(stage);
  if (!reducedMotion) {
    const els = tiles.map((t) => t.el);
    gsap.set(els, { autoAlpha: 0, scale: 0.6 });
    ScrollTrigger.create({
      trigger: stage,
      start: 'top 80%',
      once: true,
      onEnter: () => gsap.to(els, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)', stagger: { amount: 1.2, from: 'random' } }),
    });
  }
}
