import * as THREE from 'three';
import gsap from 'gsap';

// Drone camera: hangs over the padel side of the club (+z) and looks across it towards −z,
// tilted down and square to the court axes — screen right = +x, screen up = −z.
// Touch drag pans 1:1 (the ground point under the finger stays under it); a mouse drag moves the
// ground at MOUSE_PAN of the pointer and the camera eases after it (row 182); both end in a short glide;
// trackpad swipes pan; pinch, Ctrl/⌘ + wheel and mouse wheel zoom towards the cursor;
// touch: one finger pans, two pinch.

const FOV = 34;
const PITCH = THREE.MathUtils.degToRad(52); // camera tilt below the horizon
const DIST_MIN = 30; // metres from the camera to the ground point at screen centre
const DIST_MAX = 92; // on landscape screens; portrait phones may pull back a little further (row 79: closer, so less world to draw)
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const CLICK_SLOP = 5; // px a press may travel and still count as a click
// Row 182: the map moved too fast under the mouse. A mouse drag moves the ground at this share of
// the pointer and the camera eases after it; touch keeps 1:1 (the finger holds the ground).
const MOUSE_PAN = 0.62;
const SWIPE_PAN = 0.6; // trackpad two-finger swipe
const WHEEL_ZOOM = 0.0012; // per wheel pixel (was 0.0022)
const PINCH_ZOOM = 0.008; // per ctrl+wheel pixel (was 0.011)
const FOLLOW = 9; // 1/s: how fast the camera catches up with the goal (was 14)
const FLICK = 0.5; // share of the release speed that coasts on (was 0.9)

// Fixed orientation → a fixed camera basis.
const BACK = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)); // target → camera
const FWD = BACK.clone().negate();
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3().crossVectors(RIGHT, FWD);

