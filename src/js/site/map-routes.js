import { W, H, STATION } from './square-map.js';

// Route switch for the square map (row 12). Each way to the club is a line of small squares laid over
// the map; the picked one is drawn square by square from the start to the club, the others stay faint.
// Points are normalised 0..1 like the map itself (north up, the bay to the south-east).
// side: where a pin's label sits (r, l, b).

const DRAW = 2.4; // seconds to draw a route
const START_AFTER = 1800; // ms after the map appears, so the squares have assembled first

const ROUTES = {
  car: {
    text: 'US-1 to S Bayshore Drive. Free parking at gate B.',
    legs: [{ pts: [[0.5, 0.04], [0.3, 0.24], [0.3, 0.5], [0.55, 0.5]] }],
    pins: [{ p: [0.5, 0.04], t: 'Brickell', side: 'r' }, { p: [0.55, 0.5], t: 'Gate B parking', side: 'l' }],
    time: { p: [0.3, 0.37], t: '10 min drive' },
  },
  rail: {
    text: 'Metrorail to Coconut Grove station, then a twelve-minute walk down 27th Avenue.',
    legs: [
      { pts: [[0.56, 0.0], STATION] },
      { pts: [STATION, [0.325, 0.4], [0.57, 0.4], [0.6, 0.46]], dashed: true },
    ],
    pins: [{ p: [0.56, 0.0], t: 'Metrorail', side: 'r' }, { p: STATION, t: 'Coconut Grove station', side: 'r' }],
    time: { p: [0.45, 0.4], t: '12 min walk' },
  },
  ride: {
    text: 'Set the drop-off to “Break Point gate B”, the closest gate to the courts.',
    legs: [{ pts: [[0.9, 0.1], [0.6, 0.4], [0.6, 0.45]] }],
    pins: [{ p: [0.9, 0.1], t: 'Pick-up', side: 'l' }, { p: [0.6, 0.4], t: 'Gate B drop-off', side: 'l' }],
    time: { p: [0.75, 0.25], t: '10 min ride' },
  },
  bike: {
    text: 'Bike racks at gate B and a pump at the front desk.',
    legs: [{ pts: [[0.24, 0.64], [0.46, 0.64], [0.57, 0.54], [0.6, 0.5]], dashed: true }],
    pins: [{ p: [0.24, 0.64], t: 'The Grove', side: 'r' }, { p: [0.57, 0.54], t: 'Bike racks', side: 'b' }],
    time: { p: [0.4, 0.64], t: '5 min by bike' },
  },
};


// Squares along a polyline: solid = a tight chain, dashed = every few cells
function squares(pts, dashed) {
  const step = dashed ? 14 : 5;
  const size = 6;
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = [pts[i - 1][0] * W, pts[i - 1][1] * H];
    const [bx, by] = [pts[i][0] * W, pts[i][1] * H];
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d <= len; d += step) out.push([ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len, size]);
  }
  return out;
}

export function initRoutes(api) {
  const tabs = [...document.querySelectorAll('[data-route]')];
  const panel = document.querySelector('[data-route-panel]');
  const pinsHost = document.querySelector('[data-map-pins]');
  if (!api || !tabs.length) return;
  const { svg, shown } = api;
  const layer = svg.querySelector('[data-routes]');

  // One group of squares per route, one set of pins and a time tag next to it
  let svgOut = '';
  let htmlOut = '';
  for (const [key, r] of Object.entries(ROUTES)) {
    const sq = r.legs.flatMap((leg) => squares(leg.pts, leg.dashed));
    svgOut += `<g class="smap__route" data-r="${key}">${sq.map(([x, y, s], i) => `<rect class="smap__rt" x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s}" height="${s}" style="--d:${((i / sq.length) * DRAW).toFixed(2)}s"/>`).join('')}</g>`;
    const pin = ({ p, t, side }) => `<span class="smap__pin smap__pin--${side}" style="left:${p[0] * 100}%;top:${p[1] * 100}%"><i></i><b>${t}</b></span>`;
    htmlOut += `<span class="smap__pinset" data-r="${key}">${r.pins.map(pin).join('')}<span class="smap__time" style="left:${r.time.p[0] * 100}%;top:${r.time.p[1] * 100}%">${r.time.t}</span></span>`;
  }
  layer.innerHTML = svgOut;
  pinsHost.innerHTML = htmlOut;

  const groups = [...layer.children];
  const sets = [...pinsHost.children];
  let current = null;

  // Drop the old route, then draw the new one from its first square
  function draw(key) {
    groups.forEach((g) => g.classList.remove('is-active'));
    sets.forEach((s) => s.classList.remove('is-active'));
    if (!key) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (key !== current) return;
      groups.find((g) => g.dataset.r === key)?.classList.add('is-active');
      sets.find((s) => s.dataset.r === key)?.classList.add('is-active');
    }));
  }

  function select(key, { focus = false, hold = false } = {}) {
    if (key === current) return;
    current = key;
    tabs.forEach((t) => {
      const on = t.dataset.route === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panel.textContent = ROUTES[key].text;
    panel.setAttribute('aria-labelledby', `rt-${key}`);
    draw(hold ? null : key);
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.dataset.route));
    t.addEventListener('keydown', (e) => {
      const to = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!to) return;
      e.preventDefault();
      select(tabs[(i + to + tabs.length) % tabs.length].dataset.route, { focus: true });
    });
  });

  // Quiet start: the first route is drawn once the map has assembled, unless the visitor picked one.
  select('car', { hold: true });
  shown.then(() => setTimeout(() => { if (current === 'car') draw('car'); }, START_AFTER));
}
