import gsap from 'gsap';
import { EVENTS, LEVELS, AGES, byId, formatDates, levelText, ageText, spotsLeft, isPast } from './tournaments-data.js';
import { DUR, EASE, STAGGER } from './motion.js';

// Tournament application (row 75): a four-step form in a modal. Inline validation per step,
// progress on top, success screen at the end. Focus stays inside while open (the rest of the
// page is inert), Esc and the backdrop close it, focus returns to the button that opened it.
// No backend yet: "sending" only shows the confirmation.

const SHIRTS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (v) => v.replace(/\D/g, '').length;

function ageFrom(dob) {
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(+d)) return NaN;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age;
}
const ageGroup = (age) => (age < 18 ? 'jr' : age < 30 ? '18-29' : age < 45 ? '30-44' : '45+');

// Each rule returns an error message, or '' when the value is fine. `f` is the form's elements.
const RULES = {
  first: (f) => (f.first.value.trim().length > 1 ? '' : 'Add your first name.'),
  last: (f) => (f.last.value.trim().length > 1 ? '' : 'Add your last name.'),
  dob: (f) => {
    if (!f.dob.value) return 'Add your date of birth.';
    const age = ageFrom(f.dob.value);
    return age >= 5 && age <= 99 ? '' : 'Check the year.';
  },
  gender: (f) => (f.gender.value ? '' : 'Choose one.'),
  phone: (f) => (digits(f.phone.value) >= 7 ? '' : 'Check the phone number.'),
  email: (f) => (EMAIL.test(f.email.value.trim()) ? '' : 'Check the e-mail address.'),
  years: (f) => (f.years.value ? '' : 'Pick how long you’ve played.'),
  age: (f) => (f.age.value ? '' : 'Pick your age group.'),
  hand: (f) => (f.hand.value ? '' : 'Pick one.'),
  event: (f) => (f.event.value ? '' : 'Choose a tournament.'),
  entry: (f) => (f.entry.value ? '' : 'Singles or doubles?'),
  member: (f) => (f.member.value ? '' : 'Yes or no?'),
  card: (f) => (f.member.value !== 'yes' || /^\d{6}$/.test(f.card.value.trim()) ? '' : 'Six digits, on the back of your card.'),
  shirt: (f) => (f.shirt.value ? '' : 'Pick a size.'),
  iceName: (f) => (f.iceName.value.trim().length > 1 ? '' : 'Who should we call?'),
  icePhone: (f) => (digits(f.icePhone.value) >= 7 ? '' : 'Check the phone number.'),
  rules: (f) => (f.rules.checked ? '' : 'Please accept the rules to apply.'),
};

const radios = (name, options) => options.map((o) => `<label class="choice"><input type="radio" name="${name}" value="${o.id}" /><span>${o.label}</span></label>`).join('');

