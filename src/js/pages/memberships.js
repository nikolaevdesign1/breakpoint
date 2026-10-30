import gsap from 'gsap';
import { entryDone } from '../site/entry.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initSite } from '../site/site.js';
import { initReviews } from '../site/reviews.js';
import { initFaq } from '../site/faq.js';
import { renderCompare } from '../site/membership-compare.js';
import { initMembershipApply } from '../site/membership-apply.js';
import { initMemberCard } from '../site/member-card.js';
import { initCountUps } from '../site/count-up.js';
import { DUR, EASE, STAGGER } from '../site/motion.js';

// Memberships (row 128). Markup that other modules wire up (buttons, anchors, prices) is in place
// before initSite runs: the comparison table, and the plan buttons of the shared pricing block,
// which point at this page's form instead of the contacts page.
renderCompare();
document.querySelectorAll('#plans .plan__cta[href*="topic=membership"]').forEach((a) => {
  a.dataset.plan = a.closest('.plan').querySelector('.plan__name').textContent.trim().toLowerCase();
  a.href = '#apply';
});

const { reducedMotion } = initSite();
initReviews({ reducedMotion });
initFaq();
initMembershipApply({ reducedMotion });
entryDone.then(playIntro);
initMemberCard({ reducedMotion });
initCountUps('.mhero__facts', { reducedMotion });
initCountUps('.perks', { reducedMotion });
initPerks();
initJoin();

function playIntro() {
  gsap.fromTo('[data-nav] > *', { autoAlpha: 0, y: -20 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out, delay: 0.1 });
  if (reducedMotion) return;
  gsap.fromTo('.mhero__lead, .mhero__actions', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.slow, stagger: STAGGER.base, ease: EASE.out, delay: 0.4 });
  gsap.fromTo('.mhero__facts li', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.slow, stagger: STAGGER.base, ease: EASE.out, delay: 0.6 });
}

// Perks: a tap lights a cell on touch (hover does it with a mouse); the clock hand and the level scale play on enter.
function initPerks() {
  document.querySelectorAll('.perk').forEach((perk) => {
    perk.addEventListener('click', () => {
      const on = !perk.classList.contains('is-hot');
      document.querySelectorAll('.perk.is-hot').forEach((p) => p.classList.remove('is-hot'));
      perk.classList.toggle('is-hot', on);
    });
  });
  document.querySelectorAll('.perk__level, .perk__clock').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => el.classList.add('is-in') });
  });
}

// How to join: the ball hops from step to step along the dashed line as the section scrolls by
// (across on wide screens, down the left edge on phones). A step lights up once the ball reaches it.
function initJoin() {
  const root = document.querySelector('[data-join]');
  const track = root?.querySelector('.join__track');
  const ball = root?.querySelector('[data-join-ball]');
  const steps = [...(root?.querySelectorAll('[data-join-step]') || [])];
  if (!track || !ball) return;
  const light = (p) => steps.forEach((s, i) => s.classList.toggle('is-on', p >= i / (steps.length - 1) - 0.02));
  if (reducedMotion) { light(1); return; }

  // Each stop is the start of a step: its left edge across, its top edge down.
  const vertical = () => track.clientHeight > track.clientWidth;
  const stop = (i) => {
    const t = track.getBoundingClientRect();
    const s = steps[i].getBoundingClientRect();
    return vertical() ? s.top - t.top : s.left - t.left;
  };
  const along = vertical() ? 'y' : 'x';
  const across = vertical() ? 'x' : 'y';
  const hop = () => (vertical() ? 24 : -48);
  const tl = gsap.timeline({ paused: true });
  for (let i = 0; i < steps.length - 1; i++) {
    tl.fromTo(ball, { [along]: () => stop(i) }, { [along]: () => stop(i + 1), ease: 'none', duration: 1 }, i)
      .fromTo(ball, { [across]: 0 }, { [across]: hop, duration: 0.5, ease: 'power2.out' }, i)
      .fromTo(ball, { [across]: hop }, { [across]: 0, duration: 0.5, ease: 'power2.in', immediateRender: false }, i + 0.5)
      .fromTo(ball, { scaleX: 1.25, scaleY: 0.75 }, { scaleX: 1, scaleY: 1, duration: 0.25, ease: 'power2.out', immediateRender: false }, i)
      .fromTo(ball, { rotation: i * 180 }, { rotation: (i + 1) * 180, duration: 1, ease: 'none', immediateRender: false }, i);
  }
  ScrollTrigger.create({
    trigger: root,
    start: 'top 70%',
    end: 'bottom 60%',
    scrub: 0.8,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate: (st) => light(st.progress),
  });
  light(0);
}
