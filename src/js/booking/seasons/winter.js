import * as THREE from 'three';
import { part, merge } from '../life/geom.js';

// Snow on the ground for the Holidays decor (round 10, row 4). It is Miami, so the courts are
// clear (they are never touched here): the snow lies in low drifts along the walkway fences, round
// the outside of every court fence and in front of the clubhouse, as a skin on the upward-facing
// roof faces, and a snowman stands on the lawn. All static: it goes into the baked frame and the
// shadow map with the rest of the decor.

const SNOW = '#f3f6f9';
const MOUNDS = 760; // cap

/** A lumpy half-ball, 1 m across, sitting on y = 0 (scaled per drift). */
function moundGeometry() {
  const g = new THREE.SphereGeometry(0.5, 16, 10); // indexed: smooth shading
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const lump = 1 + 0.07 * Math.sin(x * 9 + z * 5) * Math.cos(z * 8 - y * 4);
    p.setXYZ(i, x * lump, Math.max(y, -0.02) * lump, z * lump);
  }
  g.computeVertexNormals();
  return g;
}

/** Drifts along the lines in `lines` ([x0, z0, x1, z1] each, thickness `k`), kept off anything standing. */
function drifts(plan, lines, r) {
  const list = [];
  for (const [x0, z0, x1, z1, k = 1] of lines) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const along = -Math.atan2(z1 - z0, x1 - x0); // each drift lies along its line
    const n = Math.max(1, Math.floor(len / 0.55));
    for (let i = 0; i < n && list.length < MOUNDS; i++) {
      const t = (i + 0.5 + (r() - 0.5) * 0.5) / n;
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.3;
      const z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.3;
      const w = (1.2 + r() * 0.7) * k;
      if (!plan.free(x, z, w * 0.3)) continue;
      list.push({ x, z, y: plan.floorY(x, z) - 0.04, w, h: (0.2 + r() * 0.16) * k, d: (0.7 + r() * 0.4) * k, yaw: along + (r() - 0.5) * 0.5 });
    }
  }
  const mesh = new THREE.InstancedMesh(moundGeometry(), new THREE.MeshStandardMaterial({ color: SNOW, roughness: 1, emissive: SNOW, emissiveIntensity: 0.85 }), Math.max(1, list.length));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach((d, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw);
    mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.w, d.h * 2, d.d)));
  });
  mesh.count = list.length;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'winter_drifts';
  return mesh;
}

/** A skin of snow over every upward-facing roof triangle (the clubhouse, the shed). */
function roofSnow(root) {
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || ![o.material].flat().some((m) => /roof/.test(m?.name ?? '')) && !/roof/.test(o.name)) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    for (let t = 0; t < (idx ? idx.count : pos.count); t += 3) {
      const at = (k, v) => v.fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
      at(0, a); at(1, b); at(2, c);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      if (n.y < 0.3) continue;
      out.push(a.x, a.y + 0.07, a.z, b.x, b.y + 0.07, b.z, c.x, c.y + 0.07, c.z);
    }
  });
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.receiveShadow = true;
  mesh.name = 'winter_roof_snow';
  return mesh;
}

/** A snowman 1.7 m tall on y = 0 (facing +z): three balls, coal, a carrot, a scarf, a top hat and stick arms. */
function snowman() {
  const ball = (rad, y) => part(new THREE.SphereGeometry(rad, 18, 12).translate(0, y, 0), SNOW);
  const dot = (x, y, z, s = 0.03) => part(new THREE.SphereGeometry(s, 6, 5).translate(x, y, z), '#1d1b19');
  const arm = (side) => part(new THREE.CylinderGeometry(0.015, 0.02, 0.62, 5).rotateZ(side * 1.05).translate(side * 0.4, 0.88, 0), '#5a4331');
  return merge([
    ball(0.42, 0.4), ball(0.31, 0.98), ball(0.22, 1.42),
    dot(-0.08, 1.46, 0.19), dot(0.08, 1.46, 0.19), dot(0, 1.0, 0.3), dot(0, 0.86, 0.34), dot(0, 0.72, 0.38),
    part(new THREE.ConeGeometry(0.035, 0.24, 8).rotateX(Math.PI / 2).translate(0, 1.4, 0.3), '#d9731c'),
    part(new THREE.TorusGeometry(0.2, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, 1.22, 0), '#9c441f'),
    part(new THREE.BoxGeometry(0.07, 0.3, 0.05).translate(0.17, 1.08, 0.12), '#9c441f'),
    part(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14).translate(0, 1.6, 0), '#1d1b19'),
    part(new THREE.CylinderGeometry(0.15, 0.16, 0.22, 14).translate(0, 1.72, 0), '#1d1b19'),
    arm(-1), arm(1),
  ]);
}

/**
 * The snow of the Holidays: drifts, roof snow and the snowman, as one group. `fences` are the walkway
 * fences ({ x0, x1, z, side }), `courts` the court fence boxes, `at` the snowman's spot.
 */
export function buildWinter({ root, plan, fences, courts, gaps, at, r }) {
  const group = new THREE.Group();
  const lines = [];
  for (const f of fences) {
    // On the walkway side, in runs between the gates.
    const cuts = [f.x0, ...gaps.filter((g) => g > f.x0 && g < f.x1).flatMap((g) => [g - 1.9, g + 1.9]), f.x1];
    for (let i = 0; i < cuts.length; i += 2) lines.push([cuts[i], f.z + f.side * 0.55, cuts[i + 1], f.z + f.side * 0.55, 1.1]);
  }
  for (const b of courts) {
    const north = b.min.z + b.max.z > 0;
    const far = north ? b.max.z + 0.7 : b.min.z - 0.7;
    lines.push([b.min.x, far, b.max.x, far, 1], [b.min.x - 0.7, b.min.z, b.min.x - 0.7, b.max.z, 1], [b.max.x + 0.7, b.min.z, b.max.x + 0.7, b.max.z, 1]);
  }
  lines.push([-24, -50.1, 59, -50.1, 0.9]); // the clubhouse front
  group.add(drifts(plan, lines, r));
  const roofs = roofSnow(root);
  if (roofs) group.add(roofs);
  const spot = plan.settle(at[0], at[1], 0.5, 3);
  if (spot) {
    plan.take(spot.x, spot.z, 0.5);
    const man = new THREE.Mesh(snowman(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    man.position.set(spot.x, plan.floorY(spot.x, spot.z), spot.z);
    man.rotation.y = 0.25;
    man.scale.setScalar(1.6);
    man.castShadow = man.receiveShadow = true;
    man.name = 'winter_snowman';
    group.add(man);
  }
  return group;
}
