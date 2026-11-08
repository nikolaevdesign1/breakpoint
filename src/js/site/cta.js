// Book a court block (partials/cta.html): the clip plays only while the block is on screen.
export function initCta({ reducedMotion }) {
  const video = document.querySelector('[data-cta-video]');
  if (!video || reducedMotion) return;
  const saveData = navigator.connection?.saveData || /^(slow-)?2g$/.test(navigator.connection?.effectiveType || '');
  if (saveData) return;
  // The 3.7 MB clip is requested only when the block is a screen away; the poster carries it until then.
  const load = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    load.disconnect();
    video.src = video.dataset.src;
  }, { rootMargin: '100% 0px' });
  load.observe(video);
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) video.play().catch(() => {}); else video.pause();
  }, { threshold: 0.2 }).observe(video);
}
