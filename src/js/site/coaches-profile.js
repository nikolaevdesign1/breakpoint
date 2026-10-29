import gsap from 'gsap';
import { DUR, STAGGER, EASE } from './motion.js';
import { COACHES, SPORT_LABEL, AGE_LABEL, coachPhoto, coachBookingUrl, slotLabels, firstName } from './coaches-data.js';

// Coach profile (row 123): the clicked tile grows (FLIP) into a full-screen spread.
// Row 22: a huge name across the top, the portrait (cut corners, slow parallax) on the left, big numbers,
// dashed rows, slot tiles and large quotes on the right; stacked on phones. The portrait is a link: click books.
// A plain fixed layer, not a modal <dialog>: the top layer would cover the custom cursor.
// The page behind is inert while it is open, Lenis is paused, and Esc / Close fold it back into its tile.
// Opens from the grid, from #slug links (home cloud) and steps to the previous / next coach.

const list = (items) => items.join(', ');
const pad = (n) => String(n).padStart(2, '0');

const rowOf = ([k, v]) => `<div data-cv-in><dt>${k}</dt><dd>${v}</dd></div>`;

function titleHtml(c) {
  return `<h2 class="cv__name" id="cv-name" data-cv-in>${c.name}</h2>`;
}

function profileHtml(c) {
  const tags = [...c.sports.map((s) => SPORT_LABEL[s]), ...c.ages.map((a) => AGE_LABEL[a])];
  const stats = [c.years ? [c.years, 'years coaching'] : null, [`$${c.price}`, 'per hour, private lesson']].filter(Boolean);
  const rows = [['Played', c.played], ['Languages', list(c.languages)], ['Best for', c.specialties.map((s) => `<span>${s}</span>`).join('')]];
  return `
    <header data-cv-in>
      <p class="cv__role">${c.role}</p>
      <ul class="cv__tags" aria-label="Teaches">${tags.map((t) => `<li>${t}</li>`).join('')}</ul>
    </header>
    <div class="cv__stats" data-cv-in>${stats.map(([n, l]) => `<p class="cv__stat"><b>${n}</b><span>${l}</span></p>`).join('')}</div>
    <dl class="cv__rows">${rows.map(rowOf).join('')}</dl>
    <section class="cv__block" aria-labelledby="cv-slots" data-cv-in>
      <h3 class="cv__label" id="cv-slots">Next free hours</h3>
      <ul class="cv__slots">${slotLabels(c).map((s, i) => {
        const [day, time] = s.split(' · ');
        return `<li><a class="slot" href="${coachBookingUrl(c, i)}"><span class="slot__day">${day}</span><span class="slot__time">${time}</span></a></li>`;
      }).join('')}</ul>
    </section>
    <section class="cv__block" aria-labelledby="cv-reviews">
      <h3 class="cv__label" id="cv-reviews" data-cv-in>What players say</h3>
      ${c.reviews.map((r) => `<blockquote class="cv__review" data-cv-in><p>${r.text}</p><footer>${r.by}</footer></blockquote>`).join('')}
    </section>
    <div class="cv__cta" data-cv-in>
      <a class="cv__book" href="${coachBookingUrl(c)}">Book a session with ${firstName(c)}</a>
    </div>`;
}

