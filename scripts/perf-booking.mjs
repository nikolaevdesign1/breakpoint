#!/usr/bin/env node
// Regression check for the frame rate of /booking.html (docs/perf-booking-final.md).
//
//   npm run dev -- --port 5191            (the dev server: window.__bp exists only there)
//   node scripts/perf-booking.mjs --url http://localhost:5191 --label after --out perf.json
//
// Options
//   --url <origin>       dev server (default http://localhost:5183)
//   --label <name>       tag stored with the run
//   --out <file.json>    write the numbers as JSON
//   --only a,b,c         run just these scenarios (default: all)
//   --repeat <n>         bench repeats, the minimum is kept (default 3)
//   --budget <file.json> compare with an earlier run and exit 1 when a scenario got >30 % + 1 ms slower (GPU timings on a shared machine carry about 3 ms of noise)
//
// Needs puppeteer-core and Chrome. Neither is a dependency of the site: point PUPPETEER_CORE at the
// module folder and CHROME at the binary when the defaults below are not where they live.
//
// Per scenario: GPU-synchronised frame cost (__bp.benchPlain moving camera, __bp.benchLife still
// camera), real rAF cadence while idle and while the camera flies (fps, frames over 20 ms, CPU
// time of the rAF callbacks), draw calls, heap, console errors.
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : a), []));
const ORIGIN = (args.url || 'http://localhost:5183').replace(/\/$/, '');
const REPEAT = +(args.repeat || 3);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PP = [process.env.PUPPETEER_CORE, 'puppeteer-core', `${process.env.HOME}/.npm/_npx/8003d8991b0d346b/node_modules/puppeteer-core`].filter(Boolean);
const puppeteer = PP.map((p) => { try { return require(p); } catch { return null; } }).find(Boolean);
if (!puppeteer) { console.error('puppeteer-core not found: set PUPPETEER_CORE'); process.exit(2); }

const BASE = 'intro=0&season=off&time=14:00';
const SCENARIOS = [
  { id: 'wide', name: 'Wide view, 14:00', q: BASE },
  { id: 'close', name: 'Close up on a court', q: BASE, fly: { court: 'clay-2', dist: 30 } },
  { id: 'night', name: 'Night, 22:00', q: 'intro=0&season=off&time=22:00' },
  { id: 'rain', name: 'Rain', q: `${BASE}&weather=rain` },
  { id: 'holidays', name: 'Holidays (December)', q: 'intro=0&season=holidays&time=14:00' },
  { id: 'new-year', name: 'New Year', q: 'intro=0&season=new-year&time=21:00' },
  { id: 'halloween', name: 'Halloween', q: 'intro=0&season=halloween&time=19:00' },
  { id: 'mobile', name: 'Phone 390x844 dpr 3', q: BASE, view: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { id: 'cpu4', name: 'CPU throttle x4', q: BASE, cpu: 4 },
  { id: 'q-medium', name: 'Tier medium forced (?quality=medium)', q: `${BASE}&quality=medium` },
  { id: 'q-low', name: 'Tier low forced (?quality=low)', q: `${BASE}&quality=low` },
  { id: 'hidden', name: 'Hidden tab: ticks while hidden (want 0)', q: BASE, hide: true },
  { id: 'drop', name: 'Tier drops high to low at run time', q: BASE, drop: true },
];
const only = args.only ? args.only.split(',') : null;
const list = SCENARIOS.filter((s) => !only || only.includes(s.id));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

// Runs before the page: times every rAF callback (the whole tick plus render submission).
const HOOK = () => {
  const rec = { on: false, dt: [], cpu: [], last: 0 };
  window.__rec = rec;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const t0 = performance.now();
    cb(t);
    if (!rec.on) return;
    if (t !== rec.last) { // first callback of a new frame; several callbacks share one timestamp
      if (rec.last) rec.dt.push(t - rec.last);
      rec.last = t;
      rec.cpu.push(0);
    }
    rec.cpu[rec.cpu.length - 1] += performance.now() - t0;
  });
};

async function record(pg, ms) {
  await pg.evaluate(() => { const r = window.__rec; r.dt = []; r.cpu = []; r.last = 0; r.on = true; });
  await sleep(ms);
  const r = await pg.evaluate(() => { const x = window.__rec; x.on = false; return { dt: x.dt, cpu: x.cpu }; });
  const n = r.dt.length || 1;
  const avg = r.dt.reduce((a, b) => a + b, 0) / n;
  return {
    fps: +(1000 / avg).toFixed(1),
    over20: r.dt.filter((d) => d > 20).length,
    over50: r.dt.filter((d) => d > 50).length,
    frames: r.dt.length,
    cpuAvg: +(r.cpu.reduce((a, b) => a + b, 0) / (r.cpu.length || 1)).toFixed(2),
    cpuP95: +pct(r.cpu, 0.95).toFixed(2),
    cpuMax: +Math.max(0, ...r.cpu).toFixed(2),
  };
}

