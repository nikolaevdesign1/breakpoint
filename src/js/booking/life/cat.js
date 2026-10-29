import * as THREE from 'three';
import gsap from 'gsap';
import { showCatCard } from './cat-card.js';
import { meow } from './meow.js';
import { spriteMesh, writeFrame, hideFrame, flush, framePair, mirrored, loadAtlas } from './sprite.js';

// The club cat (rows 95.5, 131, 137): a big ginger tabby that lives on the grounds. It strolls the
// paths, stops to stand and look round, sits (and now and then washes a paw), lies down for a while
// in the sun, and sometimes slips under the perimeter hedge to doze out of sight before strolling on.
// Flipbook sprites in eight headings (scripts/life/render_cat.py), cross-faded in time and, while it
// turns, between neighbouring headings; a card facing the drone plus a shadow on the ground.
//
// Catch it (click or tap, generous radius, rows 133–135): it meows (life/meow.js), hops in surprise
// with a burst of squares, the card with the 10% code comes up (cat-card.js) and it bolts for the
// hedge, turning up again a minute later. One catch per page load; every load is a new contest.

const DATA_URL = '/models/life/cat.json';
const atlas = (name, quality) => `/models/life/${name}${quality === 'low' ? '-lo' : ''}.webp`;

const CELL = 1.2; // m: walkable grid over the paths
const PICK_PX = 32; // minimum pick radius on screen
// A big Maine Coon rather than an average cat: at true size it was a few pixels even fully zoomed in.
const CAT_SCALE = 1.6;
const NEAR_VIEW = 26; // m: the cat strolls within sight of where the visitor is looking
const SHADOW_STRENGTH = 0.6;
const CUT = 0.14; // s: blend into a new clip from the last frame shown
const HOP = 0.5; // s: the surprised hop when caught
const TURN = { walk: 3.2, sneak: 2.2, run: 8 }; // rad/s
const FENCE = { minX: -34, maxX: 72, minZ: -58, maxZ: 80 }; // the club's perimeter fence
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The contest starts again on every page load (row 135): nothing is stored.
let caughtNow = false;

/** Walkable cells: grid points lying on the footpaths (triangles of the `paths` mesh, in plan). */
export function pathGrid(root, cell = CELL) { // round 7: the golf cart plans on a finer grid
  const paths = root.getObjectByName('paths');
  if (!paths?.isMesh) return null;
  paths.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(paths);
  box.min.x = Math.max(box.min.x, -36); // only the club itself: the paths mesh runs out to the entrance
  const nx = Math.ceil((box.max.x - box.min.x) / cell);
  const nz = Math.ceil((box.max.z - box.min.z) / cell);
  const ok = new Uint8Array(nx * nz);
  const g = paths.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const count = idx ? idx.count : pos.count;
  for (let t = 0; t < count; t += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(paths.matrixWorld);
    const x0 = Math.max(0, Math.floor((Math.min(v[0].x, v[1].x, v[2].x) - box.min.x) / cell));
    const x1 = Math.min(nx - 1, Math.ceil((Math.max(v[0].x, v[1].x, v[2].x) - box.min.x) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(v[0].z, v[1].z, v[2].z) - box.min.z) / cell));
    const z1 = Math.min(nz - 1, Math.ceil((Math.max(v[0].z, v[1].z, v[2].z) - box.min.z) / cell));
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const px = box.min.x + (i + 0.5) * cell;
        const pz = box.min.z + (j + 0.5) * cell;
        const d = (a, b) => (px - b.x) * (a.z - b.z) - (a.x - b.x) * (pz - b.z);
        const d1 = d(v[0], v[1]); const d2 = d(v[1], v[2]); const d3 = d(v[2], v[0]);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) ok[j * nx + i] = 1;
      }
    }
  }
  const y = box.max.y;
  const cells = [];
  for (let k = 0; k < ok.length; k++) if (ok[k]) cells.push(k);
  if (cells.length < 20) return null;
  return {
    nx, nz, ok, cells, y,
    centre: (k) => new THREE.Vector3(box.min.x + ((k % nx) + 0.5) * cell, y, box.min.z + (Math.floor(k / nx) + 0.5) * cell),
    cellAt: (x, z) => {
      const i = Math.floor((x - box.min.x) / cell);
      const j = Math.floor((z - box.min.z) / cell);
      return i >= 0 && j >= 0 && i < nx && j < nz ? j * nx + i : -1;
    },
  };
}

