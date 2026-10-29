// Tempo tokens for GSAP code (row 17). Twin of the --dur-* / --ease-* / --stagger tokens in css/site/tokens.css:
// tennis does not hurry, so durations are long, starts are soft and tails are long.
// Reduced motion: use `t(seconds)` to collapse a duration to an instant change.

export const DUR = { fast: 0.5, base: 0.9, slow: 1.4, slower: 2, slowest: 3 };
export const STAGGER = { tight: 0.05, base: 0.12, wide: 0.2 };
export const EASE = {
  out: 'power3.out', // default entrance
  tail: 'power4.out', // long tail for big moves
  inOut: 'power2.inOut', // soft both ends
  soft: 'sine.inOut', // loops and drifts
  spring: 'elastic.out(1, 0.7)', // squash and settle
};

export const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Duration in seconds, or an instant tick under prefers-reduced-motion. */
export const t = (seconds) => (prefersReduced() ? 0.01 : seconds);
