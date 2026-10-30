import gsap from 'gsap';
import { setMuted } from './sound.js';

// Entry screen, once per visit: two ways in, with sound and without. The choice is the shared mute
// (sound.js) and is also the click the browser needs before it lets the site play anything.
// `entryDone` resolves when the screen is gone (at once if this visit has already entered), and the
// page waits for it before its own greeting.

const KEY = 'bp-entered';
const seen = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

let resolve;
export const entryDone = new Promise((r) => { resolve = r; });

export function initEntry({ reducedMotion }) {
  if (seen()) { resolve(); return; }
  const el = document.createElement('div');
  el.className = 'entry';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Welcome to Break Point');
  el.innerHTML = `
    <svg class="entry__logo" aria-hidden="true"><use href="#bp-logo"/></svg>
    <p class="entry__line">Slow tennis. Long hours, brushed clay, nobody rushing you off the court.</p>
    <div class="entry__choice">
      <button class="entry__btn" type="button" data-entry="sound">Enter with sound</button>
      <button class="entry__btn" type="button" data-entry="silent">Enter without sound</button>
    </div>
    <p class="entry__note">Soft sound is on by default. Change it any time with the bars in the header.</p>`;
  document.body.append(el);
  document.documentElement.classList.add('is-entering');
  const first = el.querySelector('[data-entry="sound"]');
  first.focus({ preventScroll: true });

  const leave = (choice) => {
    remember(choice);
    setMuted(choice === 'silent');
    document.documentElement.classList.remove('is-entering');
    const done = () => { el.remove(); resolve(); };
    if (reducedMotion) { done(); return; }
    gsap.to(el, { autoAlpha: 0, duration: 0.7, ease: 'power2.inOut', onComplete: done });
  };
  el.querySelectorAll('[data-entry]').forEach((b) => b.addEventListener('click', () => leave(b.dataset.entry)));
}