/** Shortest 8-way route between two walkable cells (BFS; the grid is small), corners rounded. */
export function route(grid, from, to) {
  const prev = new Int32Array(grid.ok.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (c === to) break;
    const i = c % grid.nx;
    const j = Math.floor(c / grid.nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= grid.nx || b >= grid.nz) continue;
      const n = b * grid.nx + a;
      if (!grid.ok[n] || prev[n] !== -1) continue;
      if (di && dj && (!grid.ok[j * grid.nx + a] || !grid.ok[b * grid.nx + i])) continue; // no corner cutting
      prev[n] = c;
      queue.push(n);
    }
  }
  if (prev[to] === -1) return null;
  const out = [];
  for (let c = to; c !== from; c = prev[c]) out.push(grid.centre(c));
  out.reverse();
  // Every point pulled towards its neighbours: turns become curves, not grid steps.
  return out.map((p, i) => (i === 0 || i === out.length - 1 ? p
    : p.clone().multiplyScalar(0.5).addScaledVector(out[i - 1], 0.25).addScaledVector(out[i + 1], 0.25)));
}

/** A burst of squares where the cat was caught: the site's square motif, in its palette. */
function burst(x, y) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'cat-burst';
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(y)}px`;
  const colors = ['var(--sun)', 'var(--clay)', 'var(--snow)', '#d7ff3a'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('i');
    const size = [6, 8, 10][i % 3];
    s.style.width = s.style.height = `${size}px`;
    s.style.background = colors[i % colors.length];
    box.append(s);
    const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
    const r = rand(34, 70);
    gsap.fromTo(s, { x: 0, y: 0, scale: 0.4, opacity: 1 }, {
      x: Math.cos(a) * r, y: Math.sin(a) * r - 14, scale: 1, opacity: 0, rotation: rand(-90, 90),
      duration: rand(0.55, 0.8), ease: 'power3.out',
    });
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 900);
}

export function createCat({ scene, root, camera, quality, hedge = [] }, { still }) {
  const grid = pathGrid(root);
  if (!grid) return null;
  const sys = { name: 'cat', tick: () => false };

  Promise.all([
    fetch(DATA_URL).then((r) => r.json()),
    loadAtlas(atlas('cat', quality)),
    loadAtlas(atlas('cat-shadow', quality)),
  ]).then(([data, bodyTex, shadowTex]) => {
    Object.assign(sys, build(data, bodyTex, shadowTex));
  }).catch((err) => console.warn('Cat failed', err));

  // Hiding spots: hedge bushes just outside the fence that a path runs close to.
  const hides = hedge.map((b) => {
    let best = -1;
    let bestD = Infinity;
    for (const c of grid.cells) {
      const p = grid.centre(c);
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { x: b.x, z: b.z, cell: best, d: bestD };
  }).filter((h) => h.cell >= 0 && h.d < 8);

  function build(data, bodyTex, shadowTex) {
    const body = spriteMesh(bodyTex, 1, { slide: 0.2, lift: 1.3 });
    const shadow = spriteMesh(shadowTex, 1, { ground: true, shadow: true, strength: SHADOW_STRENGTH });
    body.name = 'life_cat';
    shadow.name = 'life_cat_shadow';
    shadow.renderOrder = 1;
    scene.add(body, shadow);
    const H = data.headings;
    const has = (clip) => !!data.clips[clip];
    const fpsOf = (clip) => data.clips[clip].fps ?? data.fps;
    const lengthOf = (clip) => data.clips[clip].frames / fpsOf(clip);
    const speedOf = (mode) => (data.speed[mode] ?? data.speed.walk) * CAT_SCALE; // longer legs, longer strides

    const cat = {
      pos: grid.centre(pick(grid.cells)),
      heading: Math.random() * Math.PI * 2, // 0 = away from the camera (−z), clockwise
      clip: has('sit') ? 'sit' : 'walk',
      clipT: 0,
      plan: [], // queued steps: { clip, secs } | { go: [points], mode, hidden? } | { stroll: true }
      path: null,
      mode: 'idle', // idle | walk | sneak | run | away
      until: 0,
      visible: true,
      hop: 0, // seconds left of the surprised hop when caught
      hidden: false, // tucked under the hedge
    };
    let shown = null;
    let shownClip = '';
    let cutFrom = null;
    let cutAt = -1;

    const now = () => performance.now() / 1000;
    function play(clip, secs) {
      if (!has(clip)) return;
      cat.clip = clip;
      cat.clipT = 0;
      cat.mode = 'idle';
      cat.until = now() + (secs ?? lengthOf(clip));
    }
    function go(points, mode = 'walk') {
      cat.face = null; // round 9 (row 16): it looks where it goes
      cat.path = points;
      cat.mode = mode;
      cat.clip = has(mode) ? mode : 'walk';
      cat.clipT = 0;
    }

    // Ground point at the centre of the screen.
    const look = new THREE.Vector3();
    function viewCentre() {
      camera.getWorldDirection(look);
      const t = -camera.position.y / look.y;
      return new THREE.Vector3(camera.position.x + look.x * t, 0, camera.position.z + look.z * t);
    }
    const here = () => { const c = grid.cellAt(cat.pos.x, cat.pos.z); return c >= 0 && grid.ok[c] ? c : -1; };

    /** A destination 12–45 m off along the paths, preferably within sight of the current view. */
    function strollTarget() {
      const centre = viewCentre();
      for (let tries = 0; tries < 24; tries++) {
        const target = pick(grid.cells);
        const p = grid.centre(target);
        const d = p.distanceTo(cat.pos);
        if (d < 12 || d > 45) continue;
        if (tries < 16 && Math.hypot(p.x - centre.x, p.z - centre.z) > NEAR_VIEW) continue;
        const from = here();
        const path = from >= 0 ? route(grid, from, target) : [p];
        if (path?.length) return path;
      }
      return null;
    }

    /** Off to a hedge in view, a low sneak in under it, a doze out of sight, and back out. */
    function hide() {
      const centre = viewCentre();
      const near = hides.filter((h) => Math.hypot(h.x - centre.x, h.z - centre.z) < 34);
      const h = pick(near.length ? near : hides);
      const from = here();
      const path = h && from >= 0 ? route(grid, from, h.cell) : null;
      if (!path) { cat.plan.push({ stroll: true }); return; }
      cat.plan.push(
        { go: path, mode: 'walk' },
        { clip: 'stand', secs: rand(0.8, 1.6) },
        { go: [new THREE.Vector3(h.x, grid.y, h.z)], mode: 'sneak', hidden: true },
        { clip: 'liedown' },
        { clip: 'lie', secs: rand(16, 32) },
        { clip: 'getup' },
        { go: [grid.centre(h.cell)], mode: 'sneak', hidden: false },
      );
    }

    /** What a cat does next, once the last thing is done. */
    function decide() {
      const r = Math.random();
      if (cat.clip === 'lie') { cat.plan.push({ clip: 'getup' }, { clip: 'stand', secs: rand(1.5, 3.5) }); return; }
      if (cat.clip === 'sit' || cat.clip === 'lick') {
        if (r < 0.3) cat.plan.push({ clip: 'lick', secs: rand(3, 6) }, { clip: 'sit', secs: rand(3, 8) });
        else if (r < 0.55) cat.plan.push({ clip: 'liedown' }, { clip: 'lie', secs: rand(10, 24) });
        else cat.plan.push({ clip: 'standup' }, { stroll: true });
        return;
      }
      if (r < 0.14 && hides.length && !cat.hidden) { hide(); return; }
      if (r < 0.32) { cat.plan.push({ clip: 'stand', secs: rand(2, 5) }, { stroll: true }); return; }
      if (r < 0.7) { cat.plan.push({ clip: 'sitdown' }, { clip: 'sit', secs: rand(4, 12) }); return; }
      cat.plan.push({ stroll: true });
    }

    function next() {
      if (!cat.plan.length) decide();
      const s = cat.plan.shift();
      if (!s) return;
      if (s.stroll) {
        const path = strollTarget();
        if (path) go(path, 'walk'); else play('sit', rand(4, 8));
      } else if (s.go) {
        if (s.hidden !== undefined) cat.hidden = s.hidden;
        go(s.go, s.mode);
      } else play(s.clip, s.secs);
    }

    function bolt(fromScreen) {
      // Away from where the visitor clicked, to the nearest stretch of the hedge, then out of sight.
      const options = [
        new THREE.Vector3(FENCE.minX - 2.2, cat.pos.y, cat.pos.z),
        new THREE.Vector3(FENCE.maxX + 2.2, cat.pos.y, cat.pos.z),
        new THREE.Vector3(cat.pos.x, cat.pos.y, FENCE.minZ - 2.2),
        new THREE.Vector3(cat.pos.x, cat.pos.y, FENCE.maxZ + 2.2),
      ];
      const at = cat.pos.clone().project(camera);
      const away = new THREE.Vector2(at.x - fromScreen.x, at.y - fromScreen.y).normalize();
      let best = options[0]; let bestScore = -Infinity;
      for (const o of options) {
        const s = o.clone().project(camera);
        const dir = new THREE.Vector2(s.x - at.x, s.y - at.y).normalize();
        const score = dir.dot(away) * 30 - o.distanceTo(cat.pos);
        if (score > bestScore) { bestScore = score; best = o; }
      }
      cat.plan = [];
      cat.hidden = false;
      cat.scurry = false; // round 9 (row 16): caught mid-dash, it leaves for good
      go([best], 'run');
    }

    function step(t, dt) {
      if (cat.mode === 'away') {
        if (t > cat.until) {
          // Back in through a hedge, onto a path.
          cat.pos = grid.centre(pick(grid.cells));
          cat.visible = true;
          cat.plan = [{ stroll: true }];
          next();
        }
        return;
      }
      cat.clipT += dt;
      if (cat.mode === 'walk' || cat.mode === 'sneak' || cat.mode === 'run') {
        let left = speedOf(cat.mode) * dt;
        while (left > 0 && cat.path?.length) {
          const goal = cat.path[0];
          const d = Math.hypot(goal.x - cat.pos.x, goal.z - cat.pos.z);
          if (d <= left) {
            cat.pos.x = goal.x; cat.pos.z = goal.z;
            left -= d;
            cat.path.shift();
          } else {
            cat.pos.x += ((goal.x - cat.pos.x) / d) * left;
            cat.pos.z += ((goal.z - cat.pos.z) / d) * left;
            left = 0;
          }
          // Turn smoothly towards the way ahead (a cat doesn't snap round).
          const target = Math.atan2(goal.x - cat.pos.x, -(goal.z - cat.pos.z));
          let dh = target - cat.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          const turn = TURN[cat.mode] * dt;
          if (d > 0.05) cat.heading += Math.max(-turn, Math.min(turn, dh));
        }
        if (!cat.path?.length) {
          if (cat.mode === 'run' && !cat.scurry) { cat.visible = false; cat.mode = 'away'; cat.until = t + rand(50, 90); return; }
          cat.scurry = false; // round 9 (row 16): a short dash from the pointer ends here
          next();
        }
        return;
      }
      if (cat.face != null) { // round 9 (row 16): turning to look at the pointer
        let dh = cat.face - cat.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const turn = TURN.walk * dt;
        cat.heading += Math.max(-turn, Math.min(turn, dh));
      }
      if (t > cat.until) next();
    }

    // Caught: a quick surprised hop (squash, stretch up, land) on the body rect.
    const hopped = [[], []];
    let hopK = 0;
    function squash(f, sy) {
      if (sy === 1) return f;
      const out = hopped[hopK++ % 2];
      for (let k = 0; k < 8; k++) out[k] = f[k];
      out[5] = f[5] * sy;
      out[7] = f[7] * sy;
      return out;
    }

    // Headings 5–7 are stored as mirror images of 3–1: entries [body, shadow, 1].
    const bodyOf = (e) => (e[2] ? mirrored(data.body[e[0]]) : data.body[e[0]]);

    function write(t) {
      if (!cat.visible) { hideFrame(body, 0); hideFrame(shadow, 0); flush(body); flush(shadow); return; }
      const c = data.clips[cat.clip];
      const fps = fpsOf(cat.clip);
      // Heading: the nearest of the eight; while it turns, cross-faded with the next one inside a
      // narrow band (a steady cat shows one clean sprite).
      const hf = ((((cat.heading / (Math.PI * 2)) * H) % H) + H) % H;
      const h0 = Math.floor(hf);
      const h1 = (h0 + 1) % H;
      const ht = THREE.MathUtils.smoothstep(hf - h0, 0.38, 0.62);
      const frames = data.frames[cat.clip];
      const clipA = frames[ht < 0.5 ? h0 : h1];
      let [i, j, ft] = framePair(clipA.length, fps, cat.clipT, c.loop);
      let a = bodyOf(clipA[i]);
      let b = bodyOf(clipA[j]);
      if (ht > 0.02 && ht < 0.98) { a = bodyOf(frames[h0][i]); b = bodyOf(frames[h1][i]); ft = ht; }
      if (cat.clip !== shownClip) { cutFrom = shown; cutAt = t; shownClip = cat.clip; }
      if (cutFrom && t - cutAt < CUT) { b = a; a = cutFrom; ft = (t - cutAt) / CUT; }
      shown = ft < 0.5 ? a : b;
      let sy = 1;
      let lift = 0;
      if (cat.hop > 0) {
        const k = 1 - cat.hop / HOP;
        lift = Math.sin(Math.PI * Math.min(1, k * 1.25)) * 0.16 * CAT_SCALE;
        sy = k < 0.15 ? 1 - k * 1.6 : k < 0.6 ? 1.12 : 1 - (1 - k) * 0.2;
      }
      writeFrame(body, 0, squash(a, sy), squash(b, sy), ft, cat.pos.x, cat.pos.y + lift, cat.pos.z, CAT_SCALE);
      const [si, sj, st] = framePair(clipA.length, fps, cat.clipT, c.loop, data.shadowEvery ?? 1);
      const s0 = clipA[si][1];
      const s1 = clipA[sj][1];
      if (s0 >= 0) writeFrame(shadow, 0, data.shadow[s0], data.shadow[s1 >= 0 ? s1 : s0], st, cat.pos.x, cat.pos.y + 0.004, cat.pos.z, CAT_SCALE);
      else hideFrame(shadow, 0);
      flush(body);
      flush(shadow);
    }

    const tmp = new THREE.Vector3();
    function screenAt() {
      tmp.set(cat.pos.x, cat.pos.y + 0.15 * CAT_SCALE, cat.pos.z).project(camera);
      return { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight };
    }
    function hit(x, y, touch) {
      if (!cat.visible || (cat.mode === 'run' && !cat.scurry) || cat.mode === 'away' || cat.hop > 0 || caughtNow) return false;
      const s = screenAt();
      // Half a metre around the cat in screen pixels, never less than a fingertip.
      tmp.set(cat.pos.x + 0.5 * CAT_SCALE, cat.pos.y + 0.15 * CAT_SCALE, cat.pos.z).project(camera);
      const r = Math.max(touch ? PICK_PX * 1.6 : PICK_PX, Math.abs(((tmp.x + 1) / 2) * innerWidth - s.x));
      return Math.hypot(x - s.x, y - s.y) < r;
    }

    let last = now();
    let drawn = false; // one frame once the sprites are in, even when nothing else moves
    if (still) play(cat.clip, 1e9); else next();
    return {
      tick() {
        const t = now();
        const dt = Math.min(0.1, t - last);
        last = t;
        if (cat.hop > 0) {
          cat.hop -= dt;
          if (cat.hop <= 0 && !still) bolt(cat.boltFrom);
        } else if (!still) step(t, dt);
        write(t);
        const first = !drawn;
        drawn = true;
        return first || (cat.visible && !still);
      },
      pick(x, y) { return hit(x, y, false) ? 'cat' : null; },
      click(x, y, touch) {
        if (!hit(x, y, touch)) return false;
        caughtNow = true;
        meow();
        const s = screenAt();
        burst(s.x, s.y - 10);
        cat.boltFrom = { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 };
        cat.hop = still ? 0.001 : HOP;
        setTimeout(showCatCard, still ? 0 : 420);
        return true;
      },
      /** Round 9 (row 16, fun/cat-notice.js): the pointer has rested near: stop and turn to look at ground point x, z. */
      notice(x, z) {
        if (!cat.visible || cat.hidden || cat.mode === 'run' || cat.mode === 'away' || cat.hop > 0 || caughtNow || still) return false;
        if (cat.mode !== 'idle') { cat.path = null; play(has('stand') ? 'stand' : cat.clip, 3); }
        else cat.until = Math.max(cat.until, now() + 3);
        cat.plan = [];
        cat.face = Math.atan2(x - cat.pos.x, -(z - cat.pos.z));
        return true;
      },
      /** Round 9 (row 16): then a quick dash 7–14 m along the paths, away from x, z; it can still be caught. */
      scurry(x, z) {
        if (!cat.visible || cat.hidden || cat.mode === 'run' || cat.mode === 'away' || cat.hop > 0 || caughtNow || still) return false;
        const from = here();
        if (from < 0) return false;
        const ax = cat.pos.x - x;
        const az = cat.pos.z - z;
        const al = Math.hypot(ax, az) || 1;
        let best = null;
        let bestScore = -Infinity;
        for (const c of grid.cells) {
          const p = grid.centre(c);
          const d = Math.hypot(p.x - cat.pos.x, p.z - cat.pos.z);
          if (d < 7 || d > 14) continue;
          const score = ((p.x - cat.pos.x) * ax + (p.z - cat.pos.z) * az) / (d * al);
          if (score > bestScore) { bestScore = score; best = c; }
        }
        const path = best !== null && bestScore > 0 ? route(grid, from, best) : null;
        if (!path?.length) return false;
        cat.plan = [{ clip: 'stand', secs: rand(1, 2) }, { clip: 'sitdown' }, { clip: 'sit', secs: rand(5, 10) }];
        cat.scurry = true;
        go(path, 'run');
        return true;
      },
      /** Ground position (dev checks). */
      where: () => (cat.visible ? { x: cat.pos.x, z: cat.pos.z } : null),
      debug: () => ({ mode: cat.mode, clip: cat.clip, x: +cat.pos.x.toFixed(1), z: +cat.pos.z.toFixed(1), heading: +cat.heading.toFixed(2), path: cat.path?.length ?? 0, plan: cat.plan.length, visible: cat.visible, hidden: cat.hidden, cells: grid.cells.length, hides: hides.length }),
      /** Dev: where the cat is on screen. */
      screen() { return { ...screenAt(), world: [cat.pos.x, cat.pos.z] }; },
      /** Dev: put it somewhere, facing `heading`. */
      place(x, z, heading = cat.heading) { cat.pos.set(x, grid.y, z); cat.heading = heading; cat.path = null; },
      /** Dev: make it do something now ('hide', 'lie', or any clip). */
      act(what) {
        cat.plan = [];
        if (what === 'hide') { hide(); next(); } else if (what === 'lie') { cat.plan.push({ clip: 'liedown' }, { clip: 'lie', secs: 30 }); next(); } else play(what, 30);
      },
    };
  }

  return sys;
}
