import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { pixelReveal } from '../booking/pixel-reveal.js';

// Buttons assemble from small squares when they scroll into view, like the booking tiles (row 78).
// Hover and press live in components.css and bounce.js.

// Blocks with their own entrance keep their buttons as they are.
const OWN_INTRO = '.hero, .cookies, .menu, [data-hero-fade]';

function plateColor(btn) {
  const bg = getComputedStyle(btn.querySelector('.btn__bg') || btn).backgroundColor;
  const clear = bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg);
  return clear ? getComputedStyle(btn).color : bg;
}

// Run before first paint (synchronously in initSite) so pending buttons never flash.
export function initButtons({ reducedMotion }) {
  if (reducedMotion) return;
  document.querySelectorAll('.btn').forEach((btn) => {
    if (btn.closest(OWN_INTRO)) return;
    btn.classList.add('is-pending');
    ScrollTrigger.create({
      trigger: btn,
      start: 'top 94%',
      once: true,
      onEnter: () => {
        btn.classList.remove('is-pending');
        // Inner-page heroes fade their rows up first (page-intro.js): assemble once the row is there.
        const tl = pixelReveal(btn, { cell: 6, color: plateColor(btn), whole: true, pace: 3 });
        if (btn.closest('.page-hero')) tl.delay(1.1);
      },
    });
  });
}
