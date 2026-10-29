// Soft scramble reveal, after the chriswilliamsart type-reveal but calmer: each letter flickers
// through letters of its own text (not digits), slower, while it fades in from a light blur,
// then settles on the real glyph. Words mode skips the scramble for big display lines.

const DURATION = 0.8; // seconds per letter
const STAGGER = 0.04; // seconds between letters
const FLICKER_MS = 90;
const BLUR = 6;
const SETTLE = 0.72; // share of a letter's time spent scrambling before it locks

const runs = new WeakMap();

// Wrap words (and, in 'chars' mode, letters) while keeping inline markup (em, b, spans) in place.
function split(el, mode = 'chars') {
  if (el.dataset.typeSplit === mode) return { chars: [...el.querySelectorAll('.tr-char')], words: [...el.querySelectorAll('.tr-word')] };
  if (el.dataset.typeSplit) unsplit(el);
  const chars = [];
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) { walk(child); return; }
      if (child.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const word = document.createElement('span');
        word.className = 'tr-word';
        if (mode === 'words') word.textContent = part;
        else [...part].forEach((ch) => {
          const c = document.createElement('span');
          c.className = 'tr-char';
          c.textContent = ch;
          c.dataset.char = ch;
          word.appendChild(c);
          chars.push(c);
        });
        words.push(word);
        frag.appendChild(word);
      });
      child.replaceWith(frag);
    });
  };
  walk(el);
  el.dataset.typeSplit = mode;
  return { chars, words };
}

// Letter boxes break kerning; fold words back into plain text once a reveal is done.
function unsplit(el) {
  el.querySelectorAll('.tr-word').forEach((w) => { w.textContent = w.textContent; });
  delete el.dataset.typeSplit;
}

// Lock each letter to its real width so a wide stand-in can't shove the line around.
function pinWidths(chars) {
  chars.forEach((c) => { c.textContent = c.dataset.char; c.style.width = ''; });
  const widths = chars.map((c) => c.getBoundingClientRect().width);
  if (widths.every((w) => w === 0)) return;
  chars.forEach((c, i) => { c.style.width = `${widths[i]}px`; });
}

function paint(node, p) {
  node.style.opacity = p.toFixed(3);
  node.style.filter = p >= 1 ? '' : `blur(${(BLUR * (1 - p)).toFixed(2)}px)`;
}

/**
 * Reveal `el`. mode 'chars' scrambles letter by letter, 'words' fades whole words in.
 * `fade: false` keeps letters visible and only scrambles them (hover replay).
 * Returns the total duration in seconds.
 */
export function revealText(el, { mode = 'chars', delay = 0, stagger, duration = DURATION, fade = true } = {}) {
  if (!el) return 0;
  const { chars, words } = split(el, mode);
  const units = mode === 'words' ? words : chars;
  const step = stagger ?? (mode === 'words' ? 0.11 : STAGGER);
  const dur = mode === 'words' ? duration * 1.8 : duration;
  if (!units.length) return 0;

  const prev = runs.get(el);
  if (prev) { cancelAnimationFrame(prev.raf); clearTimeout(prev.fallback); }

  if (mode === 'chars') pinWidths(chars);
  const pool = chars.map((c) => c.dataset.char).filter((ch) => /\S/.test(ch));
  if (fade) units.forEach((u) => paint(u, 0));
  words.forEach((w) => { w.style.willChange = ''; }); // promoted only while the reveal runs
  el.style.visibility = 'visible';

  const run = { raf: 0, fallback: 0 };
  runs.set(el, run);
  const start = performance.now();
  const lastSwap = new Array(units.length).fill(-Infinity);

  const finish = () => {
    units.forEach((u) => { if (fade) paint(u, 1); });
    words.forEach((w) => { w.style.willChange = 'auto'; }); // drop the compositor layers once settled
    chars.forEach((c) => { c.textContent = c.dataset.char; });
    if (fade && mode === 'chars') unsplit(el);
    if (runs.get(el) === run) runs.delete(el);
  };

  const frame = (now) => {
    const t = (now - start) / 1000 - delay;
    let active = false;
    units.forEach((u, i) => {
      const p = Math.min(1, Math.max(0, (t - i * step) / dur));
      if (p < 1) active = true;
      if (fade) paint(u, p);
      if (mode !== 'chars') return;
      if (p > 0 && p < SETTLE) {
        if (now - lastSwap[i] >= FLICKER_MS) {
          lastSwap[i] = now;
          u.textContent = pool[(Math.random() * pool.length) | 0] || u.dataset.char;
        }
      } else if (u.textContent !== u.dataset.char) {
        u.textContent = u.dataset.char;
      }
    });
    if (active) run.raf = requestAnimationFrame(frame);
    else finish();
  };
  run.raf = requestAnimationFrame(frame);

  const total = delay + (units.length - 1) * step + dur;
  // rAF pauses in background tabs; never leave text half-revealed.
  run.fallback = setTimeout(() => { cancelAnimationFrame(run.raf); finish(); }, total * 1000 + 150);
  return total;
}

/** Hide text before its reveal without changing layout. */
export function prepareText(el, { mode = 'chars' } = {}) {
  const { chars, words } = split(el, mode);
  (mode === 'words' ? words : chars).forEach((u) => paint(u, 0));
  el.style.visibility = 'visible';
}

const HOVER = '.nav__link, .menu__link, .footer__col a, .footer__col button';

// Links replay a quick scramble (no fade) when pointed at.
export function initTextHover() {
  if (!window.matchMedia('(hover: hover)').matches) return;
  document.querySelectorAll(HOVER).forEach((el) => { if (!el.querySelector('*')) split(el, 'chars'); });
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.(HOVER);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget)) || el.dataset.typeBusy) return;
    if (!el.dataset.typeSplit) return;
    el.dataset.typeBusy = '1';
    const total = revealText(el, { fade: false, duration: 0.4, stagger: 0.024 });
    setTimeout(() => delete el.dataset.typeBusy, total * 1000 + 60);
  });
}
