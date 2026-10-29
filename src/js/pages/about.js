import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initSite } from '../site/site.js';
import { initBookBanner } from '../site/next-slot.js';

// About (row 33): "One rally". about.html decides the 3D version (class is-rally); this loads it lazily,
// after the page is ready and the browser is idle, so it never touches LCP or other pages.
const rally = document.documentElement.classList.contains('is-rally');
const section = document.querySelector('[data-rally]');

if (rally) {
  // photos sit between the chapters in the plain version; in 3D they close the page
  document.querySelector('[data-rally-end]').append(...section.querySelectorAll('[data-photo]'));
} else {
  section.querySelectorAll('[data-d]').forEach((n) => n.setAttribute('data-reveal', ''));
}

const { ready } = initSite();
initBookBanner();

ready.then(() => {
  ScrollTrigger.refresh();
  if (!rally) return;
  const start = () => import('../site/about-rally/index.js')
    .then((m) => m.startRally({ section }))
    .catch((err) => { // no WebGL or the model failed: fall back to the plain chapters
      console.warn('Rally unavailable, showing the plain page', err);
      document.documentElement.classList.remove('is-rally');
      ScrollTrigger.refresh();
    });
  'requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 600);
});