async function run(browser, sc) {
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await pg.evaluateOnNewDocument(HOOK);
  await pg.setViewport(sc.view || { width: 1440, height: 900, deviceScaleFactor: 2 });
  if (sc.view?.isMobile) await pg.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  const cdp = await pg.createCDPSession();
  if (sc.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.cpu });
  const t0 = Date.now();
  await pg.goto(`${ORIGIN}/booking.html?${sc.q}`, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__bp?.fly && (!document.getElementById('loading') || document.getElementById('loading').hidden), { timeout: 240000 });
  const ready = Date.now() - t0;
  await sleep(sc.cpu ? 12000 : 7000); // life systems, atlases and shaders settle
  if (sc.fly) {
    await pg.evaluate((f) => { const c = __bp.center(f.court); __bp.fly((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, f.dist); }, sc.fly);
    await sleep(2500);
  }
  const out = { id: sc.id, name: sc.name, readyMs: ready };
  out.quality = await pg.evaluate(() => (window.__bp.perf ? window.__bp.perf().quality : null));
  if (sc.hide) {
    await pg.evaluate(() => __bp.perfReset());
    const a = await pg.evaluate(() => __bp.perf().ticks || 0);
    await pg.evaluate(() => __bp.setHidden(true));
    await sleep(3000);
    const b = await pg.evaluate(() => __bp.perf().ticks || 0);
    await pg.evaluate(() => __bp.setHidden(false));
    await sleep(1500);
    const c = await pg.evaluate(() => __bp.perf().ticks || 0);
    out.hiddenTicks = b - a; out.visibleTicks = c - b;
  }
  if (sc.drop) {
    out.drops = [await pg.evaluate(() => __bp.tierDown()), await pg.evaluate(() => __bp.tierDown())];
    await sleep(2500);
  }
  out.idle = await record(pg, 4000);
  // A real camera move: fly across the club and back while rAF is timed.
  const moving = pg.evaluate(() => new Promise((res) => {
    const v = __bp.view();
    __bp.rig.flyTo({ x: v.x + 30, z: v.z + 12, dist: v.dist }, { duration: 1.6 });
    setTimeout(() => { __bp.rig.flyTo({ x: v.x, z: v.z, dist: v.dist }, { duration: 1.6 }); res(); }, 1800);
  }));
  const mv = record(pg, 3600);
  await moving;
  out.moving = await mv;
  await sleep(1500);
  const bench = async (fn) => {
    const v = [];
    for (let i = 0; i < REPEAT; i++) v.push(await pg.evaluate(fn));
    return Math.min(...v);
  };
  out.benchPlain = await bench(() => __bp.benchPlain(30));
  out.benchLife = await bench(() => __bp.benchLife(30));
  out.draw = await pg.evaluate(() => { const i = __bp.info(); return { calls: i.calls, triangles: i.triangles, textures: i.textures, geometries: i.geometries }; });
  out.heapMB = await pg.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null));
  out.perf = await pg.evaluate(() => (window.__bp.perf ? window.__bp.perf() : null));
  out.errors = [...new Set(errors)];
  await pg.close();
  return out;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const results = [];
for (const sc of list) {
  process.stderr.write(`> ${sc.id} ...`);
  try { const r = await run(browser, sc); results.push(r); process.stderr.write(` plain ${r.benchPlain} ms, life ${r.benchLife} ms, idle ${r.idle.fps} fps, move ${r.moving.fps} fps, errors ${r.errors.length}\n`); }
  catch (e) { results.push({ id: sc.id, error: String(e.message || e).slice(0, 200) }); process.stderr.write(` FAILED ${e.message}\n`); }
}
await browser.close();

const run0 = { label: args.label || '', at: new Date().toISOString(), origin: ORIGIN, results };
if (args.out) writeFileSync(args.out, JSON.stringify(run0, null, 2));

const row = (r) => r.error ? `${r.id.padEnd(10)} ${r.error}` : `${r.id.padEnd(10)} plain ${String(r.benchPlain).padStart(6)} | life ${String(r.benchLife).padStart(6)} | idle ${String(r.idle.fps).padStart(5)} fps cpu ${String(r.idle.cpuAvg).padStart(5)} | move ${String(r.moving.fps).padStart(5)} fps >20ms ${String(r.moving.over20).padStart(3)} | calls ${r.draw.calls} | ${r.heapMB} MB | err ${r.errors.length}${r.hiddenTicks !== undefined ? ` | ticks hidden ${r.hiddenTicks}, back ${r.visibleTicks}` : ''}${r.perf?.tier ? ` | tier ${r.perf.tier} x${r.perf.scale}` : ''}`;
console.log(results.map(row).join('\n'));

let bad = 0;
if (args.budget && existsSync(args.budget)) {
  const prev = JSON.parse(readFileSync(args.budget, 'utf8')).results;
  for (const r of results) {
    const p = prev.find((x) => x.id === r.id);
    if (!p || r.error || p.error) continue;
    for (const k of ['benchPlain', 'benchLife']) {
      if (r[k] > p[k] * 1.3 + 1) { console.log(`REGRESSION ${r.id}.${k}: ${p[k]} -> ${r[k]} ms`); bad++; }
    }
  }
}
if (results.some((r) => r.errors?.length)) { console.log('CONSOLE ERRORS:', JSON.stringify(results.map((r) => [r.id, r.errors]).filter(([, e]) => e?.length))); bad++; }
process.exit(bad ? 1 : 0);
