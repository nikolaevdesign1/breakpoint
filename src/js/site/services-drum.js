import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SERVICES } from './content.js';
import { mediaUrl } from './media.js';

// Pinned "picker wheel": scroll rotates the list on an imaginary cylinder.
const STEP_DEG = 21;
const SCROLL_PER_ITEM = 0.55; // viewport heights per service

// Build the wheel and the photo stack before the shared bootstrap runs, so the court-grid
// squares (initPhotoCells) find the photos and sit on top of them.
export function renderServicesDrum() {
  const root = document.querySelector('[data-services]');
  if (!root) return;
  const drum = root.querySelector('[data-drum]');
  const thumbs = root.querySelector('[data-services-thumbs]');
  const total = root.querySelector('[data-services-total]');
  if (total) total.textContent = String(SERVICES.length).padStart(2, '0');
  drum.innerHTML = SERVICES.map((s) => `<li class="drum__item">${s.name}</li>`).join('');
  thumbs.innerHTML = SERVICES.map((s, i) => `<img src="${mediaUrl(s.media, 900)}" alt=""${i ? ' loading="lazy"' : ''} />`).join('');
}

export function initServicesDrum({ reducedMotion }) {
  const root = document.querySelector('[data-services]');
  if (!root) return;

  const thumbs = root.querySelector('[data-services-thumbs]');
  const marks = root.querySelectorAll('[data-ruler-mark]');
  const ui = {
    index: root.querySelector('[data-services-index]'),
    meta: root.querySelector('[data-services-meta]'),
    desc: root.querySelector('[data-services-desc]'),
    price: root.querySelector('[data-services-price]'),
    unit: root.querySelector('[data-services-unit]'),
    note: root.querySelector('[data-services-note]'),
    ctaLink: root.querySelector('[data-services-cta]'),
    cta: root.querySelector('[data-services-cta] .btn__label'),
  };

  const imgs = [...thumbs.querySelectorAll('img')];
  const items = [...root.querySelectorAll('.drum__item')].map((li, i) => {
    li.addEventListener('click', () => goTo(i));
    return { li, img: imgs[i] };
  });

  let radius = 0;
  let active = -1;
  let trigger = null;

  function measure() {
    radius = Math.min(window.innerHeight * (window.innerWidth < 820 ? 0.2 : 0.26), 260);
  }

  function render(pos) {
    items.forEach(({ li }, i) => {
      const d = i - pos;
      const angle = gsap.utils.clamp(-95, 95, d * STEP_DEG);
      const rad = (angle * Math.PI) / 180;
      const dist = Math.abs(d);
      const visible = Math.abs(angle) < 90;
      li.style.transform = `translateY(calc(-50% + ${(Math.sin(rad) * radius).toFixed(2)}px)) scale(${(1 - Math.min(dist, 4) * 0.07).toFixed(3)}) scaleY(${Math.max(Math.cos(rad), 0.05).toFixed(3)})`;
      li.style.opacity = visible ? (dist < 0.5 ? 1 - dist * 1.55 : Math.max(0.04, 0.2 - dist * 0.04)).toFixed(3) : 0;
    });

    const progress = pos / (SERVICES.length - 1);
    marks.forEach((m) => m.style.setProperty('--y', `${(progress * (m.parentElement.offsetHeight - 2)).toFixed(1)}px`));

    const next = Math.round(pos);
    if (next !== active) setActive(next);
  }

  function setActive(i) {
    active = i;
    const s = SERVICES[i];
    ui.index.textContent = String(i + 1).padStart(2, '0');
    items.forEach(({ img }, j) => img.classList.toggle('is-active', j === i));
    // The photo re-assembles from court squares on every change (court-grid.js PhotoCells).
    const cells = thumbs.__cells;
    if (cells) { cells.img = items[i].img; if (i !== 0 || cells.progress >= 1) cells.replay(); }

    const swaps = root.querySelectorAll('.swap');
    swaps.forEach((n) => n.classList.add('is-swapping'));
    clearTimeout(setActive.t);
    setActive.t = setTimeout(() => {
      ui.meta.textContent = s.meta;
      ui.desc.textContent = s.desc;
      ui.price.textContent = `$${s.price}`;
      ui.unit.textContent = s.unit;
      ui.note.textContent = s.note;
      ui.cta.textContent = s.cta;
      ui.ctaLink.href = s.href;
      swaps.forEach((n) => n.classList.remove('is-swapping'));
    }, 180);
  }

  function goTo(i) {
    if (!trigger) return render(i);
    const y = trigger.start + (trigger.end - trigger.start) * (i / (SERVICES.length - 1));
    window.__lenis ? window.__lenis.scrollTo(y, { duration: 1.6 }) : window.scrollTo({ top: y, behavior: 'smooth' });
  }

  measure();
  render(0);
  window.addEventListener('resize', () => { measure(); render(Math.max(active, 0)); });

  if (reducedMotion) return;

  // Pinned with CSS sticky inside a tall track instead of ScrollTrigger's position:fixed pin: same
  // behaviour, but Chrome counts the fixed switch as a full-screen layout shift (CLS ~1 per pin).
  const track = root.closest('.services');
  const travel = () => window.innerHeight * SCROLL_PER_ITEM * (SERVICES.length - 1);
  const sizeTrack = () => { track.style.height = `${root.offsetHeight + travel()}px`; };
  track.classList.add('is-sticky');
  sizeTrack();
  ScrollTrigger.addEventListener('refreshInit', sizeTrack);

  const state = { pos: 0 };
  trigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: () => `+=${travel()}`,
    refreshPriority: 1,
    scrub: true,
    snap: { snapTo: 1 / (SERVICES.length - 1), duration: { min: 0.4, max: 1 }, ease: 'power2.inOut', delay: 0.12 },
    onUpdate(self) {
      gsap.to(state, {
        pos: self.progress * (SERVICES.length - 1),
        duration: 0.9,
        ease: 'power3.out',
        overwrite: true,
        onUpdate: () => render(state.pos),
      });
    },
  });
}
