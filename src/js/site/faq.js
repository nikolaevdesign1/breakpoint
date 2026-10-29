import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Shared FAQ (rows 75, 94). Pages author plain question/answer pairs:
//   <div class="faq" data-faq> …head… <dl class="faq__list"><dt>Question?</dt><dd>Answer.</dd></dl></div>
// and this upgrades them to an accordion: "+" on the left, the question in the right column,
// a square arrow on the far right. The answer height animates in CSS (grid rows 0fr → 1fr).

const ARROW = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 11L11 3M5 3h6v6"/></svg>';
let uid = 0;
let refreshTimer = 0;

function itemHTML(id) {
  return `
    <h3 class="faq__q">
      <button class="faq__btn" type="button" id="${id}-q" aria-expanded="false" aria-controls="${id}">
        <span class="faq__plus" aria-hidden="true"></span>
        <span class="faq__row"><span class="faq__text"></span><span class="faq__arrow" aria-hidden="true">${ARROW}</span></span>
      </button>
    </h3>
    <div class="faq__a" id="${id}" role="region" aria-labelledby="${id}-q"><div class="faq__clip"><div class="faq__body"></div></div></div>`;
}

function toggle(item, open = !item.classList.contains('is-open')) {
  item.classList.toggle('is-open', open);
  item.querySelector('.faq__btn').setAttribute('aria-expanded', String(open));
  // Content below moves: let scroll-driven effects re-measure once the height has settled.
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 700);
}

export function initFaq(root = document) {
  root.querySelectorAll('[data-faq]:not([data-faq-ready])').forEach((faq) => {
    faq.dataset.faqReady = '';
    const dl = faq.querySelector('dl.faq__list');
    if (!dl) return;
    const list = document.createElement('div');
    list.className = 'faq__list';
    dl.querySelectorAll('dt').forEach((dt) => {
      const id = `faq-${++uid}`;
      const item = document.createElement('div');
      item.className = 'faq__item';
      item.dataset.reveal = '';
      item.innerHTML = itemHTML(id);
      item.querySelector('.faq__text').innerHTML = dt.innerHTML;
      const body = item.querySelector('.faq__body');
      for (let dd = dt.nextElementSibling; dd && dd.tagName === 'DD'; dd = dd.nextElementSibling) {
        const p = document.createElement('p');
        p.innerHTML = dd.innerHTML;
        body.appendChild(p);
      }
      list.appendChild(item);
    });
    dl.replaceWith(list);
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.faq__btn');
      if (btn) toggle(btn.closest('.faq__item'));
    });
  });
}
