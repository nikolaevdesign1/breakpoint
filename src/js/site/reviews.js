import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { REVIEW_SETS, avatarUrl } from './reviews-data.js';
import { initReviewForm } from './review-form.js';

// Reviews as text messages (rows 73, 116). The stage sticks while you scroll; each message shows a
// "typing…" bubble, then springs in, and the feed slides up like a chat. Scrolling back retracts them.

// Row 44: one centred thread, messages alternate left and right. Each bubble
// arrives with a small tilt and settles straight; nothing stays skewed at rest.
const TILT = [-4, 3, -2, 4, -3, 2];

const PER_MESSAGE = 0.3; // viewport heights of scroll per message (CSS reads it through --msgs)
const ROOM = 24; // px kept under the newest message

function messageHTML(r, i) {
  const at = (arr) => arr[i % arr.length];
  return `
    <li class="msg msg--${r.tone || 'ink'}" data-tilt="${at(TILT)}">
      <div class="msg__tilt">
        <span class="msg__typing" aria-hidden="true"><i></i><i></i><i></i></span>
        <figure class="msg__arrive">
          <blockquote class="msg__bubble" data-bounce="press"><p>${r.text}</p></blockquote>
          <figcaption class="msg__by">
            <img class="msg__avatar" src="${avatarUrl(r.avatar, 96)}" width="32" height="32" alt="" loading="lazy" decoding="async" />
            <span class="msg__name">${r.name}</span><span class="msg__meta">${r.meta}</span>
          </figcaption>
        </figure>
      </div>
    </li>`;
}

// One scrubbed timeline, one unit of time per message. Every tween is a fromTo, so a refresh
// (invalidateOnRefresh re-measures the feed) never records a half-played state as the start.
function scrub(root, chat, items) {
  const win = chat.parentElement;
  root.classList.add('is-scrubbed');
  root.style.setProperty('--msgs', items.length);
  root.style.setProperty('--per-msg', PER_MESSAGE);

  // How far the feed has to slide up so message i (and everything before it) is in view.
  const bottoms = () => items.map((li) => li.offsetTop + li.offsetHeight);
  let cache = null;
  const follow = (i) => {
    if (i < 0) return 0;
    cache = cache || bottoms();
    const need = Math.max(...cache.slice(0, i + 1)) + ROOM;
    return Math.min(0, win.clientHeight * MID - need); // the newest bubble lands mid-window, older ones stack above
  };

  const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });
  items.forEach((li, i) => {
    const typing = li.querySelector('.msg__typing');
    const fig = li.querySelector('.msg__arrive');
    const by = li.querySelector('.msg__by');
    const tilt = +li.dataset.tilt || 0;
    gsap.set(fig, { autoAlpha: 0, y: 70, scale: 0.82, rotate: tilt });
    gsap.set(by, { autoAlpha: 0 });
    gsap.set(typing, { autoAlpha: 0, y: 40, scale: 0.6 });
    tl.fromTo(chat, { y: () => follow(i - 1) }, { y: () => follow(i), duration: 0.5, ease: 'power2.inOut' }, i)
      .fromTo(typing, { autoAlpha: 0, y: 40, scale: 0.6 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' }, i)
      .fromTo(typing, { autoAlpha: 1, scale: 1 }, { autoAlpha: 0, scale: 0.7, duration: 0.1, ease: 'power2.in' }, i + 0.42)
      .fromTo(fig, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08, ease: 'none' }, i + 0.46)
      .fromTo(fig, { y: 70, scale: 0.82 }, { y: 0, scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.62)' }, i + 0.46)
      .fromTo(fig, { rotate: tilt }, { rotate: 0, duration: 0.42, ease: 'back.out(2.2)' }, i + 0.5)
      .fromTo(by, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' }, i + 0.6);
  });
  tl.to({}, { duration: 0.2 }); // the full thread holds a moment before the stage lets go

  ScrollTrigger.create({
    trigger: root,
    start: 'top 40%',
    end: 'bottom bottom',
    scrub: 0.6,
    animation: tl,
    invalidateOnRefresh: true,
    onRefreshInit: () => { cache = null; },
  });
}

const MID = 0.58; // share of the window height where the newest bubble's bottom edge rests

export function initReviews({ reducedMotion }) {
  initReviewForm({ reducedMotion });
  document.querySelectorAll('[data-reviews]').forEach((root) => {
    const set = REVIEW_SETS[root.dataset.reviews] || REVIEW_SETS.home;
    const title = root.querySelector('[data-reviews-title]');
    const chat = root.querySelector('[data-reviews-chat]');
    if (!chat) return;
    if (title) title.innerHTML = set.title;
    chat.innerHTML = set.items.map(messageHTML).join('');
    if (!reducedMotion) scrub(root, chat, [...chat.children]);
  });
}
