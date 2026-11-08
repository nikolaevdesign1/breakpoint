import { CHAPTERS, INTRO_END } from './path.js';
import { prepareText } from '../type-reveal.js';

// The words of the rally: each chapter fades in as its shot begins and out as the next one starts.
// Items arrive one after another (data-d) and drift against the scroll at their own depth (data-depth),
// so the columns never move as one block. Transform and opacity only.
// The big headings (.rc__big) come out of a blur letter by letter, like every heading on the site;
// here the scroll scrubs it instead of a timer (see CHAR_SPREAD).

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
const FADE = 0.16; // share of a chapter spent fading in (and out)
const DRIFT = 120; // px of parallax travel at depth 1
const CHAR_SPREAD = 0.55; // share of a heading's arrival that the first and last letter are apart
const BLUR = 6;
const SETTLE = 0.72; // share of a letter's arrival spent swapping through other letters before it locks
const SWAP_MS = 90;
const MASK_PAD = 160; // px the word mask reaches past the word on the sides that never move
const MAX_ZONES = 4;

// Words stay in the page for screen readers; only a faded-out link leaves the tab order.
function put(el, w, y, link) {
  const key = `${w.toFixed(3)}|${y.toFixed(1)}`;
  if (el._k === key) return;
  el._k = key;
  el.style.opacity = w;
  el.style.transform = `translate3d(0, ${y}px, 0)`;
  if (link) el.style.visibility = w < 0.01 ? 'hidden' : 'visible';
}

export function createChapters(stage, onJump) {
  const chapters = [...stage.querySelectorAll('[data-chapter]')].map((el) => ({
    el,
    items: [...el.querySelectorAll('[data-d]')].map((n) => {
      const big = n.classList.contains('rc__big');
      if (big) {
        prepareText(n, { mode: 'chars' });
        // lock each letter to its own width, so the stand-in letters never push the line around
        const letters = [...n.querySelectorAll('.tr-char')];
        const widths = letters.map((c) => c.getBoundingClientRect().width);
        if (widths.some(Boolean)) letters.forEach((c, i) => { c.style.width = `${widths[i]}px`; });
      }
      return { el: n, d: +n.dataset.d, depth: +n.dataset.depth || 0, link: !!n.querySelector('a'), chars: big ? [...n.querySelectorAll('.tr-char')] : null, pool: big ? [...n.textContent.replace(/\s+/g, '')] : null };
    }),
    counts: [...el.querySelectorAll('[data-count]')].map((n) => ({ el: n, to: +n.dataset.count })),
    words: [...el.querySelectorAll('[data-word]')],
  }));
  const intro = stage.querySelector('[data-rally-intro]');
  const rail = stage.querySelector('[data-rally-rail]');
  const ticks = rail ? [...rail.children] : [];
  ticks.forEach((b, i) => b.addEventListener('click', () => onJump(i)));
  if (rail) rail.hidden = false;
  let lastOn = -1;
  let lastP = 0;

  return {
    update(p) {
      lastP = p;
      put(intro, 1 - smooth(clamp(p / (INTRO_END * 0.85))), -clamp(p / INTRO_END) * 60, false);
      let on = -1;
      chapters.forEach((c, i) => {
        const [a, b] = CHAPTERS[i].p;
        const q = (p - a) / (b - a);
        const last = i === chapters.length - 1;
        const w = smooth(clamp(q / FADE)) * (last ? 1 : smooth(clamp((1 - q) / FADE)));
        if (q >= 0 && q < 1) on = i;
        for (const it of c.items) {
          const wi = smooth(clamp((w - it.d * 0.14) / (1 - it.d * 0.14)));
          it.w = wi;
          put(it.el, it.chars ? (wi > 0.001 ? 1 : 0) : wi, (0.5 - clamp(q, -0.2, 1.2)) * it.depth * DRIFT + (1 - wi) * 28, it.link);
          if (it.chars) {
            const n = it.chars.length;
            it.chars.forEach((ch, k) => {
              const pc = smooth(clamp((wi - (k / n) * CHAR_SPREAD) / (1 - CHAR_SPREAD)));
              const swapping = pc > 0 && pc < SETTLE;
              const now = performance.now();
              // while it arrives a letter flips through other letters of its heading, then settles on its own
              if (swapping && now - (ch._t || 0) >= SWAP_MS) {
                ch._t = now;
                const pool = it.pool;
                ch.textContent = pool[(Math.random() * pool.length) | 0];
                ch._k = null;
              } else if (!swapping && ch.textContent !== ch.dataset.char) {
                ch.textContent = ch.dataset.char;
              }
              const key = pc.toFixed(2);
              if (ch._k === key) return;
              ch._k = key;
              ch.style.opacity = pc;
              ch.style.filter = pc >= 1 ? '' : `blur(${(BLUR * (1 - pc)).toFixed(1)}px)`;
            });
          }
        }
        // one huge word at a time, drawn left to right by a mask while its act plays on the clay
        c.words.forEach((n, k) => {
          const x = clamp(q) * c.words.length - k;
          const draw = smooth(clamp(x / 0.55));
          const gone = smooth(clamp((x - 0.82) / 0.18));
          const o = (x > 0 && x < 1 ? 1 : 0) * (1 - gone) * w;
          n._o = o;
          const key = `${draw.toFixed(3)}|${o.toFixed(3)}`;
          if (n._k === key) return;
          n._k = key;
          n.style.opacity = o;
          // the mask only moves the right edge; the others sit far outside the word, so the soft shadow of the letters is never cut into a box
          n.style.clipPath = `inset(-${MASK_PAD}px ${((1 - draw) * 100).toFixed(1)}% -${MASK_PAD}px -${MASK_PAD}px)`;
        });
        for (const n of c.counts) {
          const v = Math.round(n.to * smooth(clamp((q - 0.12) / 0.5)));
          if (n.v !== v) { n.v = v; n.el.textContent = v; }
        }
      });
      if (on !== lastOn) {
        lastOn = on;
        ticks.forEach((b, i) => b.classList.toggle('is-on', i === on));
      }
    },
    // Where the big words are on screen and how present they are (0..1), as rectangles in stage pixels.
    // stage.js darkens the render softly under each one, so white letters hold on a light sky.
    zones(out) {
      out.length = 0;
      const box = stage.getBoundingClientRect();
      const add = (a, ...els) => {
        if (a < 0.01 || out.length >= MAX_ZONES) return;
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const el of els) {
          const q = el.getBoundingClientRect();
          if (!q.width) continue;
          l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
        }
        if (l < r) out.push({ x: (l + r) / 2 - box.left, y: (t + b) / 2 - box.top, w: r - l, h: b - t, a });
      };
      add(Math.max(0, 1 - smooth(clamp(lastP / (INTRO_END * 0.85)))), intro.querySelector('.rally__title'));
      chapters.forEach((c) => {
        c.items.forEach((it) => { if (it.chars) add(it.w || 0, it.el); });
        c.words.forEach((n) => add(n._o || 0, n.querySelector('b'), n.querySelector('.rc__cap')));
      });
      return out;
    },
    reset() {
      [intro, ...chapters.flatMap((c) => [...c.items.map((i) => i.el), ...c.words])].forEach((n) => n.removeAttribute('style'));
      chapters.forEach((c) => c.items.forEach((i) => i.chars?.forEach((ch) => { ch.style.opacity = ''; ch.style.filter = ''; ch._k = null; })));
      chapters.forEach((c) => c.counts.forEach((n) => { n.el.textContent = n.to; }));
      if (rail) rail.hidden = true;
    },
  };
}
