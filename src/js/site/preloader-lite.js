import gsap from 'gsap';
import { DUR } from './motion.js';
import { markPageReady } from './page-ready.js';

// Inner pages: no greeting, only the percent counter on paper, then the sheet lifts and the page's own
// hero photo opens (page-intro.js). Counts to 90 at once, finishes when fonts and images are in.
const MIN_S = 1.4;
const CAP_MS = 2500;

export function playLitePreloader(imageLoads) {
  const pre = document.createElement('div');
  pre.className = 'preloader';
  pre.setAttribute('aria-hidden', '');
  pre.innerHTML = '<div class="preloader__count"><span data-count>0</span>%</div>';
  document.body.prepend(pre);
  const count = pre.querySelector('[data-count]');
  const num = { v: 0 };
  const show = () => { count.textContent = Math.floor(num.v); };

  gsap.to(num, { v: 90, duration: MIN_S, ease: 'power2.inOut', onUpdate: show });
  const ready = Promise.allSettled([document.fonts.ready, ...(imageLoads || [])]);
  const cap = new Promise((r) => setTimeout(r, CAP_MS));
  Promise.all([Promise.race([ready, cap]), new Promise((r) => setTimeout(r, MIN_S * 1000))]).then(() => {
    gsap.timeline({ onComplete: () => pre.remove() })
      .to(num, { v: 100, duration: 0.6, ease: 'power1.out', onUpdate: show })
      .to(pre.firstChild, { autoAlpha: 0, y: -10, duration: 0.6, ease: 'power2.inOut' }, '>0.1')
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: DUR.slow, ease: 'power3.inOut', onStart: () => setTimeout(markPageReady, 250) }, '<0.2');
  });
}
