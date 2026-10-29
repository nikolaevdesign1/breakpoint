import '../../../css/booking-life.css';
import { CAT_CODE } from '../extras.js';

// Catch-the-cat popups (rows 133, 136): solid panels in the site's type, square corners, no glass.
// They share one slot on the map (bottom left above the dock; under the top bar on narrow screens),
// spring in, close on ×, Esc or when a court is opened, and never take the map hostage.
// Nothing is remembered between page loads (row 135): every visit is a new contest.

export { CAT_CODE };

const SPRING_OUT = 520; // ms: fallback removal if transitionend never fires
let caughtNow = false;

/** Caught on this page load. */
export const catCaught = () => caughtNow;

/** A popup in the cat slot. Returns { el, close }. `onClose` runs once, however it was closed. */
export function catPopup({ className, label, html, onClose }) {
  const el = document.createElement('section');
  el.className = `cat-pop ${className}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${className}-title`);
  el.innerHTML = `${html}<button class="cat-pop__close" type="button" aria-label="${label}"><span aria-hidden="true"></span></button>`;
  document.body.append(el);

  let open = true;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onHud = (e) => { if (e.detail?.open) close(); };

  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('bp-hud', onHud);
    if (el.contains(document.activeElement)) document.activeElement.blur();
    el.classList.remove('is-in');
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, SPRING_OUT);
    onClose?.();
  }

  el.querySelector('.cat-pop__close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.addEventListener('bp-hud', onHud);
  requestAnimationFrame(() => requestAnimationFrame(() => open && el.classList.add('is-in')));
  return { el, close };
}

let card = null;

/** The reward, right after the catch animation (cat.js). */
export function showCatCard() {
  caughtNow = true;
  document.dispatchEvent(new CustomEvent('bp-cat-caught', { detail: { code: CAT_CODE } }));
  if (card) return;

  card = catPopup({
    className: 'cat-card',
    label: 'Close',
    onClose: () => { card = null; },
    html: `
      <h2 class="cat-pop__title" id="cat-card-title">You caught the cat!</h2>
      <p class="cat-pop__text">10% off your booking. Copy the code and paste it at checkout.</p>
      <div class="cat-card__code">
        <span class="cat-card__value">${CAT_CODE}</span>
        <button class="btn btn--sm btn--light cat-card__copy" type="button"><span class="btn__bg"></span><span class="btn__label">Copy code</span></button>
      </div>`,
  });
  const { el } = card;
  const copy = el.querySelector('.cat-card__copy');
  const label = copy.querySelector('.btn__label');
  let reset = 0;

  copy.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(CAT_CODE);
      label.textContent = 'Copied';
      el.classList.add('is-copied');
      reset = setTimeout(() => { label.textContent = 'Copy code'; el.classList.remove('is-copied'); }, 2400);
    } catch {
      // No clipboard access: select the code so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('.cat-card__value'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      label.textContent = 'Select and copy';
    }
  });
  // The catch came from a click on the map: hand the keyboard the one thing to do next.
  copy.focus({ preventScroll: true });
}
