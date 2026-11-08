// Row 19: the automatic check of where the players stand. Plays 10 minutes of the rallies on four
// courts in the dev server (players.simulate: no drawing, a fixed 1/30 s step), prints the violations
// of court-bounds.js (0 expected) and draws the heat map of the sampled positions.
//   node scripts/life/bounds-check.mjs [port=5173] [out=heatmap.png] [seconds=600] [hour]
// Needs `npx vite --port <port>` running and puppeteer-core (path below, else set PUPPETEER).
import { writeFileSync } from 'node:fs';

const [,, port = '5173', out = 'bounds-heatmap.png', seconds = '600', hour = ''] = process.argv;
const { default: puppeteer } = await import(process.env.PUPPETEER ?? 'puppeteer-core');
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`http://localhost:${port}/booking.html?time=14:00`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__bp?.lifeDev()?.players?.ready && document.getElementById('loading')?.hidden === true, { timeout: 280000, polling: 200 });
await new Promise((r) => setTimeout(r, 3000)); // the map's own hour message has settled
const res = await p.evaluate((sec, hr) => {
  const pl = window.__bp.lifeDev().players;
  pl.setCourts(['clay-2', 'clay-4', 'hard-1', 'hard-4']); // four courts, whatever is booked now
  return pl.simulate(+sec, { hour: hr ? +hr : null });
}, seconds, hour);
// heat map: four courts side by side, 20 px per metre, a cell of 0.25 m
const png = await p.evaluate((r) => {
  const M = 22, W = 20, H = 36;
  const cv = document.createElement('canvas');
  cv.width = r.courts.length * (W * M + 40) + 40; cv.height = H * M + 80;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, cv.width, cv.height);
  r.courts.forEach((id, k) => {
    const ox = 40 + k * (W * M + 40) + (W / 2) * M, oy = 50 + (H / 2) * M;
    const heat = new Map();
    for (const s of r.samples) if (s[0] === k) for (let i = 2; i + 2 < s.length + 1; i += 3) {
      if (s[i + 2]) continue; // on an errand outside the court (gate, footpath): not in the heat map
      const key = `${Math.round(s[i] * 4)},${Math.round(s[i + 1] * 4)}`;
      heat.set(key, (heat.get(key) ?? 0) + 1);
    }
    const mx = Math.max(...heat.values(), 1);
    for (const [key, v] of heat) {
      const [x, z] = key.split(',').map((n) => n / 4);
      g.fillStyle = `rgba(156,68,31,${Math.min(1, 0.12 + 0.88 * Math.sqrt(v / mx))})`;
      g.fillRect(ox + (x - 0.125) * M, oy + (z - 0.125) * M, M / 4, M / 4);
    }
    g.strokeStyle = '#111'; g.lineWidth = 1;
    const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(ox + x0 * M, oy + z0 * M); g.lineTo(ox + x1 * M, oy + z1 * M); g.stroke(); };
    line(-4.115, -11.885, 4.115, -11.885); line(-4.115, 11.885, 4.115, 11.885); line(-5.485, -11.885, -5.485, 11.885); line(5.485, -11.885, 5.485, 11.885);
    line(-4.115, -11.885, -4.115, 11.885); line(4.115, -11.885, 4.115, 11.885); line(-4.115, -6.4, 4.115, -6.4); line(-4.115, 6.4, 4.115, 6.4); line(0, -6.4, 0, 6.4);
    g.lineWidth = 2; line(-6.7, 0, 6.7, 0); // the net
    g.strokeStyle = '#2a7a2a'; g.lineWidth = 2; g.strokeRect(ox - 8.6 * M, oy - 15.4 * M, 17.2 * M, 30.8 * M); // the limits
    g.fillStyle = '#111'; g.font = '14px sans-serif'; g.fillText(id, ox - 8.6 * M, 36);
  });
  g.fillStyle = '#111'; g.font = '13px sans-serif';
  g.fillText(`${r.seconds}s, ${r.samples.length} samples, violations ${r.violations.length}, green = limits (8.6 m sideways, 3.5 m behind the baseline)`, 40, cv.height - 14);
  return cv.toDataURL('image/png').split(',')[1];
}, res);
writeFileSync(out, Buffer.from(png, 'base64'));
const { samples, ...rest } = res;
console.log(JSON.stringify({ ...rest, violations: rest.violations.slice(0, 20), errors: errs }, null, 1));
await b.close();
process.exit(res.violations.length ? 1 : 0);
