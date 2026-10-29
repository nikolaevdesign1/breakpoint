import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Rows 41, 45: the four score cells under the club paragraph arrive one after another when the row scrolls in
// (CSS, .is-on, --i sets the order). Scrolling back past the row takes them away together.
export function initClubNotes({ reducedMotion }) {
  const club = document.querySelector('.club');
  const board = club?.querySelector('[data-club-board]');
  const notes = board ? [...board.querySelectorAll('[data-club-note]')] : [];
  if (!notes.length || reducedMotion) return;

  club.classList.add('is-staged');
  notes.forEach((n, i) => n.style.setProperty('--i', i));
  const set = (on) => notes.forEach((n) => n.classList.toggle('is-on', on));
  ScrollTrigger.create({ trigger: board, start: 'top 88%', onEnter: () => set(true), onLeaveBack: () => set(false) });
}
