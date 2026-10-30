import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initSite, releaseScroll } from '../site/site.js';
import { MEDIA, videoSrc } from '../site/media.js';
import { playIntro } from '../site/intro.js';
import { entryDone } from '../site/entry.js';
import { renderCourtLane, initCourtLane } from '../site/court-lane.js';
import { initCommunity } from '../site/community.js';
import { initCoachCloud } from '../site/coaches-cloud.js';
import { initClubNotes } from '../site/club-notes.js';
import { initMapGallery } from '../site/map-gallery.js';
import { watchCut } from '../site/cut.js';

renderCourtLane();
const { lenis, reducedMotion, ready } = initSite({ holdScroll: true });

// The preloader waits for the poster and the first video frame only (loadeddata, capped at 2.5 s),
// not for enough buffer to play through: the 5 MB clip keeps streaming behind the intro.
function heroVideoReady() {
  const video = document.querySelector('[data-media-video="hero"]');
  const saveData = navigator.connection?.saveData || /^(slow-)?2g$/.test(navigator.connection?.effectiveType || '');
  if (!video.poster) video.poster = MEDIA.hero.poster;
  if (!saveData && !reducedMotion) video.src = videoSrc(MEDIA.hero.video); // poster only on data saver and reduced motion
  return new Promise((resolve) => {
    if (saveData || video.readyState >= 2) return resolve();
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 2500);
  }).then(() => {
    if (reducedMotion || saveData) return;
    video.play().catch(() => {});
    // Decode only while the hero is on screen; the 1.7 MB clip loops for the whole visit otherwise.
    new IntersectionObserver(([en]) => { if (en.isIntersecting) video.play().catch(() => {}); else video.pause(); }).observe(video);
  });
}

const assets = [document.fonts.ready, heroVideoReady()];

initCommunity({ reducedMotion });
initCoachCloud();

ready.then(() => {
  initCourtLane({ reducedMotion });
  initClubNotes({ reducedMotion });
  initMapGallery({ reducedMotion });
  ScrollTrigger.refresh();
});

// Row 21: once the intro has opened the card to full size it takes a cut top right (page white shows in the notch).
// The intro owns the inline clip-path until then.
function cutHero() {
  const card = document.querySelector('[data-hero-card]');
  card.style.clipPath = '';
  card.style.setProperty('--cut-x', '7%');
  card.classList.add('cut', 'cut--a');
  watchCut(card);
}

entryDone.then(() => playIntro({ assets, reducedMotion })).then(() => {
  releaseScroll(lenis);
  cutHero();
});
