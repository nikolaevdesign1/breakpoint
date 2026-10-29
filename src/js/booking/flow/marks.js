import * as THREE from 'three';
import gsap from 'gsap';
import { COURTS } from '../../shared/availability.js';
import { pathGrid, route } from '../life/cat.js';
import { readInvite, onInviteShown } from './invite.js';

// Marks over the map for the booking flow (round 9). A flat DOM layer over the canvas, pinned to
// ground points with the camera rig, so the type stays crisp Switzer at any zoom:
// ("Your court" and the partner flags moved to club/flags.js in round 10: marker, leader line, label.)
// - The walk (row 20): after a booking (or when an invite opens the map), a dashed line in the site's
//   dash draws itself from the car park, along the footpaths (the cat's path grid), to the court gate,
//   with "3 min walk" at the gate. It stays until another court is opened.
// Registered as a life system: tick() re-pins the marks when the view moves. Hidden while the intro
// flight runs, under the booking tiles and in postcard mode.

const PARK = { x: 74, z: 52 }; // a bay in the car park, east of the club
const PARK_GATE = { x: 67, z: 44 }; // where the footpath leaves the car park
const WALK = 50; // m per minute: a stroll with a racket bag, from the car to the gate

export function createBookflowMarks({ root, rig }) {
  const grid = pathGrid(root, 1.2);
  const boxes = new Map();
  for (const c of COURTS) {
    const plane = root.getObjectByName(`${c.id}_hl`);
    if (plane) boxes.set(c.id, new THREE.Box3().setFromObject(plane));
  }
  if (!boxes.size) return null;

  const layer = document.createElement('div');
  layer.className = 'bf-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<svg class="bf-walk"><path class="bf-walk__under"/><path class="bf-walk__line"/></svg>';
  document.body.append(layer);
  const svg = layer.querySelector('svg');
  const under = svg.querySelector('.bf-walk__under');
  const line = svg.querySelector('.bf-walk__line');

  let walk = null; // { pts: [{x,z}], length, minutes, progress, courtId, el, start }
  let lastView = '';

  // --- The walk from the car park (row 20) ------------------------------------------------------

  /** Footpath route from the car park to the gate of a court nearest the way in; null without paths. */
  function plan(courtId) {
    const b = boxes.get(courtId);
    if (!grid || !b) return null;
    const near = (x, z) => {
      let best = -1;
      let bd = Infinity;
      for (const c of grid.cells) {
        const p = grid.centre(c);
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    };
    const from = near(PARK_GATE.x, PARK_GATE.z);
    // Breadth-first distances from the car park gate, then the court's gate: the path cell hugging
    // the court's fence that is closest to the way in.
    const dist = new Int32Array(grid.ok.length).fill(-1);
    const queue = [from];
    dist[from] = 0;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const x = c % grid.nx;
      const y = Math.floor(c / grid.nx);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx;
        const d = y + dy;
        if (a < 0 || d < 0 || a >= grid.nx || d >= grid.nz) continue;
        const n = d * grid.nx + a;
        if (!grid.ok[n] || dist[n] !== -1) continue;
        dist[n] = dist[c] + 1;
        queue.push(n);
      }
    }
    let gate = -1;
    let gd = Infinity;
    const pad = 2.2;
    for (const c of grid.cells) {
      if (dist[c] < 0) continue;
      const p = grid.centre(c);
      const inX = p.x > b.min.x - pad && p.x < b.max.x + pad;
      const inZ = p.z > b.min.z - pad && p.z < b.max.z + pad;
      if (!inX || !inZ) continue;
      if (dist[c] < gd) { gd = dist[c]; gate = c; }
    }
    if (gate < 0) return null;
    const path = route(grid, from, gate) ?? [];
    const g = grid.centre(gate);
    // Last step: through the gate onto the court's edge.
    const edge = { x: THREE.MathUtils.clamp(g.x, b.min.x + 1, b.max.x - 1), z: THREE.MathUtils.clamp(g.z, b.min.z + 1, b.max.z - 1) };
    const pts = [PARK, grid.centre(from), ...path, edge].map((p) => ({ x: p.x, z: p.z }));
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return { pts, length, minutes: Math.max(1, Math.round(length / WALK)), courtId };
  }

  function showWalk(courtId, { frame = true } = {}) {
    hideWalk(true);
    const w = plan(courtId);
    if (!w) return;
    walk = { ...w, progress: 0 };
    walk.el = document.createElement('div');
    walk.el.className = 'bf-mark bf-walk-label';
    walk.el.innerHTML = `<span>${w.minutes} min walk</span>`;
    walk.start = document.createElement('div');
    walk.start.className = 'bf-mark bf-walk-start';
    walk.start.innerHTML = '<span>P</span>';
    layer.append(walk.el, walk.start);
    svg.classList.add('is-on');
    if (frame) {
      const xs = w.pts.map((p) => p.x);
      const zs = w.pts.map((p) => p.z);
      const b = boxes.get(courtId);
      rig.frame({ minX: Math.min(...xs, b.min.x), maxX: Math.max(...xs, b.max.x), minZ: Math.min(...zs, b.min.z), maxZ: Math.max(...zs, b.max.z) }, { pad: 1.12, duration: 1.8 });
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.to(walk, {
      progress: 1, duration: still ? 0 : 1.8, delay: still ? 0 : 0.9, ease: 'power2.inOut',
      onUpdate: () => { lastView = ''; },
      onComplete: () => { walk?.el.classList.add('is-in'); },
    });
    requestAnimationFrame(() => walk?.start.classList.add('is-in'));
    lastView = '';
  }

  function hideWalk(now = false) {
    if (!walk) return;
    const w = walk;
    walk = null;
    gsap.killTweensOf(w);
    w.el.classList.remove('is-in');
    w.start.classList.remove('is-in');
    svg.classList.remove('is-on');
    setTimeout(() => { w.el.remove(); w.start.remove(); if (!walk) { line.removeAttribute('d'); under.removeAttribute('d'); } }, now ? 0 : 320);
  }

  // --- Pinning ------------------------------------------------------------------------------------

  function layout() {
    const hide = rig.flying?.();
    layer.classList.toggle('is-hidden', !!hide);
    if (hide) return;
    const w = innerWidth;
    const h = innerHeight;
    if (!walk) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // The part of the line drawn so far.
    const total = walk.length * walk.progress;
    const pts = [walk.pts[0]];
    let run = 0;
    for (let i = 1; i < walk.pts.length && run < total; i++) {
      const a = walk.pts[i - 1];
      const b = walk.pts[i];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (run + seg <= total) pts.push(b);
      else { const t = (total - run) / seg; pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
      run += seg;
    }
    const d = pts.map((p, i) => { const s = rig.screenOf(p.x, p.z); return `${i ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`; }).join('');
    line.setAttribute('d', d);
    under.setAttribute('d', d);
    const end = rig.screenOf(walk.pts.at(-1).x, walk.pts.at(-1).z);
    walk.el.style.transform = `translate3d(${Math.round(end.x)}px, ${Math.round(end.y)}px, 0)`;
    const s0 = rig.screenOf(walk.pts[0].x, walk.pts[0].z);
    walk.start.style.transform = `translate3d(${Math.round(s0.x)}px, ${Math.round(s0.y)}px, 0)`;
  }

  // --- Events -------------------------------------------------------------------------------------

  let pendingWalk = null;
  document.addEventListener('bp-booked', (e) => { if (e.detail?.courtId && !pendingWalk) pendingWalk = e.detail.courtId; });
  document.addEventListener('bp-hud', (e) => {
    document.body.classList.toggle('bf-hud', !!e.detail?.open);
    if (e.detail?.open) { hideWalk(); return; }
    if (!pendingWalk) return;
    const id = pendingWalk;
    pendingWalk = null;
    // After the sign has flipped in (interact/booked-sign.js), pull back to show the way in.
    gsap.delayedCall(3.2, () => { if (!document.body.classList.contains('hud-open')) showWalk(id); });
  });
  const invite = readInvite();
  if (invite) onInviteShown(() => gsap.delayedCall(3, () => showWalk(invite.courtId)));
  addEventListener('resize', () => { lastView = ''; });

  return {
    name: 'bookflow',
    tick() {
      const s = rig.state;
      const view = `${s.x.toFixed(2)}|${s.z.toFixed(2)}|${s.dist.toFixed(2)}|${innerWidth}x${innerHeight}|${rig.flying?.() ? 1 : 0}`;
      if (view !== lastView) { lastView = view; layout(); }
      return false; // DOM only: never asks the canvas for frames
    },
    debug: () => ({ walk: walk && { court: walk.courtId, minutes: walk.minutes, length: Math.round(walk.length), points: walk.pts.length, progress: +walk.progress.toFixed(2) } }),
    showWalk,
    hideWalk,
  };
}
