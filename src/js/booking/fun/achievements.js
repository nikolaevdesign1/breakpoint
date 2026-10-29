import '../../../css/booking-mapsound.css';
import { dusk } from '../life/dusk.js';
import { onWeather } from '../life/sky.js';
import { createListener } from '../sound/listener.js';

// Club finds (round 9, row 19): small things a visitor can come across on the map. A badge next to
// the logo keeps the count (the club's tennis ball and "3/9"); a click opens the list, found ones
// in white, the rest with a hint. Each new find shows a short plate under the badge. Kept in this
// browser (localStorage); nothing is sent anywhere.

const KEY = 'bp-finds';
export const FINDS = [
  { id: 'cat', name: 'Found the cat', hint: 'It wanders the grounds, mostly out of sight' },
  { id: 'sunset', name: 'Saw a sunset', hint: 'Golden hour, live or from the time bar' },
  { id: 'rally', name: 'Watched a full rally', hint: 'Zoom in on a match, serve to last shot' },
  { id: 'night', name: 'Night owl', hint: 'Look in after dark' },
  { id: 'rain', name: 'Rain check', hint: 'Wait for Miami rain, or tap the weather' },
  { id: 'storm', name: 'Stayed for the storm', hint: 'After the rain comes the thunder' },
  { id: 'keeper', name: 'Met the keeper', hint: 'He looks after the courts. Get close' },
  { id: 'cafe', name: 'Last orders', hint: 'The café deck, one evening' },
  { id: 'day', name: 'A day in 20 seconds', hint: 'Play the day from the time bar' },
];
const CAFE = { x: 55, z: -47 };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

// --- Badge, list and plate -------------------------------------------------------------------

function mountUi(found) {
  const top = document.querySelector('[data-top]');
  const back = top?.querySelector('.bp-back');
  if (!top || !back) return null;
  const wrap = document.createElement('div');
  wrap.className = 'bp-finds';
  wrap.innerHTML = `
    <button class="bp-finds__badge" type="button" aria-expanded="false" aria-controls="bp-finds-list">
      <svg class="bp-finds__ball" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M2.6 3.6C6 5 6 11 2.6 12.4M13.4 3.6C10 5 10 11 13.4 12.4" fill="none" stroke="#121211" stroke-width="1.2"/></svg>
      <span class="bp-finds__count" data-finds-count></span>
    </button>
    <div class="bp-finds__panel" id="bp-finds-list" role="dialog" aria-label="Club finds" hidden>
      <p class="bp-finds__head"><span>Club finds</span><span data-finds-of></span></p>
      <ul class="bp-finds__list" data-finds-list></ul>
    </div>
    <p class="bp-finds__toast" role="status" aria-live="polite" hidden><b data-toast-name></b><span data-toast-of></span></p>`;
  back.after(wrap);
  const badge = wrap.querySelector('.bp-finds__badge');
  const panel = wrap.querySelector('.bp-finds__panel');
  const list = wrap.querySelector('[data-finds-list]');
  const toast = wrap.querySelector('.bp-finds__toast');

  function render() {
    const n = FINDS.filter((f) => found[f.id]).length;
    wrap.querySelector('[data-finds-count]').textContent = `${n}/${FINDS.length}`;
    wrap.querySelector('[data-finds-of]').textContent = `${n} of ${FINDS.length}`;
    badge.setAttribute('aria-label', `Club finds, ${n} of ${FINDS.length}`);
    list.innerHTML = FINDS.map((f) => `<li class="bp-finds__item${found[f.id] ? ' is-found' : ''}"><span class="bp-finds__name">${f.name}</span>${found[f.id] ? '' : `<span class="bp-finds__hint">${f.hint}</span>`}</li>`).join('');
  }

  let open = false;
  function setOpen(v) {
    open = v;
    badge.setAttribute('aria-expanded', String(v));
    if (v) {
      hideToast();
      panel.hidden = false;
      requestAnimationFrame(() => panel.classList.add('is-on'));
    } else {
      panel.classList.remove('is-on');
      setTimeout(() => { if (!open) panel.hidden = true; }, 260);
    }
  }
  badge.addEventListener('click', () => setOpen(!open));
  document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { setOpen(false); badge.focus(); } });

  let toastTimer = 0;
  function hideToast() {
    clearTimeout(toastTimer);
    toast.classList.remove('is-on');
    toastTimer = setTimeout(() => { toast.hidden = true; }, 300);
  }
  function show(f) {
    render();
    badge.classList.remove('is-new');
    void badge.offsetWidth; // restart the bump
    badge.classList.add('is-new');
    if (open) return;
    clearTimeout(toastTimer);
    toast.querySelector('[data-toast-name]').textContent = f.name;
    const n = FINDS.filter((x) => found[x.id]).length;
    toast.querySelector('[data-toast-of]').textContent = `Club finds · ${n} of ${FINDS.length}`;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-on'));
    toastTimer = setTimeout(hideToast, 3600);
  }
  toast.addEventListener('click', () => { hideToast(); setOpen(true); });
  render();
  return { show, render };
}

