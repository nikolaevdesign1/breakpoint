import { courtScreenRect, onViewChange, groundToScreen, isFlying } from '../scene.js';

// Marks pinned to the map (round 10): a flat DOM layer over the canvas, so the type stays crisp
// Switzer at any zoom. Two kinds of pin:
// - plain: a small plate at a point (the numbered stops of "Your day");
// - annotation: a hologram-style ring marker on the court (dashed rim turning like a radar), a segmented leader line and a label with corner brackets and scanlines (booking-club.css).
//   It builds in when its court is large enough on screen and in view (the ring springs, the line
//   draws, the label unfolds with a short glitch, the rows come one by one) and builds out when it leaves. The label takes the side
//   (left or right, above or below) that stays on screen and keeps clear of the other labels.
// The layer steps aside under the booking tiles and the postcard (CSS). A dashed line can run
// through a list of plain pins.

const SIDES = [[1, -1], [-1, -1], [1, 1], [-1, 1]]; // [x, y] of the label from the marker: right up, left up, right down, left down
const REACH = [56, 40]; // px: leader line run in x and y
const GAP = 6;

export function createPins() {
  const layer = document.createElement('div');
  layer.className = 'cl-layer';
  layer.innerHTML = '<svg class="cl-route" aria-hidden="true"><path class="cl-route__under"/><path class="cl-route__line"/></svg>';
  document.body.append(layer);
  const svg = layer.querySelector('svg');
  const under = svg.querySelector('.cl-route__under');
  const line = svg.querySelector('.cl-route__line');
  const pins = new Map(); // key -> { el, at, minW, html, annot?, text?, size?, side? }
  let route = null; // pin keys, in order
  let queued = false;

  /** Screen point of a pin: a corner of its court ('tl' 'tr' 'bl' 'br' 'c' 'bc') or a ground point { x, z }. */
  function place(at, rects) {
    if (at.court) {
      const r = (rects[at.court] ??= courtScreenRect(at.court));
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      const p = { tl: [r.left, r.top], tr: [r.right, r.top], bl: [r.left, r.bottom], br: [r.right, r.bottom], c: [cx, cy], bc: [cx, r.bottom] }[at.corner ?? 'c'];
      return { x: p[0] + (at.dx ?? 0), y: p[1] + (at.dy ?? 0), w: r.right - r.left };
    }
    const s = groundToScreen(at.x, at.z);
    return { x: s.x + (at.dx ?? 0), y: s.y + (at.dy ?? 0), w: Infinity };
  }

  /** The label's rectangle for a side; its height is kept inside the screen (clear of the bars), so the leader line may lean more. */
  const labelRect = (s, side, size, h) => {
    const [sx, sy] = SIDES[side];
    const x = s.x + sx * REACH[0];
    const y = Math.min(Math.max(s.y + sy * REACH[1] - 12, 64), h - 64 - size.h);
    return { l: sx > 0 ? x : x - size.w, t: y, r: sx > 0 ? x + size.w : x, b: y + size.h, dx: sx * REACH[0], dy: y + 12 - s.y };
  };
  const clear = (a, b) => a.r + GAP <= b.l || b.r + GAP <= a.l || a.b + GAP <= b.t || b.b + GAP <= a.t;

  function layout() {
    queued = false;
    layer.classList.toggle('is-hidden', isFlying());
    if (!pins.size) { line.removeAttribute('d'); under.removeAttribute('d'); return; }
    const rects = {};
    const w = innerWidth;
    const h = innerHeight;
    const at = new Map();
    const taken = []; // label rectangles placed so far
    for (const [key, p] of pins) {
      const s = place(p.at, rects);
      at.set(key, s);
      const off = s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40;
      p.el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0)`;
      if (!p.annot) {
        p.el.classList.toggle('is-far', s.w < (p.minW ?? 0));
        p.el.classList.toggle('is-off', off);
        continue;
      }
      const shown = s.w >= (p.minW ?? 0) && !off && !(p.hide);
      p.el.classList.toggle('is-in', shown && p.ready);
      if (!shown) continue;
      p.size ??= { w: p.text.offsetWidth, h: p.text.offsetHeight };
      // The side it had if it still fits, else the first that stays on screen and clear of the others.
      const fits = (i) => { const r = labelRect(s, i, p.size, h); return r.l >= 8 && r.r <= w - 8 && taken.every((o) => clear(r, o)); };
      const order = [p.side, ...(p.at.corner?.endsWith('l') ? [1, 0, 3, 2] : [0, 1, 2, 3])].filter((i) => i !== undefined);
      const side = order.find(fits) ?? p.side ?? order[0];
      const r = labelRect(s, side, p.size, h);
      const shape = `${side}|${Math.round(r.dy)}`;
      if (shape !== p.shape) {
        p.shape = shape;
        p.side = side;
        p.el.style.setProperty('--len', `${Math.hypot(r.dx, r.dy).toFixed(1)}px`);
        p.el.style.setProperty('--ang', `${Math.atan2(r.dy, r.dx).toFixed(4)}rad`);
        p.el.style.setProperty('--ox', `${r.dx}px`);
        p.el.style.setProperty('--oy', `${Math.round(r.dy - 12)}px`);
        p.el.style.setProperty('--sx', r.dx > 0 ? '0%' : '-100%');
        p.el.classList.toggle('is-left', r.dx < 0);
      }
      taken.push(r);
    }
    const pts = (route ?? []).map((k) => at.get(k)).filter(Boolean);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const d = pts.length > 1 ? pts.map((s, i) => `${i ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join('') : '';
    if (d) { line.setAttribute('d', d); under.setAttribute('d', d); } else { line.removeAttribute('d'); under.removeAttribute('d'); }
    svg.classList.toggle('is-on', !!d);
  }

  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(layout); } };
  onViewChange(schedule);
  addEventListener('resize', schedule);
  document.addEventListener('bp-clock', schedule);

  function make(key, { annot, cls, tag }) {
    const el = document.createElement('div');
    el.className = `cl-pin ${annot ? 'cl-ann' : ''} ${cls}`;
    layer.append(el);
    const p = { el, html: '', annot };
    pins.set(key, p);
    if (annot) requestAnimationFrame(() => requestAnimationFrame(() => { p.ready = true; schedule(); }));
    else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    return p;
  }

  /** The annotation's parts: marker, leader line, label (a button when it can be clicked). */
  function build(p, { rows, onClick, label }) {
    const html = rows.map((r, i) => `<span class="cl-ann__l${r.cls ? ` ${r.cls}` : ''}" style="--n:${i}">${r.t}</span>`).join('');
    if (!p.text || (p.text.tagName === 'BUTTON') !== !!onClick) {
      p.el.innerHTML = '<i class="cl-ann__dot"></i><i class="cl-ann__line"></i>';
      p.text = document.createElement(onClick ? 'button' : 'span');
      p.text.className = 'cl-ann__text';
      if (onClick) {
        p.text.type = 'button';
        // Hover: the label leans a few pixels after the pointer (parallax); CSS reads --px and --py.
        p.text.addEventListener('pointermove', (e) => {
          const r = p.text.getBoundingClientRect();
          p.text.style.setProperty('--px', `${(((e.clientX - r.left) / r.width - 0.5) * 6).toFixed(1)}px`);
          p.text.style.setProperty('--py', `${(((e.clientY - r.top) / r.height - 0.5) * 4).toFixed(1)}px`);
        });
        p.text.addEventListener('pointerleave', () => { p.text.style.setProperty('--px', '0px'); p.text.style.setProperty('--py', '0px'); });
      }
      p.el.append(p.text);
      p.size = null;
    }
    if (p.html !== html) { p.text.innerHTML = `<span class="cl-ann__box">${html}</span>`; p.html = html; p.size = null; }
    if (label) p.text.setAttribute('aria-label', label); else p.text.removeAttribute('aria-label');
    p.text.onclick = onClick ?? null;
  }

  return {
    /**
     * Adds or updates a pin. `at`: { court, corner, dx, dy } or { x, z }; `minW`: the court's width on
     * screen it needs. Plain: `html`. Annotation: `rows: [{ t, cls? }]`, `tone: 'dark' | 'light' | 'clay'`.
     */
    put(key, { at, html, rows, tone = 'dark', cls = '', minW = 0, onClick, label, hide = false }) {
      let p = pins.get(key);
      if (!p) p = make(key, { annot: !!rows, cls });
      if (rows) { build(p, { rows, onClick, label }); p.el.dataset.tone = tone; p.hide = hide; } else {
        if (p.html !== html) { p.el.innerHTML = html; p.html = html; }
      }
      p.at = at;
      p.minW = minW;
      schedule();
    },
    drop(key) {
      const p = pins.get(key);
      if (!p) return;
      pins.delete(key);
      p.el.classList.remove('is-in');
      setTimeout(() => p.el.remove(), 2200); // the build-out plays first
      schedule();
    },
    /** Drops every pin whose key starts with `prefix` and is not in `keep`. */
    sweep(prefix, keep) {
      for (const k of [...pins.keys()]) if (k.startsWith(prefix) && !keep.has(k)) this.drop(k);
    },
    /** A dashed line through these pins, in order (null: none). */
    route(keys) { route = keys; schedule(); },
    layer,
  };
}
