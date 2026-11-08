import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { miamiNow } from '../miami-clock.js';
import { hanukkahDay, dayNum, fromDayNum } from './calendar.js';
import { part, merge } from '../life/geom.js';

// Hanukkah inside the Holidays (round 11, row 10): the same season as Christmas, one name, and the
// fir, the snow, the Santa hats and the snowmen are not touched. This is what is added when
// Hanukkah is on (its eight days by the Hebrew calendar, calendar.js `hanukkahDay`, or when the
// Holidays are picked by hand): a menorah by the front door whose candles are lit at dusk, as many
// as the night of Hanukkah (the shamash and the rightmost n of the eight), Star of David garlands
// and blue and silver lights on the fences, dreidels and gelt on the lawn and at the gates.
// Loaded as its own chunk by life/seasons.js (addHanukkah). Preview: __bp.seasons.hanukkah.day(n).

const BLUE = '#3d6fd1';
const WHITE = '#e9edf5';
const GOLD = '#d3a53c';
const K = 2.5; // menorah against its model size
const SPOT = [10.4, -47.0];
const DREIDELS = [[7.6, -45.2], [13.6, -44.2], [17.4, -43.6], [3.0, -43.0], [-2.5, -41.2], [22, -42.4], [28, -43.2]];
const FLAMES = { glass: '#ffd46a', glow: new THREE.Color(1, 0.66, 0.15), gain: 0.5 };

/** A Star of David (two triangles) hung under each point of a strand, blue and white. */
function starGarland(D, strandSets, size = 0.42) {
  const pos = []; const col = []; const wire = [];
  const c = new THREE.Color();
  let n = 0;
  const tri = (cx, cy, rot, tan, p, base) => {
    for (let k = 0; k < 3; k++) {
      const a0 = rot + (k / 3) * Math.PI * 2; const a1 = rot + ((k + 1) / 3) * Math.PI * 2;
      const v = (a) => new THREE.Vector3(p.x, p.y, p.z).addScaledVector(tan, cx + Math.cos(a) * size).add(new THREE.Vector3(0, cy + Math.sin(a) * size, 0));
      void base;
      const [A, B] = [v(a0), v(a1)];
      const C = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(tan, cx).add(new THREE.Vector3(0, cy, 0));
      pos.push(C.x, C.y, C.z, B.x, B.y, B.z, A.x, A.y, A.z);
      for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
    }
  };
  for (const st of strandSets) {
    const h = D.hangStrand(st.anchors, { sag: st.sag + 0.05, step: 0.95 });
    wire.push(...h.wire);
    for (const { p, tan } of h.points) {
      c.set(n % 2 ? WHITE : BLUE);
      // the hexagram is two outline triangles of one centre, point up and point down
      tri(0, -size * 1.1, Math.PI / 2, tan, p);
      tri(0, -size * 1.1, -Math.PI / 2, tan, p);
      n++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geo: g, wire };
}

/** The menorah: a stem and base, four curved arms a side, nine cups and unlit candles (the flames are live). */
function menorah() {
  const L = [
    part(new THREE.CylinderGeometry(0.3, 0.36, 0.06, 14).translate(0, 0.03, 0), GOLD),
    part(new THREE.CylinderGeometry(0.045, 0.06, 0.62, 10).translate(0, 0.37, 0), GOLD),
    part(new THREE.SphereGeometry(0.075, 8, 6).translate(0, 0.34, 0), GOLD),
    part(new THREE.CylinderGeometry(0.045, 0.03, 0.05, 8).translate(0, 0.7, 0), GOLD),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 8).translate(0, 0.86, 0), WHITE), // shamash
  ];
  const tops = [];
  for (const side of [-1, 1]) for (let k = 1; k <= 4; k++) {
    const x = side * k * 0.17;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(side * k * 0.07, 0.25, 0), new THREE.Vector3(x * 0.95, 0.4, 0), new THREE.Vector3(x, 0.6, 0)]);
    L.push(part(new THREE.TubeGeometry(curve, 14, 0.016, 5), GOLD));
    L.push(part(new THREE.CylinderGeometry(0.036, 0.024, 0.04, 8).translate(x, 0.62, 0), GOLD));
    L.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8).translate(x, 0.75, 0), (k + (side > 0 ? 1 : 0)) % 2 ? BLUE : WHITE));
    tops.push([x, 0.88]);
  }
  tops.push([0, 1.04]);
  return { geo: merge(L), tops: tops.sort((a, b) => a[0] - b[0]) };
}

