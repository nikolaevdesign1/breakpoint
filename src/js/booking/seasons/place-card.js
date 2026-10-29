import '../../../css/booking-seasons.css';

// The card a click on a place opens (round 8, row 180): a view of the place, its hours, what is
// inside and one useful line, pinned beside the place while the camera settles on it. A non-modal
// dialog: Esc, the close button or a click outside close it, focus comes back to where it was.
// No links: the visitor stays on the map.

const CLOSE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>';
export const PHOTO = { w: 272, h: 152 };

export function createPlaceCard({ onClose }) {
  const el = document.createElement('section');
  el.className = 'place-card';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', 'place-card-title');
  el.tabIndex = -1;
  el.hidden = true;
  el.innerHTML = `
    <div class="place-card__photo"><canvas width="${PHOTO.w}" height="${PHOTO.h}" role="img"></canvas></div>
    <button class="place-card__close" type="button" aria-label="Close">${CLOSE}</button>
    <div class="place-card__body">
      <p class="place-card__k"></p>
      <h2 class="place-card__title" id="place-card-title"></h2>
      <p class="place-card__inside"></p>
      <p class="place-card__note"></p>
    </div>`;
  document.body.append(el);
  const ui = {
    canvas: el.querySelector('canvas'),
    k: el.querySelector('.place-card__k'),
    title: el.querySelector('.place-card__title'),
    inside: el.querySelector('.place-card__inside'),
    note: el.querySelector('.place-card__note'),
    close: el.querySelector('.place-card__close'),
  };

  let openFor = null;
  let returnFocus = null;
  let hideTimer = 0;

  const onKey = (e) => {
    if (e.key !== 'Escape' || !openFor) return;
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  // A press on the page outside the card closes it (the map handles its own clicks: places.js).
  const onDown = (e) => {
    if (!openFor || el.contains(e.target) || e.target.id === 'scene') return;
    close(false);
  };

  function open(place, photo) {
    clearTimeout(hideTimer);
    const again = !!openFor;
    openFor = place;
    ui.k.textContent = place.hours;
    ui.title.textContent = place.title;
    ui.inside.textContent = place.inside;
    ui.note.textContent = place.note;
    ui.canvas.setAttribute('aria-label', `View of the ${place.title.toLowerCase()} on the club map`);
    const g = ui.canvas.getContext('2d');
    if (photo) {
      ui.canvas.width = photo.width;
      ui.canvas.height = photo.height;
      g.drawImage(photo, 0, 0);
    }
    if (!again) returnFocus = document.activeElement;
    el.hidden = false;
    el.classList.remove('is-in');
    void el.offsetWidth; // the spring starts from its start pose every time
    el.classList.add('is-in');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    el.focus({ preventScroll: true });
  }

  function close(restore = true) {
    if (!openFor) return;
    openFor = null;
    el.classList.remove('is-in');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    hideTimer = setTimeout(() => { el.hidden = true; }, 240);
    if (restore && el.contains(document.activeElement)) (returnFocus?.isConnected ? returnFocus : document.body).focus?.({ preventScroll: true });
    else if (el.contains(document.activeElement)) document.activeElement.blur();
    onClose?.();
  }

  /** Pins the card beside a screen rectangle: right of it, else left, else below (phones: a sheet above the dock). */
  function place(rect) {
    if (!openFor) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const phone = innerWidth <= 640;
    let left;
    let top;
    if (phone) {
      left = (innerWidth - w) / 2;
      top = innerHeight - h - 70;
    } else {
      left = rect.right + 16 + w <= innerWidth - 12 ? rect.right + 16 : rect.left - 16 - w >= 12 ? rect.left - 16 - w : (rect.left + rect.right) / 2 - w / 2;
      top = (rect.top + rect.bottom) / 2 - h / 2;
    }
    left = Math.min(Math.max(12, left), innerWidth - w - 12);
    top = Math.min(Math.max(62, top), innerHeight - h - 70);
    el.style.translate = `${Math.round(left / 2) * 2}px ${Math.round(top / 2) * 2}px`;
  }

  ui.close.addEventListener('click', () => close());
  return { open, close, place, isOpen: () => !!openFor, openFor: () => openFor };
}
