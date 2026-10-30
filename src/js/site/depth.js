import gsap from 'gsap';

// Pointer depth for the header and the open menu: the plates lean a few degrees toward the pointer on
// different planes, like the booking panel's tiles. Fine pointers only; nothing moves under reduced motion.
// GSAP owns the rotation, so it composes with the press squash (bounce.js) and the hero offsets (CSS `translate`).

const FINE = '(hover: hover) and (pointer: fine)';

function lean(items, { maxX, maxY, perspective, zStep = 0 }) {
  const pool = items.map((el, i) => {
    gsap.set(el, { transformPerspective: perspective });
    const depth = el.classList.contains('nav__logo') ? 0.55 : 1;
    return {
      el,
      depth,
      z: gsap.quickTo(el, 'z', { duration: 0.9, ease: 'power3.out' }),
      rx: gsap.quickTo(el, 'rotationX', { duration: 0.9, ease: 'power3.out' }),
      ry: gsap.quickTo(el, 'rotationY', { duration: 0.9, ease: 'power3.out' }),
      zBase: (i % 3) * zStep,
    };
  });
  return {
    to(nx, ny) {
      pool.forEach((p) => {
        if (gsap.getProperty(p.el, 'transformPerspective') !== perspective) gsap.set(p.el, { transformPerspective: perspective }); // the menu clears it after it opens
        p.ry(nx * maxY * p.depth); p.rx(-ny * maxX * p.depth); p.z(p.zBase);
      });
    },
    rest() { pool.forEach((p) => { p.ry(0); p.rx(0); p.z(0); }); },
  };
}

export function initDepth({ reducedMotion }) {
  if (reducedMotion || !window.matchMedia(FINE).matches) return;
  const plates = [...document.querySelectorAll('.nav .nav-plate')];
  const tiles = [...document.querySelectorAll('.menu__tile')];
  const headerLean = lean(plates, { maxX: 5, maxY: 7, perspective: 700 });
  const menuLean = lean(tiles, { maxX: 6, maxY: 9, perspective: 900, zStep: 14 });
  let wasOpen = false;

  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    const open = document.body.classList.contains('menu-open');
    if (open) { menuLean.to(nx, ny); headerLean.to(nx * 0.6, ny * 0.6); wasOpen = true; return; }
    if (wasOpen) { menuLean.rest(); wasOpen = false; }
    headerLean.to(nx, ny);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { headerLean.rest(); menuLean.rest(); });
}
