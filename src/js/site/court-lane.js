import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SERVICES } from './content.js';
import { mediaUrl } from './media.js';
import { prepareText, revealText } from './type-reveal.js';

// Membership lane: the club's services as full-width photos and clips that slide sideways while the page
// is pinned. Each slide has only its heading, which comes out of a blur when the slide reaches the middle.
// The "Be a member" button sits under the lane and never moves. Narrow screens and reduced motion get a
// plain swipeable row instead of the pinned scroll.

const LANE = [
  { photo: 'services.0' },
  { video: '/media/clips/clay-rally', poster: '/media/clips/clay-rally.jpg' },
  { video: '/media/clips/padel-night', poster: '/media/clips/padel-night.jpg' },
  { photo: 'services.2' },
  { photo: 'services.3' },
  { video: '/media/clips/junior-lesson', poster: '/media/clips/junior-lesson.jpg' },
];

export function renderCourtLane() {
  const track = document.querySelector('[data-mlane-track]');
  if (!track) return;
  const total = document.querySelector('[data-mlane-total]');
  if (total) total.textContent = String(SERVICES.length).padStart(2, '0');
  track.innerHTML = SERVICES.map((s, i) => {
    const m = LANE[i] ?? { photo: s.media };
    const media = m.video
      ? `<video src="${m.video}.mp4" poster="${m.poster}" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
      : `<img src="${mediaUrl(m.photo, 1800)}" alt=""${i ? ' loading="lazy"' : ''} />`;
    return `<li class="mlane__slide" data-mlane-slide>
      <div class="mlane__media" data-mlane-media>${media}</div>
      <h3 class="mlane__title" data-mlane-title>${s.name}</h3>
    </li>`;
  }).join('');
}

export function initCourtLane({ reducedMotion }) {
  const root = document.querySelector('[data-mlane]');
  if (!root) return;
  const frame = root.querySelector('[data-mlane-frame]');
  const track = root.querySelector('[data-mlane-track]');
  const slides = [...track.querySelectorAll('[data-mlane-slide]')];
  const titles = slides.map((s) => s.querySelector('[data-mlane-title]'));
  const index = root.querySelector('[data-mlane-index]');
  const videos = [...track.querySelectorAll('video')];

  const play = (slide, on) => {
    const v = slide.querySelector('video');
    if (!v) return;
    if (on) v.play().catch(() => {}); else v.pause();
  };
  const setIndex = (i) => { if (index) index.textContent = String(i + 1).padStart(2, '0'); };

  const pinned = !reducedMotion && window.matchMedia('(min-width: 761px)').matches;
  if (!pinned) {
    root.classList.add('is-plain');
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      play(en.target, en.isIntersecting);
      if (en.isIntersecting) {
        const t = en.target.querySelector('[data-mlane-title]');
        if (!reducedMotion && !t.dataset.shown) { t.dataset.shown = '1'; revealText(t, { mode: 'chars' }); }
        setIndex(slides.indexOf(en.target));
      }
    }), { threshold: 0.5 });
    titles.forEach((t) => { if (!reducedMotion) prepareText(t, { mode: 'chars' }); });
    slides.forEach((s) => io.observe(s));
    return;
  }

  root.classList.add('is-pinned');
  const dist = () => Math.max(0, track.scrollWidth - frame.clientWidth);
  const lane = gsap.to(track, {
    x: () => -dist(),
    ease: 'none',
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      end: () => `+=${dist()}`,
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      refreshPriority: 1, // measured first, so everything below the lane (FAQ, reviews, headings) counts its pin spacing
    },
  });

  slides.forEach((slide, i) => {
    const title = titles[i];
    const media = slide.querySelector('[data-mlane-media] > *');
    prepareText(title, { mode: 'chars' });
    // The heading comes out of the blur once its slide is past the middle of the frame.
    ScrollTrigger.create({
      trigger: slide,
      containerAnimation: lane,
      start: 'left 62%',
      once: true,
      onEnter: () => revealText(title, { mode: 'chars' }),
    });
    ScrollTrigger.create({
      trigger: slide,
      containerAnimation: lane,
      start: 'left 80%',
      end: 'right 20%',
      onToggle: (self) => play(slide, self.isActive),
      onEnter: () => setIndex(i),
      onEnterBack: () => setIndex(i),
    });
    // The picture is blurred while the slide is at the edges of the screen and sharp in the middle; the
    // scrub lags a little (0.7 s), so the blur eases in and out instead of stepping with the wheel.
    gsap.timeline({ scrollTrigger: { trigger: slide, containerAnimation: lane, start: 'left right', end: 'right left', scrub: 0.7 } })
      .fromTo(media, { filter: 'blur(20px)' }, { filter: 'blur(0px)', ease: 'sine.out', duration: 0.38 })
      .to(media, { filter: 'blur(0px)', ease: 'none', duration: 0.24 })
      .to(media, { filter: 'blur(20px)', ease: 'sine.in', duration: 0.38 });
    // The picture drifts against the slide so the lane has depth.
    gsap.fromTo(media, { xPercent: -5, scale: 1.12 }, {
      xPercent: 5, scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: slide, containerAnimation: lane, start: 'left right', end: 'right left', scrub: true },
    });
  });
  void videos;
}
