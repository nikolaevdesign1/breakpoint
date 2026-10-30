import gsap from 'gsap';

// Pointer depth for the header and the open menu: the header and the menu tiles lean a few degrees toward
// the pointer, like the booking panel's tiles. Fine pointers only; nothing moves under reduced motion.
// The menu tiles are rotated by GSAP; they carry no CSS translate of their own. The header uses CSS variables.

const FINE = '(hover: hover) and (pointer: fine)';

// Menu tiles: each one leans toward the pointer by its own distance from it, up to 14 degrees, so a tile
// under the pointer turns most and the far side of the panel still moves. They also float on three planes.
function tileLean(tiles) {
  gsap.set(tiles, { transformPerspective: 800 });
  const pool = tiles.map((el, i) => ({
    el,
    z: gsap.quickTo(el, 'z', { duration: 0.7, ease: 'power3.out' }),
    rx: gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3.out' }),
    ry: gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3.out' }),
    plane: (i % 3) * 16,
  }));
  return {
    toPointer(x, y) {
      pool.forEach((p) => {
        if (gsap.getProperty(p.el, 'transformPerspective') !== 800) gsap.set(p.el, { transformPerspective: 800 }); // cleared when the menu opened
        const r = p.el.getBoundingClientRect();
        const dx = (x - (r.left + r.width / 2)) / (r.width / 2 + 120);
        const dy = (y - (r.top + r.height / 2)) / (r.height / 2 + 120);
        p.ry(Math.max(-1, Math.min(1, dx)) * 14);
        p.rx(-Math.max(-1, Math.min(1, dy)) * 10);
        p.z(p.plane + (1 - Math.min(1, Math.hypot(dx, dy))) * 26);
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
  const headerLean = { to: (nx, ny) => { ty(nx * 0.9); tx(-ny * 0.6); }, rest: () => { ty(0); tx(0); } };
  const menuLean = tileLean(tiles);
  let wasOpen = false;

  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    const open = document.body.classList.contains('menu-open');
    if (open) { menuLean.toPointer(e.clientX, e.clientY); headerLean.to(nx * 0.6, ny * 0.6); wasOpen = true; return; }
    if (wasOpen) { menuLean.rest(); wasOpen = false; }
    headerLean.to(nx, ny);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { headerLean.rest(); menuLean.rest(); });
}
