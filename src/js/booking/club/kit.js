import '../../../css/booking-club.css';
import { PRICES, KIT_OFF, racketPrice } from '../extras.js';
import { icon } from './icons.js';

// Ball kit & rental (round 10). On "Your game" a tile gathers what waits on the court: a starter
// kit (two rackets and a new can, $4 off), a ball basket, and what the visitor already picked
// (rackets, balls, the ball machine). `kitOf` is what the booking carries to the map, where
// club/kit-marks.js stands it by the court.

export const isStarter = (g) => g.rackets >= 2 && g.balls === 'new';

/** What waits on court for a game, or null when nothing does. */
export function kitOf(g) {
  const kit = { rackets: g.rackets, balls: g.balls === 'new', basket: !!g.basket, machine: !!g.machine };
  return kit.rackets || kit.balls || kit.basket || kit.machine ? kit : null;
}

/** [['racket', '2 rackets'], ['balls', 'New balls'], …] */
export function kitItems(kit) {
  if (!kit) return [];
  return [
    kit.rackets ? ['racket', `${kit.rackets} ${kit.rackets === 1 ? 'racket' : 'rackets'}`] : null,
    kit.balls ? ['balls', 'New balls'] : null,
    kit.basket ? ['basket', 'Ball basket'] : null,
    kit.machine ? ['machine', 'Ball machine'] : null,
  ].filter(Boolean);
}

export const kitChips = (kit) => kitItems(kit).map(([i, t]) => `<span class="cl-chip">${icon(i)}${t}</span>`).join('');

export function renderKit(box, g, change, courtType) {
  const starter = isStarter(g);
  const rental = racketPrice(courtType);
  const price = 2 * rental + PRICES.balls - KIT_OFF;
  const ready = kitChips(kitOf(g));
  box.innerHTML = `
    <span class="hud-field__k">Ball kit & rental<small>Waiting on your court when you arrive</small></span>
    <div class="hud-kit__cards">
      <button type="button" class="hud-kit__card" data-kit="starter" aria-pressed="${starter}">${icon('racket')}<b>Starter kit</b><small>${rental ? `2 rackets, new balls · $${price}, save $${KIT_OFF}` : `2 padel rackets are free · new balls +$${PRICES.balls}`}</small></button>
      <button type="button" class="hud-kit__card" data-kit="basket" aria-pressed="${!!g.basket}">${icon('basket')}<b>Ball basket</b><small>+$${PRICES.basket} · 72 balls and a pickup tube</small></button>
    </div>
    <p class="hud-kit__ready">${ready || '<span class="hud-kit__none">Nothing yet. Bring your own, or add a kit.</span>'}</p>`;
  box.querySelector('[data-kit="starter"]').addEventListener('click', () => {
    if (starter) { g.rackets = 0; g.balls = 'own'; } else { g.rackets = Math.max(2, g.rackets); g.balls = 'new'; }
    change();
  });
  box.querySelector('[data-kit="basket"]').addEventListener('click', () => { g.basket = !g.basket; change(); });
}
