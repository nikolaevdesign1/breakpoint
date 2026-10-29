import gsap from 'gsap';

// Back to top (row 45): a square black button in the bottom right corner. It springs in after about a
// screen of scroll and out again near the top; a click glides home through the smooth scroller.
// While the cookie card is open the button sits above it. Not on booking (that page has no initSite).

const SHOW_AFTER = 0.9; // screens

export function initToTop({ lenis, reducedMotion }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'to-top';
  btn.dataset.bounce = 'press';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 14V2M3 7l5-5 5 5"/></svg>';
  btn.hidden = true;
  document.body.appendChild(btn);

  let shown = false;
  let tween = null;
  const toggle = (on) => {
    if (on === shown) return;
    shown = on;
    tween?.kill();
    if (reducedMotion) { btn.hidden = !on; return; }
    if (on) {
      btn.hidden = false;
      tween = gsap.fromTo(btn, { autoAlpha: 0, scale: 0.4, y: 16 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.55)', clearProps: 'transform' });
    } else {
      tween = gsap.to(btn, { autoAlpha: 0, scale: 0.5, y: 12, duration: 0.5, ease: 'power2.inOut', onComplete: () => { btn.hidden = true; } });
    }
  };

  const onScroll = (y) => toggle(y > window.innerHeight * SHOW_AFTER);
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  onScroll(lenis ? lenis.scroll : window.scrollY);

  btn.addEventListener('click', (e) => {
    if (lenis) lenis.scrollTo(0, { duration: 2, force: true });
    else window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    // From the keyboard, focus goes back to the start of the page.
    if (e.detail === 0) document.querySelector('[data-menu-toggle]')?.focus({ preventScroll: true });
  });

  // Stay clear of the cookie card: lift by its height while it is on screen.
  const lift = () => {
    const card = document.querySelector('.cookies');
    const open = card && !card.hidden && getComputedStyle(card).visibility !== 'hidden';
    btn.style.setProperty('--lift', open ? `${card.offsetHeight + 8}px` : '0px');
  };
  const watch = new MutationObserver(lift);
  const watchCard = () => {
    const card = document.querySelector('.cookies');
    if (card && !card.dataset.toTopWatched) {
      card.dataset.toTopWatched = '1';
      watch.observe(card, { attributes: true, attributeFilter: ['hidden', 'style'] });
    }
    lift();
  };
  new MutationObserver(watchCard).observe(document.body, { childList: true });
  window.addEventListener('resize', lift, { passive: true });
  watchCard();
}
