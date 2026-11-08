import * as THREE from 'three';
import * as D from './decor.js';

// The shared building blocks of the holiday decor (row 1, round 11): what every season needs to
// string lights, hang flags, place things, and light them after dark. Life/seasons.js builds the
// first three seasons with it, and a holiday pack (seasons/packs/<id>.js) gets the same kit:
//
//   export default function build(kit) { const group = new THREE.Group(); ...; return { group, glow }; }
//
// What a pack may return (everything optional but `group`):
//   group      THREE.Group, static: goes into the baked frame and the shadow map once
//   glow       [(night 0…1, boost) => void]: lights that turn up after dark (bulbs, stars, windows)
//   live       { update(t, dt, night) → boolean (needs frames), pick?(x, y), click?(x, y), label?(kind), off?() }
//              things that move: drawn on the life layer, over the cached frame
//   snow       0…1 how wintry the club gets (1: the Holidays; Miami: a light fall and small drifts)
//   particles  { kind: 'confetti' | 'petals' | 'leaves' | 'hearts' | 'clovers' …, colors?, density? } falling bits in the air
//   hats       true (Santa hats) or the name of a hat: 'party', … (life/adorn.js)
//   crew       true: the snow-shoveling crew walks the paths
//   windows    0…1: warm clubhouse windows by day
//   accent     { tint: [r, g, b] }: a balance on the light of the whole map (daylight.js), colors the courts too
//   fireworks  true: July 4th style distant fireworks after dark (a pack with its own show leaves it off)
//   sound      { …} reserved for a pack's own loops (they follow the sound toggle: sound/*.js)
//
// `kit.plan` is a fresh placement plan (placement.js): `settle` a spot, `take` it, `floorY` there.

// Light colours: glass, glow (for the halo), gain (how strongly it takes the night boost).
export const TINTS = {
  ORANGE: { glass: '#e9792b', glow: new THREE.Color(1, 0.3, 0.02), gain: 0.45 },
  PURPLE: { glass: '#8a4fd8', glow: new THREE.Color(0.55, 0.18, 1), gain: 0.5 },
  WARM: { glass: '#efe2c4', glow: new THREE.Color(1, 0.7, 0.36), gain: 1 },
  RED: { glass: '#e0312b', glow: new THREE.Color(1, 0.08, 0.04), gain: 0.55 },
  GREEN: { glass: '#2fb85a', glow: new THREE.Color(0.1, 1, 0.25), gain: 0.5 },
  GOLD: { glass: '#f2c24a', glow: new THREE.Color(1, 0.62, 0.12), gain: 0.7 },
  SILVER: { glass: '#dfe6ef', glow: new THREE.Color(0.7, 0.8, 1), gain: 0.8 },
  PINK: { glass: '#f06a9a', glow: new THREE.Color(1, 0.18, 0.5), gain: 0.55 },
  BLUE: { glass: '#3d78e0', glow: new THREE.Color(0.12, 0.35, 1), gain: 0.55 },
};

// Round 9 (row 2): the decor has to read from the drone at normal zoom, to someone not looking
// for it. Bulbs are oversized (a C9 is 7 cm) and glow a little by day too, pennants are flag-sized.
const BULB_SCALE = 2.8;
const HALO = 1.2; // m, glow card per bulb
const DAY_GLOW = 3.2; // bulb emission by day (night adds to it)
const DAY_HALO = 0.16;
export const BUNTING = { w: 0.56, l: 0.7 };
export const NIGHT_STEPS = 6;
export const GATES = [[-19, 1], [19, 1], [57, 1], [0, -1], [38, -1]]; // court gate x, fence side (z = ±2.1)

