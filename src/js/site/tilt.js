import gsap from 'gsap';

// Plates that lean toward the pointer (membership plans and perks): up to 7 degrees, with a soft spring
// back. GSAP owns the rotation, so it composes with the reveal that lands the same elements. Fine pointers only.

const FINE = '(hover: hover) and (pointer: fine)';

export function initTilt({ reducedMotion }, selector = '[data-tilt]') {
  if (reducedMotion || !window.matchMedia(FINE).matches) return;
  document.querySelectorAll(selector).forEach((el) => {
    if (el.dataset.tiltReady) return;
    el.dataset.tiltReady = '';
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 14);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}
