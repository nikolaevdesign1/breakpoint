import '../../../css/booking-interact.css';
import { COURTS, isOpenHour, isTakenByClub, kidsCourtOn } from '../../shared/availability.js';
import { KIDS_HOUR } from '../../shared/academy.js';
import { isOwnSlot } from '../../shared/session-bookings.js';
import { COACHES, coachPhoto } from '../../site/coaches-data.js';
import { fmtHour } from '../../shared/slot-ui.js';
import { rng } from '../life/shared.js';

// Coach on hover (round 7). Some of the courts that are taken at the dock's hour are taken by a
// lesson: hovering one shows who is coaching there (no link: the visitor stays on the map, row 174). The schedule is
// made up but stable: a random stream seeded by day and court decides, so the same court has the same
// coach at the same hour on every visit, and no coach is on two courts at once.

const LESSON_SHARE = 0.55; // of the busy courts, how many are lessons

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const sportOf = (court) => (court.type === 'padel' ? 'padel' : 'tennis');
const cache = new Map();

/** Courts → coach for one day and hour: { courtId: coach }. */
export function lessonsAt(dayKey, hour) {
  const key = `${dayKey}|${hour}`;
  if (cache.has(key)) return cache.get(key);
  const out = {};
  const used = new Set();
  for (const court of COURTS) {
    if (!isOpenHour(dayKey, hour) || !isTakenByClub(court.id, dayKey, hour) || isOwnSlot(court.id, dayKey, hour)) continue;
    const r = rng(seedOf(`${dayKey}|${court.id}`) + hour * 7919);
    const kids = hour === KIDS_HOUR && court.id === kidsCourtOn(dayKey); // round 8: the kids group always has a junior coach
    if (r() > LESSON_SHARE && !kids) continue;
    const fits = COACHES.filter((c) => c.sports.includes(sportOf(court)) && !used.has(c.slug) && (!kids || c.ages.includes('kids')));
    if (!fits.length) continue;
    const coach = fits[Math.floor(r() * fits.length)];
    used.add(coach.slug);
    out[court.id] = coach;
  }
  cache.set(key, out);
  return out;
}

/**
 * The hover card. `when()` → { dayKey, hour } the dock is talking about (hour null when closed);
 * `rectOf(id)` → the court's rectangle on screen, the card pins itself inside its top-right corner.
 */
export function createCoachHover({ when, rectOf }) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const el = document.createElement('aside');
  el.className = 'coach-tag';
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.innerHTML = `
    <img class="coach-tag__photo" width="48" height="60" alt="" decoding="async" />
    <div class="coach-tag__body">
      <p class="coach-tag__k"></p>
      <p class="coach-tag__name"></p>
      <p class="coach-tag__role"></p>
    </div>`;
  document.body.append(el);
  const ui = {
    photo: el.querySelector('img'),
    k: el.querySelector('.coach-tag__k'),
    name: el.querySelector('.coach-tag__name'),
    role: el.querySelector('.coach-tag__role'),
  };

  let shownFor = null;
  let blocked = false;

  function place(id) {
    const r = rectOf(id);
    const w = el.offsetWidth || 256;
    const left = Math.max(12, Math.min(r.right - w - 16, innerWidth - w - 12));
    const top = Math.max(62, Math.min(r.top + 16, innerHeight - el.offsetHeight - 120));
    el.style.translate = `${Math.round(left / 2) * 2}px ${Math.round(top / 2) * 2}px`;
  }

  function show(id, coach, hour) {
    if (shownFor !== id) {
      shownFor = id;
      ui.photo.src = coachPhoto(coach, 'thumb');
      ui.k.textContent = hour === KIDS_HOUR && id === kidsCourtOn(when().dayKey) ? `Kids group here at ${fmtHour(hour)}` : `Coaching here at ${fmtHour(hour)}`;
      ui.name.textContent = coach.name;
      ui.role.textContent = coach.role;
      el.hidden = false;
      el.classList.remove('is-in');
      place(id);
      void el.offsetWidth; // restart the spring from its start pose
      el.classList.add('is-in');
    } else {
      place(id);
    }
  }

  function hideNow() {
    if (!shownFor) return;
    shownFor = null;
    el.classList.remove('is-in');
    setTimeout(() => { if (!shownFor) el.hidden = true; }, 240);
  }

  document.addEventListener('bp-hud', (e) => { blocked = !!e.detail?.open; if (blocked) hideNow(); });
  document.addEventListener('bp-postcard', (e) => { blocked = !!e.detail?.open; if (blocked) hideNow(); });

  return {
    /** From the scene's hover: a court id or null. */
    hover(id) {
      if (!fine || blocked) return;
      const { dayKey, hour } = when();
      const coach = id && hour !== null ? lessonsAt(dayKey, hour)[id] : null;
      if (coach) show(id, coach, hour);
      else if (shownFor) hideNow();
    },
    hide: hideNow,
  };
}