export function createKit(ctx, { r, once }) {
  const { root, rig } = ctx;
  const glowTex = () => once('glow', D.glowTexture);

  /** The fence boxes of the clay and hard courts (their `_hl` meshes). */
  function courtBoxes() {
    const out = [];
    root.traverse((o) => { if (o.isMesh && /^(clay|hard)-\d_hl$/.test(o.name)) out.push(new THREE.Box3().setFromObject(o)); });
    return out;
  }

  /** Fences along the main walkway (z ≈ ±2.1): x from, x to, z, the walkway side (−1 / +1). */
  function walkwayFences() {
    return courtBoxes().map((b) => {
      const north = b.min.z + b.max.z > 0;
      return { x0: b.min.x, x1: b.max.x, z: north ? b.min.z : b.max.z, side: north ? -1 : 1 };
    }).sort((a, b) => a.z - b.z || a.x0 - b.x0);
  }

  /** Strands of anchors: every walkway fence (post tops, 3.5 m up) and the clubhouse eave. */
  function strands({ fences = true, eave = true, y = 3.5, out = 0.16 } = {}) {
    const list = [];
    if (fences) {
      for (const f of walkwayFences()) {
        const z = f.z + f.side * out; // on hooks just in front of the chain link, clear of the gate headers
        const n = 4;
        list.push({ anchors: Array.from({ length: n + 1 }, (_, k) => [f.x0 + 0.1 + ((f.x1 - f.x0 - 0.2) * k) / n, y, z]), sag: 0.26 });
      }
    }
    if (eave) {
      const x0 = -24.6;
      const x1 = 59.6;
      const n = 24;
      list.push({ anchors: Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, 3.14 + (y - 3.5) * 0.5, -51.42]), sag: 0.3 });
    }
    return list;
  }

  /**
   * A garland of small flags along `sets` of strands, colours cycling, with its wire. `shape` is a
   * pennant (default), 'heart', 'star', 'clover', 'diamond', 'round' or 'square'; `size` { w, l } the flag.
   */
  function flags(group, sets, colors, { shape = 'pennant', step = 0.62, size = BUNTING, wire: wireColor = 0x2a2926 } = {}) {
    const pos = [];
    const wire = [];
    for (const st of sets) {
      const h = D.hangStrand(st.anchors, { sag: st.sag + 0.05, step });
      pos.push(D.garlandGeometry(h.points, colors, { shape, ...size }));
      wire.push(...h.wire);
    }
    const mesh = new THREE.Mesh(D.merge(pos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    mesh.userData.noAO = true;
    group.add(mesh);
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const line = new THREE.LineSegments(w, new THREE.LineBasicMaterial({ color: wireColor }));
    line.userData.noAO = true;
    group.add(line);
    return mesh;
  }
  const bunting = (group, sets, colors, opts) => flags(group, sets, colors, opts);

  /** Bulbs, wire and glow cards for a set of strands. `glowList` collects the night callbacks. */
  function lights(group, sets, tint, glowList, { halo: haloK = 1 } = {}) {
    const bulbs = [];
    const wire = [];
    for (const s of sets) {
      if (s.points) { bulbs.push(...s.points); wire.push(...s.wire); continue; }
      const h = D.hangStrand(s.anchors, { sag: s.sag, step: s.step ?? 0.5 });
      bulbs.push(...h.points);
      wire.push(...h.wire);
    }
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const line = new THREE.LineSegments(w, new THREE.LineBasicMaterial({ color: 0x1c1b19 }));
    line.userData.noAO = true;
    group.add(line);

    const glass = new THREE.MeshStandardMaterial({ color: tint.glass, roughness: 0.25, metalness: 0, emissive: tint.glow, emissiveIntensity: 0 });
    const bulb = new THREE.InstancedMesh(once('bulb', D.bulbGeometry), glass, bulbs.length);
    const haloGeo = once('haloGeo', () => new THREE.PlaneGeometry(HALO, HALO).rotateX(-rig.pitch));
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const halo = new THREE.InstancedMesh(haloGeo, haloMat, bulbs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3().setScalar(BULB_SCALE);
    bulbs.forEach(({ p }, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      m4.compose(p, q, sc);
      bulb.setMatrixAt(i, m4);
      halo.setMatrixAt(i, m4.makeScale(haloK, haloK, haloK).setPosition(p.x, p.y - 0.05, p.z));
    });
    for (const m of [bulb, halo]) { m.userData.noAO = true; m.computeBoundingSphere(); group.add(m); }
    halo.renderOrder = 3;
    glowList.push((level, k) => {
      glass.emissiveIntensity = (DAY_GLOW * (1 - level) + level * 3.4 * k) * tint.gain;
      haloMat.color.copy(tint.glow).multiplyScalar(Math.max(DAY_HALO * (1 - level), level * 0.5) * haloK * Math.min(k, 3));
    });
    return bulbs.length;
  }

  /** A strand of lights wound round a vertical post or trunk: a tight spiral from `y0` to `y1`. */
  function wrap(x, z, { y0 = 0.74, y1 = 1.86, turns = 6.5, rad = 0.13, n = 46 } = {}) {
    const points = [];
    const wire = [];
    let prev = null;
    for (let i = 0; i <= n * 3; i++) {
      const t = i / (n * 3);
      const a = t * turns * Math.PI * 2;
      const p = new THREE.Vector3(x + Math.cos(a) * rad, y0 + t * (y1 - y0), z + Math.sin(a) * rad);
      if (prev) wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
      if (i % 5 === 0) points.push({ p: p.clone().add(new THREE.Vector3(Math.cos(a) * 0.02, 0.04, Math.sin(a) * 0.02)) });
    }
    return { points, wire };
  }

  /** Instanced copies of one geometry at [x, y, z, yaw, scale] spots; vertex-coloured or tinted per piece. */
  function scatter(group, geometry, material, spots, { colors, shadow = true } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, y, z, yaw = 0, s = 1], i) => {
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m4);
      if (colors) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    mesh.count = spots.length;
    mesh.castShadow = mesh.receiveShadow = shadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }

  return { THREE, D, r, once, glowTex, courtBoxes, walkwayFences, strands, flags, bunting, lights, wrap, scatter, TINTS, GATES };
}
