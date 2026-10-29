import gsap from 'gsap';
import { DUR, EASE, STAGGER } from './motion.js';

// Header (row 37): separate black plates over a transparent bar; nav.js marks .is-solid once the page
// scrolls (a soft shadow under the plates) and hides the bar on scroll down, back on scroll up. On the
// home page the bar sits inside the hero card until then (row 122, CSS).
// Menu (row 39): built like the booking panel. The page dims a little and the sections land over it as
// big tiles, one after another with a spring; they scatter on close. Close, Esc or the dim close it,
// and Tab stays inside the header and the menu while it is open.

const SOLID_AFTER = 24; // px of scroll before the plates get their shadow
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initNav(lenis) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = document.querySelector('[data-nav]');
  const toggle = nav.querySelector('[data-menu-toggle]');
  const toggleLabel = toggle.querySelector('[data-menu-label]');
  const menu = document.querySelector('[data-menu]');
  const dim = menu.querySelector('[data-menu-dim]');
  const tiles = [...menu.querySelectorAll('.menu__tile')];
  const links = [...menu.querySelectorAll('[data-nav-id]')];

  const page = document.body.dataset.page;
  links.find((a) => a.dataset.navId === page)?.setAttribute('aria-current', 'page');

  let open = false;
  let tl = null;
  let behind = [];

  function setOpen(next, { viaKeyboard = false } = {}) {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    if (toggleLabel) toggleLabel.textContent = open ? 'Close' : 'Menu';
    document.body.classList.toggle('menu-open', open);
    // Everything except the header and the menu goes inert while it is open.
    if (open) {
      behind = [...document.body.children].filter((el) => el !== nav && el !== menu && !el.inert && !/^(SCRIPT|svg)$/i.test(el.tagName));
      behind.forEach((el) => { el.inert = true; });
    } else {
      behind.forEach((el) => { el.inert = false; });
      behind = [];
    }
    tl?.kill();
    const d = reduced ? 0.01 : 1; // duration scale

    // Transform and opacity only. Tiles drop in from just above with a spring, top to bottom.
    if (open) {
      menu.hidden = false;
      lenis?.stop();
      tl = gsap.timeline()
        .fromTo(dim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7 * d, ease: EASE.out }, 0)
        .fromTo(tiles, { autoAlpha: 0, y: -24, scale: 0.9, transformOrigin: '50% 0%' }, {
          autoAlpha: 1, y: 0, scale: 1,
          duration: reduced ? 0.01 : DUR.slow,
          ease: 'elastic.out(1, 0.8)',
          stagger: STAGGER.base * d,
          clearProps: 'transform,transformOrigin',
        }, 0.1 * d);
      if (viaKeyboard) links[0].focus({ preventScroll: true });
    } else {
      lenis?.start();
      tl = gsap.timeline({ onComplete: () => { menu.hidden = true; } })
        .to(tiles, { autoAlpha: 0, y: 14, scale: 0.94, duration: 0.5 * d, ease: 'power2.inOut', stagger: { amount: 0.3 * d, from: 'end' } }, 0)
        .to(dim, { autoAlpha: 0, duration: 0.6 * d, ease: 'power2.inOut' }, 0.2 * d);
    }
  }

  // detail === 0: activated from the keyboard, so focus moves into the menu (mouse users get no ring).
  toggle.addEventListener('click', (e) => setOpen(!open, { viaKeyboard: e.detail === 0 }));
  menu.querySelectorAll('a').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  dim.addEventListener('click', () => setOpen(false));
  // Clicks in the gaps between tiles count as the dim too.
  menu.addEventListener('click', (e) => { if (e.target === menu) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); toggle.focus(); return; }
    if (e.key !== 'Tab') return;
    // Focus trap: header plates and menu tiles, wrapping at both ends.
    const items = [...nav.querySelectorAll(FOCUSABLE), ...menu.querySelectorAll(FOCUSABLE)]
      .filter((el) => el.offsetParent !== null || el === toggle);
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (!items.includes(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
    else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
  });

  let last = 0;
  const onScroll = (y) => {
    nav.classList.toggle('is-solid', y > SOLID_AFTER);
    nav.classList.toggle('is-hidden', y > last && y > window.innerHeight * 0.6 && !open && !document.documentElement.classList.contains('is-rally'));
    last = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  onScroll(lenis ? lenis.scroll : window.scrollY);

  // Same-page anchors go through the smooth scroller so pinned sections stay in sync.
  document.querySelectorAll('a[href*="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const url = new URL(a.href, window.location.href);
      if (url.pathname !== window.location.pathname || url.hash.length < 2) return;
      const target = document.querySelector(url.hash);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: DUR.slower });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Arriving with a hash (e.g. /about.html#pricing): jump there once layout has settled.
  if (window.location.hash.length > 1) {
    window.addEventListener('load', () => {
      const target = document.querySelector(window.location.hash);
      if (target && lenis) setTimeout(() => lenis.scrollTo(target, { immediate: true, force: true }), 300);
    });
  }
}
