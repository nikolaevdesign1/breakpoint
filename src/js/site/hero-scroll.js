import gsap from 'gsap';

// The home hero video: once the page starts to scroll
// it leaves slower than the text, drifting down against the scroll, and grows a little.
// Scrubbed on ScrollTrigger; `transform` on the picture itself, the frame keeps its clip.

const DRIFT = 10; // % of its own height the picture lags by the time the hero has left
const ZOOM = 1.2; // scale 1 + 2 x DRIFT/100, so the top edge never shows a gap

export function initHeroScroll({ reducedMotion }) {
  if (reducedMotion) return;
  document.querySelectorAll('[data-hero-media] video, [data-hero-media] img').forEach((pic) => {
    const hero = pic.closest('.hero, .page-hero, section') || pic.parentElement;
    gsap.fromTo(pic, { yPercent: 0, scale: 1 }, {
      yPercent: DRIFT, scale: ZOOM, ease: 'none', transformOrigin: '50% 50%',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.8, invalidateOnRefresh: true },
    });
  });
}
