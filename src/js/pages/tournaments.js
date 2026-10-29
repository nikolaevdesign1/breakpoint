import gsap from 'gsap';
import { initSite } from '../site/site.js';
import { initReviews } from '../site/reviews.js';
import { initFaq } from '../site/faq.js';
import { initCalendar } from '../site/tournament-calendar.js';
import { initApply } from '../site/tournament-apply.js';
import { nextEvent, formatDates, formatStart, levelText, ageText, spotsLeft } from '../site/tournaments-data.js';
import { DUR, EASE, STAGGER } from '../site/motion.js';

// Hero: the next draw with a live countdown ("3 days 10 hrs 24 min 12 sec").
function initNextDraw() {
  const e = nextEvent();
  const box = document.querySelector('[data-next]');
  if (!e || !box) return null;
  const $ = (sel) => box.querySelector(sel);
  $('[data-next-dates]').textContent = `${formatDates(e)}, ${formatStart(e).toLowerCase()}`;
  $('[data-next-name]').innerHTML = e.name;
  $('[data-next-meta]').textContent = `${levelText(e)} · ${ageText(e)} · ${e.entries.join(' and ')} · ${e.surface}`;
  const left = spotsLeft(e);
  $('[data-next-spots]').textContent = left ? `${left} of ${e.spots} spots left` : 'Full, waitlist open';
  $('[data-next-apply]').dataset.apply = e.id;
  if (!left) $('[data-next-apply] .btn__label').textContent = 'Join the waitlist';

  const cd = Object.fromEntries(['d', 'h', 'm', 's'].map((k) => [k, box.querySelector(`[data-cd="${k}"]`)]));
  const label = { d: box.querySelector('[data-cd-label="d"]'), h: box.querySelector('[data-cd-label="h"]') };
  const tick = () => {
    const ms = Math.max(0, e.startsAt - Date.now());
    const t = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
    cd.d.textContent = t.d;
    ['h', 'm', 's'].forEach((k) => { cd[k].textContent = String(t[k]).padStart(2, '0'); });
    label.d.textContent = t.d === 1 ? 'day' : 'days';
    label.h.textContent = t.h === 1 ? 'hr' : 'hrs';
  };
  tick();
  setInterval(tick, 1000);
  return e;
}

// Hero background loop (row 127): poster first; the video loads after the page, only on wider screens
// with motion allowed and no data saver, and plays only while the hero is on screen.
function initHeroVideo({ reducedMotion }) {
  const video = document.querySelector('[data-hero-video]');
  if (!video || reducedMotion || navigator.connection?.saveData || window.matchMedia('(max-width: 720px)').matches) return;
  const start = () => {
    video.src = video.dataset.src;
    video.preload = 'auto';
    video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
    new IntersectionObserver(([en]) => { if (en.isIntersecting) video.play().catch(() => {}); else video.pause(); }).observe(video);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

function playHeroIntro({ reducedMotion }) {
  if (reducedMotion) return;
  gsap.fromTo('.thero__lead, .thero__event, .countdown__unit', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.slow, stagger: STAGGER.base, ease: EASE.out, delay: 0.3 });
  gsap.fromTo('[data-nav] > *', { autoAlpha: 0, y: -20 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out, delay: 0.1 });
}

const { reducedMotion } = initSite();
const next = initNextDraw();
playHeroIntro({ reducedMotion });
initHeroVideo({ reducedMotion });
initCalendar({ reducedMotion });
initReviews({ reducedMotion });
initFaq();

// Every "Apply" on the page opens the same application form for its event.
const apply = initApply({ reducedMotion });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-apply]');
  if (btn && !btn.closest('[data-apply-modal]')) apply.open(btn.dataset.apply || next?.id, btn);
});
