import '../../../css/booking-interact.css';
import { captureFrame } from '../scene.js';
import { hourState } from '../hour-state.js';
import { miamiNow, sunElevation, fmtClock } from '../miami-clock.js';
import { miamiDay } from '../forecast.js';

// Postcard mode (round 7). A button in the top bar takes the current view as a still: the UI steps
// away, the top and bottom of the picture soften into a tilt-shift (so the club reads like a model),
// and a caption sits bottom left: "Break Point, Miami", the date, the time in Miami and the weather.
// "Save" downloads that picture with its caption as a PNG; "Close" or Esc goes back to the map.
// The frame is read straight after a render (scene.js captureFrame), so the renderer keeps its
// default drawing buffer; the blur is a cheap downscale chain on a 2D canvas, no extra GPU pass.
//
// Round 9 (row 18): three frames to pick from, "Morning session" (white card), "Night match" (black,
// scoreboard type) and "Rain delay" (white, the site's dashed line inside); the map's weather and
// hour pick one to start with. The caption tells the hour and the sky on the map, and Save draws
// the frame into the PNG.

const TZ = 'America/New_York';
const BAND_TOP = [0, 0.38]; // fraction of the height: fully soft at 0, sharp from 0.38
const BAND_BOTTOM = [0.66, 1];

const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.75" y="3.75" width="12.5" height="8.5"/><rect x="10.25" y="5.75" width="2" height="2.5"/><path d="M3.75 9.75h4M3.75 7.75h3"/></svg>';

/** Soft copy of a canvas: halve it a few times, then scale it back up (bilinear each way). */
function blurred(src, steps = 4) {
  let cur = src;
  const chain = [];
  for (let i = 0; i < steps; i++) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(cur.width / 2));
    c.height = Math.max(2, Math.round(cur.height / 2));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, c.width, c.height);
    chain.push(c);
    cur = c;
  }
  for (let i = chain.length - 2; i >= 0; i--) {
    const g = chain[i].getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, chain[i].width, chain[i].height);
    cur = chain[i];
  }
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

