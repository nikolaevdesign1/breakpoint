import gsap from 'gsap';
import { initSite } from '../site/site.js';
import { COACHES, CLIPS, coachPhoto } from '../site/coaches-data.js';
import { videoSrc } from '../site/media.js';

// 404: the number is built from squares, each one a portrait or a clip from the coaches block.
// A pointer passing over a square swaps its picture; every few seconds one square changes by itself.

const GLYPH = {
  4: ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
};
const ROWS = ['4', '0', '4'].map((d) => GLYPH[d]);

const { reducedMotion } = initSite();
const mosaic = document.querySelector('[data-nf-mosaic]');
const cols = ROWS.length * 5 + (ROWS.length - 1);

const pool = [
  ...COACHES.map((c) => ({ img: coachPhoto(c, 'thumb') })),
  ...CLIPS.map((c) => ({ video: `/media/clips/${c.file}`, img: `/media/clips/${c.file}.jpg` })),
];
let deal = gsap.utils.shuffle([...pool]);
const next = () => { if (!deal.length) deal = gsap.utils.shuffle([...pool]); return deal.pop(); };

function fill(cell, item) {
  cell.innerHTML = item.video
    ? `<video muted playsinline loop autoplay poster="${item.img}" src="${videoSrc(item.video)}"></video>`
    : `<img src="${item.img}" alt="" loading="lazy" />`;
}

mosaic.style.setProperty('--cols', cols);
const cells = [];
for (let r = 0; r < 7; r += 1) {
  for (let g = 0; g < ROWS.length; g += 1) {
    for (let c = 0; c < 5; c += 1) {
      if (ROWS[g][r][c] === '1') {
        const cell = document.createElement('i');
        cell.className = 'nf__cell';
        cell.style.gridColumn = String(g * 6 + c + 1);
        cell.style.gridRow = String(r + 1);
        fill(cell, next());
        mosaic.append(cell);
        cells.push(cell);
      }
    }
  }
}

if (!reducedMotion) {
  gsap.from(cells, { autoAlpha: 0, scale: 0.4, duration: 0.5, ease: 'back.out(2)', stagger: { amount: 1.2, from: 'random' }, delay: 0.3 });
  const swap = (cell) => {
    gsap.to(cell, { scale: 0.85, autoAlpha: 0.2, duration: 0.2, ease: 'power2.in', onComplete: () => {
      fill(cell, next());
      gsap.to(cell, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(2.2)' });
    } });
  };
  cells.forEach((cell) => cell.addEventListener('pointerenter', () => { if (!cell._busy) { cell._busy = true; swap(cell); setTimeout(() => { cell._busy = false; }, 900); } }));
  setInterval(() => swap(cells[(Math.random() * cells.length) | 0]), 2400);
}
