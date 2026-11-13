import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GALLERY, TILES } from './gallery-data.js';
import { layoutWide, layoutNarrow } from './gallery-layout.js';

// Club life: one big field of small pictures, laid out like a map. Three levels:
//   1  the whole field (cursor "+")
//   2  one zoom: a cell of three to five pictures fills the frame (cursor "+")
//   3  second zoom: a single picture or clip, the clip plays (cursor "−", it only leads back)
// A click or tap on the cursor, on a picture or on the empty space goes one level further (1 → 2 → 3); on level 3
// the same click goes one level back. Esc and "Back to all" go one level back too (3 → 2, 2 → 1).
// While zoomed the page does not scroll and the map moves freely in both directions: wheel and trackpad, a drag
// with inertia, the arrow keys, Home / End / Page keys, a pinch or Ctrl + wheel. Zoom gestures settle on the
// nearest level; the small chart in the bottom left corner moves the window. The edges give way like rubber.
//
// Two canvases: a landscape field on wide screens, a dense portrait field on phones and tablets in portrait.
// One transform (x, y, scale) on the field does all the zooming; pictures load only near the window.

const GROUP_MIN = 3; // pictures that fill the frame after a zoom: three to five
const GROUP_MAX = 5;
const PAD = 0.1; // share of the frame left empty around the group
const MAX_SCALE = 8;
const TAP = 8; // px of finger travel that still counts as a tap

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const even = (n) => Math.round(n / 2) * 2;

