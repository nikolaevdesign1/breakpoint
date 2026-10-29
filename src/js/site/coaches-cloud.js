import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { COACHES, CLIPS, coachPhoto, firstName } from './coaches-data.js';
import { mediaUrl, videoSrc } from './media.js';

gsap.registerPlugin(ScrollTrigger);

// Home coaches block: a depth cloud of portraits, clips and court shots around one centred line.
// The stage is sticky; scroll moves a camera through the cloud. Cards grow, pass by and dissolve,
// new ones come out of the depth. One ScrollTrigger drives everything with transform and opacity only.

const SHOTS = ['services.1', 'advantages.0', 'community.5', 'services.4', 'advantages.4', 'community.0', 'services.7', 'banner.0'];

const NEAR = 0.34; // camera distance when a card is at the front plane
const FAR = 4.2; // distance when it is born at the back
const TRAVEL = 1.7; // depth cycles covered by the whole scroll

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function pick(list, n) { return list.slice(0, Math.max(0, n)); }

// Mix the three kinds so neighbours in depth are rarely the same kind.
function buildItems(phone) {
  const portraits = pick(COACHES, phone ? 9 : 13).map((c) => ({ kind: 'coach', coach: c }));
  const clips = pick(CLIPS, phone ? 4 : 8).map((clip) => ({ kind: 'clip', clip }));
  const shots = pick(SHOTS, phone ? 5 : 7).map((key) => ({ kind: 'shot', key }));
  const out = [];
  while (portraits.length || clips.length || shots.length) {
    if (portraits.length) out.push(portraits.shift());
    if (clips.length) out.push(clips.shift());
    if (portraits.length) out.push(portraits.shift());
    if (shots.length) out.push(shots.shift());
  }
  return out;
}

// Cut-corner variant per card (cut.css), picked from a stable key.
const cutOf = (key) => `cut--${'abcdef'[[...String(key)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6]}`;

function cardHtml(item) {
  if (item.kind === 'coach') {
    const c = item.coach;
    return `<a class="cc-card cc-card--coach cut ${cutOf(c.slug)}" href="/coaches.html#${c.slug}" tabindex="-1" data-cursor="Meet ${firstName(c)}">
      <img src="${coachPhoto(c, 'thumb')}" alt="" width="240" height="300" loading="lazy" decoding="async" /></a>`;
  }
  if (item.kind === 'clip') {
    const { clip } = item;
    return `<div class="cc-card cc-card--${clip.wide ? 'wide' : 'tall'} cut ${cutOf(clip.file)}">
      <video muted playsinline loop preload="none" poster="/media/clips/${clip.file}.jpg" data-src="/media/clips/${clip.file}"></video></div>`;
  }
  return `<div class="cc-card cc-card--wide cut ${cutOf(item.key)}"><img src="${mediaUrl(item.key, 420)}" alt="" width="420" height="315" loading="lazy" decoding="async" /></div>`;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function initCoachCloud() {
  const root = document.querySelector('[data-coach-cloud]');
  if (!root) return;
  const field = root.querySelector('[data-cloud-field]');
  const copy = root.querySelector('.coach-cloud__copy');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = window.matchMedia('(max-width: 720px)').matches;

  const items = buildItems(phone);
  // Phones are tall and narrow: push the cloud wider so cards frame the line instead of hiding behind it.
  const spread = phone ? { x: 1.7, y: 1.2 } : { x: 1.15, y: 1.15 };
  field.innerHTML = items.map(cardHtml).join('');
  const n = items.length;

  // Spread cards on a ring (golden angle) so they orbit the line instead of crossing it,
  // and space them evenly in depth with a little jitter.
  const cards = [...field.children].map((el, i) => {
    const a = i * GOLDEN + 0.6;
    const r = 0.62 + ((i * 7) % 5) * 0.11;
    return {
      el,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r * 0.92,
      z: (i / n + ((i * 13) % 7) * 0.006) % 1,
      video: el.querySelector('video'),
      alpha: -1,
      playing: false,
    };
  });

  let vw = 0;
  let vh = 0;
  let hole = { w: 1, h: 1 };
  const measure = () => {
    vw = field.clientWidth;
    vh = field.clientHeight;
    const r = copy.getBoundingClientRect();
    hole = { w: Math.max(r.width * 0.5, 1), h: Math.max(r.height * 0.5, 1) };
  };

  let active = false;

  function render(camera) {
    for (const c of cards) {
      const d = (((c.z + camera) % 1) + 1) % 1; // 0 = back, 1 = passing the camera
      const dist = FAR - (FAR - NEAR) * d;
      const s = 1 / dist;
      const px = c.x * vw * 0.5 * s * spread.x;
      const py = c.y * vh * 0.5 * s * spread.y;
      // Fade in from the depth, dissolve as it passes; stay clear of the centred line.
      const ex = px / (hole.w + 40);
      const ey = py / (hole.h + 40);
      const clear = smooth(0.85, 1.25, Math.sqrt(ex * ex + ey * ey));
      const alpha = smooth(0, 0.16, d) * (1 - smooth(0.78, 0.97, d)) * clear;
      c.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      if (Math.abs(alpha - c.alpha) > 0.004) {
        c.el.style.opacity = alpha.toFixed(3);
        c.el.style.zIndex = Math.round(d * 100);
        c.el.style.pointerEvents = alpha > 0.6 ? 'auto' : 'none';
        c.alpha = alpha;
      }
      if (c.video) syncVideo(c);
    }
  }

  // Clips load only when their card first becomes visible and play only while they can be seen.
  function syncVideo(c) {
    const want = active && !reducedMotion && c.alpha > 0.05;
    if (want === c.playing) return;
    c.playing = want;
    if (want) {
      if (!c.video.src) { c.video.src = videoSrc(c.video.dataset.src); c.video.preload = 'auto'; }
      c.video.play().catch(() => {});
    } else {
      c.video.pause();
    }
  }

  measure();

  if (reducedMotion) {
    root.classList.add('is-static');
    measure();
    render(0.42);
    window.addEventListener('resize', () => { measure(); render(0.42); });
    return;
  }

  let camera = 0;
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onRefresh: (self) => { measure(); camera = self.progress * TRAVEL; render(camera); },
    onUpdate: (self) => { camera = self.progress * TRAVEL; render(camera); },
    onToggle: (self) => { active = self.isActive; render(camera); },
  });
  render(camera);
}
