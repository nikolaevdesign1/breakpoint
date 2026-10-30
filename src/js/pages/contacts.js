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
initCopy();
playIntro();

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
