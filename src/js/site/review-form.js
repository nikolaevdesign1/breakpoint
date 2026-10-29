import gsap from 'gsap';
import { initLineForm } from './line-form.js';
import { initChecks, initSelects } from './custom-select.js';
import { DUR, EASE } from './motion.js';

// "Send a review" (row 54): a small modal with the thin-line form. Esc and the backdrop close it, the rest of the
// page is inert while it is open, focus returns to the button. No backend: a valid submit shows the thanks screen.

const RULES = {
  name: (f) => (f.name.value.trim().length > 1 ? '' : 'Add your name.'),
  about: (f) => (f.about.value ? '' : 'Choose one.'),
  rating: (f) => (f.rating.value ? '' : 'Pick a number from 1 to 5.'),
  text: (f) => (f.text.value.trim().length > 9 ? '' : 'A few more words, please.'),
  consent: (f) => (f.consent.checked ? '' : 'Please agree to let us publish it.'),
};

export function initReviewForm({ reducedMotion }) {
  const modal = document.querySelector('[data-review-modal]');
  const openers = document.querySelectorAll('[data-review-open]');
  if (!modal || !openers.length) return;
  document.body.append(modal); // out of the sticky stage, so position: fixed is relative to the screen
  const panel = modal.querySelector('.apply__panel');
  const form = modal.querySelector('[data-review-form]');
  const title = modal.querySelector('#rv-title');
  let opener = null;
  let inertEls = [];

  initChecks(modal);
  initSelects(modal);
  initLineForm(form, {
    rules: RULES,
    onValid: ({ name }) => {
      modal.querySelector('[data-review-name]').textContent = name.trim().split(/\s+/)[0];
      panel.classList.add('is-sent');
      const done = modal.querySelector('.lf-done');
      done.querySelector('[tabindex="-1"]').focus({ preventScroll: true });
      if (!reducedMotion) gsap.fromTo(done, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: 'transform' });
    },
  });

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]')].filter((el) => el.offsetParent);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  function open(from) {
    opener = from;
    panel.classList.remove('is-sent');
    modal.hidden = false;
    inertEls = [...document.body.children].filter((el) => el !== modal && !el.matches('script, .cursor, .cursor-label, canvas') && !el.inert);
    inertEls.forEach((el) => { el.inert = true; });
    window.__lenis?.stop();
    document.documentElement.classList.add('apply-open');
    document.addEventListener('keydown', onKey, true);
    if (!reducedMotion) {
      gsap.fromTo(modal.querySelector('.apply__backdrop'), { opacity: 0 }, { opacity: 1, duration: DUR.base, ease: EASE.out });
      gsap.fromTo(panel, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.out, clearProps: 'transform,opacity,visibility' });
    }
    title.focus({ preventScroll: true });
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
      if (panel.classList.contains('is-sent')) { form.reset(); panel.classList.remove('is-sent'); }
    };
    if (reducedMotion) return finish();
    gsap.to(modal, { autoAlpha: 0, duration: DUR.fast, ease: 'power2.inOut', onComplete: () => { finish(); gsap.set(modal, { clearProps: 'opacity,visibility' }); } });
  }

  openers.forEach((b) => b.addEventListener('click', () => open(b)));
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-review-close]')) close(); });
}
