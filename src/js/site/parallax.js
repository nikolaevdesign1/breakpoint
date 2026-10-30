import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// One parallax module for the site (rows 25 and 62). Docs: docs/parallax.md.
// Photos and video: every img/video drifts inside its frame, slower than the page, with no markup. The frame is
// the closest .cut/.media/figure/... (or the parent); the picture itself moves with the CSS properties `translate`
// and `scale` (see cut.css), so the frame keeps its clip-path and the picture keeps its own transform.
//   data-parallax="0.12"   on a frame: its own travel (share of the frame height, 0.04 to 0.2)
//   data-parallax="off"    opt out (also inside any data-parallax-auto="off" ancestor)
// Text: data-parallax="0.4" on any element without media moves it up to 24px either way (positive = lags,
// negative = faster); h1/h2[data-lines] lag a little and `.lead` runs a little ahead.
// Inside a sticky stage the frame does not move on screen, so the drift follows the progress of the whole scene.
// Scrubbed on ScrollTrigger (Lenis/Locomotive feed it in site.js): no layout work, no CLS.

const TEXT_AMP = 24; // px at coefficient 1
const TIERS = [0.1, 0.14, 0.12]; // travel as a share of the frame height; neighbours get different ones
const TRAVEL_MAX = 0.2;
const SCENE_BOOST = 1.4; // a pinned scene is long, so its drift is stretched to stay visible
const SCENE_MAX = 0.16;
const ZOOM = 0.07; // how much more the picture scales by the time it has passed
const MARGIN = 0.04; // extra scale on top of the travel, so no edge ever shows
const SCRUB = 1.2; // seconds of smoothing, unhurried (row 17)
const MIN_W = 120; // smaller pictures (avatars, icons) stay still

const FRAME = '.cut, .media, figure, .cc-card, .mt, .book-banner, [class*="__media"], [class*="__photo"], [class*="__thumb"]';
const SKIP = 'nav, .nav, .preloader, .cgal-view, .msg';
const AUTO_TEXT = [['h1[data-lines], h2[data-lines]', 0.4], ['.lead', -0.3]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 1 on desktop, half on touch, 0 on weak touch devices.
function strength() {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (!touch) return 1;
  const weak = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  return weak ? 0 : 0.5;
}

// The nearest sticky ancestor, 'fixed' when there is a fixed one first, else null.
function stage(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed') return 'fixed';
    if (p === 'sticky') return n;
  }
  return null;
}

function enabled(el) {
  return el.dataset.parallax !== 'off' && !el.closest('[data-parallax="off"], [data-parallax-auto="off"]');
}

const clips = (el) => /hidden|clip/.test(getComputedStyle(el).overflow);

// The frame clips the drifting picture: a known frame class, else the parent.
function frameOf(media) {
  const box = media.closest(FRAME) || media.parentElement;
  if (!clips(box)) box.style.overflow = 'clip';
  return box;
}

function trigger(box, targets, vars, scene) {
  gsap.fromTo(targets, vars.from, {
    ...vars.to,
    ease: 'none',
    scrollTrigger: {
      trigger: scene || box,
      start: scene ? 'top top' : 'clamp(top bottom)', // clamped: a frame in the first screen still uses its full range
      end: scene ? 'bottom bottom' : 'clamp(bottom top)',
      scrub: SCRUB,
      invalidateOnRefresh: true,
      onToggle: (self) => targets.forEach((t) => { t.style.willChange = self.isActive ? 'translate, scale, transform' : ''; }), // only while on screen
    },
  });
}

function mediaParallax(box, medias, travel, scene) {
  const y = () => `${(box.offsetHeight * travel) / 2}px`;
  const ny = () => `-${y()}`;
  const s0 = 1 + travel + MARGIN;
  medias.forEach((m) => { m.dataset.px = ''; m.style.setProperty('--par-s', s0); });
  // The picture lags behind the page and grows a little (ZOOM) while the frame passes through the screen.
  trigger(box, medias, { from: { '--par-y': ny, '--par-s': s0 }, to: { '--par-y': y, '--par-s': s0 + ZOOM } }, scene);
}

function textParallax(el, k, power) {
  const amp = clamp(k, -1, 1) * TEXT_AMP * power;
  if (!amp) return;
  trigger(el, [el], { from: { y: -amp }, to: { y: amp } });
}

export function initParallax({ reducedMotion }) {
  const power = reducedMotion ? 0 : strength();
  if (!power) return;

  const frames = new Map(); // frame -> its pictures
  const done = new Set();
  let count = 0;

  const addMedia = (m) => {
    if (m.dataset.px !== undefined || m.closest(SKIP) || !enabled(m)) return;
    if (getComputedStyle(m).objectFit === 'contain') return; // cut-out portraits: scaling would crop them
    const box = frameOf(m);
    if (!box.matches('.cc-card') && box.getBoundingClientRect().width < MIN_W) return;
    if (stage(box) === 'fixed') return;
    if (!frames.has(box)) frames.set(box, []);
    frames.get(box).push(m);
  };

  const build = () => {
    const before = done.size;
    frames.forEach((medias, box) => {
      if (done.has(box)) return;
      done.add(box);
      const own = parseFloat(box.dataset.parallax);
      const base = Number.isNaN(own) ? TIERS[count++ % TIERS.length] : clamp(own, 0.04, TRAVEL_MAX);
      const scene = stage(box)?.parentElement; // the scene's height may still be set by its own script: ScrollTrigger re-reads it on refresh
      mediaParallax(box, medias, (scene ? Math.min(base * SCENE_BOOST, SCENE_MAX) : base) * power, scene);
    });
    frames.clear();
    return done.size > before;
  };

  const scan = (root) => {
    root.querySelectorAll('img, video').forEach(addMedia);
    if (root.matches?.('img, video')) addMedia(root);
    return build();
  };

  scan(document);
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    const k = parseFloat(el.dataset.parallax);
    if (Number.isNaN(k) || el.querySelector('img, video') || done.has(el) || !enabled(el)) return;
    textParallax(el, k, power);
  });
  AUTO_TEXT.forEach(([selector, k]) => document.querySelectorAll(selector).forEach((el) => {
    // Elements that already animate their own transform (reveal, bounce) are left alone.
    if (!el.hasAttribute('data-parallax') && !el.closest('[data-reveal], [data-bounce]') && enabled(el) && !stage(el)) textParallax(el, k, power);
  }));

  // Pictures that arrive later (built by scripts) join in; frames that change size re-measure.
  let late = [];
  let timer = 0;
  new MutationObserver((list) => {
    list.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && late.push(n)));
    clearTimeout(timer);
    timer = setTimeout(() => { const added = late.map(scan).some(Boolean); late = []; if (added) ScrollTrigger.refresh(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });
}
