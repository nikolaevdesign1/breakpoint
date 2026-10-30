import gsap from 'gsap';

// Loading screen: a percent counter while the model streams in, then the screen fades away.

export function createLoader(root) {
  const pct = root.querySelector('[data-loading-pct]');
  let shown = 0;
  const value = { p: 0 };

  const draw = () => { pct.textContent = String(Math.round(value.p * 100)); };

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
          gsap.timeline({ onComplete: () => { root.hidden = true; } })
            .add(resolve, 0.1)
            .to(root, { autoAlpha: 0, duration: 0.6, ease: 'power2.inOut' }, 0.1);
        },
      });
    });
  }

  function fail() {
    root.querySelector('[data-loading-text]').textContent = 'Could not load the club map. Refresh to try again.';
    root.classList.add('is-failed');
  }

  return { progress, done, fail };
}
