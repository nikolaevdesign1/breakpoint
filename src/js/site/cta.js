// Book a court block (partials/cta.html): the clip plays only while the block is on screen.
export function initCta({ reducedMotion }) {
  const video = document.querySelector('[data-cta-video]');
  if (!video || reducedMotion) return;
  const saveData = navigator.connection?.saveData || /^(slow-)?2g$/.test(navigator.connection?.effectiveType || '');
  if (saveData) return;
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) video.play().catch(() => {}); else video.pause();
  }, { threshold: 0.2 }).observe(video);
}