const tileOf = (slug) => document.querySelector(`.mt[data-slug="${slug}"]`);
const figureOf = (tile) => tile;
const onScreen = (r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight;

export function initProfile({ lenis, reducedMotion }) {
  const view = document.querySelector('[data-coach-view]');
  if (!view) return { open: () => {} };
  const paper = view.querySelector('.cv__paper');
  const figure = view.querySelector('[data-cv-figure]');
  const pic = view.querySelector('[data-cv-pic]');
  const title = view.querySelector('[data-cv-title]');
  const body = view.querySelector('[data-cv-body]');
  const scroller = view.querySelector('[data-cv-scroll]');
  const controls = [...view.querySelectorAll('[data-cv-ctrl]')];
  const motionItems = () => view.querySelectorAll('[data-cv-in]');
  const counter = view.querySelector('[data-cv-count]');
  const stepBtns = [...view.querySelectorAll('[data-cv-step]')];
  const closeBtn = view.querySelector('[data-cv-close]');
  let index = -1;
  let returnFocus = null;
  let anim = null;
  let inerted = [];

  // Stepping follows the grid as filtered; a coach outside it (deep link) steps through everyone.
  function sequence() {
    const shown = COACHES.filter((c) => !tileOf(c.slug)?.hidden);
    return shown.includes(COACHES[index]) ? shown : COACHES;
  }

  // Calm change: the new portrait settles in while the old one fades away behind it.
  function setPortrait(c, dir) {
    const img = new Image(720, 900);
    img.src = coachPhoto(c);
    img.alt = `Portrait of ${c.name}`;
    img.decoding = 'async';
    const old = [...pic.querySelectorAll('img')];
    pic.append(img);
    figure.href = coachBookingUrl(c);
    figure.setAttribute('aria-label', `Book a session with ${firstName(c)}`);
    if (!dir || reducedMotion) { old.forEach((o) => o.remove()); return; }
    gsap.fromTo(img, { autoAlpha: 0, yPercent: 3 * dir }, { autoAlpha: 1, yPercent: 0, duration: DUR.slow, ease: EASE.out });
    gsap.to(old, { autoAlpha: 0, duration: DUR.base, ease: EASE.inOut, onComplete: () => old.forEach((o) => o.remove()) });
  }

  // The portrait drifts up slowly while the page scrolls (a few pixels, only transform).
  function drift() {
    if (reducedMotion) return;
    pic.style.setProperty('--py', `${-Math.min((scroller.scrollTop + view.scrollTop) * 0.05, 20)}px`);
  }
  scroller.addEventListener('scroll', drift, { passive: true });
  view.addEventListener('scroll', drift, { passive: true });

  function fill(i, dir = 0) {
    index = (i + COACHES.length) % COACHES.length;
    const c = COACHES[index];
    const seq = sequence();
    const at = seq.indexOf(c);
    const prev = seq[(at - 1 + seq.length) % seq.length];
    const nxt = seq[(at + 1) % seq.length];
    title.innerHTML = titleHtml(c);
    body.innerHTML = profileHtml(c);
    setPortrait(c, dir);
    counter.textContent = `${pad(at + 1)} / ${pad(seq.length)}`;
    stepBtns[0].dataset.cursor = prev.name;
    stepBtns[1].dataset.cursor = nxt.name;
    stepBtns[0].setAttribute('aria-label', `Previous coach: ${prev.name}`);
    stepBtns[1].setAttribute('aria-label', `Next coach: ${nxt.name}`);
    // The cursor label under the pointer names the new neighbour right away.
    stepBtns.find((btn) => btn.matches(':hover'))?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    scroller.scrollTop = 0;
    view.scrollTop = 0;
    drift();
    history.replaceState(null, '', `#${c.slug}`);
    if (dir && !reducedMotion) {
      gsap.fromTo(motionItems(), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: STAGGER.base });
    }
  }

  function step(dir) {
    const seq = sequence();
    const at = seq.indexOf(COACHES[index]);
    const target = seq[(at + dir + seq.length) % seq.length];
    fill(COACHES.indexOf(target), dir);
  }

  // The figure (position: relative) animates its box as an offset from its place, so the cut-out keeps its proportions.
  function boxFrom(rect) {
    const now = figure.getBoundingClientRect();
    return { top: rect.top - now.top, left: rect.left - now.left, width: rect.width, height: rect.height };
  }

  function lockPage(lock) {
    if (lock) {
      inerted = [...document.body.children].filter((el) => el !== view && !el.matches('script, .cursor, .cursor-label') && !el.inert);
      inerted.forEach((el) => { el.inert = true; });
      lenis?.stop();
    } else {
      inerted.forEach((el) => { el.inert = false; });
      inerted = [];
      lenis?.start();
    }
    document.documentElement.classList.toggle('cv-open', lock);
  }

  function open(slug) {
    const i = COACHES.findIndex((c) => c.slug === slug);
    if (i < 0) return;
    if (!view.hidden) {
      if (anim?.data !== 'close') { anim?.progress(1); if (i !== index) fill(i, i > index ? 1 : -1); return; }
      anim.progress(1); // a closing profile finishes first, then opens again
    }
    returnFocus = document.activeElement;
    view.hidden = false;
    fill(i);
    lockPage(true);
    closeBtn.focus({ preventScroll: true });
    if (reducedMotion) return;

    const tile = tileOf(slug);
    const src = figureOf(tile)?.getBoundingClientRect();
    const items = motionItems();
    tile?.classList.add('is-lifted');
    anim = gsap.timeline({ onComplete: () => { tile?.classList.remove('is-lifted'); gsap.set([figure, paper, ...controls, ...items], { clearProps: 'all' }); anim = null; } })
      .fromTo(paper, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.base, ease: EASE.out }, 0)
      .fromTo(items, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: STAGGER.base }, 0.5)
      .fromTo(controls, { opacity: 0 }, { opacity: 1, duration: DUR.base, ease: EASE.out, stagger: STAGGER.tight }, 0.8);
    if (src && onScreen(src)) {
      anim.fromTo(figure, boxFrom(src), { ...boxFrom(figure.getBoundingClientRect()), duration: DUR.slow, ease: EASE.inOut }, 0);
    } else {
      anim.fromTo(figure, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: DUR.slow, ease: EASE.out }, 0.1);
    }
  }

  function finish() {
    view.hidden = true;
    gsap.set([figure, paper, ...controls, body, title], { clearProps: 'all' });
    document.querySelectorAll('.mt.is-lifted').forEach((t) => t.classList.remove('is-lifted'));
    lockPage(false);
    history.replaceState(null, '', location.pathname + location.search);
    const tile = tileOf(COACHES[index]?.slug);
    (tile && !tile.hidden ? tile : returnFocus)?.focus?.({ preventScroll: true });
    anim = null;
  }

  function close() {
    if (view.hidden || (anim && anim.data === 'close')) return;
    anim?.progress(1);
    if (reducedMotion) { finish(); return; }

    // Fold back into the current coach's tile: bring it on screen under the cover first.
    const tile = tileOf(COACHES[index].slug);
    const fig = figureOf(tile);
    if (fig && !tile.hidden) {
      const r = fig.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) {
        const y = scrollY + r.top - (innerHeight - r.height) / 2;
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      }
    }
    const dst = fig && !tile.hidden ? fig.getBoundingClientRect() : null;
    tile?.classList.add('is-lifted');
    anim = gsap.timeline({ data: 'close', onComplete: finish })
      .to([body, title, ...controls], { opacity: 0, duration: DUR.fast, ease: EASE.inOut }, 0);
    if (dst) {
      anim.fromTo(figure, boxFrom(figure.getBoundingClientRect()), { ...boxFrom(dst), duration: DUR.slow, ease: EASE.inOut }, 0.1)
        .to(paper, { autoAlpha: 0, duration: DUR.base, ease: EASE.inOut }, 0.5);
    } else {
      anim.to(figure, { autoAlpha: 0, scale: 0.96, duration: 0.4, ease: 'power2.in' }, 0.05)
        .to(paper, { autoAlpha: 0, duration: 0.4, ease: 'power2.inOut' }, 0.2);
    }
  }

  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-cv-close]')) close();
    const btn = e.target.closest('[data-cv-step]');
    if (btn) step(Number(btn.dataset.cvStep));
  });

  document.addEventListener('keydown', (e) => {
    if (view.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (e.target.closest?.('input, textarea, select')) return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key !== 'Tab') return;
    // Focus trap: Tab and Shift+Tab cycle inside the profile.
    const focusables = [...view.querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.getClientRects().length);
    if (!focusables.length) return;
    const firstEl = focusables[0];
    const lastEl = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === firstEl || !view.contains(document.activeElement))) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && (document.activeElement === lastEl || !view.contains(document.activeElement))) { e.preventDefault(); firstEl.focus(); }
  });

  // Deep links: /coaches.html#sofia-marquez
  const fromHash = () => { const slug = decodeURIComponent(location.hash.slice(1)); if (slug) open(slug); };
  window.addEventListener('hashchange', fromHash);
  fromHash();

  return { open, close };
}