function dreidel() {
  return merge([
    part(new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.28, 0), BLUE),
    part(new THREE.ConeGeometry(0.14, 0.2, 4).rotateX(Math.PI).rotateY(Math.PI / 4).translate(0, 0.1, 0), BLUE),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6).translate(0, 0.43, 0), '#c7ccd4'),
    part(new THREE.BoxGeometry(0.205, 0.04, 0.205).translate(0, 0.28, 0), WHITE),
    part(new THREE.SphereGeometry(0.02, 5, 4).translate(0, 0.0, 0), '#c7ccd4'),
  ]);
}

function gelt() {
  return merge([
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.014, 12), '#d7a93a'),
    part(new THREE.CylinderGeometry(0.044, 0.044, 0.016, 12), '#f0cf6a'),
  ]);
}

export default function build(kit) {
  const { ctx, plan, lights, strands, walkwayFences, TINTS, scatter, once, r, D, glowTex, still } = kit;
  const group = new THREE.Group();
  group.name = 'hanukkah';
  const glow = [];
  const solid = (extra) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, ...extra });

  // Stars and blue-and-silver lights on the fences, a little lower and higher than the Christmas strands.
  const stars = starGarland(D, strands({ y: 2.75, out: 0.22, eave: false }));
  const star = new THREE.Mesh(stars.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: 0x2a3a6a, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
  star.castShadow = true;
  star.userData.noAO = true;
  group.add(star);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars.wire, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2926 })));
  const high = strands({ eave: false, y: 4.0 });
  lights(group, high.filter((_, i) => i % 2 === 0), TINTS.BLUE, glow);
  lights(group, high.filter((_, i) => i % 2 === 1), TINTS.SILVER, glow);
  lights(group, strands({ fences: false, y: 4.05 }), TINTS.SILVER, glow, { halo: 0.8 });

  // The menorah on a low plinth by the front door.
  const m = menorah();
  const at = plan.settle(SPOT[0], SPOT[1], 1.4, 3.5) ?? { x: SPOT[0], z: SPOT[1] };
  plan.take(at.x, at.z, 1.5);
  const gy = plan.floorY(at.x, at.z);
  const plinth = merge([
    part(new THREE.BoxGeometry(2.0, 0.16, 0.8).translate(0, 0.08, 0), '#cfcabd'),
    part(new THREE.BoxGeometry(1.8, 0.04, 0.6).translate(0, 0.18, 0), BLUE),
  ]);
  const menMesh = new THREE.Mesh(m.geo, solid({ metalness: 0.65, roughness: 0.35 }));
  menMesh.position.set(at.x, gy + 0.2 * 1, at.z);
  menMesh.scale.setScalar(K);
  menMesh.castShadow = true;
  group.add(menMesh);
  const plinthMesh = new THREE.Mesh(plinth, solid());
  plinthMesh.position.set(at.x, gy, at.z);
  plinthMesh.scale.set(K * 0.9, K * 0.8, K * 0.9);
  plinthMesh.castShadow = plinthMesh.receiveShadow = true;
  group.add(plinthMesh);
  menMesh.position.y = gy + 0.16 * K * 0.8 + 0.04;

  // Dreidels and gelt.
  const spots = [];
  for (const [x, z] of DREIDELS) { const s = plan.settle(x, z, 0.4, 1.4); if (s) { plan.take(s.x, s.z, 0.45); spots.push([s.x, plan.floorY(s.x, s.z), s.z, r() * 6, 2.6 + r() * 0.6]); } }
  for (const [gx, side] of kit.GATES) { const s = plan.settle(gx - 1.6, side * 1.7, 0.3, 0.8); if (s) { plan.take(s.x, s.z, 0.35); spots.push([s.x, plan.floorY(s.x, s.z), s.z, r() * 6, 2.4]); } }
  scatter(group, once('hk-dreidel', dreidel), solid(), spots);
  const coins = [];
  for (let i = 0; i < 28; i++) {
    const a = r() * Math.PI * 2; const d = 1.6 + r() * 1.6;
    const x = at.x + Math.cos(a) * d * 1.3; const z = at.z + 0.9 + Math.abs(Math.sin(a)) * d * 0.7;
    coins.push([x, plan.floorY(x, z) + 0.012 * 2.4, z, r() * 3, 2.4]);
  }
  scatter(group, once('hk-gelt', gelt), solid({ metalness: 0.6, roughness: 0.35 }), coins, { colors: ['#d7a93a', '#e8c25a', '#3d6fd1'] });
  for (const [gx, side] of kit.GATES) { // a few coins at each gate
    const s = [];
    for (let i = 0; i < 4; i++) { const x = gx + 0.6 + r() * 0.8; const z = side * (1.5 + r() * 0.5); s.push([x, plan.floorY(x, z) + 0.03, z, r() * 3, 2.4]); }
    scatter(group, once('hk-gelt'), solid({ metalness: 0.6, roughness: 0.35 }), s, { colors: ['#d7a93a', '#3d6fd1'] });
  }

  // The flames: live, nine small cones and their halos; the candles burn at dusk, n of eight and the shamash.
  const live = new THREE.Group();
  live.name = 'hanukkah_live';
  const flameGeo = new THREE.ConeGeometry(0.034, 0.13, 6).translate(0, 0.065, 0);
  const flameMat = gradeLife(new THREE.MeshBasicMaterial({ color: 0xffd46a, toneMapped: false }));
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, 9);
  const haloMat = gradeLife(new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-ctx.rig.pitch), haloMat, 9);
  for (const o of [flames, halos]) { o.layers.set(LIFE_LAYER); o.frustumCulled = false; o.userData.noAO = true; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); live.add(o); }
  halos.renderOrder = 5;
  const order = m.tops.map((t, i) => i); // left to right, the shamash (x = 0) is the middle one, index 4
  const rank = (i) => (i === 4 ? -1 : i > 4 ? 8 - i : 8 - (i + 1) + 0); // 0 for the rightmost
  let pinDay = null;
  const nights = () => {
    if (pinDay != null) return pinDay;
    const n = miamiNow();
    const tomorrow = fromDayNum(dayNum(n.y, n.m, n.d) + 1);
    return (n.hours >= 12 ? hanukkahDay(tomorrow) : hanukkahDay(n)) || hanukkahDay(n) || 5; // 5: only on a preview outside Hanukkah
  };
  const m4 = new THREE.Matrix4();
  const wasted = new THREE.Vector3();
  const api = {
    update(t, dt, night) {
      if (!group.visible) return false;
      if (!live.parent) ctx.scene.add(live);
      const n = nights();
      const lit = Math.min(1, Math.max(0, (night - 0.25) / 0.5));
      order.forEach((i) => {
        const [x, y] = m.tops[i];
        const on = i === 4 || rank(i) < n;
        const f = on ? lit * (0.9 + 0.1 * Math.sin(t * 9 + i * 2.3) + (still ? 0 : 0.06 * Math.sin(t * 23 + i))) : 0;
        wasted.set(at.x + x * K, menMesh.position.y + (y + 0.01) * K, at.z);
        flames.setMatrixAt(i, m4.makeScale(f * K, f * K * (1 + 0.15 * Math.sin(t * 13 + i)), f * K).setPosition(wasted));
        halos.setMatrixAt(i, m4.makeScale(f * 1.1, f * 1.1, f * 1.1).setPosition(wasted.x, wasted.y + 0.1 * K, wasted.z + 0.05));
      });
      haloMat.color.setRGB(1, 0.62, 0.18).multiplyScalar(0.55);
      flames.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
      return lit > 0 && !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { ctx.scene.remove(live); },
  };
  void FLAMES;
  if (import.meta.env.DEV) { window.__bp ??= {}; window.__bp.seasons ??= {}; window.__bp.seasons.hanukkah = { day: (n) => { pinDay = n; }, nights }; }

  return {
    group, glow, live: api,
    /** On the days of Hanukkah (the eve counts), or when the Holidays are picked by hand. */
    wanted(forced) {
      const n = miamiNow();
      const tomorrow = fromDayNum(dayNum(n.y, n.m, n.d) + 1);
      return forced || hanukkahDay(n) > 0 || hanukkahDay(tomorrow) > 0;
    },
  };
}
