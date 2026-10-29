import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { STAGGER } from './motion.js';

// "Bouncing ball" motion for shapes, never for text (row 74). The pivot is always the bottom edge.
//   data-bounce="land"   drops in when it scrolls into view: stretches in flight, squashes on contact,
//                        then one small damped rebound.
//   data-bounce="press"  squashes on press and springs back, like the cursor ball. Buttons get it for free.
// Both can be combined: data-bounce="land press".

const LAND = '[data-bounce~="land"]';
const PRESS = '.btn, .round-btn, [data-bounce~="press"]';

// Deformation is set in pixels, then turned into a scale: a tall card squashes as subtly as a small button.
const squash = (el, px, max) => Math.min(max, px / Math.max(el.offsetHeight, 1));

export function landIn(el, { delay = 0 } = {}) {
  const drop = Math.min(64, 20 + el.offsetHeight * 0.1);
  const s = squash(el, 14, 0.07);
  return gsap.timeline({ delay, onComplete: () => gsap.set(el, { clearProps: 'transform,transformOrigin' }) })
    .set(el, { transformOrigin: '50% 100%', y: -drop, autoAlpha: 0 })
    .to(el, { autoAlpha: 1, duration: 0.5, ease: 'power1.out' }, 0)
    // fall: accelerates and stretches with speed
    .to(el, { y: 0, duration: 0.7, ease: 'power2.in' }, 0)
    .to(el, { scaleY: 1 + s * 0.6, scaleX: 1 - s * 0.3, duration: 0.7, ease: 'power2.in' }, 0)
    // contact
    .to(el, { scaleY: 1 - s, scaleX: 1 + s * 0.5, duration: 0.14, ease: 'power1.out' })
    // small rebound and settle
    .to(el, { y: -drop * 0.12, scaleY: 1 + s * 0.15, scaleX: 1 - s * 0.08, duration: 0.36, ease: 'power2.out' })
    .to(el, { y: 0, scaleY: 1, scaleX: 1, duration: 0.3, ease: 'power2.in' })
    .to(el, { scaleY: 1 - s * 0.3, scaleX: 1 + s * 0.15, duration: 0.12, ease: 'power1.out' })
    .to(el, { scaleY: 1, scaleX: 1, duration: 0.8, ease: 'elastic.out(1, 0.55)' });
}

function press(el) {
  const s = squash(el, 5, 0.1);
  gsap.to(el, { scaleY: 1 - s, scaleX: 1 + s * 0.5, transformOrigin: '50% 100%', duration: 0.12, ease: 'power2.out', overwrite: 'auto' });
}

function release(el) {
  gsap.to(el, {
    scaleY: 1,
    scaleX: 1,
    duration: 0.9,
    ease: 'elastic.out(1.1, 0.4)',
    overwrite: 'auto',
    onComplete: () => gsap.set(el, { clearProps: 'transform,transformOrigin' }),
  });
}

function initPress() {
  let held = null;
  const up = () => { if (held) { release(held); held = null; } };
  const pick = (target) => {
    const el = target.closest?.(PRESS);
    return el && !el.matches('[disabled], [aria-disabled="true"]') ? el : null;
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    held = pick(e.target);
    if (held) press(held);
  }, { passive: true });
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', up, { passive: true });

  // Keyboard presses squash too.
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    held = pick(e.target);
    if (held) press(held);
  });
  document.addEventListener('keyup', up);
}

// Call before initReveals(): a landing shape drops in instead of fading up.
export function initBounce({ reducedMotion }) {
  const shapes = [...document.querySelectorAll(LAND)];
  if (reducedMotion) {
    gsap.set(shapes, { autoAlpha: 1 });
    return;
  }

  initPress();
  shapes.forEach((el) => el.removeAttribute('data-reveal'));
  ScrollTrigger.batch(shapes, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => batch.forEach((el, i) => landIn(el, { delay: i * STAGGER.base })),
  });
}
