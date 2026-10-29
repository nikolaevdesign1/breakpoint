import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Thin-line forms (rows 118, 128: contacts, memberships). Markup per field:
//   <div class="lf__field" data-field="email"><label class="lf__label">…</label><input class="lf__input" name="email" />
//   <span class="lf__line"></span><p class="lf__error"></p></div>
// A field is checked when it loses focus (only once it has a value), re-checked live while it shows
// an error, and all at once on submit. Fields inside [hidden] or [inert] are skipped.
// No backend yet: a valid submit hands the values to `onValid`, which shows the success state.

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const digits = (v) => v.replace(/\D/g, '').length;

// data-mask="phone": 305 555 0142, or +1 305 555 0142 when it starts with a plus. Digits only, the caret stays put at the end.
const maskPhone = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 13);
  const groups = (s) => [s.slice(0, 3), s.slice(3, 6), s.slice(6, 10)].filter(Boolean).join(' ');
  return v.trim().startsWith('+') ? `+${d.slice(0, 1)}${d.length > 1 ? ' ' : ''}${groups(d.slice(1))}`.trim() : groups(d);
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initLineForm(form, { rules, onValid }) {
  const f = form.elements;
  form.querySelectorAll('[data-mask="phone"]').forEach((el) => el.addEventListener('input', () => { el.value = maskPhone(el.value); }));
  const box = (name) => form.querySelector(`[data-field="${name}"]`);
  const live = (el) => !el.closest('[hidden], [inert]');
  const control = (name) => box(name)?.querySelector('.cs__btn, input, select, textarea');
  const filled = (name) => {
    const el = f[name];
    if (!el) return false;
    if (el instanceof RadioNodeList || el.type === 'checkbox') return false; // those check on change
    return el.value.trim() !== '';
  };

  function check(name) {
    const b = box(name);
    if (!b || !live(b)) return true;
    const error = rules[name](f) || '';
    b.classList.toggle('is-invalid', Boolean(error));
    const msg = b.querySelector('.lf__error');
    if (msg) msg.textContent = error;
    const el = control(name);
    if (el) {
      el.setAttribute('aria-invalid', String(Boolean(error)));
      if (msg) { msg.id ||= `${el.id || name}-error`; el.setAttribute('aria-describedby', msg.id); }
    }
    return !error;
  }

  Object.keys(rules).forEach((name) => {
    const b = box(name);
    if (!b) return;
    b.addEventListener('focusout', (e) => { if (!b.contains(e.relatedTarget) && filled(name)) check(name); });
    const recheck = () => { if (b.classList.contains('is-invalid')) check(name); };
    b.addEventListener('input', recheck);
    b.addEventListener('change', recheck);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = Object.keys(rules).filter((name) => !check(name));
    if (bad.length) {
      const b = box(bad[0]);
      control(bad[0])?.focus({ preventScroll: false });
      if (!reduced()) gsap.fromTo(b, { x: -8 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', clearProps: 'x' });
      return;
    }
    onValid(Object.fromEntries(new FormData(form)));
  });

  return { check };
}

// Swap the form for its success panel (`.lf-done` inside the same wrapper) and bring it in.
export function showDone(wrap) {
  const done = wrap.querySelector('.lf-done');
  wrap.classList.add('is-sent');
  requestAnimationFrame(() => ScrollTrigger.refresh()); // the page below changed height
  const title = done?.querySelector('[tabindex="-1"]');
  title?.focus({ preventScroll: true });
  const y = wrap.getBoundingClientRect().top + (window.__lenis?.scroll ?? window.scrollY) - 96;
  if (wrap.getBoundingClientRect().top < 80) window.__lenis ? window.__lenis.scrollTo(y, { duration: 1 }) : window.scrollTo({ top: y, behavior: 'smooth' });
  if (!done || reduced()) return;
  gsap.fromTo(done, { autoAlpha: 0, y: 32, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1, ease: 'elastic.out(1, 0.7)', clearProps: 'transform' });
}
