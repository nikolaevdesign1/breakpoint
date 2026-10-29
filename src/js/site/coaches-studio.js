import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { COACHES, coachPhoto } from './coaches-data.js';
import { videoSrc } from './media.js';
import { nextEvent, formatDates } from './tournaments-data.js';
import { DUR, STAGGER, EASE } from './motion.js';

gsap.registerPlugin(ScrollTrigger);

// Coaches page mosaic (rows 21, 29-31): equal portrait tiles with cut corners, three to a row, 8px apart.
// The photo stays clean: the cursor turns into a black plate that shows the name, then the role, and so on
// while the pointer rests on a tile (touch screens get a small caption instead). Video tiles (row 19) take
// the place of portraits at even intervals while no switch is on; a promo tile fills the last row.
// Switches filter by sport and age group; every switch that is on must match.

const CUTS = ['a', 'f', 'b', 'e'];
const VIDEOS = [
  { at: 3, cut: 'c', src: 'serve-studio', alt: 'A player serves' },
  { at: 8, cut: 'd', src: 'padel-sunset', alt: 'A padel player at sunset' },
  { at: 14, cut: 'c', src: 'junior-rally', alt: 'A junior rally' },
  { at: 19, cut: 'd', src: 'clay-aerial', alt: 'Players on clay, seen from above' },
];
const CYCLE = 2400; // ms the plate holds the name or the role

const matches = (c, on) => on.every((f) => c.sports.includes(f) || c.ages.includes(f));

const coachTile = (c) => `
  <button class="mt cut" type="button" data-slug="${c.slug}" data-cursor="${c.name}" aria-label="${c.name}, ${c.role}" aria-haspopup="dialog">
    <img class="mt__img" src="${coachPhoto(c)}" alt="" width="720" height="900" loading="lazy" decoding="async" />
    <span class="mt__cap"><span class="mt__name">${c.name}</span><span class="mt__role">${c.role}</span></span>
  </button>`;

const promoTile = () => `
  <a class="mt mt--promo" href="/contacts.html?topic=coaching#form">
    <span class="mt__name">Not sure who to pick?</span><span class="mt__role">Book a free assessment</span>
  </a>`;

function videoTile(v) {
  const e = nextEvent();
  const when = e ? `${formatDates(e)} · ${e.plain}` : 'See the calendar';
  return `
  <a class="mt mt--video cut cut--${v.cut}" href="/tournaments.html" data-cursor="See tournaments">
    <video muted loop playsinline preload="none" poster="/media/clips/${v.src}.jpg" data-src="/media/clips/${v.src}" aria-label="${v.alt}"></video>
    <span class="mt__cap"><span class="mt__name">Come to the tournament</span><span class="mt__role">${when}</span></span>
  </a>`;
}

const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };

export function initStudio({ onOpen, reducedMotion }) {
  const grid = document.querySelector('[data-studio]');
  if (!grid) return;
  const count = document.querySelector('[data-studio-count]');
  const empty = document.querySelector('[data-studio-empty]');
  const switches = [...document.querySelectorAll('.switch[data-filter]')];

  const coachEls = new Map(COACHES.map((c) => [c.slug, html(coachTile(c))]));
  const videoEls = VIDEOS.map((v) => html(videoTile(v)));
  const promo = html(promoTile());
  grid.append(...coachEls.values(), ...videoEls, promo);
  let current = []; // tiles on screen, in order

  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.mt[data-slug]');
    if (tile) onOpen(tile.dataset.slug);
  });

  // The cursor plate alternates name and role while the pointer rests on a tile (a pointerover re-reads data-cursor).
  if (matchMedia('(hover: hover)').matches && !reducedMotion) {
    let timer = 0;
    const stop = (tile) => {
      clearInterval(timer);
      if (tile?.dataset.role) tile.dataset.cursor = tile.dataset.name;
    };
    grid.addEventListener('pointerover', (e) => {
      const tile = e.target.closest('.mt[data-slug]');
      if (!tile || tile.contains(e.relatedTarget)) return;
      clearInterval(timer);
      const c = COACHES.find((x) => x.slug === tile.dataset.slug);
      tile.dataset.name = c.name;
      tile.dataset.role = c.role;
      let showRole = false;
      timer = setInterval(() => {
        showRole = !showRole;
        tile.dataset.cursor = showRole ? c.role : c.name;
        tile.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: tile }));
      }, CYCLE);
      tile.addEventListener('pointerleave', () => stop(tile), { once: true });
    });
  }

  // Videos load when they come near the screen and pause when they leave it (and while hidden).
  const player = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
    if (!isIntersecting) { v.pause(); return; }
    if (!v.src) v.src = videoSrc(v.dataset.src);
    v.play().catch(() => {});
  }), { rootMargin: '160px' });
  if (!reducedMotion) videoEls.forEach((el) => player.observe(el.querySelector('video')));

  // First view: each tile rises into place as it scrolls in, one after another.
  const reveal = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach(({ target }, i) => {
      reveal.unobserve(target);
      target.style.transitionDelay = `${i * STAGGER.base}s`;
      target.classList.add('is-in');
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  // Cuts follow the visible order; hidden tiles go to the end of the grid.
  function layout(on) {
    const seq = COACHES.filter((c) => matches(c, on)).map((c) => coachEls.get(c.slug));
    if (!on.length) VIDEOS.forEach((v, i) => seq.splice(Math.min(v.at, seq.length), 0, videoEls[i]));
    const gap = (3 - (seq.length % 3)) % 3; // empty cells in the last row of three
    if (gap) { promo.style.setProperty('--fill', gap); seq.push(promo); }
    const rest = [...coachEls.values(), ...videoEls, promo].filter((el) => !seq.includes(el));
    rest.forEach((el) => { el.hidden = true; });
    let coachNo = 0;
    seq.forEach((el) => {
      el.hidden = false;
      if (el.dataset.slug) el.className = `mt cut cut--${CUTS[coachNo++ % CUTS.length]}${el.classList.contains('is-in') ? ' is-in' : ''}`;
    });
    grid.append(...seq, ...rest);
    current = seq;
    return seq;
  }

  const selected = () => switches.filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.dataset.filter);
  layout([]).forEach((el) => reveal.observe(el));

  let run = null;
  function apply() {
    const on = selected();
    const shown = COACHES.filter((c) => matches(c, on)).length;
    count.textContent = `${shown} ${shown === 1 ? 'coach' : 'coaches'}`;
    empty.hidden = shown > 0;
    reveal.disconnect();
    run?.kill();
    if (reducedMotion) { layout(on).forEach((el) => el.classList.add('is-in')); ScrollTrigger.refresh(); return; }

    // The old set fades out, the new one rises in a wave.
    run = gsap.timeline()
      .to(current, { autoAlpha: 0, duration: DUR.fast, ease: EASE.inOut, overwrite: true })
      .add(() => {
        const seq = layout(on);
        seq.forEach((el) => el.classList.add('is-in'));
        ScrollTrigger.refresh();
        gsap.fromTo(seq, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: DUR.slow, stagger: STAGGER.tight, ease: EASE.out, clearProps: 'transform,opacity,visibility' });
      });
  }

  switches.forEach((s) => s.addEventListener('click', () => {
    s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true'));
    apply();
  }));
}