export function initApply({ reducedMotion }) {
  const modal = document.querySelector('[data-apply-modal]');
  if (!modal) return { open: () => {} };
  const panel = modal.querySelector('.apply__panel');
  const backdrop = modal.querySelector('.apply__backdrop');
  const form = modal.querySelector('[data-apply-form]');
  const f = form.elements;
  const steps = [...form.querySelectorAll('[data-step]')];
  const stepItems = [...modal.querySelectorAll('.apply__steps li')];
  const bar = modal.querySelector('[data-apply-bar]');
  const count = modal.querySelector('[data-apply-count]');
  const back = modal.querySelector('[data-apply-back]');
  const nextLabel = modal.querySelector('[data-apply-next] .btn__label');
  const progress = modal.querySelector('[data-apply-progress]');
  const done = modal.querySelector('[data-apply-done]');
  const eventLine = modal.querySelector('[data-apply-event]');
  const fitNote = modal.querySelector('[data-fit-note]');
  const ageHint = modal.querySelector('[data-age-hint]');

  let step = 0;
  let opener = null;
  let ageTouched = false;
  let inertEls = [];

  // Options built from the same data as the calendar.
  modal.querySelector('[data-options="years"]').innerHTML = radios('years', LEVELS);
  modal.querySelector('[data-options="age"]').innerHTML = radios('age', AGES);
  modal.querySelector('[data-options="shirt"]').innerHTML = radios('shirt', SHIRTS.map((s) => ({ id: s, label: s })));
  f.event.innerHTML = '<option value="">Choose a tournament</option>' + EVENTS.filter((e) => !isPast(e)).map((e) =>
    `<option value="${e.id}">${e.plain} · ${formatDates(e)}${spotsLeft(e) ? '' : ' · waitlist'}</option>`).join('');

  const visible = (el) => !el.closest('[hidden]');
  const fieldBox = (name) => (form.querySelector(`[data-choice="${name}"]`) || f[name]?.closest?.('.field'));

  function check(name) {
    const error = RULES[name]?.(f) || '';
    const box = fieldBox(name);
    if (!box) return true;
    box.classList.toggle('is-invalid', Boolean(error));
    const msg = box.querySelector('.field__error');
    if (msg) msg.textContent = error;
    const control = f[name];
    if (control?.setAttribute) {
      control.setAttribute('aria-invalid', String(Boolean(error)));
      if (msg) { msg.id ||= `${control.id || name}-error`; control.setAttribute('aria-describedby', msg.id); }
    }
    return !error;
  }

  const stepFields = (i) => Object.keys(RULES).filter((name) => {
    const box = fieldBox(name);
    return box && steps[i].contains(box) && visible(box);
  });

  function validateStep(i) {
    const names = stepFields(i);
    const bad = names.filter((n) => !check(n));
    if (bad.length) {
      const box = fieldBox(bad[0]);
      (box.querySelector('input:not([type="radio"]), select, textarea') || box.querySelector('input'))?.focus();
      if (!reducedMotion) gsap.fromTo(box, { x: -6 }, { x: 0, duration: DUR.fast, ease: 'elastic.out(1, 0.3)' });
    }
    return !bad.length;
  }

  function currentEvent() { return byId(f.event.value); }

  function syncEntry() {
    const e = currentEvent();
    const box = modal.querySelector('[data-options="entry"]');
    const previous = f.entry?.value;
    const entries = e ? e.entries : ['Singles', 'Doubles'];
    box.innerHTML = radios('entry', entries.map((x) => ({ id: x.toLowerCase(), label: x })));
    const keep = entries.map((x) => x.toLowerCase()).includes(previous) ? previous : entries.length === 1 ? entries[0].toLowerCase() : '';
    if (keep) form.querySelector(`input[name="entry"][value="${keep}"]`).checked = true;
    syncConditional();
    eventLine.textContent = e ? `${e.plain} · ${formatDates(e)}${spotsLeft(e) ? '' : ' · waitlist'}` : 'Amateur tournaments';
    syncFit();
  }

  function syncConditional() {
    form.querySelector('[data-when="doubles"]').hidden = f.entry?.value !== 'doubles';
    form.querySelector('[data-when="member"]').hidden = f.member.value !== 'yes';
  }

  // Soft check: does the chosen level fit the event? It never blocks the application.
  function syncFit() {
    const e = currentEvent();
    const years = f.years.value;
    const age = f.age.value;
    const off = e && ((years && !e.levels.includes(years)) || (age && !e.ages.includes(age)));
    fitNote.hidden = !off;
    if (off) fitNote.textContent = `${e.plain} is for ${levelText(e).toLowerCase()} · ${ageText(e).toLowerCase()}. You can still apply: the desk will suggest the right draw.`;
  }

  function goTo(i, dir = 1) {
    const from = steps[step];
    step = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    stepItems.forEach((li, k) => {
      li.classList.toggle('is-done', k < i);
      li.classList.toggle('is-current', k === i);
      if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    bar.style.transform = `scaleX(${(i + 1) / steps.length})`;
    count.textContent = `Step ${i + 1} of ${steps.length}`;
    back.hidden = i === 0;
    nextLabel.textContent = i === steps.length - 1 ? 'Send application' : 'Continue';
    panel.scrollTop = 0;
    if (from !== steps[i] && !reducedMotion) gsap.fromTo(steps[i], { opacity: 0, x: 32 * dir }, { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out });
    steps[i].querySelector('input:not([type="radio"]):not([type="checkbox"]), select, textarea, input')?.focus({ preventScroll: true });
  }

  function showDone() {
    const e = currentEvent();
    const waitlist = e && !spotsLeft(e);
    modal.querySelector('[data-apply-kicker]').textContent = waitlist ? 'Let' : 'Ace';
    modal.querySelector('[data-apply-summary]').textContent = `${f.first.value.trim()}, you’re ${waitlist ? 'on the waitlist' : 'in'} for ${e.plain}, ${formatDates(e)}. We’ll confirm your spot and send the draw to ${f.email.value.trim()}.`;
    form.hidden = true;
    progress.hidden = true;
    done.hidden = false;
    done.focus();
    if (!reducedMotion) {
      gsap.fromTo(done.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: DUR.slow, stagger: STAGGER.base, ease: EASE.out });
      gsap.fromTo(done.querySelector('.apply__ball'), { y: -60 }, { y: 0, duration: DUR.slow, ease: 'bounce.out' });
    }
  }

  function reset(eventId) {
    form.reset();
    ageTouched = false;
    ageHint.textContent = '';
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    form.querySelectorAll('.field__error').forEach((el) => { el.textContent = ''; });
    if (eventId) f.event.value = eventId;
    form.hidden = false;
    progress.hidden = false;
    done.hidden = true;
    syncEntry();
    goTo(0);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  function open(eventId, from) {
    opener = from || document.activeElement;
    const e = byId(eventId);
    if (!done.hidden || !form.dataset.started) reset(e && !isPast(e) ? eventId : '');
    else if (e && !isPast(e) && f.event.value !== eventId) { f.event.value = eventId; syncEntry(); }
    form.dataset.started = '1';

    modal.hidden = false;
    inertEls = [...document.body.children].filter((el) => el !== modal && !el.matches('script, .cursor, .cursor-label') && !el.inert);
    inertEls.forEach((el) => { el.inert = true; });
    window.__lenis?.stop();
    document.documentElement.classList.add('apply-open');
    document.addEventListener('keydown', onKey, true);

    if (!reducedMotion) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: DUR.base, ease: EASE.out });
      gsap.fromTo(panel, { opacity: 0, y: 60, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: DUR.slow, ease: EASE.out });
    }
    (done.hidden ? steps[step].querySelector('input, select, textarea') : done)?.focus({ preventScroll: true });
  }

  function close() {
    if (modal.hidden) return;
    document.removeEventListener('keydown', onKey, true);
    const finish = () => {
      modal.hidden = true;
      inertEls.forEach((el) => { el.inert = false; });
      inertEls = [];
      document.documentElement.classList.remove('apply-open');
      window.__lenis?.start();
      opener?.focus?.({ preventScroll: true });
    };
    if (reducedMotion) { finish(); return; }
    gsap.to(backdrop, { opacity: 0, duration: DUR.fast, ease: EASE.inOut });
    gsap.to(panel, { opacity: 0, y: 40, duration: DUR.fast, ease: EASE.inOut, onComplete: finish });
  }

  // Field behaviour
  form.addEventListener('focusout', (e) => {
    const name = e.target.name;
    if (RULES[name] && e.target.type !== 'radio' && e.target.type !== 'checkbox' && e.target.value) check(name);
  });
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (fieldBox(name)?.classList.contains('is-invalid')) check(name);
  });
  form.addEventListener('change', (e) => {
    const { name } = e.target;
    if (name === 'dob' && !ageTouched) {
      const age = ageFrom(f.dob.value);
      if (age >= 5 && age <= 99) {
        const radio = form.querySelector(`input[name="age"][value="${ageGroup(age)}"]`);
        radio.checked = true;
        ageHint.textContent = '(set from your date of birth)';
      }
    }
    if (name === 'age') { ageTouched = true; ageHint.textContent = ''; }
    if (name === 'event') syncEntry();
    if (name === 'entry' || name === 'member') syncConditional();
    if (['years', 'age', 'event'].includes(name)) syncFit();
    if (e.target.type === 'radio' || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') check(name);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep(step)) return;
    if (step < steps.length - 1) goTo(step + 1, 1);
    else showDone();
  });
  back.addEventListener('click', () => goTo(step - 1, -1));
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-apply-close]')) close();
    if (e.target.closest('[data-apply-again]')) { const id = f.event.value; reset(id); }
  });

  return { open, close };
}
