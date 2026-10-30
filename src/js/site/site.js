import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import LocomotiveScroll from 'locomotive-scroll';
import 'locomotive-scroll/dist/locomotive-scroll.css';
import { hydrateImages } from './media.js';
import { initNav } from './nav.js';
import { initReveals } from './reveal.js';
import { initCta } from './cta.js';
import { initDepth } from './depth.js';
import { initEntry, entryDone } from './entry.js';
import { initAmbientBed } from './ambient-bed.js';
import { initRates } from './pricing.js';
import { initBigmark } from './bigmark.js';
import { initSound } from './sound.js';
import { initCursor } from './cursor.js';
import { initParallax } from './parallax.js';
import { initCuts } from './cut.js';
import { initCookies } from './cookies.js';
import { initToTop } from './to-top.js';
import { initBounce } from './bounce.js';
import { initButtons } from './buttons.js';
import { initNoise } from './noise.js';
import { initFormControls } from './custom-select.js';
import { playLitePreloader } from './preloader-lite.js';

gsap.registerPlugin(ScrollTrigger);

const INNER_PAGES = ['about', 'coaches', 'tournaments', 'memberships', 'contacts'];

// Shared bootstrap for every page: smooth scroll, nav, images, scroll reveals, footer mark.
export function initSite({ holdScroll = false } = {}) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Locomotive Scroll v5 drives smooth scrolling (Lenis under the hood) on GSAP's ticker,
  // so ScrollTrigger and Locomotive's data-scroll-speed parallax share one frame loop.
  let lenis = null;
  if (!reducedMotion) {
    const loco = new LocomotiveScroll({
      lenisOptions: { lerp: 0.07, wheelMultiplier: 0.6, touchMultiplier: 1.4 },
      scrollCallback: ScrollTrigger.update,
      initCustomTicker: (render) => gsap.ticker.add(render),
      destroyCustomTicker: (render) => gsap.ticker.remove(render),
    });
    gsap.ticker.lagSmoothing(0);
    lenis = loco.lenisInstance;
    window.__lenis = lenis;
    window.__loco = loco;
    if (holdScroll) lenis.stop();
  }

  trackInputMode();
  if (import.meta.env.DEV) import('./grid-dev.js').then((m) => m.initGridDev());
  const imageLoads = hydrateImages();
  initNav(lenis);
  initRates();
  initSound();
  initCursor();
  initNoise();
  initFormControls();
  initButtons({ reducedMotion });
  initEntry({ reducedMotion });
  initAmbientBed();
  initCta({ reducedMotion });
  initDepth({ reducedMotion });
  initToTop({ lenis, reducedMotion });
  // The home page shows the cookie card after its intro (see releaseScroll).
  if (!holdScroll) initCookies();

  const ready = document.fonts.ready.then(() => {
    initBounce({ reducedMotion }); // before reveals: landing shapes opt out of the fade-up
    initReveals({ reducedMotion });
    initBigmark({ reducedMotion });
    initCuts();
    initParallax({ reducedMotion });
  });

  // Inner pages get the counter-only preloader; the home page runs its own greeting (intro.js).
  if (!reducedMotion && INNER_PAGES.includes(document.body.dataset.page)) {
    entryDone.then(() => playLitePreloader(imageLoads));
  }

  return { lenis, reducedMotion, imageLoads, ready };
}

// Pointer vs keyboard (row 100): focus rings show only while the visitor is using the keyboard.
function trackInputMode() {
  const root = document.documentElement;
  window.addEventListener('pointerdown', () => root.classList.add('is-pointer'), { capture: true, passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) root.classList.remove('is-pointer');
  }, { capture: true });
}

export function releaseScroll(lenis) {
  document.body.classList.remove('is-loading');
  initCookies({ delay: 0.6 });
  lenis?.start();
  ScrollTrigger.refresh();
}
