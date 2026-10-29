import gsap from 'gsap';

// Footer wordmark rises onto the bottom edge as the footer scrolls into view.
export function initBigmark({ reducedMotion }) {
  const text = document.querySelector('[data-bigmark] .bigmark__text');
  if (!text || reducedMotion) return;

  gsap.fromTo(text, { yPercent: 60 }, {
    yPercent: 0,
    ease: 'none',
    scrollTrigger: { trigger: text.parentElement, start: 'top bottom', end: 'bottom bottom', scrub: 0.6 },
  });
}