export function initMapGallery({ reducedMotion }) {
  const root = document.querySelector('[data-mapg]');
  if (!root) return;
  const stage = root.querySelector('[data-mapg-stage]');
  const field = root.querySelector('[data-mapg-field]');
  const back = root.querySelector('[data-mapg-back]');
  const sub = root.querySelector('.mapg__sub');
  const subWide = sub?.textContent;
  const items = GALLERY.slice(0, TILES);

  // ---------- DOM: tiles, controls, chart, hint ----------
  const zoomInLabel = (src) => (src.alt ? `Zoom in: ${src.alt}` : 'Zoom in on this part of the club');
  const tiles = items.map((src) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mapg__tile';
    el.setAttribute('aria-label', zoomInLabel(src));
    el.innerHTML = src.video
      ? '<video muted loop playsinline preload="none"></video>'
      : `<img alt="" decoding="async" width="${Math.round(src.ar * 100)}" height="100" />`;
    field.append(el);
    return { el, src, media: el.firstElementChild, x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0, state: 0 };
  });

  const mini = document.createElement('div');
  mini.className = 'mapg__mini';
  mini.hidden = true;
  mini.setAttribute('aria-hidden', 'true');
  const miniView = document.createElement('b');
  miniView.className = 'mapg__miniview';
  const hint = document.createElement('p');
  hint.className = 'mapg__hint';
  hint.hidden = true;
  hint.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span></span>';
  const status = document.createElement('p');
  status.className = 'visually-hidden';
  status.setAttribute('role', 'status');
  stage.append(mini, hint, status);

  // ---------- Layout and geometry ----------
  let sw = 0; let sh = 0;
  let FW = 1600; let FH = 900;
  let narrow = false;
  let focus = null; // tiles in frame while zoomed
  let cell = null; // the level 2 group, kept while a single picture (level 3) is open
  const level = () => (!focus ? 1 : focus.length === 1 ? 3 : 2);
  const st = { x: 0, y: 0, s: 1 };

  function relayout() {
    const lay = narrow ? layoutNarrow(items) : layoutWide(items);
    FW = lay.w; FH = lay.h;
    field.style.width = `${FW}px`; field.style.height = `${FH}px`;
    lay.tiles.forEach((p) => {
      const t = tiles[p.i];
      Object.assign(t, { x: p.x, y: p.y, w: p.w, h: p.h, cx: p.x + p.w / 2, cy: p.y + p.h / 2 });
      t.el.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
      t.media.style.objectPosition = p.pos;
    });
    mini.replaceChildren(...tiles.map((t) => {
      const i = document.createElement('i');
      i.style.cssText = `left:${(t.x / FW) * 100}%;top:${(t.y / FH) * 100}%;width:${(t.w / FW) * 100}%;height:${(t.h / FH) * 100}%`;
      return i;
    }), miniView);
    const mh = narrow ? 96 : 72; // the chart keeps the field's proportions
    const mw = even((mh * FW) / FH);
    mini.style.height = `${mh}px`; mini.style.width = `${mw}px`;
    root.style.setProperty('--mini-w', `${mw}px`);
  }

  const view = (scale, cx, cy) => ({ s: scale, x: sw / 2 - cx * scale, y: sh / 2 - cy * scale });
  const minScale = () => Math.min(sw / FW, sh / FH);
  const startScale = () => (sw < 520 ? 1 : 1.3);
  const overview = () => (narrow ? view(startScale(), FW / 2, FH / 2) : view(minScale(), FW / 2, FH / 2));

  // Limits of x and y: the field may leave the frame by a quarter of the screen; smaller than the frame it is centred.
  const limits = (s) => {
    const w = FW * s; const h = FH * s; const px = sw / 4; const py = sh / 4;
    const lx = w + px * 2 <= sw ? [(sw - w) / 2, (sw - w) / 2] : [sw - w - px, px];
    const ly = h + py * 2 <= sh ? [(sh - h) / 2, (sh - h) / 2] : [sh - h - py, py];
    return { x0: lx[0], x1: lx[1], y0: ly[0], y1: ly[1] };
  };
  const damp = (d, span) => span * (1 - 1 / ((d / span) * 0.55 + 1));
  const rubber = (v, lo, hi, span) => (v < lo ? lo - damp(lo - v, span) : v > hi ? hi + damp(v - hi, span) : v);

  // ---------- Applying the transform; chart; lazy media ----------
  let dirty = true;
  let mediaAt = 0;
  let inView = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function apply() {
    field.style.transform = `translate3d(${st.x}px,${st.y}px,0) scale(${st.s})`;
    dirty = true;
    if (!mini.hidden) {
      const m = mini.clientWidth / FW;
      miniView.style.cssText = `left:${(-st.x / st.s) * m}px;top:${(-st.y / st.s) * m}px;width:${(sw / st.s) * m}px;height:${(sh / st.s) * m}px`;
    }
  }

  // Pictures load when they come near the window; a small file first, the full one once the picture is shown big.
  // Clips play only for the few pictures nearest the centre.
  function refreshMedia(now) {
    if (!inView || now - mediaAt < 120) return;
    mediaAt = now;
    const m = Math.max(sw, sh) * 0.4;
    const centre = [sw / 2, sh / 2];
    const vids = [];
    tiles.forEach((t) => {
      const sx = st.x + t.x * st.s; const sy = st.y + t.y * st.s; const tw = t.w * st.s; const th = t.h * st.s;
      const near = sx + tw > -m && sx < sw + m && sy + th > -m && sy < sh + m;
      const seen = sx + tw > 0 && sx < sw && sy + th > 0 && sy < sh;
      if (near && t.state < 1) {
        t.state = 1;
        if (t.src.video) t.media.poster = t.src.src;
        else { t.media.src = t.src.thumb || t.src.src; t.media.addEventListener('load', () => t.el.classList.add('is-loaded'), { once: true }); }
      }
      if (near && t.state < 2 && !t.src.video && t.src.thumb && tw * dpr > 360) { t.state = 2; t.media.src = t.src.src; }
      if (t.src.video && seen) vids.push({ t, d: Math.hypot(sx + tw / 2 - centre[0], sy + th / 2 - centre[1]) });
    });
    const limit = narrow ? 2 : 6;
    vids.sort((a, b) => a.d - b.d);
    tiles.forEach((t) => {
      if (!t.src.video || t.state < 1) { if (t.src.video && vids.some((v) => v.t === t)) t.state = 1; else return; }
      const on = vids.slice(0, limit).some((v) => v.t === t);
      if (on) { if (!t.media.src) t.media.src = t.src.video; t.media.play().catch(() => {}); } else t.media.pause();
    });
  }

  // ---------- Motion: one loop for inertia, wheel glide, rubber return and the slow drift ----------
  let mode = 'idle'; // idle | drag | free | tween | pinch
  let vx = 0; let vy = 0;
  const pend = { x: 0, y: 0 }; // wheel and key distance still to travel
  let driftDir = [1, 0.6];
  let driftHold = 0;
  let warmTimer = 0;
  const warm = () => { field.style.willChange = 'transform'; clearTimeout(warmTimer); warmTimer = setTimeout(() => { field.style.willChange = ''; }, 500); };

  function tick(time, dtms) {
    const now = performance.now();
    const dt = Math.min(dtms / 1000, 0.05);
    if (mode === 'free') {
      const L = limits(st.s);
      let moved = false;
      if (pend.x || pend.y) {
        const k = 1 - Math.exp(-dt * 12);
        ['x', 'y'].forEach((a) => {
          let d = pend[a] * k;
          const lo = a === 'x' ? L.x0 : L.y0; const hi = a === 'x' ? L.x1 : L.y1;
          if ((st[a] <= lo && d < 0) || (st[a] >= hi && d > 0)) d *= 0.3; // stiff past the edge
          st[a] += d; pend[a] -= d;
          if (Math.abs(pend[a]) < 0.3) pend[a] = 0;
        });
        moved = true;
      }
      let busy = moved;
      [['x', 'x0', 'x1'], ['y', 'y0', 'y1']].forEach(([a, lo, hi]) => {
        const out = st[a] < L[lo] ? L[lo] - st[a] : st[a] > L[hi] ? L[hi] - st[a] : 0;
        let v = a === 'x' ? vx : vy;
        if (out) v += (out * 170 - v * 23) * dt; else v *= Math.exp(-dt * 3.4);
        st[a] += v * dt;
        if (Math.abs(v) > 6 || Math.abs(out) > 0.4) busy = true; else if (out) st[a] = out > 0 ? L[lo] : L[hi];
        if (a === 'x') vx = Math.abs(v) < 6 && !out ? 0 : v; else vy = Math.abs(v) < 6 && !out ? 0 : v;
      });
      apply();
      if (!busy) mode = 'idle';
    } else if (mode === 'idle' && narrow && !focus && inView && !reducedMotion && now > driftHold) {
      const L = { x0: sw - FW * st.s, x1: 0, y0: sh - FH * st.s, y1: 0 };
      st.x += driftDir[0] * 9 * dt; st.y += driftDir[1] * 9 * dt;
      if (st.x < L.x0 || st.x > L.x1) { driftDir[0] *= -1; st.x = clamp(st.x, L.x0, L.x1); }
      if (st.y < L.y0 || st.y > L.y1) { driftDir[1] *= -1; st.y = clamp(st.y, L.y0, L.y1); }
      apply();
    }
    if (dirty) { dirty = false; refreshMedia(now); } else refreshMedia(now);
  }
  gsap.ticker.add(tick);

  function tweenTo(v, instant, duration = 1.15) {
    gsap.killTweensOf(st);
    vx = 0; vy = 0; pend.x = 0; pend.y = 0;
    field.style.willChange = '';
    if (instant || reducedMotion) { Object.assign(st, v); mode = 'idle'; apply(); return; }
    mode = 'tween';
    gsap.to(st, { ...v, duration, ease: 'power3.inOut', overwrite: true, onUpdate: apply, onComplete: () => { mode = 'idle'; apply(); refreshCursor(); } });
  }
  const stopTween = () => { if (mode === 'tween') { gsap.killTweensOf(st); mode = 'idle'; } };

  // ---------- Zoom in and out ----------
  function setSize() {
    sw = stage.clientWidth; sh = stage.clientHeight;
    const n = sw <= 900;
    if (n !== narrow || !tiles[0].w || tiles[0].cx === 0) { narrow = n; relayout(); if (sub && subWide) sub.textContent = narrow && 'ontouchstart' in window ? 'Tap a photo to zoom in, then drag to look around.' : subWide; }
  }
  function measure() {
    setSize();
    if (focus) zoom(focus, true); else tweenTo(overview(), true);
    root.classList.toggle('is-narrow', narrow);
  }

  // The view that frames a group of pictures: three to five (level 2) or one (level 3).
  function viewFor(group) {
    const x0 = Math.min(...group.map((t) => t.x)); const x1 = Math.max(...group.map((t) => t.x + t.w));
    const y0 = Math.min(...group.map((t) => t.y)); const y1 = Math.max(...group.map((t) => t.y + t.h));
    const scale = Math.min(sw / (x1 - x0), sh / (y1 - y0)) * (1 - PAD * 2);
    return view(clamp(scale, narrow && group.length > 1 ? startScale() * 1.5 : minScale(), 7), (x0 + x1) / 2, (y0 + y1) / 2);
  }

  // Everything that depends on the level lives here: classes, buttons, cursor, labels for assistive tech.
  const LABELS = {
    1: '',
    2: 'Level 2 of 3, a few photos in frame. Click a photo to see it alone, press Escape to go back.',
    3: 'Level 3 of 3, one photo in frame. Click or press Escape to go back.',
  };
  function syncLevel() {
    const L = level();
    root.dataset.level = String(L);
    root.classList.toggle('is-zoomed', L > 1);
    back.hidden = L === 1; mini.hidden = L === 1;
    if (L === 1) hint.hidden = true;
    back.querySelector('.btn__label').textContent = L === 3 ? 'Back' : 'Back to all';
    back.setAttribute('aria-label', L === 3 ? 'Back to the group of photos' : 'Back to all photos');
    tiles.forEach((t) => t.el.setAttribute('aria-label', L === 3 ? 'Zoom out' : zoomInLabel(t.src)));
    status.textContent = LABELS[L];
    setCursor(L === 3 ? '−' : '+'); // level 3 can only lead back: always the minus
    setTimeout(refreshCursor, 0);
  }

  function zoom(group, instant) {
    const lenis = window.__lenis;
    const off = stage.getBoundingClientRect().top;
    const align = !focus && Math.abs(off) > 2; // bring the whole map into the window, so no other block shows under it
    focus = group;
    if (group.length > 1) cell = group; else if (!cell || !cell.includes(group[0])) cell = nearest(group[0].cx, group[0].cy);
    tweenTo(viewFor(group), instant);
    syncLevel();
    if (level() > 1) showHint();
    if (align && lenis) lenis.scrollTo(lenis.scroll + off, { duration: 0.8, force: true, onComplete: () => { if (focus) lenis.stop(); } });
    else if (align) scrollTo({ top: scrollY + off, behavior: 'smooth' });
    else lenis?.stop();
  }
  function reset() {
    focus = null; cell = null;
    tweenTo(overview());
    syncLevel();
    driftHold = performance.now() + 1500;
    window.__lenis?.start();
  }
  // One level back: 3 → 2, 2 → 1. On level 1 there is nothing to leave.
  function stepBack() {
    const L = level();
    if (L === 3) zoom(cell || nearest(focus[0].cx, focus[0].cy));
    else if (L === 2) reset();
  }
  // Zoom by a factor around a point of the frame (Ctrl + wheel).
  function zoomAt(factor, px, py) {
    const s = clamp(st.s * factor, minScale(), MAX_SCALE);
    const fx = (px - st.x) / st.s; const fy = (py - st.y) / st.s;
    const L = limits(s);
    stopTween(); Object.assign(st, { s, x: clamp(px - fx * s, L.x0, L.x1), y: clamp(py - fy * s, L.y0, L.y1) }); mode = 'idle'; apply();
  }
  // After a pinch or Ctrl + wheel the map lands on the nearest level (by scale), around what is in the middle of the frame.
  function settle() {
    if (!focus) return;
    const cx = (sw / 2 - st.x) / st.s; const cy = (sh / 2 - st.y) / st.s;
    const [t3] = [...tiles].sort((a, b) => Math.hypot(a.cx - cx, a.cy - cy) - Math.hypot(b.cx - cx, b.cy - cy));
    const g2 = nearest(cx, cy);
    const scales = [overview().s, viewFor(g2).s, viewFor([t3]).s];
    const d = scales.map((v) => Math.abs(Math.log(st.s / v)));
    const pick = d.indexOf(Math.min(...d)) + 1;
    if (pick === 1) reset();
    else if (pick === 2) zoom(g2);
    else { cell = g2.includes(t3) ? g2 : nearest(t3.cx, t3.cy); zoom([t3]); }
  }
  let settleTimer = 0;
  const settleSoon = (ms) => { clearTimeout(settleTimer); settleTimer = setTimeout(settle, ms); };

  // The pictures around a point: the closest first, then more while the group stays compact.
  const groupBox = () => (narrow ? [300, 420] : [380, 250]);
  const nearest = (fx, fy) => {
    const [GW, GH] = groupBox();
    const sorted = [...tiles].sort((a, b) => Math.hypot(a.cx - fx, a.cy - fy) - Math.hypot(b.cx - fx, b.cy - fy));
    const group = [sorted[0]];
    for (const t of sorted.slice(1)) {
      if (group.length >= GROUP_MAX) break;
      const all = [...group, t];
      const w = Math.max(...all.map((g) => g.x + g.w)) - Math.min(...all.map((g) => g.x));
      const h = Math.max(...all.map((g) => g.y + g.h)) - Math.min(...all.map((g) => g.y));
      if ((w <= GW && h <= GH) || group.length < GROUP_MIN) group.push(t);
    }
    return group;
  };
  const toField = (e) => {
    const r = stage.getBoundingClientRect();
    return [(e.clientX - r.left - st.x) / st.s, (e.clientY - r.top - st.y) / st.s];
  };

  // ---------- Cursor label ----------
  let mx = -1; let my = -1;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  const refreshCursor = () => { if (mx >= 0) document.elementFromPoint(mx, my)?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); };
  const setCursor = (text) => { stage.dataset.cursor = text; tiles.forEach((t) => { t.el.dataset.cursor = text; }); };

  // ---------- Hint ----------
  let hintShown = false;
  let hintTimer = 0;
  function showHint() {
    if (hintShown) return;
    hintShown = true;
    hint.lastElementChild.textContent = narrow ? 'Drag to look around, pinch to zoom' : 'Drag or scroll to look around';
    hint.hidden = false;
    hintTimer = setTimeout(hideHint, 7000);
  }
  function hideHint() { hint.hidden = true; clearTimeout(hintTimer); }

  // ---------- Clicks ----------
  // One handler on the stage. While zoomed the stage holds the pointer capture (for dragging), so a click lands on the
  // stage itself, not on a picture: the picture under the point is found by geometry, not by event.target.
  let dragged = false;
  const hit = (fx, fy) => tiles.find((t) => fx >= t.x && fx <= t.x + t.w && fy >= t.y && fy <= t.y + t.h);
  const closest = (fx, fy) => [...tiles].sort((a, b) => Math.hypot(a.cx - fx, a.cy - fy) - Math.hypot(b.cx - fx, b.cy - fy))[0];
  stage.addEventListener('click', (e) => {
    if (dragged || e.target.closest('.mapg__back, .mapg__mini')) return;
    const L = level();
    if (L === 3) { stepBack(); return; } // a picture, the empty space or the minus: one level back
    const key = !e.detail && e.target.closest('.mapg__tile'); // Enter on a focused picture: around that picture
    const own = key && tiles.find((t) => t.el === key);
    const [fx, fy] = own ? [own.cx, own.cy] : toField(e);
    const t = own || hit(fx, fy);
    if (L === 2) { zoom([t || closest(fx, fy)]); return; } // a picture or the nearest one: down to that picture alone
    const around = nearest(fx, fy);
    zoom(t && !around.includes(t) ? nearest(t.cx, t.cy) : around);
  });
  back.addEventListener('click', stepBack);

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (!focus || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 180;
    const go = (dx, dy) => { e.preventDefault(); stopTween(); mode = 'free'; pend.x += dx; pend.y += dy; hideHint(); warm(); };
    if (e.key === 'Escape') stepBack();
    else if (e.key === 'ArrowRight') go(-step, 0);
    else if (e.key === 'ArrowLeft') go(step, 0);
    else if (e.key === 'ArrowDown') go(0, -step);
    else if (e.key === 'ArrowUp') go(0, step);
    else if (e.key === 'PageDown') go(0, -sh * 0.8);
    else if (e.key === 'PageUp') go(0, sh * 0.8);
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const L = limits(st.s);
      tweenTo(e.key === 'Home' ? { s: st.s, x: L.x1, y: L.y1 } : { s: st.s, x: L.x0, y: L.y0 }, false, 0.9);
    }
  });

  // ---------- Wheel and trackpad ----------
  stage.addEventListener('wheel', (e) => {
    if (!focus) return; // not zoomed: the page scrolls on as usual
    e.preventDefault();
    hideHint();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sh : 1;
    if (e.ctrlKey) { // trackpad pinch: zoom around the pointer
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * unit * 0.01), e.clientX - r.left, e.clientY - r.top);
      settleSoon(220);
      return;
    }
    stopTween();
    let dx = e.deltaX * unit; let dy = e.deltaY * unit;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    mode = 'free';
    pend.x = clamp(pend.x - dx * 1.15, -1800, 1800);
    pend.y = clamp(pend.y - dy * 1.15, -1800, 1800);
    warm();
  }, { passive: false });

  // ---------- Drag (mouse and one finger) and pinch ----------
  const ptrs = new Map();
  let grab = null;
  let pinch = null;
  let samples = [];
  const beginGrab = (e) => { grab = { x: e.clientX, y: e.clientY, fx: st.x, fy: st.y }; samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }]; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mapg__back, .mapg__mini')) return;
    clearTimeout(settleTimer);
    driftHold = performance.now() + 4000; // the drift stops at a touch
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (!focus) return;
    stopTween(); vx = 0; vy = 0; pend.x = 0; pend.y = 0;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: st.s, x: st.x, y: st.y };
      grab = null; mode = 'pinch'; dragged = true; warm();
      return;
    }
    mode = 'drag';
    beginGrab(e);
    stage.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinch && ptrs.size >= 2) {
      const r = stage.getBoundingClientRect();
      const [a, b] = [...ptrs.values()];
      const cx = (a.x + b.x) / 2 - r.left; const cy = (a.y + b.y) / 2 - r.top;
      const s = clamp(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), minScale(), MAX_SCALE);
      const fx = (pinch.mx - r.left - pinch.x) / pinch.s; const fy = (pinch.my - r.top - pinch.y) / pinch.s;
      const L = limits(s); const px = sw / 4; const py = sh / 4;
      st.s = s;
      st.x = rubber(cx - fx * s, L.x0, L.x1, px);
      st.y = rubber(cy - fy * s, L.y0, L.y1, py);
      hideHint(); apply();
      return;
    }
    if (!grab || !p) return;
    const dx = e.clientX - grab.x; const dy = e.clientY - grab.y;
    if (Math.hypot(dx, dy) > TAP) dragged = true;
    if (!dragged) return;
    hideHint(); warm();
    stage.classList.add('is-grabbing');
    const L = limits(st.s);
    st.x = rubber(grab.fx + dx, L.x0, L.x1, sw / 4);
    st.y = rubber(grab.fy + dy, L.y0, L.y1, sh / 4);
    const now = performance.now();
    samples.push({ t: now, x: e.clientX, y: e.clientY });
    samples = samples.filter((q) => now - q.t < 100);
    apply();
  });
  const release = (e) => {
    const had = ptrs.delete(e.pointerId);
    if (!had) return;
    stage.classList.remove('is-grabbing');
    if (pinch) {
      if (ptrs.size < 2) {
        pinch = null;
        const [rest] = [...ptrs.values()];
        if (rest) { mode = 'drag'; beginGrab({ clientX: rest.x, clientY: rest.y }); } else { mode = 'free'; settleSoon(60); }
      }
      setTimeout(() => { dragged = false; }, 0);
      return;
    }
    if (!grab) { setTimeout(() => { dragged = false; }, 0); return; }
    grab = null;
    const a = samples[0]; const b = samples[samples.length - 1];
    vx = 0; vy = 0;
    if (a && b && b.t - a.t > 10) { vx = clamp(((b.x - a.x) / (b.t - a.t)) * 1000, -3500, 3500); vy = clamp(((b.y - a.y) / (b.t - a.t)) * 1000, -3500, 3500); }
    const L = limits(st.s);
    if (narrow && dragged && st.y > L.y1 + 80) { setTimeout(() => { dragged = false; }, 0); reset(); return; } // pulled down at the top edge: leave
    mode = 'free';
    setTimeout(() => { dragged = false; }, 0);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---------- Chart in the corner: click or drag moves the window ----------
  const miniGo = (e) => {
    const r = mini.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * FW; const fy = ((e.clientY - r.top) / r.height) * FH;
    const L = limits(st.s);
    stopTween(); mode = 'idle'; vx = 0; vy = 0;
    st.x = clamp(sw / 2 - fx * st.s, L.x0, L.x1); st.y = clamp(sh / 2 - fy * st.s, L.y0, L.y1);
    hideHint(); apply();
  };
  mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); mini.setPointerCapture(e.pointerId); miniGo(e); mini.onpointermove = miniGo; });
  mini.addEventListener('pointerup', () => { mini.onpointermove = null; });
  mini.addEventListener('click', (e) => e.stopPropagation());

  // ---------- Start ----------
  new IntersectionObserver(([en]) => { inView = en.isIntersecting; if (!inView) tiles.forEach((t) => t.src.video && t.media.pause()); }, { threshold: 0.1 }).observe(stage);
  gsap.set(field, { transformOrigin: '0 0' });
  back.dataset.cursor = ''; mini.dataset.cursor = ''; // the plates keep the ordinary cursor, only the field wears the sign
  setCursor('+');
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
  // Dev hook (see window.__bp in site.js)
  if (import.meta.env?.DEV) window.__mapg = { st, get focus() { return focus; }, tiles, limits, get narrow() { return narrow; }, get size() { return [FW, FH, sw, sh]; } };
}
