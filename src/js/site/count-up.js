import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DUR, EASE } from './motion.js';

// Numbers count up once when their group scrolls in: <b><span data-count="14">14</span></b>, optional data-dec="1".
// The markup keeps the final value, so no JS or reduced motion shows the right numbers.
export function initCountUps(group, { reducedMotion, stagger = 0.14 } = {}) {
  const els = [...document.querySelectorAll(`${group} [data-count]`)];
  if (!els.length || reducedMotion) return;
  const dec = (el) => +(el.dataset.dec || 0);
  els.forEach((el) => { el.textContent = (0).toFixed(dec(el)); });
  const groups = new Map();
  els.forEach((el) => {
    const g = el.closest(group.split(' ')[0]);
    groups.set(g, [...(groups.get(g) || []), el]);
  });
  groups.forEach((list, g) => {
    ScrollTrigger.create({
      trigger: g,
      start: 'top 85%',
      once: true,
      onEnter: () => list.forEach((el, i) => {
        const n = { v: 0 };
        gsap.to(n, { v: +el.dataset.count, duration: DUR.slower, delay: i * stagger, ease: EASE.out, onUpdate: () => { el.textContent = n.v.toFixed(dec(el)); } });
      }),
    });
  });
}
