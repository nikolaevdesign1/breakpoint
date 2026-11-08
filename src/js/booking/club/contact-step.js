import { loadContact, saveContact, clearContact, hasContact, formatPhone, RULES, CONTACT_HINT, fullName, contactLine, peopleLabel } from '../../shared/contact.js';
import { CANCEL } from '../../shared/club-facts.js';

// The data step of every booking made in the Club panel (lesson, café table, open game), and the
// ticket that follows it. One form: first and last name, a phone or an e-mail, how many people (a
// stepper with limits), the cancellation rule to agree to. What was typed is kept in `ctx.cdraft` so
// a redraw (the time bar moving) does not empty it, and in localStorage (shared/contact.js) for the
// next booking. The court booking has the same fields on its details tile (player-form.js).

const TICK = '<svg class="check__tick" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param ctx   panel context (keeps the draft between redraws)
 * @param opts  { id, title, sub, party: { min, max, n }, partyLabel, confirm, onBack, onConfirm(person) }
 *              person = { first, last, name, phone, email, contact, party }
 */
export function contactStep(ctx, { id, title, sub, party, partyLabel = 'People', confirm = 'Confirm', onBack, onConfirm }) {
  if (ctx.cdraft?.id !== id) ctx.cdraft = { id, ...loadContact(), n: party.n, agreed: false };
  const d = ctx.cdraft;
  d.n = Math.min(party.max, Math.max(party.min, d.n));

  const f = document.createElement('form');
  f.className = 'cl-form cl-contact';
  f.noValidate = true;
  f.innerHTML = `
    <div class="cl-wide cl-contact__sum"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
    <label class="cl-field">First name<input name="first" autocomplete="given-name" autocapitalize="words" required /></label>
    <label class="cl-field">Last name<input name="last" autocomplete="family-name" autocapitalize="words" required /></label>
    <label class="cl-field">Phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 (305) 555-0142" /></label>
    <label class="cl-field">E-mail<input name="email" type="email" autocomplete="email" placeholder="you@example.com" /></label>
    <p class="cl-wide cl-contact__note"><span>${CONTACT_HINT}. One of the two is enough.</span><button type="button" class="cl-link" data-clear hidden>Not you? Clear</button></p>
    <div class="cl-wide cl-party"><span>${esc(partyLabel)}<small>${party.min === party.max ? party.max : `${party.min} to ${party.max}`}</small></span>
      <div class="cl-step"><button type="button" data-n="-1" aria-label="Fewer people">−</button><b data-n-out aria-live="polite"></b><button type="button" data-n="1" aria-label="More people">+</button></div></div>
    <label class="check cl-wide cl-agree"><input type="checkbox" name="policy" /><span class="check__box" aria-hidden="true">${TICK}</span><span>${esc(CANCEL.text)}</span></label>
    <p class="cl-wide cl-score__err cl-contact__err" role="alert" data-err></p>
    <div class="cl-wide cl-contact__acts"><button type="button" class="cl-btn" data-back>Back</button><button type="submit" class="cl-btn is-solid">${esc(confirm)}</button></div>`;

  const el = (n) => f.elements[n];
  for (const n of ['first', 'last', 'phone', 'email']) el(n).value = d[n] ?? '';
  el('policy').checked = !!d.agreed;
  const clearBtn = f.querySelector('[data-clear]');
  const out = f.querySelector('[data-n-out]');
  const steps = f.querySelectorAll('[data-n]');
  const err = f.querySelector('[data-err]');
  const syncClear = () => { clearBtn.hidden = !hasContact() && !['first', 'last', 'phone', 'email'].some((n) => el(n).value); };
  const syncN = () => { out.textContent = d.n; steps.forEach((b) => { b.disabled = Number(b.dataset.n) < 0 ? d.n <= party.min : d.n >= party.max; }); };
  syncN();
  syncClear();

  const mark = (n, text) => {
    const row = el(n).closest('.cl-field');
    row.classList.toggle('is-invalid', !!text);
    el(n).setAttribute('aria-invalid', String(!!text));
    let h = row.querySelector('.cl-field__hint');
    if (!text) { h?.remove(); return true; }
    if (!h) { h = document.createElement('em'); h.className = 'cl-field__hint'; row.append(h); }
    h.textContent = text;
    return false;
  };
  const check = (n) => { const r = RULES[n](el(n).value); return mark(n, r === true ? '' : r); };

  for (const n of ['first', 'last', 'phone', 'email']) {
    el(n).addEventListener('input', () => {
      if (n === 'phone') el(n).value = formatPhone(el(n).value);
      d[n] = el(n).value;
      syncClear();
      if (el(n).closest('.is-invalid')) check(n);
      if ((n === 'phone' || n === 'email') && el(n).value) { ['phone', 'email'].forEach((m) => { if (el(m).closest('.is-invalid')) check(m); }); err.textContent = ''; }
    });
    el(n).addEventListener('blur', () => { if (el(n).value) check(n); });
  }
  el('policy').addEventListener('change', () => { d.agreed = el('policy').checked; f.querySelector('.cl-agree').classList.remove('is-invalid'); err.textContent = ''; });
  steps.forEach((b) => b.addEventListener('click', () => { d.n = Math.min(party.max, Math.max(party.min, d.n + Number(b.dataset.n))); syncN(); }));
  clearBtn.addEventListener('click', () => {
    clearContact();
    for (const n of ['first', 'last', 'phone', 'email']) { el(n).value = ''; d[n] = ''; mark(n, ''); }
    syncClear();
    el('first').focus();
  });
  f.querySelector('[data-back]').addEventListener('click', () => { onBack?.(); });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = ['first', 'last', 'phone', 'email'].filter((n) => !check(n));
    const none = !el('phone').value.trim() && !el('email').value.trim();
    if (none) { mark('phone', 'A phone or an e-mail'); el('email').closest('.cl-field').classList.add('is-invalid'); if (!bad.includes('phone')) bad.push('phone'); }
    const agreed = el('policy').checked;
    f.querySelector('.cl-agree').classList.toggle('is-invalid', !agreed);
    if (bad.length || !agreed) {
      err.textContent = bad.length ? (none && bad.length === 1 ? 'Add a phone or an e-mail so we can confirm.' : 'Check the highlighted fields.') : 'Please agree to the cancellation rule.';
      (bad.length ? el(bad[0]) : el('policy')).focus();
      return;
    }
    const person = { first: d.first.trim(), last: d.last.trim(), phone: d.phone.trim(), email: d.email.trim() };
    saveContact(person);
    ctx.cdraft = null;
    onConfirm({ ...person, name: fullName(person), contact: contactLine(person), party: d.n });
  });
  return f;
}

/** The ticket after a booking: what, when, who, how many, how to reach them, the price and the rule. */
export function ticketBox({ title, rows }, onClose) {
  const box = document.createElement('section');
  box.className = 'cl-ticket';
  box.setAttribute('role', 'status');
  box.innerHTML = `
    <h3 class="cl-ticket__t">${esc(title)}</h3>
    <dl class="cl-ticket__rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <p class="cl-ticket__note">The desk will confirm by phone or e-mail. ${esc(CANCEL.head)}.</p>
    <button type="button" class="cl-btn is-solid" data-done>Done</button>`;
  box.querySelector('[data-done]').addEventListener('click', onClose);
  return box;
}

export { peopleLabel };
