// Plan comparison (row 128): privileges by plan, one dashed row each, the Club column highlighted.
// The plan row sticks under the bar while the table scrolls. Prices carry data-price, so the
// Monthly / Annual switch of the pricing block (pricing.js) updates them too.
// On phones every row stacks: the privilege on its own line, the four values under the plan row.

import { PLAN, ROLLOVER_HOURS } from '../shared/club-facts.js';

const CTA = { payg: 'Book a court', weekday: 'Choose Weekday', club: 'Choose Club', family: 'Choose Family' };
export const PLANS = Object.entries(PLAN).map(([id, p]) => ({
  id, name: p.name, price: p.price, cta: CTA[id], ...(id === 'payg' ? { href: '/booking.html' } : {}), ...(id === 'club' ? { popular: true } : {}),
}));

const Y = true; // included
const N = false; // not included
const pct = (n) => (n ? `${Math.round(n * 100)}%` : N);
const days = (id) => `${PLAN[id].window} days`;
const guests = (id) => (PLAN[id].guests ? `${PLAN[id].guests} a month` : N);
const freeze = (id) => (PLAN[id].freeze ? `Up to ${PLAN[id].freeze} ${PLAN[id].freeze === 1 ? 'month' : 'months'}` : N);
const { weekday: W, club: C, family: F } = PLAN;

// [privilege, note, ...one value per plan]
const ROWS = [
  ['Court hours a month', `Club and Family roll over up to ${ROLLOVER_HOURS}`, 'Drop-in rate', `${W.hours}, before 4 PM`, `${C.hours}, peak included`, `${F.hours}, shared`],
  ['Booking window', '', days('payg'), days('weekday'), days('club'), days('family')],
  ['Coaching discount', 'Private lessons and clinics', N, pct(W.coachOff), pct(C.coachOff), `${pct(F.coachOff)}, juniors ${pct(F.juniorOff)}`],
  ['Extra court hours', 'Beyond the hours in your plan', 'Drop-in rate', 'Drop-in rate', `${pct(C.courtOff)} off`, `${pct(F.courtOff)} off`],
  ['Guest passes', '', N, guests('weekday'), guests('club'), guests('family')],
  ['Member draws', '', 'Open draws', Y, Y, Y],
  ['Locker', '', N, 'Day locker', 'Keyless locker', '2 keyless lockers'],
  ['Racket restringing', 'Strings at cost', 'From $28', '15% off', 'One a quarter', 'One a month'],
  ['Pro shop discount', '', N, '5%', '10%', '15%'],
  ['Membership freeze', 'For travel or injury', N, freeze('weekday'), freeze('club'), freeze('family')],
];

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

const cellClass = (plan) => `cmp__cell${plan.popular ? ' is-club' : ''}`;

function valueHTML(v) {
  if (v === Y) return `<span class="cmp__yes">${CHECK}<span class="visually-hidden">Included</span></span>`;
  if (v === N) return '<span class="cmp__no" aria-hidden="true"></span><span class="visually-hidden">Not included</span>';
  return v;
}

function headHTML() {
  const plans = PLANS.map((p) => `
    <div class="${cellClass(p)} cmp__plan" role="columnheader">
      <b>${p.name}</b>${p.popular ? '<span class="cmp__tag">Most popular</span>' : ''}
      <small>$<span data-price="${p.price}">${p.price}</span> / month</small>
    </div>`).join('');
  return `<div class="cmp__head" role="rowgroup"><div class="cmp__row" role="row"><div class="cmp__corner" role="columnheader"><span class="visually-hidden">Privilege</span></div>${plans}</div></div>`;
}

function rowHTML([label, note, ...values]) {
  const cells = values.map((v, i) => `<div class="${cellClass(PLANS[i])}" role="cell">${valueHTML(v)}</div>`).join('');
  return `<div class="cmp__row" role="row"><div class="cmp__key" role="rowheader">${label}${note ? `<small>${note}</small>` : ''}</div>${cells}</div>`;
}

function footHTML() {
  const ctas = PLANS.map((p) => `
    <div class="${cellClass(p)}" role="cell">
      <a class="btn btn--sm${p.popular ? '' : ' btn--ghost'}" href="${p.href || '#apply'}"${p.href ? '' : ` data-plan="${p.id}"`}><span class="btn__bg"></span><span class="btn__label">${p.cta}</span></a>
    </div>`).join('');
  return `<div class="cmp__row cmp__row--foot" role="row"><div class="cmp__key" role="cell"><span class="visually-hidden">Choose a plan</span></div>${ctas}</div>`;
}

export function renderCompare(root = document) {
  const table = root.querySelector('[data-compare]');
  if (!table) return;
  table.innerHTML = `${headHTML()}<div class="cmp__body" role="rowgroup">${ROWS.map(rowHTML).join('')}${footHTML()}</div>`;
}
