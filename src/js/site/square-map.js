// Square map of Coconut Grove (row 118), in the site's court-of-squares language: land is a grid of
// light squares, roads ink, parks Finch, the bay a field of small dots, the club a Rich Red block.
// The geography is simplified by hand (north up, the bay to the south-east). Squares assemble outward
// from the club when the map scrolls into view.

export const COLS = 72; // cells across
export const ROWS = 36; // cells down: the map is twice as wide as it is tall
export const CELL = 10; // viewBox units per cell
export const W = COLS * CELL;
export const H = ROWS * CELL;

// Normalised [x, y] points, 0..1 from the top-left corner. Roads run along and across the shore.
const COAST = [[1.02, 0.12], [0.8, 0.34], [0.7, 0.44], [0.66, 0.5], [0.74, 0.56], [0.7, 0.62], [0.6, 0.6], [0.4, 0.8], [0.18, 1.02]];
const ROADS = [
  [[1, 0], [0, 1]], // S Bayshore Dr
  [[0.55, 0], [0, 0.55]], // US-1, Metrorail above it
  [[0.55, 0.45], [0.1, 0]], // SW 27th Ave
  [[0.3, 0.7], [0, 0.4]], // Grand Ave
];
const PARKS = [[0.78, 0.12, 0.05], [0.14, 0.2, 0.06], [0.42, 0.48, 0.04]]; // [x, y, radius]
const ISLANDS = [[0.86, 0.72, 0.03], [0.66, 0.88, 0.025]];
export const CLUB = [0.6, 0.5];
export const STATION = [0.325, 0.225];

// Distances are measured in viewBox units (x * W, y * H), so roads and parks keep their width on the wide map.
function segDist(px, py, [ax, ay], [bx, by]) {
  px *= W; ax *= W; bx *= W; py *= H; ay *= H; by *= H;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const nearLine = (x, y, line, r) => line.some((p, i) => i > 0 && segDist(x, y, line[i - 1], p) < r * 480);
const inCircle = (x, y, [cx, cy, r]) => Math.hypot((x - cx) * W, (y - cy) * H) < r * 480;

// Water: the polygon closed by the coast and the bottom-right corner (even-odd ray cast)
const WATER = [...COAST, [1.02, 1.02]];
function inWater(x, y) {
  let inside = false;
  for (let i = 0, j = WATER.length - 1; i < WATER.length; j = i++) {
    const [xi, yi] = WATER[i];
    const [xj, yj] = WATER[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cellKind(x, y) {
  if (inWater(x, y) && !ISLANDS.some((c) => inCircle(x, y, c))) return 'water';
  if (ROADS.some((r) => nearLine(x, y, r, 0.72 / 36))) return 'road';
  if (PARKS.some((c) => inCircle(x, y, c))) return 'park';
  return 'land';
}

export function initSquareMap(root = document) {
  const host = root.querySelector('[data-square-map]');
  if (!host) return null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rects = [];
  const far = Math.hypot(1, 1);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = (col + 0.5) / COLS;
      const y = (row + 0.5) / ROWS;
      const kind = cellKind(x, y);
      const delay = ((Math.hypot(x - CLUB[0], y - CLUB[1]) / far) * 1.4 + Math.random() * 0.12).toFixed(2);
      const size = kind === 'water' ? 2 : 8;
      const o = (CELL - size) / 2;
      rects.push(`<rect class="smap__${kind}" x="${col * CELL + o}" y="${row * CELL + o}" width="${size}" height="${size}" style="--d:${delay}s"/>`);
    }
  }
  // A 2 × 2 cell block drawn over the grid (the club, the Metrorail station)
  const at = ([x, y]) => `x="${Math.round(x * COLS - 1) * CELL + 1}" y="${Math.round(y * ROWS - 1) * CELL + 1}" width="${CELL * 2 - 2}" height="${CELL * 2 - 2}"`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    ${rects.join('')}
    <g class="smap__routes" data-routes></g>
    <rect class="smap__station" ${at(STATION)} style="--d:0.5s"/>
    <rect class="smap__pulse" ${at(CLUB)}/>
    <rect class="smap__club" ${at(CLUB)} style="--d:0s"/>
  </svg>`;

  // Resolves once the squares start to assemble (the routes wait for it).
  const map = host.closest('.smap') || host;
  if (reduced || !('IntersectionObserver' in window)) { map.classList.add('is-in'); return { map, svg: host.firstElementChild, shown: Promise.resolve() }; }
  const shown = new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      map.classList.add('is-in');
      io.disconnect();
      resolve();
    }, { threshold: 0.3 });
    io.observe(map);
  });
  return { map, svg: host.firstElementChild, shown };
}
