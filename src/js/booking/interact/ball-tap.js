import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { ballBounce } from '../ambient.js';
import { cursor } from '../../site/cursor.js';
import { COURTS } from '../../shared/availability.js';
import { aimAtNet, netStep, playNet } from '../fun/ball-net.js'; // round 9 (row 15): balls into the net

// Ball tap (round 7): hold on a court for a moment (or Alt/Option-click it) and a tennis ball drops
// from hand height, bounces and rolls out on that court's surface. A plain click still opens the
// booking, so the gesture never fights it: the press has to stay put for HOLD_MS, and the click that
// follows the drop is swallowed before scene.js sees it.
//
// Physics per surface: vertical restitution and how much of its pace the ball keeps through a bounce.
// Clay grips (slow, a little higher off the ground than grass), hard courts are lively, grass skids
// low and keeps its pace, padel turf sits between. On clay each bounce leaves a mark that fades out
// after ~30 s. A few balls at most; the oldest makes room. All of it lives on LIFE_LAYER.

const G = 9.81;
const R = 0.033; // m, a real ball
const MIN_PX = 8; // never smaller than this on screen, or it is a speck at drone height
const MAX_BALLS = 4;
const MAX_MARKS = 24;
const HOLD_MS = 380;
const HINT_MS = 140; // the cursor says what is coming once the press is clearly not a click
const SLOP = 6; // px
const STEP = 1 / 240;
const REST_FOR = 18; // s a ball lies still before it is cleared away
const MARK_LIFE = 30; // s
const MARK_FADE = 9; // s at the end of its life
const SURFACE = {
  clay: { e: 0.74, keep: 0.58, roll: 1.2 },
  hard: { e: 0.77, keep: 0.74, roll: 0.55 },
  padel: { e: 0.7, keep: 0.7, roll: 0.9 },
  grass: { e: 0.6, keep: 0.88, roll: 0.75 },
};
const rand = (a, b) => a + Math.random() * (b - a);

function markTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createBallTap({ scene, root, camera, rig, renderer, sunDir }, { still }) {
  const canvas = renderer.domElement;
  const types = new Map(COURTS.map((c) => [c.id, c.type]));
  const planes = [];
  const boxes = new Map();
  for (const c of COURTS) {
    const plane = root.getObjectByName(`${c.id}_hl`);
    if (!plane) continue;
    planes.push(plane);
    boxes.set(plane, { id: c.id, box: new THREE.Box3().setFromObject(plane) });
  }
  if (!planes.length) return null;

  // --- Meshes ---
  const ballMat = gradeLife(new THREE.MeshStandardMaterial({ color: 0xc9d93a, roughness: 0.85 }));
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 12, 10), ballMat, MAX_BALLS);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(R * 1.1, 12).rotateX(-Math.PI / 2), shadowMat, MAX_BALLS);
  const markGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  markGeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(MAX_MARKS), 1));
  const markMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: markTexture(), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 });
  markMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vFade;\n#include <opaque_fragment>');
  };
  markMat.customProgramCacheKey = () => 'ball-mark';
  const marks = new THREE.InstancedMesh(markGeo, markMat, MAX_MARKS);
  for (const o of [balls, shadows, marks]) {
    o.layers.set(LIFE_LAYER);
    o.frustumCulled = false;
    o.userData.noAO = true;
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.count = 0;
  }
  marks.renderOrder = 1;
  shadows.renderOrder = 1;
  scene.add(marks, shadows, balls);

  const live = []; // { p, v, y, box, surface, rolling, restAt, born, scale }
  const markList = []; // { x, y, z, angle, len, wid, born }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s3 = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const sun = sunDir.clone().normalize();
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let changed = false;

  /** Render scale so the ball keeps MIN_PX on screen wherever the drone is. */
  function minScale(p) {
    const ppm = innerHeight / (2 * camera.position.distanceTo(p) * halfTan);
    return Math.max(1, MIN_PX / 2 / (R * ppm));
  }

  function sound(b, impact) {
    const v = rig.state;
    const d = Math.hypot(b.p.x - v.x, b.p.z - v.z);
    const loud = THREE.MathUtils.clamp(impact / 6, 0, 1) * THREE.MathUtils.clamp(1 - d / 70, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2);
    const s = rig.screenOf(b.p.x, b.p.z);
    ballBounce(loud, THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.8, 0.8), b.surface);
  }

  function addMark(b) {
    if (markList.length >= MAX_MARKS) markList.shift();
    const k = b.scale;
    markList.push({ x: b.p.x, y: b.y + 0.003, z: b.p.z, angle: Math.atan2(-b.v.z, b.v.x), len: (0.1 + Math.hypot(b.v.x, b.v.z) * 0.03) * k, wid: 0.062 * k, born: performance.now() / 1000 });
  }

  function drop(hit) {
    const { id, box } = boxes.get(hit.object);
    const surface = types.get(id) ?? 'hard';
    if (live.length >= MAX_BALLS) live.shift();
    const now = performance.now() / 1000;
    const a = Math.random() * Math.PI * 2;
    const pace = rand(0.8, 2.2);
    const b = {
      p: hit.point.clone(), v: new THREE.Vector3(Math.cos(a) * pace, -0.4, Math.sin(a) * pace),
      y: hit.point.y, box, surface, rolling: false, restAt: 0, born: now, scale: minScale(hit.point),
    };
    b.p.y += still ? R * b.scale : rand(1.5, 2.1);
    if (!still) aimAtNet(b); // round 9 (row 15)
    if (still) { b.v.set(0, 0, 0); b.rolling = true; b.restAt = now; if (surface === 'clay') addMark(b); sound(b, 3); }
    live.push(b);
    changed = true;
  }

  function step(b, dt) {
    const k = SURFACE[b.surface] ?? SURFACE.hard;
    const prev = netPrev.copy(b.p); // round 9 (row 15): where it was, for the net check below
    const floor = b.y + R * b.scale;
    if (!b.rolling) {
      b.v.y -= G * dt;
      b.v.multiplyScalar(1 - 0.05 * dt); // a little air drag
      b.p.addScaledVector(b.v, dt);
      if (b.p.y <= floor && b.v.y < 0) {
        b.p.y = floor;
        const impact = -b.v.y;
        if (impact > 0.45) {
          b.v.y = impact * k.e;
          b.v.x *= k.keep;
          b.v.z *= k.keep;
          sound(b, impact);
          if (b.surface === 'clay' && impact > 3) addMark(b); // the first few, harder bounces
        } else {
          b.v.y = 0;
          b.rolling = true;
        }
      }
    } else {
      b.p.y = floor;
      const speed = Math.hypot(b.v.x, b.v.z);
      const slow = k.roll * dt;
      if (speed <= slow) { b.v.set(0, 0, 0); if (!b.restAt) b.restAt = performance.now() / 1000; } else b.v.multiplyScalar((speed - slow) / speed);
      b.p.x += b.v.x * dt;
      b.p.z += b.v.z * dt;
    }
    // The fence round the apron stops it (a dead windscreen, not a wall to bounce off).
    const { min, max } = b.box;
    if (b.p.x < min.x + 0.15 || b.p.x > max.x - 0.15) { b.p.x = THREE.MathUtils.clamp(b.p.x, min.x + 0.15, max.x - 0.15); b.v.x *= -0.25; }
    if (b.p.z < min.z + 0.15 || b.p.z > max.z - 0.15) { b.p.z = THREE.MathUtils.clamp(b.p.z, min.z + 0.15, max.z - 0.15); b.v.z *= -0.25; }
    netStep(b, prev, R * b.scale, netSound); // round 9 (row 15): caught by the net, it slides down the mesh
  }
  const netPrev = new THREE.Vector3();
  function netSound(b, impact) {
    const v = rig.state;
    const d = Math.hypot(b.p.x - v.x, b.p.z - v.z);
    const s = rig.screenOf(b.p.x, b.p.z);
    playNet(impact * THREE.MathUtils.clamp(1 - d / 70, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2), THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.8, 0.8));
  }

  function write(now) {
    let n = 0;
    for (const b of live) {
      // Cleared away after a while at rest: it shrinks into the court.
      const gone = b.restAt ? THREE.MathUtils.clamp((now - b.restAt - REST_FOR) / 0.4, 0, 1) : 0;
      const k = b.scale * (1 - gone);
      m4.compose(b.p, q.identity(), s3.setScalar(k));
      balls.setMatrixAt(n, m4);
      const h = b.p.y - b.y;
      m4.compose(pos.set(b.p.x - (sun.x / sun.y) * h, b.y + 0.004, b.p.z - (sun.z / sun.y) * h), q.identity(), s3.setScalar(k * (1 + h * 0.15)));
      shadows.setMatrixAt(n, m4);
      n++;
    }
    balls.count = shadows.count = n;
    balls.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
    const fade = marks.geometry.attributes.aFade;
    markList.forEach((m, i) => {
      m4.compose(pos.set(m.x, m.y, m.z), q.setFromAxisAngle(up, m.angle), s3.set(m.len, 1, m.wid));
      marks.setMatrixAt(i, m4);
      fade.array[i] = THREE.MathUtils.clamp((MARK_LIFE - (now - m.born)) / MARK_FADE, 0, 1);
    });
    marks.count = markList.length;
    marks.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }

  // --- Gesture ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function courtAt(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(planes, false)[0] ?? null;
  }

  let press = null; // { id, x, y, hint, fire }
  let swallowUntil = 0;
  const cancel = () => {
    if (!press) return;
    clearTimeout(press.hint);
    clearTimeout(press.fire);
    if (press.hinted) cursor().setLabel(null); // it became a drag or a click: the scene relabels on the next move
    press = null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    cancel();
    swallowUntil = 0; // only the click that ends the drop's own press is swallowed
    if (!e.isPrimary || e.button !== 0 || e.altKey) return;
    const hit = courtAt(e.clientX, e.clientY);
    if (!hit) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') press.hint = setTimeout(() => { press.hinted = true; cursor().setLabel('Drop a ball'); }, HINT_MS);
    press.fire = setTimeout(() => {
      const again = press && courtAt(press.x, press.y);
      press = null;
      if (!again) return;
      drop(again);
      swallowUntil = performance.now() + 1500; // the click that ends this press is not a booking
    }, HOLD_MS);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancel();
  });
  window.addEventListener('pointerup', (e) => { if (press && e.pointerId === press.id) cancel(); });
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('contextmenu', (e) => { if (swallowUntil > performance.now() || press) e.preventDefault(); });
  // Capture phase on window: runs before scene.js's click handler on the canvas.
  window.addEventListener('click', (e) => {
    if (e.target !== canvas) return;
    if (swallowUntil > performance.now()) {
      swallowUntil = 0;
      e.stopImmediatePropagation();
      return;
    }
    if (e.altKey) {
      const hit = courtAt(e.clientX, e.clientY);
      if (!hit) return;
      e.stopImmediatePropagation();
      drop(hit);
    }
  }, true);

  return {
    name: 'balls',
    tick(t, dt) {
      const now = performance.now() / 1000;
      const d = Math.min(0.05, dt || 0);
      for (const b of live) b.scale = minScale(b.p); // follows the zoom: the drone may come closer
      for (let left = d; left > 1e-6; left -= STEP) {
        const h = Math.min(STEP, left);
        for (const b of live) step(b, h);
      }
      for (let i = live.length - 1; i >= 0; i--) if (live[i].restAt && now - live[i].restAt > REST_FOR + 0.4) live.splice(i, 1);
      while (markList.length && now - markList[0].born > MARK_LIFE) markList.shift();
      const busy = live.length > 0 || markList.length > 0;
      if (busy || changed) write(now);
      const wasChanged = changed;
      changed = busy;
      return busy || wasChanged;
    },
    /** Dev: drop a ball on a court at its centre (or a ground point). */
    drop(id, dx = 0, dz = 0) {
      const plane = planes.find((p) => boxes.get(p).id === id);
      if (!plane) return false;
      const { box } = boxes.get(plane);
      const point = new THREE.Vector3((box.min.x + box.max.x) / 2 + dx, box.max.y, (box.min.z + box.max.z) / 2 + dz);
      drop({ object: plane, point });
      return true;
    },
    debug: () => ({ balls: live.map((b) => [b.surface, +b.p.y.toFixed(2), b.rolling, +b.scale.toFixed(2), +b.y.toFixed(2), b.netted ? "net" : "", +b.p.x.toFixed(2), +b.p.z.toFixed(2)]), marks: markList.length, cam: +camera.position.y.toFixed(1) }),
  };
}
