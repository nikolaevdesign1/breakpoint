// Line pictograms for the club marks and tiles (16 px grid, 1.5 px stroke, currentColor).
const P = {
  racket: '<ellipse cx="10" cy="6" rx="3.6" ry="4.6" transform="rotate(35 10 6)"/><path d="M7.4 9.6L2.5 14.5"/>',
  balls: '<path d="M4.5 3h7v10h-7zM4.5 6h7M4.5 10h7"/>',
  basket: '<path d="M2 6h12l-1.6 8H3.6zM5 6V3.5h6V6M6 9v2.5M8 9v2.5M10 9v2.5"/>',
  machine: '<path d="M2 8.5h7.5v4H2zM9.5 9l4.5-3.2M4 12.5v2M8 12.5v2"/>',
  walk: '<path d="M3 13l3-6 3 3 4-7"/>',
  cup: '<path d="M3 6h8v4a4 4 0 0 1-8 0zM11 7h1.5a1.5 1.5 0 0 1 0 3H11M3 14h8"/>',
};

export const icon = (name) => `<svg class="cl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" aria-hidden="true">${P[name]}</svg>`;
