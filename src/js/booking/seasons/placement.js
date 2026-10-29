import * as THREE from 'three';

// Where decor may stand (round 8, "seasons"). Built once, the first time decor goes up:
// - an occupancy grid (20 cm cells) of everything standing on the ground plan: props, planters,
//   benches, bins, fences, poles, walls (mesh vertices and triangle edges between 10 cm and 2.6 m,
//   plus every instance's box), so a pumpkin never sits inside a planter or a bench;
// - the walkable floor (ground, paths, aprons, the deck, the car park) for a downward raycast that
//   gives the height a thing stands at.

const CELL = 0.2;
const X0 = -64;
const Z0 = -104;
const W = 1040;
const H = 1040;
const FLOOR = /^(ground|paths|parking_|chill_sand)|_(apron|hl|pool)$|^(clay|hard|grass|padel)-\d$/;

export function createPlacement(root) {
  const grid = new Uint8Array(W * H);
  const mark = (x, z) => {
    const i = Math.floor((x - X0) / CELL);
    const j = Math.floor((z - Z0) / CELL);
    if (i >= 0 && j >= 0 && i < W && j < H) grid[j * W + i] = 1;
  };
  const floors = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const box = new THREE.Box3();
  const inBand = (y) => y > 0.1 && y < 2.6;

  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (FLOOR.test(o.name) || FLOOR.test(o.parent?.name ?? '')) {
      if (!/_(hl|pool)$/.test(o.name)) floors.push(o);
      return;
    }
    const geo = o.geometry;
    if (o.isInstancedMesh) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m4);
        box.copy(geo.boundingBox).applyMatrix4(m4.premultiply(o.matrixWorld));
        if (box.max.y < 0.1) continue;
        for (let x = box.min.x; x <= box.max.x + CELL; x += CELL) for (let z = box.min.z; z <= box.max.z + CELL; z += CELL) mark(Math.min(x, box.max.x), Math.min(z, box.max.z));
      }
      return;
    }
    const pos = geo.attributes.position;
    const idx = geo.index;
    const world = (i, out) => out.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) { world(i, v); if (inBand(v.y)) mark(v.x, v.z); }
    // Edges: a wall is two big triangles, its vertices far apart.
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      for (let e = 0; e < 3; e++) {
        world(idx ? idx.getX(t + e) : t + e, a);
        world(idx ? idx.getX(t + ((e + 1) % 3)) : t + ((e + 1) % 3), b);
        const len = a.distanceTo(b);
        if (len < CELL * 1.5) continue;
        const steps = Math.ceil(len / (CELL * 0.75));
        for (let s = 1; s < steps; s++) {
          v.lerpVectors(a, b, s / steps);
          if (inBand(v.y) || (v.y > -0.05 && v.y <= 0.1 && (a.y > 0.1 || b.y > 0.1))) mark(v.x, v.z);
        }
      }
    }
  });

  /** True when a disc of radius r around (x, z) touches nothing standing. */
  function free(x, z, r) {
    for (let dz = -r; dz <= r + 1e-6; dz += CELL / 2) {
      for (let dx = -r; dx <= r + 1e-6; dx += CELL / 2) {
        if (dx * dx + dz * dz > r * r) continue;
        const i = Math.floor((x + dx - X0) / CELL);
        const j = Math.floor((z + dz - Z0) / CELL);
        if (i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i]) return false;
      }
    }
    return true;
  }

  /** The free spot nearest (x, z) within `reach` m, or null. */
  function settle(x, z, r, reach = 0.8) {
    if (free(x, z, r)) return { x, z };
    for (let d = 0.1; d <= reach + 1e-6; d += 0.1) {
      const n = Math.max(8, Math.round((Math.PI * 2 * d) / 0.1));
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2;
        const px = x + Math.cos(th) * d;
        const pz = z + Math.sin(th) * d;
        if (free(px, pz, r)) return { x: px, z: pz };
      }
    }
    return null;
  }

  /** Marks a disc as taken (decor placed earlier blocks the next piece). */
  function take(x, z, r) {
    for (let dz = -r; dz <= r; dz += CELL / 2) for (let dx = -r; dx <= r; dx += CELL / 2) if (dx * dx + dz * dz <= r * r) mark(x + dx, z + dz);
  }

  // Floor height under a point: one ray down against the walkable meshes.
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 20);
  function floorY(x, z) {
    ray.ray.origin.set(x, 8, z);
    const hit = ray.intersectObjects(floors, false)[0];
    return hit ? Math.max(0, hit.point.y) : 0;
  }

  /** A copy of the grid, so each season places into a fresh plan. */
  function fork() {
    const saved = grid.slice();
    return { free, settle, take, floorY, restore: () => grid.set(saved) };
  }

  return { free, settle, take, floorY, fork };
}
