import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { revealText, prepareText, initTextHover } from './type-reveal.js';
import { DUR, EASE, STAGGER } from './motion.js';

export function initReveals({ reducedMotion }) {
  if (reducedMotion) {
    document.querySelectorAll('[data-lines]').forEach((el) => { el.style.visibility = 'visible'; });
    return;
  }

  // Headings and labels resolve letter by letter; longer leads fade in word by word.
  const targets = [
    ...[...document.querySelectorAll('[data-lines]')].map((el) => [el, el.classList.contains('section-head__lead') ? 'words' : 'chars']),
    ...[...document.querySelectorAll('.eyebrow:not(.widget .eyebrow):not(.plan .eyebrow)')].map((el) => [el, 'chars']),
    ...[...document.querySelectorAll('.lead')].map((el) => [el, 'words']),
  ];
  targets.forEach(([el, mode]) => {
    prepareText(el, { mode });
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => revealText(el, { mode }) });
  });
  initTextHover();

  // Manifesto: words come out of a soft blur as you read through the scroll.
  // data-words="ink": words start grey (--words-from) and darken to the text colour instead.
  document.querySelectorAll('[data-words]').forEach((el) => {
    prepareText(el, { mode: 'words' });
    const ink = el.dataset.words === 'ink';
    const css = getComputedStyle(el);
    const from = ink
      ? { opacity: 1, filter: 'none', color: css.getPropertyValue('--words-from').trim() || '#c8c7c2' }
      : { opacity: 0.14, filter: 'blur(4px)' };
    const to = ink ? { color: css.color } : { opacity: 1, filter: 'blur(0px)' };
    gsap.fromTo(el.querySelectorAll('.tr-word'), from, {
      ...to,
      stagger: STAGGER.wide,
      ease: 'none',
      scrollTrigger: { trigger: el, start: ink ? 'top 80%' : 'top 75%', end: ink ? 'bottom 50%' : 'bottom 45%', scrub: true },
    });
  });

  gsap.set('[data-reveal]', { autoAlpha: 0 });
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.fromTo(batch, { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: DUR.slower, stagger: STAGGER.wide, ease: EASE.tail }),
  });
}
