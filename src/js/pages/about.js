import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initSite } from '../site/site.js';
import { initRules } from '../site/rules.js';

// About (row 33): "One rally". about.html decides the 3D version (class is-rally); this loads it lazily,
// after the page is ready and the browser is idle, so it never touches LCP or other pages.
const rally = document.documentElement.classList.contains('is-rally');
const section = document.querySelector('[data-rally]');

if (!rally) section.querySelectorAll('[data-d]').forEach((n) => n.setAttribute('data-reveal', ''));

const { ready } = initSite();
initRules();

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
