import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLineForm, showDone, EMAIL, digits } from './line-form.js';
import { PLANS } from './membership-compare.js';
import { DUR, EASE } from './motion.js';

// Membership application (row 128): a thin-line form beside a member card that fills in as you type
// (name, plan, start date). Family asks how many players live at home. Any link with
// data-plan="club" (plan buttons, comparison table) preselects that plan on its way here.
// No backend yet: a valid submit shows the welcome state.

const DAY_MS = 864e5;
const LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const parseDay = (v) => (v ? new Date(`${v}T00:00:00`) : null);
const today = () => parseDay(isoDay(new Date()));
const planName = (id) => PLANS.find((p) => p.id === id)?.name || '';

const RULES = {
  name: (f) => (f.name.value.trim().length > 1 ? '' : 'Add your name.'),
  email: (f) => (EMAIL.test(f.email.value.trim()) ? '' : 'Check the address.'),
  phone: (f) => (digits(f.phone.value) >= 7 ? '' : 'We call to start your week.'),
  start: (f) => {
    const d = parseDay(f.start.value);
    if (!d || Number.isNaN(+d)) return 'Pick a day.';
    const days = (d - today()) / DAY_MS;
    if (days < 0) return 'From today on.';
    return days > 90 ? 'Within three months.' : '';
  },
  plan: (f) => (f.plan.value ? '' : 'Choose a plan.'),
  household: (f) => (f.household.value ? '' : 'How many of you?'),
  agree: (f) => (f.agree.checked ? '' : 'Please accept to apply.'),
};

export function initMembershipApply({ reducedMotion }) {
  const wrap = document.querySelector('[data-apply-wrap]');
  const form = wrap?.querySelector('[data-apply-form]');
  if (!form) return;
  const f = form.elements;
  const card = document.querySelector('[data-live-card]');
  const $card = (sel) => card?.querySelector(sel);
  const family = form.querySelector('[data-when-plan="family"]');

  const min = today();
  f.start.min = isoDay(min);
  f.start.max = isoDay(new Date(+min + 90 * DAY_MS));

  // The card mirrors the form.
  const syncCard = () => {
    if (!card) return;
    $card('[data-card-name]').textContent = f.name.value.trim() || 'Your name';
    $card('[data-card-tier]').textContent = f.plan.value ? `${planName(f.plan.value)} member` : 'Member';
    const start = parseDay(f.start.value);
    $card('[data-card-meta]').textContent = `No. 0417 · ${start && !RULES.start(f) ? `from ${SHORT.format(start)}` : 'pick a date'}`;
  };
  // A small lean on every keystroke: the card reads the form.
  const nudge = () => {
    if (!reducedMotion) gsap.fromTo($card('[data-clubcard-tilt]'), { rotationZ: -1.5 }, { rotationZ: 0, duration: DUR.base, ease: EASE.spring, overwrite: 'auto' });
  };

  const syncPlan = (animate = true) => {
    const show = f.plan.value === 'family';
    f.plan.classList.toggle('is-empty', !f.plan.value);
    if (show === !family.hidden) return;
    family.hidden = !show;
    ScrollTrigger.refresh(); // the form changed height: triggers below it (the submit button) re-measure
    if (show && animate && !reducedMotion) gsap.fromTo(family, { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: 'all' });
  };

  form.addEventListener('input', () => { syncCard(); nudge(); });
  form.addEventListener('change', () => { syncPlan(); syncCard(); });
  syncPlan(false);
  syncCard();

  // Plan buttons anywhere on the page: preselect, then the anchor scrolls here (nav.js).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-plan]');
    if (!link || !PLANS.some((p) => p.id === link.dataset.plan)) return;
    f.plan.value = link.dataset.plan;
    form.querySelector('[data-field="plan"]').classList.remove('is-invalid');
    syncPlan(false);
    syncCard();
    if (card && !reducedMotion) gsap.fromTo(card, { rotate: -4, y: 12 }, { rotate: 0, y: 0, duration: DUR.slow, delay: 1.2, ease: EASE.spring, clearProps: 'rotate,y' });
  });

  initLineForm(form, {
    rules: RULES,
    onValid: (data) => {
      const first = data.name.trim().split(/\s+/)[0];
      wrap.querySelector('[data-done-name]').textContent = first;
      wrap.querySelector('[data-done-text]').textContent = `Your free ${planName(data.plan)} week starts ${LONG.format(parseDay(data.start))}. The desk will call ${data.phone.trim()} the same day to set it up. Bring clay shoes.`;
      showDone(wrap);
      if (!card) return;
      $card('[data-card-meta]').textContent = `No. 0417 · from ${SHORT.format(parseDay(data.start))}`;
      if (!reducedMotion) gsap.fromTo(card, { rotateY: -180, scale: 0.9 }, { rotateY: 0, scale: 1, duration: DUR.slower, ease: EASE.spring, clearProps: 'transform' });
    },
  });
}
