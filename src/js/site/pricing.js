import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { RATES } from './content.js';
import { ANNUAL_OFF } from '../shared/club-facts.js';
import { initFaq } from './faq.js';

// Pricing block (partials/pricing.html, row 94). Runs on every page from site.js and does nothing
// where the block is absent: inline rate tokens, the court-hour strip, the billing switch and its FAQ.
const ANNUAL = 1 - ANNUAL_OFF;

export function initRates() {
  fillRateTokens();
  renderRateStrip();
  initBilling();
  const faq = document.querySelector('.pricing-faq');
  if (faq) initFaq(faq.parentElement);
}

// Court-hour strip, rendered from the same table the booking widget charges from.
// Row 112: on first view the prices count up from $0 with a slight overshoot, once.
function renderRateStrip() {
  const list = document.querySelector('[data-rates]');
  if (!list) return;
  list.innerHTML = Object.values(RATES)
    .map((r) => `
      <li class="rate-strip__item">
        <span class="rate-strip__surface">${r.label}<small>${r.note}</small></span>
        <b class="rate-strip__price">$<span data-count="${r.offPeak}">${r.offPeak}</span></b>
        <span class="rate-strip__more">Peak $${r.peak} · Weekend $${r.weekend}</span>
      </li>`)
    .join('');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const counts = [...list.querySelectorAll('[data-count]')];
  counts.forEach((el) => { el.textContent = '0'; });
  ScrollTrigger.create({
    trigger: list,
    start: 'top 90%',
    once: true,
    onEnter: () => counts.forEach((el, i) => {
      const n = { v: 0 };
      gsap.to(n, {
        v: +el.dataset.count,
        duration: 1.8,
        delay: i * 0.14,
        ease: 'back.out(1.6)',
        onUpdate: () => { el.textContent = Math.max(0, Math.round(n.v)); },
      });
      gsap.fromTo(el.parentElement, { yPercent: 40, scaleY: 0.8 }, { yPercent: 0, scaleY: 1, duration: 1.5, delay: i * 0.14, ease: 'elastic.out(1, 0.55)' });
    }),
  });
}

// Inline prices anywhere on the page: <span data-rate="clay.offPeak"></span>
export function fillRateTokens() {
  document.querySelectorAll('[data-rate]').forEach((el) => {
    const [type, key] = el.dataset.rate.split('.');
    const value = RATES[type]?.[key];
    if (value !== undefined) el.textContent = `$${value}`;
  });
}

const money = (n) => `$${n.toLocaleString('en-US')}`;

// Monthly / Annual −15%: prices count to their new value, bill notes swap.
function initBilling() {
  const group = document.querySelector('[data-billing]');
  if (!group) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opts = [...group.querySelectorAll('[data-period]')];
  const prices = [...document.querySelectorAll('[data-price]')].map((el) => ({ el, monthly: +el.dataset.price, v: +el.dataset.price }));
  const bills = [...document.querySelectorAll('[data-bill]')];

  const set = (period) => {
    const annual = period === 'annual';
    group.dataset.period = period;
    opts.forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.period === period)));
    prices.forEach((p) => {
      const to = annual ? Math.round(p.monthly * ANNUAL) : p.monthly;
      if (to === p.v) return;
      gsap.to(p, {
        v: to,
        duration: reduced ? 0 : 1.4,
        ease: 'power4.out',
        overwrite: true,
        onUpdate: () => { p.el.textContent = Math.round(p.v); },
      });
      if (!reduced) gsap.fromTo(p.el.parentElement, { y: annual ? 6 : -6 }, { y: 0, duration: 1.1, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
    });
    bills.forEach((b) => {
      b.textContent = annual ? `Billed ${money(Math.round(+b.dataset.bill * ANNUAL) * 12)} a year` : 'Billed monthly';
    });
  };
  opts.forEach((o) => o.addEventListener('click', () => set(o.dataset.period)));
}
