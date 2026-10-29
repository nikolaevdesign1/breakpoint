import * as THREE from 'three';
import { COURTS } from '../../shared/availability.js';

// Round 9: one court picker for the map details in fun/ (scoreboard, light test). It raycasts the
// court planes (<id>_hl) once per pointer move and tells every listener which court is under a
// mouse pointer (null when none, or while a button is held: a drag pans the map).

let shared = null;

export function courtPick({ root, camera, renderer }) {
  if (shared) return shared;
  const canvas = renderer.domElement;
  const planes = [];
  const courts = new Map(); // plane -> { court, box }
  for (const c of COURTS) {
    const plane = root.getObjectByName(`${c.id}_hl`);
    if (!plane) continue;
    planes.push(plane);
    courts.set(plane, { court: c, box: new THREE.Box3().setFromObject(plane) });
  }
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const listeners = new Set();
  let current = null;

  function at(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(planes, false)[0];
    return hit ? courts.get(hit.object) : null;
  }
  function set(next, e) {
    if (next === current) return;
    current = next;
    listeners.forEach((fn) => fn(current, e));
  }
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    set(e.buttons ? null : at(e.clientX, e.clientY), e);
  });
  canvas.addEventListener('pointerleave', (e) => set(null, e));
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') set(null, e); });

  shared = {
    at,
    /** fn({ court, box } | null, event) on every change of the court under the mouse. */
    on(fn) { listeners.add(fn); },
    current: () => current,
    byId: (id) => [...courts.values()].find((c) => c.court.id === id) ?? null,
    all: () => [...courts.values()],
  };
  return shared;
}
