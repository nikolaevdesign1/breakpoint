import gsap from 'gsap';
import { DUR, EASE, STAGGER } from './motion.js';

// Inner-page entrance: lead and actions fade up, the hero photo opens from the bottom.
// Its scroll motion comes from the mosaic in parallax.js.
export function playPageIntro({ reducedMotion }) {
  const hero = document.querySelector('.page-hero');
  if (!hero || reducedMotion) return;

  const fades = hero.querySelectorAll('.page-hero__top, .page-hero__row');
  const media = hero.querySelector('.page-hero__media');

  gsap.fromTo(fades, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.slower, stagger: STAGGER.wide, ease: EASE.tail, delay: 0.4 });
  gsap.fromTo('[data-nav] > *', { autoAlpha: 0, y: -20 }, { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.tail, delay: 0.2 });

  // Photos on the court grid assemble from squares on their own (court-grid.js); others open from the bottom.
  if (!media || media.hasAttribute('data-cells')) return;
  gsap.fromTo(media, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 2.2, ease: 'power3.inOut', delay: 0.5 });
}
