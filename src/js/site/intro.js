import gsap from 'gsap';
import { revealText, prepareText } from './type-reveal.js';
import { DUR, STAGGER } from './motion.js';
import { splitCells, pinCells, hideCells, flapIn } from './flap.js';

// Preloader greeting → hero card intro. While the counter runs, "Welcome to Break Point" flips in letter by
// letter like a scoreboard. At 40% "Welcome to" lifts away, "Break Point" settles and the small line
// "Tennis club of Alexander Milevski" rises letter by letter. At 100 everything lifts out as the card opens.
// Tempo (row 17): only the show is slow. Assets load at full speed in parallel; the counter just catches up.

const MIN_MS = 3800;
const MAX_MS = 7500;
const SWITCH_AT = 40; // % at which the second phrase takes over
const HOLD_MS = 500; // rest on the finished phrase before the card opens

const el = {
  root: document.documentElement,
  pre: document.querySelector('.preloader'),
  lines: [...document.querySelectorAll('.preloader__line')],
  sub: document.querySelector('.preloader__sub'),
  count: document.querySelector('[data-count]'),
  card: document.querySelector('[data-hero-card]'),
  media: document.querySelector('[data-hero-media]'),
  title: document.querySelector('[data-hero-title]'),
  fades: document.querySelectorAll('[data-hero-fade]'),
  nav: document.querySelectorAll('[data-nav] > *'),
};

// Browsers collapse inset() shorthands, which breaks string tweening, so the mask is tweened as numbers.
const clip = { top: 0, side: 0, r: 0 };
function applyClip() {
  el.card.style.clipPath = `inset(${clip.top}px ${clip.side}px ${clip.top}px ${clip.side}px round ${clip.r}px)`;
}
function setClip(shape) {
  Object.assign(clip, shape);
  applyClip();
}
function clipTo(shape, vars) {
  return { ...vars, ...shape, onUpdate: applyClip };
}

function cardGeometry() {
  const { width: w, height: h } = el.card.getBoundingClientRect();
  const smallW = Math.min(w * 0.36, 520);
  const smallH = smallW * 0.62;
  return {
    line: { top: h / 2, side: (w - smallW) / 2, r: 0 },
    small: { top: (h - smallH) / 2, side: (w - smallW) / 2, r: 0 },
    full: { top: 0, side: 0, r: 0 },
  };
}

function trackAssets(promises) {
  let done = 0;
  const state = { progress: 0 };
  const total = promises.length || 1;
  promises.forEach((p) =>
    Promise.resolve(p).catch(() => {}).finally(() => {
      done++;
      state.progress = (done / total) * 100;
    })
  );
  return state;
}

const slide = (cells, vars) => gsap.to(cells.map((c) => c.inner), { ease: 'power3.out', ...vars });

function runPreloader(assets, { head, tail, sub }) {
  return new Promise((resolve) => {
    const loaded = trackAssets(assets);
    const start = performance.now();
    let shown = 0;
    let switched = false;
    let subIn = false;
    let holdUntil = 0;

    let flipped = false;
    flapIn([...head, ...tail], { delay: 0.2, stagger: 0.04, duration: 0.7 }).then(() => { flipped = true; });

    function swap() {
      switched = true;
      const first = el.lines[0];
      slide(head, { y: 0, yPercent: -110, duration: DUR.base, stagger: STAGGER.tight, ease: 'power3.inOut' });
      gsap.to(first, { height: 0, duration: DUR.slow, delay: 0.5, ease: 'power3.inOut' });
      gsap.fromTo(sub.map((c) => c.inner), { yPercent: 110 }, {
        yPercent: 0, duration: DUR.base, stagger: 0.025, delay: 0.9, ease: 'power3.out', onComplete: () => { subIn = true; },
      });
    }

    function frame(now) {
      const t = now - start;
      const timeCap = Math.min(100, (t / MIN_MS) * 100);
      const creep = 90 * (1 - Math.exp(-t / 2600));
      const target = t > MAX_MS ? 100 : Math.max(loaded.progress, Math.min(creep, loaded.progress < 100 ? 90 : 100));
      shown += (Math.min(timeCap, target) - shown) * 0.05;
      if (Math.min(timeCap, target) >= 100 && shown > 99.4) shown = 100;
      el.count.textContent = Math.floor(shown);

      if (!switched && flipped && shown >= SWITCH_AT) swap(); // let the full title be read first
      if (shown === 100 && subIn && !holdUntil) holdUntil = now + HOLD_MS;
      if (holdUntil && now >= holdUntil) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

function heroIn(tl, geo) {
  tl.set(el.pre, { className: 'preloader is-done' }, 0)
    .to(clip, clipTo(geo.small, { duration: 1.4, ease: 'power3.inOut' }), 0.5)
    .fromTo(el.media, { scale: 1.35, autoAlpha: 0.2 }, { scale: 1.15, autoAlpha: 1, duration: 1.4, ease: 'power2.out' }, '<')
    .to(clip, clipTo(geo.full, { duration: 1.6, ease: 'power3.inOut' }), '+=0.1')
    .to(el.media, { scale: 1, duration: 2, ease: 'power4.out' }, '<0.3')
    .add(() => revealText(el.title, { mode: 'words', stagger: 0.2, duration: 0.8 }), '-=0.9')
    .to(el.fades, { autoAlpha: 1, y: 0, duration: DUR.slower, stagger: STAGGER.wide, ease: 'power4.out' }, '<0.2')
    .to(el.nav, { autoAlpha: 1, y: 0, duration: DUR.slower, ease: 'power4.out' }, '<');
}

// Reduced motion: the plain greeting and the live counter, gone as soon as the assets are ready (capped).
async function staticPreloader(assets) {
  const loaded = trackAssets(assets);
  const tick = setInterval(() => { el.count.textContent = Math.floor(loaded.progress); }, 100);
  await Promise.race([Promise.allSettled(assets), new Promise((r) => setTimeout(r, 1500))]);
  clearInterval(tick);
  el.pre?.remove();
}

export async function playIntro({ assets, reducedMotion }) {
  if (!el.pre) {
    el.root.classList.remove('intro');
    return;
  }
  if (reducedMotion) {
    await staticPreloader(assets);
    el.root.classList.remove('intro');
    return;
  }

  prepareText(el.title, { mode: 'words' });
  gsap.set(el.fades, { autoAlpha: 0, y: 16 });
  gsap.set(el.nav, { autoAlpha: 0, y: -20 });

  await document.fonts.ready; // letter cells are pinned to measured glyph widths
  const [head, tail] = el.lines.map(splitCells);
  const sub = splitCells(el.sub);
  const all = [...head, ...tail, ...sub];
  hideCells([...head, ...tail]);
  gsap.set(sub.map((c) => c.inner), { yPercent: 110 });
  pinCells(all);

  setClip(cardGeometry().line);
  el.root.classList.remove('intro');
  await runPreloader(assets, { head, tail, sub });

  const tl = gsap.timeline({ paused: true });
  const out = [...tail, ...sub].map((c) => c.inner);
  tl.to(el.count.parentElement, { autoAlpha: 0, y: -10, duration: 0.7, ease: 'power2.inOut' }, 0)
    .to(out, { yPercent: -110, duration: DUR.base, stagger: STAGGER.tight / 2, ease: 'power3.inOut' }, 0);
  heroIn(tl, cardGeometry());
  tl.play();
  await tl.then();

  el.pre.remove();
}
