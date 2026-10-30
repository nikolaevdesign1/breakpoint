import gsap from 'gsap';
import { revealText } from './type-reveal.js';

// Ball cursor: a small dot that inverts what is under it, grows over links, squashes on press
// and turns into a solid label over blocks marked with data-cursor="…".

const INTERACTIVE = 'a, button, [role="button"], summary, label, select, .slot, .chip, .topic, .day-tab';
const TEXT_INPUT = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';

const REST = 0.25; // the dot is 48px in CSS: 12px at rest, full size over links

let api = { setLabel: () => {} };

export function initCursor() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return api;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dot = document.createElement('div');
  dot.className = 'cursor';
  const label = document.createElement('div');
  label.className = 'cursor-label';
  label.innerHTML = '<span class="cursor-label__text"></span>';
  document.body.append(dot, label);
  document.documentElement.classList.add('has-cursor');
  const labelText = label.firstChild;

  const lag = reduced ? 0.01 : 0.5;
  const dx = gsap.quickTo(dot, 'x', { duration: lag, ease: 'power3.out' });
  const dy = gsap.quickTo(dot, 'y', { duration: lag, ease: 'power3.out' });
  const lx = gsap.quickTo(label, 'x', { duration: lag * 1.5, ease: 'power3.out' });
  const ly = gsap.quickTo(label, 'y', { duration: lag * 1.5, ease: 'power3.out' });
  const roll = gsap.quickTo(dot, 'rotation', { duration: lag * 3, ease: 'power3.out' }); // the ball rolls as it moves
  let turn = 0;
  gsap.set([dot, label], { xPercent: -50, yPercent: -50 });
  gsap.set(dot, { scale: REST });

  let mode = 'idle';
  let currentText = '';
  let forced = null; // label set from script (3D courts)

  function setMode(next, text = '') {
    // The label shows at full size with its text in place; the letters only flicker into focus.
    if (next === 'label' && text !== currentText) {
      currentText = text;
      labelText.textContent = text;
      delete labelText.dataset.typeSplit; // fresh text: split it again
      revealText(labelText, { fade: false, duration: 0.45, stagger: 0.024 });
    }
    if (next === mode) return;
    mode = next;
    dot.dataset.mode = next;
    if (next === 'label') {
      gsap.fromTo(label, { autoAlpha: 0, filter: 'blur(4px)' }, { autoAlpha: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
      gsap.to(dot, { scale: 0, duration: 0.45, ease: 'power2.out' });
    } else {
      currentText = next === 'label' ? currentText : '';
      gsap.to(label, { autoAlpha: 0, filter: 'blur(4px)', duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });
      gsap.to(dot, { scale: next === 'hover' ? 1 : next === 'text' ? 0 : REST, duration: 0.8, ease: 'elastic.out(1, 0.6)' });
    }
  }

  function resolve(target) {
    if (forced) return setMode('label', forced);
    const labelled = target.closest?.('[data-cursor]');
    if (labelled && labelled.dataset.cursor) return setMode('label', labelled.dataset.cursor);
    if (target.closest?.(TEXT_INPUT)) return setMode('text');
    if (target.closest?.(INTERACTIVE)) return setMode('hover');
    setMode('idle');
  }

  window.addEventListener('pointermove', (e) => {
    dx(e.clientX); dy(e.clientY); lx(e.clientX); ly(e.clientY);
    if (!reduced) roll((turn += e.movementX * 0.6));
    if (dot.dataset.hidden) { delete dot.dataset.hidden; gsap.to(dot, { autoAlpha: 1, duration: 0.2 }); }
  }, { passive: true });
  document.addEventListener('pointerover', (e) => resolve(e.target), { passive: true });
  document.addEventListener('pointerleave', () => { dot.dataset.hidden = '1'; gsap.to([dot, label], { autoAlpha: 0, duration: 0.2 }); mode = 'idle'; });

  // Press: the ball squashes like it just met the strings.
  window.addEventListener('pointerdown', () => {
    const s = mode === 'hover' ? 1 : REST;
    gsap.fromTo(dot, { scaleX: s * 1.35, scaleY: s * 0.65 }, { scaleX: s, scaleY: s, duration: 0.9, ease: 'elastic.out(1.1, 0.45)', overwrite: 'auto' });
  }, { passive: true });

  gsap.set(label, { autoAlpha: 0 });

  api = {
    // Let canvas scenes drive the label (e.g. "Book Clay 3" over a court).
    setLabel(text) {
      forced = text || null;
      if (forced) setMode('label', forced);
      else setMode('idle');
    },
  };
  return api;
}

export function cursor() {
  return api;
}
