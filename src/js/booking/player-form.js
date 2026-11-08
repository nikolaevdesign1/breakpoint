import { promoRate, CAT_CODE, memberOff } from './extras.js';
import { loadContact, saveContact, clearContact, hasContact, formatPhone, RULES as CONTACT_RULES, fullName, contactLine } from '../shared/contact.js';

// "Your details" step (row 84, row 21 of the 2026-11-06 list): first and last name, a phone or an
// e-mail, how many people, membership, a note and the cancellation terms. Fields check themselves as
// you leave them; the contact is remembered for the next booking (shared/contact.js, "Not you? Clear").
// Promo code (row 134): a valid code applies as soon as it is typed; Apply, Enter or leaving the
// field checks anything else. The code itself is never stored.

const STORE = 'bp-player';
const RULES = {
  ...CONTACT_RULES,
  card: (v, member) => !member || /^\d{6}$/.test(v.trim()) || 'Six digits, printed on your card',
};

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* private mode: nothing to remember */ }
}

const PROMO_BAD = 'That code doesn’t work. Check the spelling.';

export function createPlayerForm(form, { onSubmit, onPromo, onMember, onParty }) {
  const field = (name) => form.elements[name];
  const cardRow = form.querySelector('[data-card]');
  const memberRow = form.querySelector('[data-member-row]');
  const cardState = form.querySelector('[data-card-state]');
  const memberBtns = form.querySelectorAll('[data-member]');
  let member = false; // the plan id of a member, else false
  let priced = null; // the card the member price was last shown for

  // Round 9 (row 35): a valid card number takes the member price at once, in every total.
  const validCard = () => (member && /^\d{6}$/.test(field('card').value.trim()) ? field('card').value.trim() : null);
  function syncMember() {
    const card = validCard();
    cardState.textContent = card ? (memberOff(member) ? 'member price on' : 'no court discount') : '';
    const key = card ? `${card}|${member}` : null;
    if (key === priced) return;
    priced = key;
    onMember?.(card, card ? member : null);
  }

  // Round 9 (row 5): "Yes" opens the card column with a spring (CSS on .hud-member); "No" folds it.
  function setMember(plan) {
    member = plan;
    const on = !!plan;
    memberBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.member === (plan || 'no'))));
    memberRow.classList.toggle('is-member', on);
    cardRow.inert = !on;
    cardRow.setAttribute('aria-hidden', String(!on));
    if (!on) mark(field('card'), true);
    syncMember();
  }

  function mark(input, result) {
    const row = input.closest('.hud-input');
    const ok = result === true;
    row.classList.toggle('is-invalid', !ok);
    input.setAttribute('aria-invalid', String(!ok));
    let hint = row.querySelector('.hud-input__hint');
    if (ok) { hint?.remove(); return true; }
    if (!hint) { hint = document.createElement('em'); hint.className = 'hud-input__hint'; row.append(hint); }
    hint.textContent = result;
    return false;
  }

  const check = (name) => mark(field(name), RULES[name](field(name).value, member));

  // --- Promo code ---
  const promo = form.querySelector('[data-promo]');
  const promoIn = field('promo');
  const promoBtn = promo.querySelector('[data-promo-apply]');
  const promoState = promo.querySelector('[data-promo-state]');
  const promoHelp = promo.querySelector('[data-promo-help]');
  let applied = null;

  function setPromo(code) {
    if (code === applied) return;
    applied = code;
    promo.classList.toggle('is-applied', !!code);
    promoState.textContent = code ? `${Math.round(promoRate(code) * 100)}% off applied` : 'optional';
    promoBtn.textContent = code ? 'Remove' : 'Apply';
    if (code && !matchMedia('(prefers-reduced-motion: reduce)').matches) promo.animate?.([{ transform: 'scale(0.97)' }, { transform: 'scale(1.01)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    onPromo?.(code);
  }

  /** Empty: no discount, no hint. Valid: applied. Anything else: the hint, unless `quiet`. */
  function checkPromo({ quiet = false } = {}) {
    const v = promoIn.value.trim();
    if (!v || promoRate(v)) {
      if (!quiet) promoIn.value = v.toLowerCase(); // tidy it once the visitor is done typing
      mark(promoIn, true);
      setPromo(v ? v.toLowerCase() : null);
      return true;
    }
    setPromo(null);
    if (!quiet) mark(promoIn, PROMO_BAD);
    return quiet;
  }

  promoIn.addEventListener('input', () => checkPromo({ quiet: !promo.classList.contains('is-invalid') }));
  promoIn.addEventListener('blur', () => checkPromo());
  promoIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkPromo(); } }); // not a submit
  promoBtn.addEventListener('click', () => {
    if (applied) { promoIn.value = ''; checkPromo(); promoIn.focus(); } else checkPromo();
  });
  // Caught the cat on this page load: the hint offers the code, one click fills it in.
  document.addEventListener('bp-cat-caught', () => {
    promoHelp.innerHTML = `You caught the cat. Your code: <button type="button" class="hud-promo__fill">${CAT_CODE}</button>`;
    promoHelp.querySelector('button').addEventListener('click', () => { promoIn.value = CAT_CODE; checkPromo(); });
  }, { once: true });

  // Restore the last player.
  const saved = load();
  if (saved.card) field('card').value = saved.card;
  const clearBtn = form.querySelector('[data-contact-clear]');
  const fillContact = (c) => ['first', 'last', 'phone', 'email'].forEach((n) => { field(n).value = c[n] || ''; });
  const syncClear = () => { clearBtn.hidden = !hasContact() && !['first', 'last', 'phone', 'email'].some((n) => field(n).value); };
  fillContact(loadContact());
  syncClear();
  clearBtn.addEventListener('click', () => {
    clearContact();
    ['first', 'last', 'phone', 'email'].forEach((n) => { field(n).value = ''; mark(field(n), true); });
    syncClear();
    field('first').focus();
  });
  field('phone').addEventListener('input', () => { field('phone').value = formatPhone(field('phone').value); });

  // People: a stepper with the limits of the court (set by the booking, see setParty).
  const partyBox = form.querySelector('[data-party]');
  const partyN = partyBox.querySelector('[data-party-n]');
  const partyBtns = partyBox.querySelectorAll('[data-party-step]');
  let party = { min: 1, max: 4, n: 2 };
  function renderParty() {
    partyN.textContent = party.n;
    partyBox.querySelector('[data-party-hint]').textContent = ` ${party.min === party.max ? party.max : `${party.min} to ${party.max}`}`;
    partyBtns.forEach((b) => { b.disabled = Number(b.dataset.partyStep) < 0 ? party.n <= party.min : party.n >= party.max; });
  }
  partyBtns.forEach((b) => b.addEventListener('click', () => {
    party.n = Math.min(party.max, Math.max(party.min, party.n + Number(b.dataset.partyStep)));
    renderParty();
    onParty?.(party.n);
  }));
  setMember(saved.plan || (saved.member ? 'club' : false));

  memberBtns.forEach((b) => b.addEventListener('click', () => {
    const plan = b.dataset.member === 'no' ? false : b.dataset.member;
    if (plan === member) return;
    setMember(plan);
    if (member) setTimeout(() => field('card').focus({ preventScroll: true }), 160); // once the column has room
  }));
  field('card').addEventListener('input', () => {
    const digits = field('card').value.replace(/\D/g, '').slice(0, 6);
    if (digits !== field('card').value) field('card').value = digits;
    syncMember();
  });
  const CONTACT_NEED = 'A phone or an e-mail, so we can confirm';
  const contactFields = ['first', 'last', 'phone', 'email'];
  contactFields.forEach((n) => field(n).addEventListener('input', syncClear));
  Object.keys(RULES).forEach((n) => {
    field(n).addEventListener('blur', () => { if (field(n).value) check(n); });
    field(n).addEventListener('input', () => {
      if (field(n).closest('.is-invalid')) check(n);
      // typing one of phone / e-mail satisfies "at least one"
      if ((n === 'phone' || n === 'email') && field(n).value) ['phone', 'email'].forEach((m) => { if (field(m).closest('.is-invalid')) check(m); });
    });
  });
  field('policy').addEventListener('change', () => field('policy').closest('.hud-check-row').classList.remove('is-invalid'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = Object.keys(RULES).filter((n) => !check(n));
    // Phone and e-mail may each be empty, but not both.
    if (!field('phone').value.trim() && !field('email').value.trim()) {
      mark(field('phone'), CONTACT_NEED);
      field('email').closest('.hud-input').classList.add('is-invalid');
      field('email').setAttribute('aria-invalid', 'true');
      bad.push('phone');
    }
    const policy = field('policy').checked;
    field('policy').closest('.hud-check-row').classList.toggle('is-invalid', !policy);
    if (bad.length) { field(bad[0]).focus(); return; }
    if (!checkPromo()) { promoIn.focus(); return; }
    if (!policy) { field('policy').focus(); return; }
    saveContact(contactValue());
    save({ plan: member, card: member ? field('card').value.trim() : '' });
    onSubmit();
  });

  const contactValue = () => ({ first: field('first').value.trim(), last: field('last').value.trim(), phone: field('phone').value.trim(), email: field('email').value.trim() });

  return {
    value: () => ({ ...contactValue(), name: fullName(contactValue()), contact: contactLine(contactValue()), party: party.n, member, card: validCard(), note: field('note').value.trim() }),
    /** The people allowed for this court and the number to start with. */
    setParty: (min, max, n) => { party = { min, max, n: Math.min(max, Math.max(min, n)) }; renderParty(); return party.n; },
    memberCard: validCard,
    memberPlan: () => (validCard() ? member : null),
    focusFirst: () => (['first', 'last', 'phone', 'card'].map(field).find((i) => !i.value && !i.closest('[inert]') && (i.name !== 'phone' || !field('email').value)) || field('policy')).focus({ preventScroll: true }),
  };
}