// --- Watching the map --------------------------------------------------------------------------

export function createAchievements({ rig, players, keeper, squeegee, clubhouse }) {
  const found = read();
  const ui = mountUi(found);
  const ear = createListener(rig);

  function earn(id) {
    if (found[id]) return;
    const f = FINDS.find((x) => x.id === id);
    if (!f) return;
    found[id] = Date.now();
    write(found);
    ui?.show(f);
    document.dispatchEvent(new CustomEvent('bp-find', { detail: { id } }));
  }

  document.addEventListener('bp-cat-caught', () => earn('cat'));
  document.addEventListener('bp-thunder', () => earn('storm'));
  document.addEventListener('bp-timelapse', (e) => { if (e.detail?.done) earn('day'); });
  let rain = 0;
  onWeather((d) => { rain = d.rain ?? 0; });

  // Conditions held for a moment (s) before they count.
  const held = {};
  const hold = (id, on, dt, need) => {
    held[id] = on ? (held[id] ?? 0) + dt : 0;
    if (held[id] >= need) earn(id);
  };

  // A rally watched from the serve to the last shot, the drone close and the court in view.
  const watch = new Map(); // court id → shots when we started watching (null: joined mid-point)
  function rallies(dt) {
    if (!players?.courts) return;
    const close = rig.state.dist < 60;
    for (const id of players.courts()) {
      const g = players.game(id);
      if (!g) continue;
      const c = g.court;
      const seen = close && ear.reach(c.x, c.z, 0.45) > 0.25;
      if (!seen) { watch.delete(id); continue; }
      const w = watch.get(id);
      const serving = !!g.toss || (g.ball && !g.pointOver && (g.shots ?? 0) <= 1);
      if (!w) { watch.set(id, serving || !g.ball ? { from: 0 } : null); continue; } // joined mid-point: wait for the next serve
      if (g.pointOver) {
        if ((g.shots ?? 0) >= 4) earn('rally');
        watch.set(id, null);
      }
    }
    void dt;
  }

  let last = performance.now() / 1000;
  let acc = 0;
  return {
    name: 'achievements',
    tick() {
      const now = performance.now() / 1000;
      const dt = Math.min(0.5, now - last);
      last = now;
      acc += dt;
      rallies(dt);
      if (acc < 0.25) return false;
      const step = acc;
      acc = 0;
      const d = dusk();
      hold('sunset', d.afternoon && d.elevation > -1.5 && d.elevation < 3.5, step, 1.2);
      hold('night', d.elevation < -9, step, 2);
      hold('rain', rain > 0, step, 3);
      const near = rig.state.dist < 62;
      const k = keeper?.where?.() ?? squeegee?.where?.();
      hold('keeper', near && k && ear.reach(k.x, k.z, 0.5) > 0.2, step, 2);
      const deck = clubhouse?.debug?.().cafe ?? 0;
      hold('cafe', near && deck > 0.5 && ear.reach(CAFE.x, CAFE.z, 0.6) > 0.3, step, 2);
      return false;
    },
    debug: () => ({ found: Object.keys(found), watching: [...watch.entries()].filter(([, w]) => w).map(([id]) => id) }),
    /** Dev: forget every find (and redraw the badge). */
    reset() { for (const k of Object.keys(found)) delete found[k]; write(found); ui?.render(); },
    earn,
  };
}
