// Row 19: the same check for the lesson courts, the kids' group and padel (they run on the page clock,
// so the clock is replaced: frozen and advanced by hand, 1/30 s a step).
//   node scripts/life/crowd-check.mjs [port=5173] [seconds=600]
const [,, port = '5173', seconds = '600'] = process.argv;
const { default: puppeteer } = await import(process.env.PUPPETEER ?? 'puppeteer-core');
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push(String(e.stack).slice(0, 300)));
await p.evaluateOnNewDocument(() => {
  const real = performance.now.bind(performance);
  let fixed = null;
  performance.now = () => fixed ?? real();
  window.__clock = { freeze() { fixed = real(); }, step(ms) { fixed += ms; } };
});
await p.goto(`http://localhost:${port}/booking.html?time=14:00`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__bp?.lifeDev()?.padel && window.__bp.lifeDev().players?.ready && document.getElementById('loading')?.hidden === true, { timeout: 280000, polling: 200 });
// the lesson, kids and padel systems load their atlases when a court needs them: ask for all three
await p.evaluate(() => { const d = window.__bp.lifeDev(); d.lessons.trigger('clay-2'); d.lessons.trigger('hard-1'); d.kids.trigger('clay-5'); d.padel.setCourts(['padel-1', 'padel-2', 'padel-3', 'padel-4']); });
await p.waitForFunction(() => { const d = window.__bp.lifeDev(); return d.padel.ready && typeof d.kids.people === 'function' && typeof d.lessons.people === 'function' && d.padel.people().length === 4; }, { timeout: 120000, polling: 300 });
await new Promise((r) => setTimeout(r, 3000));
const res = await p.evaluate(async (sec) => {
  const dev = window.__bp.lifeDev();
  const { BOUNDS, violations } = await import('/src/js/booking/life/court-bounds.js');
  await new Promise((r) => setTimeout(r, 500));
  window.__clock.freeze();
  const out = { bad: {}, n: 0, near: {}, who: {} };
  const dt = 1000 / 30;
  for (let k = 0; k < sec * 30; k++) {
    window.__clock.step(dt);
    dev.lessons.tick(); dev.kids.tick(); dev.padel.tick();
    if (k % 6) continue;
    for (const [sys, list] of [['lessons', dev.lessons.people()], ['kids', dev.kids.people()], ['padel', dev.padel.people()]]) {
      for (const r of list) {
        out.n++;
        const pad = sys === 'padel';
        const ps = r.who.map(([x, z, , o]) => (pad ? { out: false, dx: 0, dz: 0, px: x - r.c[0], pz: z - r.c[1] } : { out: !!o, dx: x - r.c[0], dz: z - r.c[1] }));
        let bad;
        if (pad) {
          bad = [];
          ps.forEach((q, i) => {
            if (Math.abs(q.px) > 10.02 || Math.abs(q.pz) > 5.02) bad.push(`walls p${i} ${q.px.toFixed(2)},${q.pz.toFixed(2)}`);
            if (Math.abs(q.px) < 0.68) bad.push(`net p${i} ${q.px.toFixed(2)}`);
            for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(q.px - ps[j].px, q.pz - ps[j].pz); if (d < 0.7) bad.push(`overlap p${i}-p${j} ${d.toFixed(2)}`); }
          });
        } else bad = violations(ps, sys === 'kids' ? 0.47 : undefined);
        for (const m of bad) { const key = `${sys} ${r.id} ${m.split(' ')[0]}`; out.bad[key] = (out.bad[key] ?? 0) + 1; if (!out.who[key]) out.who[key] = `${(k / 30).toFixed(1)}s ${m} ${sys === "kids" ? JSON.stringify(dev.kids.debug()) + JSON.stringify(r.who.map((w) => w.map((v) => typeof v === "number" ? +(v).toFixed(1) : v))) : ""}`; }
      }
    }
  }
  return out;
}, +seconds);
console.log(JSON.stringify({ ...res, errors: errs }, null, 1));
await b.close();
process.exit(Object.keys(res.bad).length ? 1 : 0);
