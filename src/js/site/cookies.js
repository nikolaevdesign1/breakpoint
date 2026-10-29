import gsap from 'gsap';

// Cookie consent card. Nothing non-essential loads until the visitor accepts;
// the choice lives in this browser only and can be reopened from the footer.

const KEY = 'bp-cookie-consent';

function readChoice() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function writeChoice(value) {
  try { localStorage.setItem(KEY, value); } catch { /* storage blocked: ask again next visit */ }
}

export function consent() {
  return readChoice(); // 'all' | 'essential' | null
}

function build() {
  const card = document.createElement('section');
  card.className = 'cookies';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Cookie preferences');
  card.innerHTML = `
    <span class="cookies__ball" aria-hidden="true"></span>
    <h2 class="cookies__title">Quiet, please.</h2>
    <p class="cookies__text">We use cookies to see how the site plays: which pages get booked and where people get stuck. No third-party ads. <a class="link" href="/cookies.html">Cookie Policy</a></p>
    <div class="cookies__actions">
      <button class="btn btn--sm" type="button" data-choice="all"><span class="btn__bg"></span><span class="btn__label">Accept</span></button>
      <button class="link cookies__essential" type="button" data-choice="essential">Only essential</button>
    </div>`;
  document.body.appendChild(card);
  return card;
}

export function initCookies({ delay = 1.2 } = {}) {
  let card = null;

  const show = (wait = 0) => {
    card ||= build();
    card.hidden = false;
    gsap.fromTo(card, { autoAlpha: 0, y: 40, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.4, delay: wait, ease: 'power4.out' });
    gsap.fromTo(card.querySelector('.cookies__ball'), { y: -26 }, { y: 0, duration: 1.3, delay: wait + 0.2, ease: 'bounce.out' });
    card.querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        writeChoice(b.dataset.choice);
        gsap.to(card, { autoAlpha: 0, y: 24, duration: 0.8, ease: 'power2.inOut', onComplete: () => { card.hidden = true; } });
        document.dispatchEvent(new CustomEvent('cookie-consent', { detail: b.dataset.choice }));
      };
    });
  };

  document.querySelectorAll('[data-cookie-settings]').forEach((b) => b.addEventListener('click', () => show(0)));
  if (!readChoice()) show(delay);
}
