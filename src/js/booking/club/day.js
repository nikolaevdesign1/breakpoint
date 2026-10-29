import { COURTS, HOURS, isSlotTaken, dayKeyForOffset } from '../../shared/availability.js';
import { levelLabel } from '../../shared/club-facts.js';
import { sessionBookings } from '../../shared/session-bookings.js';
import { fmtHour, dayName } from '../../shared/slot-ui.js';
import { COACHES } from '../../site/coaches-data.js';
import { hourState } from '../hour-state.js';
import { miamiNow } from '../miami-clock.js';
import { frameCourts, frameGround } from '../scene.js';
import { club, save } from './store.js';
import { joinNames } from './people.js';
import { kitChips } from './kit.js';
import { initSelects } from '../../site/custom-select.js';

// Club panel, "Your day at the club" (round 10): a timeline of what the visitor has on the shown
// day: booked courts, open games joined, a lesson and dinner at the café, which they add here.
// While the tab is open the map shows the stops as numbered plates joined by a dashed line.

const CAFE = { x: 51.3, z: -54.7, box: { minX: 40, maxX: 62, minZ: -60, maxZ: -42 } };
const SURFACE = { clay: 'Red clay', hard: 'Hard, indoor', padel: 'Padel, covered', grass: 'Grass' };
const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
const span = (h) => { const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const courtOf = (id) => COURTS.find((c) => c.id === id);
const sportOf = (coach) => (coach.sports.includes('padel') ? 'padel' : 'tennis');

/** Everything on the day, in time order: { id, kind, start, end, title, sub, courtId?, cafe?, started, report, kit?, remove? }. */
function entries(dayKey) {
  const now = miamiNow().hours;
  const today = dayKey === dayKeyForOffset(0);
  const out = [];
  for (const b of sessionBookings()) {
    if (b.dayKey !== dayKey || (b.group && b.group[0] !== b.courtId)) continue;
    const ids = b.group ?? [b.courtId];
    out.push({ id: `game:${b.courtId}:${b.hour}`, kind: 'game', courtId: b.courtId, start: b.hour, end: b.hour + (b.minutes || 60) / 60, title: ids.map((id) => courtOf(id).label).join(' + '), sub: `${SURFACE[courtOf(b.courtId).type]} · ${span((b.minutes || 60) / 60)}`, kit: b.kit });
  }
  for (const j of club().joined) {
    if (j.dayKey !== dayKey) continue;
    out.push({ id: `open:${j.courtId}:${j.hour}`, kind: 'open', courtId: j.courtId, start: j.hour, end: j.hour + 1, title: courtOf(j.courtId).label, sub: `Open play · ${levelLabel(j.level)} · with ${joinNames(j.with)}`, opp: j.with[0] });
  }
  for (const d of club().day) {
    if (d.dayKey !== dayKey) continue;
    if (d.kind === 'lesson') {
      const coach = COACHES.find((c) => c.slug === d.coach);
      out.push({ id: d.id, kind: 'lesson', courtId: d.courtId, start: d.hour, end: d.hour + 1, title: `Lesson with ${coach?.name ?? 'your coach'}`, sub: `${courtOf(d.courtId).label} · $${coach?.price ?? 0} for 1 h`, remove: true });
    } else {
      out.push({ id: d.id, kind: 'dinner', cafe: true, start: d.hour, end: d.hour + 1.5, title: 'Dinner at the café', sub: `Table for ${d.party}`, remove: true });
    }
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((e) => { e.started = !today ? false : e.start <= now; e.report = e.kind === 'game' || e.kind === 'open'; });
  return out;
}

const clash = (list, start, end) => list.some((e) => start < e.end && end > e.start);

function lessonForm(ctx, dayKey, list, today) {
  const f = document.createElement('form');
  f.className = 'cl-form';
  const d = ctx.draft;
  d.coach ??= COACHES[0].slug;
  const coach = () => COACHES.find((c) => c.slug === d.coach);
  const courtFor = (h) => COURTS.find((c) => (sportOf(coach()) === 'padel' ? c.type === 'padel' : c.type !== 'padel') && !isSlotTaken(c.id, dayKey, h));
  const hours = HOURS.filter((h) => !(today && h <= miamiNow().hours) && !clash(list, h, h + 1) && courtFor(h));
  // The time asked for (a coach's slot link), or the nearest free hour when it is taken.
  const asked = d.hour != null;
  const want = +(d.hour ?? hours[0]);
  d.hour = hours.includes(want) ? want : hours.slice().sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b)[0];
  if (ctx.coachLink && asked && !hours.includes(want) && hours.length) ctx.nearest = `${fmtHour(want)} is not free for a lesson. The nearest free hour is selected.`;
  f.innerHTML = `
    <label class="cl-wide">Coach<select name="coach">${COACHES.map((c) => `<option value="${c.slug}"${c.slug === d.coach ? ' selected' : ''}>${c.name} · $${c.price}</option>`).join('')}</select></label>
    <label>Time<select name="hour"${hours.length ? '' : ' disabled'}>${hours.map((h) => `<option value="${h}"${h === d.hour ? ' selected' : ''}>${fmtHour(h)}</option>`).join('') || '<option>No free court</option>'}</select></label>
    <button type="submit" class="cl-btn is-solid"${hours.length ? '' : ' disabled'}>Add lesson</button>`;
  initSelects(f);
  f.elements.coach.addEventListener('change', () => { d.coach = f.elements.coach.value; ctx.render(); });
  f.elements.hour.addEventListener('change', () => { d.hour = +f.elements.hour.value; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const h = +f.elements.hour.value;
    const court = courtFor(h);
    if (!court) return;
    ctx.adding = null;
    ctx.coachLink = null;
    ctx.nearest = null;
    ctx.notice = `Lesson booked: ${coach().name}, ${fmtHour(h)} on ${court.label}, $${coach().price}. It is on your day.`;
    save({ day: [...club().day, { id: `lesson:${Date.now()}`, kind: 'lesson', dayKey, hour: h, coach: d.coach, courtId: court.id }] });
  });
  return f;
}

function dinnerForm(ctx, dayKey, list, today) {
  const f = document.createElement('form');
  f.className = 'cl-form';
  const d = ctx.draft;
  const times = [18, 18.5, 19, 19.5, 20, 20.5, 21].filter((h) => !(today && h <= miamiNow().hours) && !clash(list, h, h + 1.5));
  const last = list.filter((e) => e.kind !== 'dinner').at(-1);
  const wish = last ? Math.ceil((last.end + 0.5) * 2) / 2 : 19; // half an hour after the last game, on the half hour
  d.time = times.includes(+d.time) ? +d.time : times.find((h) => h >= wish) ?? times[0];
  d.party ??= 2;
  f.innerHTML = `
    <label>Time<select name="time"${times.length ? '' : ' disabled'}>${times.map((h) => `<option value="${h}"${h === d.time ? ' selected' : ''}>${clock(h)}</option>`).join('') || '<option>Booked out</option>'}</select></label>
    <label>Table for<select name="party">${[1, 2, 3, 4, 5, 6].map((n) => `<option${n === d.party ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <button type="submit" class="cl-btn is-solid"${times.length ? '' : ' disabled'}>Reserve</button>`;
  initSelects(f);
  f.elements.time.addEventListener('change', () => { d.time = +f.elements.time.value; });
  f.elements.party.addEventListener('change', () => { d.party = +f.elements.party.value; });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.adding = null;
    save({ day: [...club().day, { id: `dinner:${Date.now()}`, kind: 'dinner', dayKey, hour: +f.elements.time.value, party: +f.elements.party.value }] });
  });
  return f;
}

export function renderDay(box, ctx) {
  const dayKey = hourState.dayKey ?? dayKeyForOffset(0);
  const today = dayKey === dayKeyForOffset(0);
  const list = entries(dayKey);
  const word = dayName(hourState.offset ?? 0).toLowerCase();

  const head = document.createElement('p');
  head.className = 'cl-lead';
  head.textContent = list.length ? `Your plan for ${word}, in order. The map shows the route.` : `Nothing planned ${word}. Book a court or join an open game, then add a lesson or dinner here.`;
  box.append(head);
  if (ctx.notice) {
    const n = document.createElement('p');
    n.className = 'cl-result';
    n.setAttribute('role', 'status');
    n.textContent = ctx.notice;
    box.append(n);
  }

  const ol = document.createElement('ol');
  ol.className = 'cl-line';
  const keys = [];
  list.forEach((e, i) => {
    if (i) {
      const gap = e.start - list[i - 1].end;
      if (gap > 0.01) { const g = document.createElement('li'); g.className = 'cl-gap'; g.textContent = `${span(gap)} between`; ol.append(g); }
    }
    const li = document.createElement('li');
    li.className = `cl-stop is-${e.kind}`;
    li.style.setProperty('--i', i);
    li.innerHTML = `
      <span class="cl-stop__t">${clock(e.start)}<small>to ${clock(e.end)}</small></span>
      <span class="cl-stop__n" aria-hidden="true">${i + 1}</span>
      <div class="cl-stop__b">
        <b>${e.title}</b><small>${e.sub}</small>
        ${e.kit ? `<span class="cl-stop__kit">${kitChips(e.kit)}</span>` : ''}
        <span class="cl-stop__acts">
          <button type="button" class="cl-link" data-show>Show on map</button>
          ${e.report && e.started ? '<button type="button" class="cl-link" data-report>Report score</button>' : ''}
          ${e.remove ? '<button type="button" class="cl-link" data-remove>Remove</button>' : ''}
        </span>
      </div>`;
    li.querySelector('[data-show]').addEventListener('click', () => {
      if (e.cafe) frameGround(CAFE.box, 1.4, ctx.inset());
      else frameCourts([courtOf(e.courtId)], ctx.inset(), 1.4);
      ctx.afterShow();
    });
    li.querySelector('[data-report]')?.addEventListener('click', () => ctx.go('ladder', { report: { opp: e.opp ?? null } }));
    li.querySelector('[data-remove]')?.addEventListener('click', () => save({ day: club().day.filter((d) => d.id !== e.id) }));
    ol.append(li);
    const key = `stop:${e.id}`;
    keys.push(key);
    ctx.pins.put(key, { at: e.cafe ? { x: CAFE.x, z: CAFE.z } : { court: e.courtId, corner: 'c' }, cls: 'cl-stop-pin', html: `<b>${i + 1}</b><small>${clock(e.start)}</small>` });
  });
  if (list.length) box.append(ol);
  ctx.pins.sweep('stop:', new Set(keys));
  ctx.pins.route(keys);

  const adds = document.createElement('div');
  adds.className = 'cl-adds';
  adds.innerHTML = `
    <button type="button" class="cl-btn" data-add="lesson" aria-expanded="${ctx.adding === 'lesson'}">Add a lesson</button>
    <button type="button" class="cl-btn" data-add="dinner" aria-expanded="${ctx.adding === 'dinner'}">Table at the café</button>`;
  adds.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { ctx.adding = ctx.adding === b.dataset.add ? null : b.dataset.add; ctx.render(); }));
  box.append(adds);
  if (ctx.adding) {
    const form = ctx.adding === 'lesson' ? lessonForm(ctx, dayKey, list, today) : dinnerForm(ctx, dayKey, list, today);
    if (ctx.adding === 'lesson' && ctx.nearest) {
      const m = document.createElement('p');
      m.className = 'cl-score__err';
      m.textContent = ctx.nearest;
      form.prepend(m);
      m.style.gridColumn = '1 / -1';
    }
    box.append(form);
  }
}

export const clearStops = (pins) => { pins.sweep('stop:', new Set()); pins.route(null); };
