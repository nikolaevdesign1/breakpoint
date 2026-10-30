import gsap from 'gsap';

// Pointer depth for the header and the open menu: the header and the menu tiles lean a few degrees toward
// the pointer, like the booking panel's tiles. Fine pointers only; nothing moves under reduced motion.
// The menu tiles are rotated by GSAP; they carry no CSS translate of their own. The header uses CSS variables.

const FINE = '(hover: hover) and (pointer: fine)';

function lean(items, { maxX, maxY, perspective, zStep = 0 }) {
  const pool = items.map((el, i) => {
    gsap.set(el, { transformPerspective: perspective });
    const depth = 1;
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
  const nav = document.querySelector('[data-nav]');
  const tiles = [...document.querySelectorAll('.menu__tile')];
  // The header leans as one piece through CSS variables (nav.css), so it never touches the plates' own transforms.
  const tx = gsap.quickTo(nav, '--tx', { duration: 0.9, ease: 'power3.out' });
  const ty = gsap.quickTo(nav, '--ty', { duration: 0.9, ease: 'power3.out' });
  const headerLean = { to: (nx, ny) => { ty(nx * 2.2); tx(-ny * 1.6); }, rest: () => { ty(0); tx(0); } };
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
