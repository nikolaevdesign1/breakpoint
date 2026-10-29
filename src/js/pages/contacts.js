import gsap from 'gsap';
import { initSite } from '../site/site.js';
import { initContactForm } from '../site/contact-form.js';
import { initClubStatus } from '../site/club-hours.js';
import { initSquareMap } from '../site/square-map.js';
import { initRoutes } from '../site/map-routes.js';
import { revealText } from '../site/type-reveal.js';
import { DUR, EASE } from '../site/motion.js';

const { reducedMotion } = initSite();
initContactForm();
initClubStatus();
initRoutes(initSquareMap());
initScramble();
initCopy();
playIntro();

// Big contacts scramble their letters when pointed at (type-reveal, no fade), then fold back to text.
function initScramble() {
  if (reducedMotion || !window.matchMedia('(hover: hover)').matches) return;
  document.querySelectorAll('[data-scramble]').forEach((link) => {
    const el = link.querySelector('[data-scramble-text]') || link;
    const text = el.textContent;
    let busy = false;
    link.addEventListener('mouseenter', () => {
      if (busy) return;
      busy = true;
      const total = revealText(el, { fade: false, duration: 0.3, stagger: 0.02 });
      setTimeout(() => { el.textContent = text; busy = false; }, total * 1000 + 80);
    });
  });
}

// A click on the e-mail copies it, with a small "copied" tag; without clipboard access it opens mail.
function initCopy() {
  const link = document.querySelector('[data-copy]');
  if (!link || !navigator.clipboard) return;
  const tag = link.querySelector('[data-copied]');
  const status = document.querySelector('[data-copied-status]');
  let timer = 0;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(link.dataset.copy);
    } catch {
      window.location.href = link.href;
      return;
    }
    status.textContent = 'E-mail address copied.';
    link.classList.add('is-copied');
    clearTimeout(timer);
    timer = setTimeout(() => { link.classList.remove('is-copied'); status.textContent = ''; }, 1600);
  });
}

// Entrance: the title and the live status rise, the rest reveals on scroll (data-reveal).
function playIntro() {
  gsap.fromTo('[data-nav] > *', { autoAlpha: 0, y: -20 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out, delay: 0.1 });
  if (reducedMotion) return;
  gsap.fromTo('.cx__live', { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.tail, delay: 0.5 });
}
