import gsap from 'gsap';

// Clay-sand trail behind the ball cursor (row 58). One 2D canvas, one rAF loop, at most 150 grains.
// Grains fly out behind the ball against its direction, slow down and fade in 0.6-0.9 s; faster mouse, more grains;
// a ring ripples out where the ball turns sharply or stops. Grains are cream (--sun) with a thin dark rim, so they
// read on white and on dark blocks. Over links, buttons and fields the trail is weaker. The ball's position is read
// from its element (cursor.js), not tracked twice. Off on touch and under reduced motion (cursor.js does not call it).

const MAX = 150;
const RIPPLES = 3;
const GRAIN = '255, 243, 218'; // --sun
const RIM = '54, 37, 27'; // --wood
const SOFT = { hover: 0.4, text: 0.3, label: 0.3 }; // emission factor by cursor mode

export function initCursorTrail(dot) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  fit();
  window.addEventListener('resize', fit, { passive: true });

  // Pool of grains: x, y, vx, vy, age, life (ms), size
  const g = Array.from({ length: MAX }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, s: 2 }));
  const rings = Array.from({ length: RIPPLES }, () => ({ on: false, x: 0, y: 0, age: 0 }));
  const RING_MS = 900;

  let px = null; let py = null; // ball position last frame
  let dirX = 0; let dirY = 0; // smoothed direction of travel
  let speed = 0; // smoothed px per frame
  let moved = false; // moved since the last stop
  let last = 0;
  let raf = 0;
  let carry = 0; // fractional grains owed

  const spawn = (x, y, vx, vy) => {
    const p = g.find((q) => !q.on);
    if (!p) return;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = 0;
    p.life = 600 + Math.random() * 300;
    p.s = Math.random() < 0.85 ? 2 : 4;
  };
  const ring = (x, y) => {
    const r = rings.find((q) => !q.on);
    if (r) { r.on = true; r.x = x; r.y = y; r.age = 0; }
  };

  function frame(now) {
    const dt = Math.min(now - last || 16, 50);
    last = now;
    const k = dt / 16;
    const x = gsap.getProperty(dot, 'x');
    const y = gsap.getProperty(dot, 'y');
    if (px === null) { px = x; py = y; }
    const mx = x - px; const my = y - py;
    const v = Math.hypot(mx, my) / k;
    px = x; py = y;

    if (v > 0.8) {
      const nx = mx / (v * k); const ny = my / (v * k);
      // sharp turn: the new heading is far from the smoothed one while the ball is moving fast
      if (speed > 6 && v > 4 && nx * dirX + ny * dirY < -0.2) ring(x, y);
      dirX += (nx - dirX) * 0.35; dirY += (ny - dirY) * 0.35;
      const dl = Math.hypot(dirX, dirY) || 1; dirX /= dl; dirY /= dl;
      moved = true;
    } else if (moved && speed > 8) { ring(x, y); moved = false; } // came to a stop
    speed += (v - speed) * 0.25;
    if (speed < 1) moved = false;

    const soft = SOFT[dot.dataset.mode] ?? 1;
    carry += Math.min(v / 4, 8) * soft * k * (dot.dataset.hidden ? 0 : 1);
    while (carry >= 1) {
      carry -= 1;
      const jitter = (Math.random() - 0.5) * 1.6; // sideways spread
      const back = 1 + Math.random() * 2.4; // how hard the grain is thrown backwards
      const a = Math.atan2(dirY, dirX) + Math.PI + jitter * 0.8;
      const rx = (Math.random() - 0.5) * 10; const ry = (Math.random() - 0.5) * 10; // starts under the ball
      spawn(x + rx - dirX * 6, y + ry - dirY * 6, Math.cos(a) * back * Math.min(1 + speed / 10, 3), Math.sin(a) * back * Math.min(1 + speed / 10, 3));
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    let alive = 0;
    const drag = 0.93 ** k;
    for (const p of g) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      alive++;
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * k; p.y += p.vy * k;
      const a = (1 - p.age / p.life) ** 1.4 * Math.min(1, 0.5 + soft);
      const rx = Math.round(p.x / 2) * 2; const ry = Math.round(p.y / 2) * 2; // even pixels, like the rest of the site
      ctx.fillStyle = `rgba(${RIM}, ${a * 0.5})`;
      ctx.fillRect(rx - 1, ry - 1, p.s + 2, p.s + 2);
      ctx.fillStyle = `rgba(${GRAIN}, ${a})`;
      ctx.fillRect(rx, ry, p.s, p.s);
    }
    for (const r of rings) {
      if (!r.on) continue;
      r.age += dt;
      if (r.age >= RING_MS) { r.on = false; continue; }
      alive++;
      const t = r.age / RING_MS;
      const e = 1 - (1 - t) ** 3;
      const radius = 12 + 12 * e;
      const a = (1 - t) * 0.9;
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(${RIM}, ${a * 0.4})`;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${GRAIN}, ${a})`;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI * 2); ctx.stroke();
    }

    // Sleep when nothing moves and nothing is left to draw
    raf = alive || v > 0.2 || carry ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  window.addEventListener('pointermove', wake, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; g.forEach((p) => { p.on = false; }); rings.forEach((r) => { r.on = false; }); px = null; }
    else wake();
  });
}
