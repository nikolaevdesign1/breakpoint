import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Home gallery (row 43): six photos on a strip that runs sideways while the page scrolls.
// - The stage sticks; vertical scroll moves the strip 1:1, so Lenis gives it the inertia.
// - Drag (mouse or a sideways swipe) scrolls the page under the hood and flings on release.
// - Speed bends the photos a little (skew), each photo wipes in, tilted, as it enters from the right.
// - The photo under the cursor zooms, its image follows the cursor and the frame leans toward it.
// - Click opens it full screen, growing out of its place on the strip (and shrinking back on close).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function initGalleryStrip({ reducedMotion }) {
  const root = document.querySelector('[data-cgal]');
  if (!root) return;
  const stage = root.querySelector('[data-cgal-stage]');
  const track = root.querySelector('[data-cgal-track]');
  const items = [...root.querySelectorAll('[data-cgal-item]')];
  const medias = items.map((li) => li.querySelector('[data-cgal-open]'));
  const lenis = window.__lenis || null;

  const viewer = createViewer({ items, medias, reducedMotion, lenis });
  let suppressClick = false;
  medias.forEach((m, i) => m.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); return; }
    viewer.open(i);
  }));

  if (reducedMotion) { root.classList.add('is-static'); return; }

  // ---- geometry: the section is as tall as the strip needs to run past
  let travel = 0;
  let stageW = 0;
  let lefts = [];
  let widths = [];
  const measure = () => {
    stageW = stage.clientWidth;
    travel = Math.max(0, track.scrollWidth - stageW);
    root.style.height = `${stage.offsetHeight + travel}px`;
    lefts = items.map((li) => li.offsetLeft);
    widths = items.map((li) => li.offsetWidth);
  };
  measure();
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); ScrollTrigger.refresh(); }, 120);
  }).observe(stage);

  const st = ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom bottom', invalidateOnRefresh: true });

  // ---- first arrival: the photos already in view cascade in once the section shows up
  const ins = items.map((li) => li.querySelector('.cgal__in'));
  gsap.fromTo(ins,
    { y: 140, rotate: (i) => (i % 2 ? 6 : -6), scale: 0.86, clipPath: 'inset(100% 0% 0% 0%)' },
    {
      y: 0, rotate: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0%)',
      duration: 1.6, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: root, start: 'top 95%', toggleActions: 'play none none reverse' },
    });

  // ---- pointer: hover parallax + lean, drag to scroll
  const hover = items.map(() => ({ x: 0, y: 0, tx: 0, ty: 0 }));
  let hovered = -1;
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const i = medias.findIndex((m) => m.contains(e.target));
    if (i !== hovered && hovered >= 0) { hover[hovered].tx = 0; hover[hovered].ty = 0; }
    hovered = i;
    if (i < 0) return;
    const r = medias[i].getBoundingClientRect();
    hover[i].tx = (e.clientX - r.left) / r.width - 0.5;
    hover[i].ty = (e.clientY - r.top) / r.height - 0.5;
  });
  stage.addEventListener('pointerleave', () => {
    if (hovered >= 0) { hover[hovered].tx = 0; hover[hovered].ty = 0; }
    hovered = -1;
  });

  const scrollNow = () => (lenis ? lenis.scroll : window.scrollY);
  const scrollTo = (y, opts) => (lenis ? lenis.scrollTo(y, opts) : window.scrollTo(0, y));
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: scrollNow(), moved: false, v: 0, lastX: e.clientX, lastT: performance.now() };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
      drag.moved = true;
      root.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
    const now = performance.now();
    drag.v = lerp(drag.v, (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT), 0.4);
    drag.lastX = e.clientX;
    drag.lastT = now;
    scrollTo(clamp(drag.start - dx, st.start, st.end), { immediate: true, force: true });
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved) {
      // fling: carry the release speed on for a moment
      const to = clamp(scrollNow() - drag.v * 380, st.start, st.end);
      scrollTo(to, { duration: 1.8, force: true });
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 60);
    }
    root.classList.remove('is-dragging');
    drag = null;
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---- per frame, only while the section is around the viewport
  let x = 0;
  let bend = 0;
  let live = false;
  ScrollTrigger.create({ trigger: root, start: 'top 200%', end: 'bottom top', onToggle: (s) => {
    live = s.isActive;
    // photos far right sit outside the clipped stage, so lazy loading would wait too long
    if (live) medias.forEach((m) => { const im = m.querySelector('img'); if (im.loading === 'lazy') im.loading = 'eager'; });
  } });
  const enterSpan = () => stageW * 0.4;

  gsap.ticker.add(() => {
    if (!live) return;
    const target = -st.progress * travel;
    if (target < -8) root.classList.add('is-moved'); // the hint goes after the first move
    const prev = x;
    x = lerp(x, target, 0.5);
    if (Math.abs(x - target) < 0.05) x = target;
    bend = lerp(bend, clamp((x - prev) * 0.12, -7, 7), 0.15);
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    track.style.setProperty('--bend', bend.toFixed(3));

    for (let i = 0; i < items.length; i++) {
      // entry: wipes open left to right as the photo comes in from the right edge, tilt settles
      const left = lefts[i] + x;
      const e = clamp((stageW - left) / enterSpan(), 0, 1);
      const k = 1 - (1 - e) ** 3;
      const li = items[i];
      li.style.clipPath = e >= 1 ? '' : `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
      li.style.transform = e >= 1 ? '' : `translate3d(0, ${((1 - k) * 80).toFixed(1)}px, 0) rotate(${((1 - k) * 7).toFixed(2)}deg)`;

      // hover: the image follows the cursor inside the frame, the frame leans toward it
      const h = hover[i];
      h.x = lerp(h.x, h.tx, 0.12);
      h.y = lerp(h.y, h.ty, 0.12);
      const m = medias[i].style;
      m.setProperty('--px', `${(h.x * -28).toFixed(2)}px`);
      m.setProperty('--py', `${(h.y * -28).toFixed(2)}px`);
      m.translate = `${(h.x * 14).toFixed(2)}px ${(h.y * 14).toFixed(2)}px`;
    }
  });
}

// ---------------------------------------------------------------- full screen view

function createViewer({ items, medias, reducedMotion, lenis }) {
  let el = null;
  let img = null;
  let index = -1;
  let lastFocus = null;
  const dur = reducedMotion ? 0.01 : 1.3;

  const capOf = (i) => {
    const cap = items[i].querySelector('.cgal__cap');
    return cap ? cap.innerHTML : '';
  };
  const fit = (nw, nh) => {
    const pad = window.innerWidth < 760 ? 12 : 32;
    const barH = 68;
    const maxW = window.innerWidth - pad * 2;
    const maxH = window.innerHeight - barH - pad * 2;
    const s = Math.min(maxW / nw, maxH / nh);
    const w = nw * s;
    const h = nh * s;
    return { left: (window.innerWidth - w) / 2, top: pad + (maxH - h) / 2, width: w, height: h };
  };
  const rectOf = (i) => {
    const r = medias[i].getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const sourceImg = (i) => medias[i].querySelector('img');

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }

  function open(i) {
    if (el) return;
    index = i;
    lastFocus = document.activeElement;
    const src = sourceImg(i);
    el = document.createElement('div');
    el.className = 'cgal-view';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Photo');
    el.innerHTML = `
      <img class="cgal-view__img" alt="" />
      <div class="cgal-view__bar">
        <p class="cgal-view__cap" aria-live="polite"></p>
        <div class="cgal-view__nav">
          <button class="cgal-view__btn" type="button" data-go="-1">Previous</button>
          <button class="cgal-view__btn" type="button" data-go="1">Next</button>
          <button class="cgal-view__btn" type="button" data-close>Close</button>
        </div>
      </div>`;
    document.body.append(el);
    img = el.querySelector('img');
    img.src = src.currentSrc || src.src;
    img.alt = src.alt;
    el.querySelector('.cgal-view__cap').innerHTML = capOf(i);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) { go(+b.dataset.go); return; }
      if (e.target.closest('[data-close]') || e.target === el || e.target === img) close();
    });
    document.addEventListener('keydown', onKey);
    lenis?.stop();

    const from = rectOf(i);
    const to = fit(src.naturalWidth || from.width, src.naturalHeight || from.height);
    gsap.set(img, from);
    medias[i].style.visibility = 'hidden';
    requestAnimationFrame(() => el.classList.add('is-open'));
    gsap.to(img, { ...to, duration: dur, ease: 'power3.inOut' });
    el.querySelector('[data-close]').focus({ preventScroll: true });
  }

  function go(step) {
    if (!el) return;
    medias[index].style.visibility = '';
    index = (index + step + items.length) % items.length;
    medias[index].style.visibility = 'hidden';
    const src = sourceImg(index);
    el.querySelector('.cgal-view__cap').innerHTML = capOf(index);
    gsap.to(img, {
      autoAlpha: 0, x: step * -40, duration: reducedMotion ? 0.01 : 0.45, ease: 'power2.inOut',
      onComplete: () => {
        img.src = src.currentSrc || src.src;
        img.alt = src.alt;
        gsap.set(img, { ...fit(src.naturalWidth || 4, src.naturalHeight || 3), x: step * 40 });
        gsap.to(img, { autoAlpha: 1, x: 0, duration: reducedMotion ? 0.01 : 1, ease: 'power4.out' });
      },
    });
  }

  function close() {
    if (!el) return;
    const view = el;
    const i = index;
    el = null;
    document.removeEventListener('keydown', onKey);
    view.classList.remove('is-open');
    gsap.to(img, {
      ...rectOf(i), x: 0, autoAlpha: 1, duration: dur * 0.85, ease: 'power3.inOut',
      onComplete: () => {
        medias[i].style.visibility = '';
        view.remove();
        lenis?.start();
        lastFocus?.focus?.({ preventScroll: true });
      },
    });
  }

  return { open, close };
}
