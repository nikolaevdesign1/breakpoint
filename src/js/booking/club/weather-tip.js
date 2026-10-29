import '../../../css/booking-club.css';
import { COURTS, HOURS } from '../../shared/availability.js';
import { fmtHour } from '../../shared/slot-ui.js';
import { forecastAt, isWet } from '../forecast.js';

// Weather-smart tip (round 10) under the forecast line of the booking panel. Rain likely or a hot
// hour: one tap moves the game to a court with a roof (indoor hard, covered padel) or to the nearest
// hour with better weather. The tiles are drawn here; the panel (court-hud.js) applies the tap
// through `bp-tip-time` and `bp-open-court`.

const HOT = 90; // °F
const roofed = (c) => c.type === 'hard' || c.type === 'padel';

/** { tone, text, actions: [{ label, hour? , courtId? }] } for the picked hour, or null. */
export function weatherTip({ court, offset, hour, minutes, fitsOn }) {
  const f = hour === null ? null : forecastAt(offset, hour);
  if (!f) return null;
  const wet = isWet(f);
  const hot = !wet && f.temp >= HOT;
  if (!wet && !hot) return null;
  const heat = `Hot at ${fmtHour(hour)}, ${Math.round(f.temp)}°F.`;
  if (roofed(court)) return { tone: 'ok', text: wet ? `${court.type === 'padel' ? 'This court is covered' : 'This court is indoor'}, so rain will not touch your game.` : `${heat} ${court.type === 'padel' ? 'This court is covered, with shade all game' : 'This court is indoor, 72°F all year'}.`, actions: [] };

  const actions = [];
  const covered = COURTS.filter((c) => roofed(c) && (court.type !== 'padel' || c.type === 'padel')).find((c) => fitsOn(c, hour, minutes));
  if (covered) actions.push({ label: `Move to ${covered.label}, ${covered.type === 'padel' ? 'covered' : 'indoor'}`, courtId: covered.id });
  const better = (h) => { const x = forecastAt(offset, h); return x && (wet ? !isWet(x) : x.temp <= f.temp - 6); };
  const alt = HOURS.filter((h) => h !== hour && better(h) && fitsOn(court, h, minutes)).sort((a, b) => Math.abs(a - hour) - Math.abs(b - hour) || a - b)[0];
  if (alt !== undefined) {
    const x = forecastAt(offset, alt);
    actions.push({ label: `Play at ${fmtHour(alt)} instead, ${wet ? `rain ${x.rain}%` : `${Math.round(x.temp)}°F`}`, hour: alt });
  }
  const lead = wet
    ? (actions.length ? 'Keep the game dry:' : 'No roofed court or dry hour is free for this game. You can move it for free up to 24 hours before.')
    : `${heat} ${actions.length ? 'Keep cool:' : 'Free water and towels are on the house.'}`;
  return { tone: wet ? 'rain' : 'heat', text: lead, actions };
}

export function renderTip(box, ctx) {
  const tip = weatherTip(ctx);
  box.hidden = !tip;
  if (!tip) { box.replaceChildren(); return; }
  box.dataset.tone = tip.tone;
  box.innerHTML = `<p class="hud-tip__text">${tip.text}</p>` + (tip.actions.length ? `<div class="hud-tip__acts">${tip.actions.map((a, i) => `<button type="button" data-act="${i}">${a.label}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button>`).join('')}</div>` : '');
  box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = tip.actions[Number(b.dataset.act)];
    if (a.courtId) document.dispatchEvent(new CustomEvent('bp-open-court', { detail: { courtId: a.courtId, offset: ctx.offset, hour: ctx.hour, minutes: ctx.minutes } }));
    else document.dispatchEvent(new CustomEvent('bp-tip-time', { detail: { hour: a.hour } }));
  }));
}