export function createCameraRig(canvas, { bounds }) {
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 5, 900); // near 5: depth precision for coplanar paths

  // `cur` is what the camera shows; `goal` is where smoothed input (mouse wheel) is heading.
  const cur = { x: 18, z: -6, dist: 150 };
  const goal = { ...cur };
  let tween = null;
  const listeners = new Set();

  const distMax = () => Math.max(DIST_MAX, 72 / (2 * TAN * camera.aspect));

  function clamp(s) {
    s.dist = THREE.MathUtils.clamp(s.dist, DIST_MIN, distMax());
    // East of the car park there is only the tree belt (row 140): the further out the drone is,
    // the less far east it may pan, so the right edge of the view stays near `edgeX` (`edgeMinX` west).
    const half = s.dist * TAN * camera.aspect;
    const maxX = bounds.edgeX === undefined ? bounds.maxX
      : THREE.MathUtils.clamp(bounds.edgeX - half, bounds.minX, bounds.maxX);
    // Same on the west side (row 152): past the perimeter fence there is only a strip of trees.
    const minX = bounds.edgeMinX === undefined ? bounds.minX
      : THREE.MathUtils.clamp(bounds.edgeMinX + half, bounds.minX, maxX);
    s.x = THREE.MathUtils.clamp(s.x, minX, maxX);
    // Row 177: the top and bottom edges too, so a pulled-back drone doesn't show the empty belt
    // beyond the trees. `halfZ` is roughly half the ground the view covers along z.
    const halfZ = (s.dist * TAN) / Math.sin(PITCH);
    const maxZ = bounds.edgeMaxZ === undefined ? bounds.maxZ
      : THREE.MathUtils.clamp(bounds.edgeMaxZ - halfZ, bounds.minZ, bounds.maxZ);
    const minZ = bounds.edgeMinZ === undefined ? bounds.minZ
      : THREE.MathUtils.clamp(bounds.edgeMinZ + halfZ, bounds.minZ, maxZ);
    s.z = THREE.MathUtils.clamp(s.z, minZ, maxZ);
    return s;
  }

  const origin = (s) => new THREE.Vector3(s.x, 0, s.z).addScaledVector(BACK, s.dist);

  /** Ground point (y = 0) under a screen pixel for a given camera state. */
  function groundAt(px, py, s = cur) {
    const nx = (px / innerWidth) * 2 - 1;
    const ny = 1 - (py / innerHeight) * 2;
    const dir = FWD.clone()
      .addScaledVector(RIGHT, nx * TAN * camera.aspect)
      .addScaledVector(UP, ny * TAN);
    const o = origin(s);
    const t = dir.y < -1e-4 ? -o.y / dir.y : 1e4; // rays above the horizon: clamp far away
    return { x: o.x + dir.x * t, z: o.z + dir.z * t };
  }

  /** Screen pixel of a ground point for a given camera state. */
  function screenOf(x, z, s = cur) {
    const v = new THREE.Vector3(x, 0, z).sub(origin(s));
    const depth = v.dot(FWD);
    return {
      x: ((v.dot(RIGHT) / (depth * TAN * camera.aspect) + 1) / 2) * innerWidth,
      y: ((1 - v.dot(UP) / (depth * TAN)) / 2) * innerHeight,
    };
  }

  function apply() {
    if (orient.pitch || orient.yaw) camera.position.copy(cineOrigin(cur)); // round 8: intro flight only
    else camera.position.copy(origin(cur));
    camera.lookAt(cur.x, 0, cur.z);
    listeners.forEach((fn) => fn(cur));
  }

  function stopMotion() {
    tween?.kill();
    tween = null;
    inertia.vx = inertia.vz = 0;
  }

  /** Move both the view and the goal (direct manipulation). */
  function jumpBy(dx, dz) {
    goal.x += dx; goal.z += dz;
    cur.x += dx; cur.z += dz;
    clamp(goal); clamp(cur);
  }

  /** Zoom so the ground point under (px, py) stays under it. */
  function zoomAt(px, py, factor, s = goal) {
    const before = groundAt(px, py, s);
    s.dist = THREE.MathUtils.clamp(s.dist * factor, DIST_MIN, distMax());
    const after = groundAt(px, py, s);
    s.x += before.x - after.x;
    s.z += before.z - after.z;
    clamp(s);
  }

  // --- Frame loop: glide towards the goal, coast after a flick ----------------

  const inertia = { vx: 0, vz: 0 };
  gsap.ticker.add((_, deltaMs) => {
    const dt = Math.min(deltaMs, 64) / 1000;
    if (!dragging && (inertia.vx || inertia.vz)) {
      jumpBy(inertia.vx * dt, inertia.vz * dt);
      const decay = Math.exp(-dt * 7);
      inertia.vx *= decay;
      inertia.vz *= decay;
      if (Math.hypot(inertia.vx, inertia.vz) < cur.dist * 0.01) inertia.vx = inertia.vz = 0;
    }
    if (!tween && !cine) {
      const k = 1 - Math.exp(-dt * FOLLOW);
      cur.x += (goal.x - cur.x) * k;
      cur.z += (goal.z - cur.z) * k;
      cur.dist += (goal.dist - cur.dist) * k;
    }
    apply();
  });

  // --- Pointer: one pointer pans, two pinch ---------------------------------

  const pointers = new Map();
  let dragging = false;
  let travel = 0;
  let anchor = null; // ground point grabbed by the pointer(s)
  let pinchGap = 0;
  let samples = [];

  function centroid() {
    const pts = [...pointers.values()];
    const x = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const y = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    const gap = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { x, y, gap };
  }

  function regrab() {
    const c = centroid();
    anchor = groundAt(c.x, c.y);
    pinchGap = c.gap;
    samples = [];
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (cine) { travel = Infinity; return; } // round 8: this press only ends the intro flight (not a click)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopMotion();
    Object.assign(goal, cur);
    dragging = true;
    if (pointers.size === 1) travel = 0;
    regrab();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    travel += Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (e.pointerType === 'mouse' && pointers.size === 1) {
      // Mouse: the ground slides by a share of the pointer's move and the camera eases after it.
      const a = groundAt(p.x, p.y);
      const b = groundAt(e.clientX, e.clientY);
      p.x = e.clientX; p.y = e.clientY;
      const dx = (a.x - b.x) * MOUSE_PAN;
      const dz = (a.z - b.z) * MOUSE_PAN;
      goal.x += dx;
      goal.z += dz;
      clamp(goal);
      const now = performance.now();
      samples.push({ t: now, x: dx, z: dz });
      samples = samples.filter((q) => now - q.t < 90);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;

    const c = centroid();
    if (pointers.size > 1 && pinchGap > 0 && c.gap > 0) {
      cur.dist = THREE.MathUtils.clamp(cur.dist * (pinchGap / c.gap), DIST_MIN, distMax());
      pinchGap = c.gap;
    }
    // Keep the grabbed ground point exactly under the pointer (or the pinch centre).
    const g = groundAt(c.x, c.y);
    const dx = anchor.x - g.x;
    const dz = anchor.z - g.z;
    jumpBy(dx, dz);
    Object.assign(goal, cur);
    const now = performance.now();
    samples.push({ t: now, x: dx, z: dz });
    samples = samples.filter((q) => now - q.t < 90);
  });

  const release = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size > 0) { regrab(); return; } // pinch → one-finger pan continues smoothly
    dragging = false;
    // Flick: carry the last ~90 ms of motion forward and let it bleed off.
    if (samples.length > 1 && travel > CLICK_SLOP) {
      const span = Math.max(16, samples[samples.length - 1].t - samples[0].t);
      inertia.vx = (samples.reduce((a, q) => a + q.x, 0) / span) * 1000 * FLICK;
      inertia.vz = (samples.reduce((a, q) => a + q.z, 0) / span) * 1000 * FLICK;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // --- Wheel: trackpad swipe pans, pinch / modifier / mouse wheel zooms -------

  // Trackpads stream small pixel deltas, often with deltaX; mouse wheels send discrete notches:
  // line mode (Firefox), multiples of 4.000244 (Chrome on macOS) or whole ±100+ steps.
  const isMouseWheel = (e) => {
    if (e.deltaMode !== 0) return true;
    if (e.deltaX !== 0 || e.deltaY === 0) return false;
    if (e.deltaY % 4.000244140625 === 0) return true;
    return Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY) && (!e.wheelDeltaY || e.wheelDeltaY % 120 === 0);
  };

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (cine) return; // round 8: ends the intro flight (cinematic's own listener)
    if (tween) { tween.kill(); tween = null; Object.assign(goal, cur); }
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas; a ctrl+mouse notch is ~100.
      const d = THREE.MathUtils.clamp(e.deltaY, -40, 40);
      zoomAt(e.clientX, e.clientY, Math.exp(d * PINCH_ZOOM), cur);
      Object.assign(goal, cur);
    } else if (isMouseWheel(e)) {
      const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(e.clientX, e.clientY, Math.exp(THREE.MathUtils.clamp(step, -160, 160) * WHEEL_ZOOM));
    } else {
      // Content follows the fingers: the ground slides by the swipe, measured at screen centre.
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const a = groundAt(cx, cy);
      const b = groundAt(cx - e.deltaX * SWIPE_PAN, cy - e.deltaY * SWIPE_PAN);
      jumpBy(a.x - b.x, a.z - b.z);
    }
  }, { passive: false });

  // --- Programmatic moves ------------------------------------------------------

  /** Glide to a camera state (duration 0 = jump). */
  function flyTo({ x, z, dist = cur.dist }, { duration = 1.4 } = {}) {
    if (cine) releaseCinematic(Math.min(duration || 0.3, 0.6)); // round 8: a programmatic move takes over
    stopMotion();
    const to = clamp({ x, z, dist });
    Object.assign(goal, to);
    if (!duration) { Object.assign(cur, to); apply(); return; }
    tween = gsap.to(cur, {
      ...to,
      duration,
      ease: 'expo.inOut',
      onComplete: () => { tween = null; },
    });
  }

  /**
   * Frame a ground rectangle inside the screen minus `inset` (panel / sheet).
   * Perspective makes this non-linear, so it converges in a few passes:
   * scale the distance to fit, then slide the target to centre the rectangle.
   */
  function frame({ minX, maxX, minZ, maxZ }, { inset = {}, pad = 1.18, duration, dry = false } = {}) {
    const { right = 0, bottom = 0 } = inset;
    const areaW = (innerWidth - right) / pad;
    const areaH = (innerHeight - bottom) / pad;
    const ax = (innerWidth - right) / 2;
    const ay = (innerHeight - bottom) / 2;
    const s = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, dist: cur.dist };
    const corners = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
    const measure = () => {
      const pts = corners.map(([x, z]) => screenOf(x, z, s));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    for (let i = 0; i < 6; i++) {
      const m = measure();
      s.dist = THREE.MathUtils.clamp(s.dist * Math.max(m.w / areaW, m.h / areaH), DIST_MIN, distMax());
      const n = measure();
      const from = groundAt(n.cx, n.cy, s);
      const to = groundAt(ax, ay, s);
      s.x += from.x - to.x;
      s.z += from.z - to.z;
    }
    if (dry) return clamp(s); // round 8: just the camera state (intro.js ends its flight there)
    flyTo(s, { duration });
  }

  /** Was the last press a drag? (clicks after a drag must not open courts) */
  const wasDrag = () => travel > CLICK_SLOP;

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }

  // --- Cinematic flight (round 8, intro.js) -------------------------------------------
  // A one-off camera path over the club: keys { x, z, dist, pitch?, yaw? } passed through by a
  // Catmull-Rom spline, unclamped. `pitch` and `yaw` are temporary offsets (radians) from the
  // fixed drone basis; the last key is a normal view with both at 0, so the rig ends exactly on its
  // fixed basis. Any input (press, wheel, key, touch) ends it: the rest is covered in `skip` s.

  const orient = { pitch: 0, yaw: 0 };
  let cine = null; // { tween, end, done, finishing }
  const cineBack = new THREE.Vector3();

  function cineOrigin(s) {
    const p = PITCH + orient.pitch;
    cineBack.set(Math.sin(orient.yaw) * Math.cos(p), Math.sin(p), Math.cos(orient.yaw) * Math.cos(p));
    return new THREE.Vector3(s.x, 0, s.z).addScaledVector(cineBack, s.dist);
  }

  const INPUTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];

  function finishCinematic() {
    if (!cine) return;
    INPUTS.forEach((t) => window.removeEventListener(t, cine.onInput, true));
    orient.pitch = orient.yaw = 0;
    const { done } = cine;
    cine = null;
    Object.assign(goal, cur);
    apply();
    done?.();
  }

  /** Ends a running flight: eases from wherever it is to its last key in `seconds`. */
  function endCinematic(seconds = 0.3) {
    if (!cine || cine.finishing) return;
    cine.finishing = true;
    cine.tween.kill();
    const from = { ...cur, ...orient };
    const { end } = cine;
    const k = { v: 0 };
    cine.tween = gsap.to(k, {
      v: 1,
      duration: seconds,
      ease: 'power2.out',
      onUpdate: () => {
        const t = k.v;
        cur.x = from.x + (end.x - from.x) * t;
        cur.z = from.z + (end.z - from.z) * t;
        cur.dist = from.dist + (end.dist - from.dist) * t;
        orient.pitch = from.pitch * (1 - t);
        orient.yaw = from.yaw * (1 - t);
      },
      onComplete: finishCinematic,
    });
  }

  /** Hands the camera to another move: the flight stops where it is, the tilt eases back to the fixed basis. */
  function releaseCinematic(seconds) {
    if (!cine) return;
    cine.tween.kill();
    const { done } = cine;
    INPUTS.forEach((t) => window.removeEventListener(t, cine.onInput, true));
    cine = null;
    gsap.to(orient, { pitch: 0, yaw: 0, duration: seconds, ease: 'power2.out', overwrite: true });
    done?.();
  }

  /**
   * Flies through `keys` in `duration` s (gentle ease in and out). The camera is on the first key at
   * once; `paused` holds it there until `play()`. `done` resolves when the camera has settled on the
   * last key, flown or skipped.
   */
  function cinematic(keys, { duration = 5.6, ease = 'power1.inOut', skip = 0.3, paused = false } = {}) {
    if (cine) finishCinematic();
    stopMotion();
    const P = (k) => new THREE.Vector3(k.x, k.dist, k.z);
    const A = (k) => new THREE.Vector3(k.pitch ?? 0, k.yaw ?? 0, 0);
    const path = new THREE.CatmullRomCurve3(keys.map(P), false, 'centripetal');
    const turn = new THREE.CatmullRomCurve3(keys.map(A), false, 'centripetal');
    const end = { ...keys[keys.length - 1] };
    const k = { u: 0 };
    const p = new THREE.Vector3();
    const a = new THREE.Vector3();
    const done = new Promise((resolve) => {
      const onInput = () => endCinematic(skip);
      cine = { end, done: resolve, finishing: false, onInput };
      INPUTS.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: true }));
      const step = () => {
        path.getPoint(k.u, p);
        turn.getPoint(k.u, a);
        cur.x = p.x; cur.z = p.z; cur.dist = p.y;
        orient.pitch = a.x; orient.yaw = a.y;
      };
      step();
      apply();
      cine.tween = gsap.to(k, { u: 1, duration, ease, paused, onUpdate: step, onComplete: () => { k.u = 1; step(); finishCinematic(); } });
    });
    const flight = cine;
    const live = () => cine === flight && !flight.finishing;
    return { done, play: () => { if (live()) flight.tween.play(); }, seek: (p) => { if (live()) flight.tween.progress(p).pause(); } };
  }

  apply();
  return {
    camera, pitch: PITCH, flyTo, frame, wasDrag, resize, groundAt, screenOf, onChange: (fn) => listeners.add(fn), state: cur,
    cinematic, endCinematic, flying: () => !!cine, // round 8: intro flight
  };
}
