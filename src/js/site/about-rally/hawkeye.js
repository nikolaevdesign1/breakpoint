import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { COURT, R, POINTS, BOUNCES, ballAt } from './path.js';

// The graphics layer of the rally (Hawk-Eye style): the ball, its dashed track, the shadow under it,
// and an ellipse where each bounce touched down. Everything is a pure function of rally time T,
// so scrubbing back and forth never leaves anything behind.

const INK = 0x0e0e0d;
const SUN = 0xfff3da; // the match-point mark
const PAPER = 0xf6f6f3;
const STEP = 1 / 60;

// Black and white ball with the two seam curves, drawn once.
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f6f3';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#0e0e0d';
  g.lineWidth = 9;
  g.lineCap = 'round';
  for (const off of [0, 128]) {
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) {
      const y = 64 + Math.sin((x / 128) * Math.PI * 2) * 34;
      x ? g.lineTo(x + off, y) : g.moveTo(x + off, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(14,14,13,0.7)');
  r.addColorStop(1, 'rgba(14,14,13,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const world = (v, out = new THREE.Vector3()) => out.set(v.x + COURT.x, v.y, v.z + COURT.z);
const easeOutBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

export function createHawkeye(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // Ball: textured sphere plus a black back-face shell for a graphic outline
  const ball = new THREE.Group();
  const map = keep(ballTexture());
  const sphere = new THREE.SphereGeometry(R, 24, 16);
  ball.add(new THREE.Mesh(keep(sphere), keep(new THREE.MeshBasicMaterial({ map }))));
  const shell = new THREE.Mesh(sphere, keep(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })));
  shell.scale.setScalar(1.14);
  ball.add(shell);
  group.add(ball);

  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ map: keep(blobTexture()), transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  group.add(shadow);

  // Dashed track, one pair of lines per shot: the whole shot faint, the part flown in ink. Only the shot in
  // flight, the one before (faded) and the one after (faint) are drawn, so the picture never fills up.
  const tmp = new THREE.Vector3();
  const lines = [];
  const mat = (color, opacity, size) => keep(new LineMaterial({ color, opacity, transparent: true, linewidth: 0.02, worldUnits: true, dashed: true, dashSize: size, gapSize: size * 0.75 }));
  for (let i = 1; i < POINTS.length; i++) {
    const { t: a } = POINTS[i - 1];
    const { t: b } = POINTS[i];
    const n = Math.round((b - a) / STEP);
    const pts = [];
    for (let k = 0; k <= n; k++) pts.push(...world(ballAt(a + (k / n) * (b - a), tmp)).toArray());
    const full = new Line2(keep(new LineGeometry().setPositions(pts)), mat(0xffffff, 0.35, 0.16));
    const flown = new Line2(keep(new LineGeometry().setPositions(pts)), mat(0xffffff, 1, 0.2)); // its own instanceCount
    for (const l of [full, flown]) { l.computeLineDistances(); l.frustumCulled = false; l.visible = false; group.add(l); }
    lines.push({ a, b, n, full, flown });
  }

  // Bounce marks: an ellipse along the direction of travel, popping in at touchdown
  const fillGeo = keep(new THREE.CircleGeometry(1, 32));
  const ringGeo = keep(new THREE.RingGeometry(0.84, 1, 32));
  const flat = (color, opacity) => keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const marks = BOUNCES.map((b, i) => {
    const last = i === BOUNCES.length - 1;
    const m = new THREE.Group();
    const fill = new THREE.Mesh(fillGeo, flat(last ? SUN : PAPER, 0.95));
    const ring = new THREE.Mesh(ringGeo, flat(last ? 0x9c441f : INK, 1));
    ring.position.z = 0.001;
    m.add(fill, ring);
    const a = ballAt(b.t - 0.05);
    const c = ballAt(b.t + 0.05);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, Math.atan2(c.x - a.x, c.z - a.z), 0); // long axis (local y) follows the flight
    m.position.set(b.p.x + COURT.x, 0.03, b.p.z + COURT.z);
    m.renderOrder = 1;
    m.traverse((o) => { o.renderOrder = 1; });
    m.visible = false;
    group.add(m);
    return { m, t: b.t, base: last ? 0.36 : 0.24 };
  });

  const res = new THREE.Vector2();
  return {
    marks: BOUNCES.map((b) => ({ t: b.t, pos: world(b.p, new THREE.Vector3()) })),
    ballWorld: new THREE.Vector3(),
    setResolution(w, h) { res.set(w, h); for (const l of lines) { l.full.material.resolution.copy(res); l.flown.material.resolution.copy(res); } },
    update(T) {
      const bw = this.ballWorld;
      world(ballAt(T, tmp), bw);
      ball.position.copy(bw);
      ball.rotation.set(T * 9, T * 4, 0);
      shadow.position.set(bw.x, 0.03, bw.z);
      shadow.scale.setScalar(R * (5 + bw.y * 1.2));
      shadow.material.opacity = Math.max(0.15, 1 - bw.y / 5);
      ball.visible = T > -0.05;
      shadow.visible = ball.visible;
      let cur = lines.findIndex((l) => T < l.b);
      if (cur < 0) cur = lines.length - 1;
      lines.forEach((l, i) => {
        const done = Math.max(0, Math.min(l.n, Math.floor((T - l.a) / STEP)));
        l.full.visible = i === cur || i === cur + 1;
        l.flown.visible = (i === cur || i === cur - 1) && done > 0;
        l.flown.geometry.instanceCount = i === cur ? done : l.n;
        l.flown.material.opacity = i === cur ? 1 : 0.3;
      });
      for (const k of marks) {
        const s = (T - k.t) / 0.5;
        k.m.visible = s > 0;
        if (s > 0) { const e = k.base * easeOutBack(Math.min(1, s)); k.m.scale.set(e * 0.55, e, 1); }
      }
    },
    dispose() {
      group.removeFromParent();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