/** The picture with its top and bottom bands blurred in, a touch more contrast and colour, like a print. */
function tiltShift(base) {
  const { width: w, height: h } = base;
  const soft = blurred(base);
  const g = soft.getContext('2d');
  const mask = g.createLinearGradient(0, 0, 0, h);
  mask.addColorStop(BAND_TOP[0], 'rgba(0,0,0,1)');
  mask.addColorStop(BAND_TOP[1], 'rgba(0,0,0,0)');
  mask.addColorStop(BAND_BOTTOM[0], 'rgba(0,0,0,0)');
  mask.addColorStop(BAND_BOTTOM[1], 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = mask;
  g.fillRect(0, 0, w, h);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const o = out.getContext('2d');
  if ('filter' in o) o.filter = 'saturate(1.12) contrast(1.04)';
  o.drawImage(base, 0, 0);
  o.filter = 'none';
  o.drawImage(soft, 0, 0);
  return out;
}

// Frames: [name, paper, ink, quiet ink]. Margins in CSS px: sides and top, bottom (caption band).
const FRAMES = {
  morning: { name: 'Morning session', paper: '#ffffff', ink: '#0e0e0d', mute: '#6d6c68' },
  night: { name: 'Night match', paper: '#121211', ink: '#fff3da', mute: 'rgba(255, 243, 218, 0.6)' },
  rain: { name: 'Rain delay', paper: '#ffffff', ink: '#0e0e0d', mute: '#6d6c68', dashed: true },
};

/** The hour on the map (the scrubber's, or Miami now) and its day. */
function mapTime() {
  const live = hourState.live || hourState.time == null;
  const offset = live ? 0 : hourState.offset ?? 0;
  return { offset, hours: live ? miamiNow().hours : hourState.time };
}

/** Rain on the map: a rain frame; after dark: a night match; otherwise the morning card. */
function frameFor(weather) {
  if (weather.rain > 0 || /rain|storm|drizzle/i.test(weather.label)) return 'rain';
  const { offset, hours } = mapTime();
  return sunElevation(miamiDay(offset), hours).elevation < -2 ? 'night' : 'morning';
}

function captionLines(weather) {
  const now = new Date();
  const { offset, hours } = mapTime();
  const day = new Date(now.getTime() + offset * 864e5);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(day);
  const sky = [weather.label, weather.temp].filter(Boolean).join(', ');
  return { title: 'Break Point, Miami', meta: [date, fmtClock(hours), sky].filter(Boolean).join(' · '), stamp: day };
}

export function initPostcard() {
  const bar = document.querySelector('.bp-right');
  if (!bar) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bp-postcard';
  btn.dataset.postcardToggle = '';
  btn.dataset.cursor = 'Make a postcard';
  btn.setAttribute('aria-label', 'Postcard mode: take the current view as a picture');
  btn.innerHTML = ICON;
  bar.insertBefore(btn, bar.querySelector('[data-sound-toggle]'));

  // Weather as the top bar shows it (booking/weather.js); the DOM is the fallback before the first event.
  const weather = { label: '', temp: '', rain: 0 };
  document.addEventListener('bp-weather', (e) => {
    weather.label = e.detail?.label ?? '';
    weather.temp = e.detail?.temp == null ? '' : `${Math.round(e.detail.temp)}°F`;
    weather.rain = e.detail?.rain ?? 0;
  });
  const readWeather = () => ({
    label: weather.label || document.querySelector('[data-weather-label]')?.textContent || '',
    temp: weather.temp || document.querySelector('[data-weather-temp]')?.textContent || '',
    rain: weather.rain,
  });

  let open = null; // { root, picture, caption, onKey }

  function show() {
    if (open || document.body.classList.contains('hud-open')) return;
    const base = captureFrame((canvas) => {
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      c.getContext('2d').drawImage(canvas, 0, 0);
      return c;
    });
    const picture = tiltShift(base);
    const sky = readWeather();
    const caption = captionLines(sky);
    let frame = frameFor(sky);

    const root = document.createElement('section');
    root.className = 'postcard';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Postcard');
    base.className = 'postcard__shot';
    picture.className = 'postcard__shot postcard__shot--soft';
    base.setAttribute('aria-hidden', 'true');
    picture.setAttribute('role', 'img');
    picture.setAttribute('aria-label', `${caption.title}, ${caption.meta}`);
    root.append(base, picture);
    root.insertAdjacentHTML('beforeend', `
      <div class="postcard__frame" aria-hidden="true"><i class="postcard__dash"></i></div>
      <div class="postcard__caption"><p class="postcard__title" data-frame-title></p><p class="postcard__meta">${caption.title} · ${caption.meta}</p></div>
      <div class="postcard__frames" role="radiogroup" aria-label="Frame">${Object.entries(FRAMES).map(([k, f]) => `<button type="button" role="radio" data-frame="${k}">${f.name}</button>`).join('')}</div>
      <div class="postcard__actions">
        <button class="btn btn--light postcard__close" type="button"><span class="btn__label">Close</span></button>
        <button class="btn postcard__save" type="button"><span class="btn__label">Save</span></button>
      </div>`);
    const setFrame = (k, animate) => {
      frame = k;
      root.dataset.frame = k;
      root.querySelector('[data-frame-title]').textContent = FRAMES[k].name;
      root.querySelectorAll('[data-frame]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.frame === k)));
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) root.querySelector('.postcard__caption').animate?.([{ transform: 'translateY(8px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    };
    setFrame(frame);
    root.querySelectorAll('[data-frame]').forEach((b) => b.addEventListener('click', () => setFrame(b.dataset.frame, true)));
    document.body.append(root);
    document.body.classList.add('postcard-on');
    document.dispatchEvent(new CustomEvent('bp-postcard', { detail: { open: true } }));

    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hide(); } };
    document.addEventListener('keydown', onKey, true);
    root.querySelector('.postcard__close').addEventListener('click', hide);
    root.querySelector('.postcard__save').addEventListener('click', () => save(picture, caption, frame));
    open = { root, onKey };
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));
    root.querySelector('.postcard__save').focus({ preventScroll: true });
  }

  function hide() {
    if (!open) return;
    const { root, onKey } = open;
    open = null;
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('postcard-on');
    document.dispatchEvent(new CustomEvent('bp-postcard', { detail: { open: false } }));
    root.classList.remove('is-in');
    root.classList.add('is-out');
    setTimeout(() => root.remove(), 420);
    btn.focus({ preventScroll: true });
  }

  /** The picture in its frame with the caption band, at the canvas' own resolution, as a PNG download. */
  async function save(picture, caption, frame) {
    await document.fonts?.load('500 22px Switzer').catch(() => {});
    const f = FRAMES[frame];
    const k = picture.width / innerWidth; // CSS px → canvas px
    const m = Math.round(24 * k); // margin: sides and top
    const band = Math.round(104 * k); // caption band at the bottom
    const out = document.createElement('canvas');
    out.width = picture.width + m * 2;
    out.height = picture.height + m + band;
    const g = out.getContext('2d');
    g.fillStyle = f.paper;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(picture, m, m);
    if (f.dashed) { // the site's dashed line, inside the margin
      g.strokeStyle = f.ink;
      g.lineWidth = Math.max(1, Math.round(k));
      g.setLineDash([6 * k, 6 * k]);
      const i = m / 2;
      g.strokeRect(i, i, out.width - 2 * i, out.height - 2 * i);
      g.setLineDash([]);
    }
    const font = (weight, px) => `${weight} ${Math.round(px * k)}px Switzer, "Helvetica Neue", Arial, sans-serif`;
    g.textBaseline = 'top';
    g.fillStyle = f.ink;
    g.font = font(500, 32);
    const top = picture.height + m + Math.round(22 * k);
    g.fillText(f.name, m, top);
    g.fillStyle = f.mute;
    g.font = font(400, 14);
    g.fillText(`${caption.title} · ${caption.meta}`, m, top + Math.round(44 * k));
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(caption.stamp);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `break-point-miami-${stamp}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  btn.addEventListener('click', () => (open ? hide() : show()));
  return { show, hide, isOpen: () => !!open };
}
