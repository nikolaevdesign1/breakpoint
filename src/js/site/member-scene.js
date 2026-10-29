import gsap from 'gsap';
import { mediaUrl } from './media.js';

// Row 49: a sticky scene to the right of the perk list. Each perk has its own drawing, built from squares, dashes and
// court lines; the one for the active perk (member-card.js toggles .is-on on the list rows) builds in slowly, the old one
// folds away, and a short ripple of squares runs across the frame. Plain DOM, no canvas. Numbers follow
// docs/content-bible.md. Reduced motion: the active scene just shows, finished.

const DAYS = Array.from({ length: 14 }, (_, i) => i);
const LADDER = ['Lena V.', 'Marcus T.', 'Ana K.', 'Diego M.', 'You'];
const LOCKERS = 12;
const RIPPLE = 36;

const row = (label, cls, filled) => `
  <div class="ms-days__row ${cls}"><p class="ms-k">${label}</p>
    <div class="ms-days__cells">${DAYS.map((d) => `<i style="--i:${d}"${d < filled ? ' class="is-open"' : ''}></i>`).join('')}</div></div>`;

const SCENES = [
  // 1. Book 14 days ahead: the member row fills to 14, the guest row stops at 3
  `<div class="ms-days">
    ${row('Member', 'ms-days__member', 14)}
    ${row('Guest', 'ms-days__guest', 3)}
    <p class="ms-big">14<small>days ahead</small></p><p class="ms-note">Guests see three.</p>
  </div>`,
  // 2. Lower rates: drop-in bars against member bars (20% off lessons and extra hours)
  `<div class="ms-rates">
    ${[['Private lesson', 120, 96], ['Court hour, peak clay', 64, 51]].map(([k, a, b]) => `
      <div class="ms-rates__pair"><p class="ms-k">${k}</p>
        <div class="ms-rates__bars">
          <div class="ms-bar" style="--h:100%"><b data-n="${a}">$${a}</b><i></i><span>Drop-in</span></div>
          <div class="ms-bar ms-bar--member" style="--h:${Math.round((b / a) * 100)}%"><b data-n="${b}" data-from="${a}">$${a}</b><i></i><span>Club</span></div>
        </div></div>`).join('')}
    <p class="ms-note">Club plan: 20% off lessons and extra hours.</p>
  </div>`,
  // 3. Ladder and draws: the You row climbs from fifth to second
  `<div class="ms-ladder"><p class="ms-k">Member draw</p>
    <ol>${LADDER.map((n, i) => `<li class="${n === 'You' ? 'is-you' : ''}" style="--to:${n === 'You' ? 1 : i < 1 ? 0 : i + 1}; --from:${i}"><span>${n}</span><em>${n === 'You' ? '6–4, 7–5' : ['6–2, 6–3', '6–4, 6–4', '7–6, 6–4', '6–3, 6–2'][i]}</em></li>`).join('')}
      ${LADDER.map((_, i) => `<b class="ms-rank" style="--r:${i}">${i + 1}</b>`).join('')}</ol>
    <p class="ms-note">Member draws open a week early.</p>
  </div>`,
  // 4. Guest passes: two tickets with a cut corner and a dashed perforation
  `<div class="ms-pass">
    ${[1, 2].map((n) => `<div class="ms-ticket cut cut--a" style="--n:${n - 1}"><p class="ms-k">Guest pass</p><b>${n} of 2</b><i aria-hidden="true"></i><span>This month, on the Club plan</span></div>`).join('')}
  </div>`,
  // 5. Lounge and lockers: a wall of lockers, one opens; the terrace beside it
  `<div class="ms-lounge">
    <div class="ms-lockers">${Array.from({ length: LOCKERS }, (_, i) => `<i style="--i:${i}"${i === 6 ? ' class="is-open"' : ''}><b>${108 + i}</b></i>`).join('')}</div>
    <div class="ms-terrace cut cut--b"><img src="${mediaUrl('advantages.4', 700)}" alt="" loading="lazy" /></div>
    <p class="ms-note">Keyless lockers, and the terrace over Center Court.</p>
  </div>`,
];

export function initMemberScene({ reducedMotion }) {
  const root = document.querySelector('[data-member]');
  const rows = root ? [...root.querySelectorAll('[data-perk]')] : [];
  if (!rows.length) return;
  const box = document.createElement('div');
  box.className = 'member__scene mscene';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<div class="mscene__ripple">${Array.from({ length: RIPPLE }, (_, i) => `<i style="--d:${((i * 7) % RIPPLE) / RIPPLE}"></i>`).join('')}</div>`
    + SCENES.map((s, i) => `<div class="mscene__layer" data-scene="${i}">${s}</div>`).join('');
  root.append(box);
  const layers = [...box.querySelectorAll('.mscene__layer')];
  const ripple = box.querySelector('.mscene__ripple');
  let now = -1;

  const countRates = (layer, on) => layer.querySelectorAll('.ms-bar--member b').forEach((b) => {
    const from = +b.dataset.from;
    const to = +b.dataset.n;
    if (reducedMotion) { b.textContent = `$${on ? to : from}`; return; }
    const o = { v: on ? from : to };
    gsap.to(o, { v: on ? to : from, duration: 2, delay: on ? 1 : 0, ease: 'power2.inOut', overwrite: true, onUpdate: () => { b.textContent = `$${Math.round(o.v)}`; } });
  });

  function show(i) {
    if (i === now || i < 0) return;
    const prev = now;
    now = i;
    if (!reducedMotion) { ripple.classList.remove('is-run'); void ripple.offsetWidth; ripple.classList.add('is-run'); }
    layers.forEach((l, k) => {
      const on = k === i;
      if (l.classList.contains('is-on') === on) return;
      l.classList.toggle('is-on', on);
      if (k === 1) countRates(l, on);
    });
    if (prev < 0) box.classList.add('is-ready');
  }

  // member-card.js marks the active row; follow it.
  const sync = () => show(rows.findIndex((r) => r.classList.contains('is-on')));
  const mo = new MutationObserver(sync);
  rows.forEach((r) => mo.observe(r, { attributes: true, attributeFilter: ['class'] }));
  sync();
  if (now < 0) show(0);
}
