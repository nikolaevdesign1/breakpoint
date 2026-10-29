import gsap from 'gsap';

// Loading screen: a 4×4 mark of squares that flicker while the model streams in.
// Squares lock on as real progress grows; at 100% the mark shatters and the map shows.

const SIZE = 16;

export function createLoader(root) {
  const mark = root.querySelector('[data-loading-mark]');
  const pct = root.querySelector('[data-loading-pct]');
  const cells = Array.from({ length: SIZE }, () => mark.appendChild(document.createElement('i')));
  // Fixed random order in which squares lock on.
  const order = gsap.utils.shuffle(cells.map((_, i) => i));
  let shown = 0;
  let locked = 0;
  const value = { p: 0 };

  // Flicker: unlocked squares blink on a stepped rhythm, like a display waking up.
  const flicker = gsap.ticker.add(() => {
    if (Math.random() > 0.35) return;
    const free = order.slice(locked);
    const c = cells[free[Math.floor(Math.random() * free.length)]];
    if (c) c.classList.toggle('is-on');
  });

  function draw() {
    pct.textContent = String(Math.round(value.p * 100));
    const next = Math.floor(value.p * SIZE);
    for (; locked < next; locked++) {
      const c = cells[order[locked]];
      c.classList.add('is-on', 'is-locked');
    }
  }

  function progress(p) {
    shown = Math.max(shown, Math.min(1, p));
    gsap.to(value, { p: shown, duration: 0.4, ease: 'power2.out', onUpdate: draw, overwrite: true });
  }

  function done() {
    return new Promise((resolve) => {
      gsap.to(value, {
        p: 1,
        duration: 0.35,
        ease: 'power2.out',
        overwrite: true,
        onUpdate: draw,
        onComplete: () => {
          gsap.ticker.remove(flicker);
          gsap.timeline({ onComplete: () => { root.hidden = true; } })
            .to(cells, { scale: 0, duration: 0.2, ease: 'steps(2)', stagger: { amount: 0.3, from: 'random' } }, 0.1)
            .to(pct, { autoAlpha: 0, duration: 0.3 }, 0.1)
            .add(resolve, 0.3)
            .to(root, { autoAlpha: 0, duration: 0.6, ease: 'power2.inOut' }, 0.3);
        },
      });
    });
  }

  function fail() {
    gsap.ticker.remove(flicker);
    root.querySelector('[data-loading-text]').textContent = 'Could not load the club map. Refresh to try again.';
    root.classList.add('is-failed');
  }

  return { progress, done, fail };
}
