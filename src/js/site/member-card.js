import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// The member card (rows 42, 48, 55), one component for every page: it swings in, leans toward the cursor and
// spins by drag, springing to the nearest face. Inside [data-member] (home) the perk row in the middle of the
// screen (or under the pointer) is the active one: the card turns to the face that carries it and lights its
// line. A light patch (--gx / --gy) slides across the card as it moves.
const BACK = new Set([3, 4]); // perks printed on the back of the card

export function initMemberCard({ reducedMotion }) {
  document.querySelectorAll('[data-clubcard]').forEach((card) => initCard(card, reducedMotion));
}

function initCard(card, reducedMotion) {
  const root = card.closest('[data-member]');
  const tilt = card.querySelector('[data-clubcard-tilt]');
  const flip = card.querySelector('[data-clubcard-flip]');
  const rows = root ? [...root.querySelectorAll('[data-perk]')] : [];
  const fields = [...card.querySelectorAll('[data-field]')];

  let angle = 0; // current flip angle, multiples of 180 at rest
  let dragging = false;
  let active = -1;
  const turnTo = (deg, fast) => {
    angle = deg;
    gsap.to(flip, { rotationY: deg, duration: reducedMotion || fast ? 0.01 : 1.1, ease: 'elastic.out(1, 0.7)', overwrite: true });
  };
  const faceBack = () => Math.round(angle / 180) % 2 !== 0;
  const mark = (i) => {
    rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
    fields.forEach((f) => f.classList.toggle('is-hot', +f.dataset.field === i));
  };

  if (rows.length) {
    root.classList.add('is-live');
    const activate = (i) => {
      if (i === active) return;
      active = i;
      mark(i);
      if (BACK.has(i) !== faceBack()) turnTo(angle + 180);
    };
    // Scroll: the row crossing the middle of the screen is active.
    rows.forEach((row, i) => {
      ScrollTrigger.create({ trigger: row, start: 'top 60%', end: 'bottom 60%', onToggle: (st) => { if (st.isActive) activate(i); } });
      row.addEventListener('pointerenter', () => activate(i));
    });
    activate(0);
  }

  if (reducedMotion) return;

  // Light follows the turn: the patch drifts with the total angle.
  let lastLight = '';
  const light = () => {
    const a = (gsap.getProperty(flip, 'rotationY') + gsap.getProperty(tilt, 'rotationY')) * (Math.PI / 180);
    const x = Math.round(50 + 45 * Math.sin(a));
    const y = Math.round(30 - gsap.getProperty(tilt, 'rotationX') * 2);
    const v = `${x}% ${y}%`;
    if (v === lastLight) return;
    lastLight = v;
    card.style.setProperty('--gx', `${x}%`);
    card.style.setProperty('--gy', `${y}%`);
  };
  ScrollTrigger.create({ trigger: card, start: 'top bottom', end: 'bottom top', onToggle: (st) => (st.isActive ? gsap.ticker.add(light) : gsap.ticker.remove(light)) });

  // Entrance: the card swings in once, flat and straight at the end.
  gsap.from(card, {
    rotationY: -40, rotationX: 12, y: 80, autoAlpha: 0, duration: 1.4, ease: 'elastic.out(1, 0.75)',
    scrollTrigger: { trigger: card, start: 'top 85%', once: true },
  });

  // Lean toward the cursor.
  const rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.6, ease: 'power3.out' });
  const ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.6, ease: 'power3.out' });
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    card.addEventListener('pointermove', (e) => {
      if (dragging) return;
      const r = card.getBoundingClientRect();
      rx(((e.clientY - r.top) / r.height - 0.5) * -12);
      ry(((e.clientX - r.left) / r.width - 0.5) * 16);
    });
    card.addEventListener('pointerleave', () => { rx(0); ry(0); });
  }

  // Drag to spin; release springs to the nearest face (and lights the first perk on it).
  let startX = 0;
  let startAngle = 0;
  card.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startAngle = gsap.getProperty(flip, 'rotationY');
    gsap.killTweensOf(flip);
    card.setPointerCapture(e.pointerId);
    rx(0); ry(0);
  });
  card.addEventListener('pointermove', (e) => {
    if (dragging) gsap.set(flip, { rotationY: startAngle + (e.clientX - startX) * 0.6 });
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    turnTo(Math.round(gsap.getProperty(flip, 'rotationY') / 180) * 180);
    if (rows.length && BACK.has(active) !== faceBack()) {
      active = faceBack() ? 3 : 0;
      mark(active);
    }
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}
