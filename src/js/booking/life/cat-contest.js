import { catPopup, catCaught } from './cat-card.js';

// Catch-the-cat contest (row 136): ten seconds into the visit a card with the club cat explains the
// deal. "Let's find it" flies the camera towards the cat; × or Esc just closes it. It waits while a
// court is being booked, never comes back on the same page load, and skips itself once the cat is caught.

const AFTER = 10000; // ms from page load
const MIN_AFTER_READY = 2500; // ms: a slow load still gets a moment of the map first
const SETTLE = 1200; // ms after the booking tiles close, so it doesn't land on the camera pulling back
const PORTRAIT = '/models/life/cat-portrait.webp';

export function initCatContest({ onFind, isBusy = () => false } = {}) {
  let done = catCaught();
  let pop = null;
  let portrait = 'pending'; // 'ok' | 'none' once the image has answered

  // Load the portrait ahead so the card never shows with a hole or reflows when it arrives.
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { portrait = 'ok'; };
  img.onerror = () => { portrait = 'none'; };
  img.src = PORTRAIT;
  setTimeout(() => { if (portrait === 'pending') portrait = 'none'; }, AFTER + 2000); // a stalled image doesn't hold the card
  document.addEventListener('bp-cat-caught', () => { done = true; pop?.close(); }, { once: true });

  function show() {
    if (done) return;
    done = true;
    const media = portrait === 'ok'
      ? `<div class="cat-contest__media"><img src="${PORTRAIT}" alt="The club cat, an orange tabby" width="640" height="480" /><span class="cat-contest__tag">10% off</span></div>`
      : '';
    pop = catPopup({
      className: 'cat-contest',
      label: 'Close',
      onClose: () => { pop = null; },
      html: `${media}
        <div class="cat-contest__body">
          <h2 class="cat-pop__title" id="cat-contest-title">Find the club cat</h2>
          <p class="cat-pop__text">Find and catch the cat on the map to get 10% off your booking.</p>
          <button class="btn cat-contest__go" type="button"><span class="btn__bg"></span><span class="btn__label">Let’s find it</span></button>
        </div>`,
    });
    pop.el.classList.toggle('has-media', !!media);
    pop.el.querySelector('.cat-contest__go').addEventListener('click', () => { pop?.close(); onFind?.(); });
  }

  // Waits for: the ten seconds, a free map (no booking tiles), a visible tab and the portrait's answer.
  let wasBusy = false;
  function attempt() {
    if (done) return;
    const busy = isBusy() || document.hidden || portrait === 'pending';
    if (busy) { wasBusy ||= isBusy(); setTimeout(attempt, 400); return; }
    if (wasBusy) { wasBusy = false; setTimeout(attempt, SETTLE); return; }
    show();
  }
  setTimeout(attempt, Math.max(AFTER - performance.now(), MIN_AFTER_READY));
}
