import { promoRate, CAT_CODE, memberOff } from './extras.js';

// "Your details" step (row 84): name, phone, e-mail, membership, a note and the cancellation terms.
// Fields check themselves as you leave them; what you typed is remembered for the next booking.
// Promo code (row 134): a valid code applies as soon as it is typed; Apply, Enter or leaving the
// field checks anything else. The code itself is never stored.

const STORE = 'bp-player';
const RULES = {
  name: (v) => v.trim().split(/\s+/).length >= 2 || 'First and last name, please',
  phone: (v) => v.replace(/\D/g, '').length >= 10 || 'A number we can text, 10 digits or more',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'That e-mail looks incomplete',
  card: (v, member) => !member || /^\d{6}$/.test(v.trim()) || 'Six digits, printed on your card',
};

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* private mode: nothing to remember */ }
}

const PROMO_BAD = 'That code doesn’t work. Check the spelling.';

export function createPlayerForm(form, { onSubmit, onPromo, onMember }) {
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
  ['name', 'phone', 'email', 'card'].forEach((n) => { if (saved[n]) field(n).value = saved[n]; });
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
  Object.keys(RULES).forEach((n) => {
    field(n).addEventListener('blur', () => { if (field(n).value) check(n); });
    field(n).addEventListener('input', () => { if (field(n).closest('.is-invalid')) check(n); });
  });
  field('policy').addEventListener('change', () => field('policy').closest('.hud-check-row').classList.remove('is-invalid'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = Object.keys(RULES).filter((n) => !check(n));
    const policy = field('policy').checked;
    field('policy').closest('.hud-check-row').classList.toggle('is-invalid', !policy);
    if (bad.length) { field(bad[0]).focus(); return; }
    if (!checkPromo()) { promoIn.focus(); return; }
    if (!policy) { field('policy').focus(); return; }
    save({ name: field('name').value.trim(), phone: field('phone').value.trim(), email: field('email').value.trim(), plan: member, card: member ? field('card').value.trim() : '' });
    onSubmit();
  });

  return {
    value: () => ({ name: field('name').value.trim(), email: field('email').value.trim(), phone: field('phone').value.trim(), member, card: validCard(), note: field('note').value.trim() }),
    memberCard: validCard,
    memberPlan: () => (validCard() ? member : null),
    focusFirst: () => (Object.keys(RULES).map(field).find((i) => !i.value && !i.closest('[inert]')) || field('policy')).focus({ preventScroll: true }),
  };
}
