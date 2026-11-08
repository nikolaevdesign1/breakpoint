import * as THREE from 'three';
import { LIFE_LAYER } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { miamiNow } from '../miami-clock.js';
import { daysFromEvent } from './calendar.js';
import { part, merge } from '../life/geom.js';

// The quiet patriotic decor Memorial Day and Veterans Day share (round 11, row 8): masts with the
// flag of the country streaming in a light wind, star garlands in muted red, white and blue along
// the fences and the eave, ribbon bows on the fence posts, soft warm lights. No fireworks, no
// particles, no bright flashes (July 4th has those). The one difference between the two days:
// on Memorial Day, before noon in Miami, the flags fly at half-staff, and at noon they are raised
// to the top (45 s, once); Veterans Day they fly full all day. A day that is only previewed
// (forced from the menu, or the days around the real one) flies them full.
// Dev: __bp.seasons.flags.at(hours) pins the hour, .state() says where they are.

const POLE = 7;
const MASTS = [[-43.5, 3.8], [-43.5, -3.8], [-17.5, -46.4], [30.5, -46.4], [43.5, -46.2]]; // the street end of the walkway, and the lawn along the clubhouse
const L = 1.7; // flag, m
const H = 0.9;
const HALF = 0.56; // half-staff: the flag's top edge at this share of the pole
const RAISE = 45; // s the flag takes to climb at noon
const MUTED = ['#a8343a', '#efeade', '#40507f'];

/** Stars and stripes, a little larger than the walkway flags (decor.js): 13 stripes, 50 stars in rows. */
function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 380; c.height = 200;
  const g = c.getContext('2d');
  const s = c.height / 13;
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#efeade' : '#a8343a'; g.fillRect(0, i * s, c.width, s + 1); }
  g.fillStyle = '#40507f';
  g.fillRect(0, 0, c.width * 0.4, s * 7);
  g.fillStyle = '#efeade';
  for (let row = 0; row < 9; row++) {
    const n = row % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const x = (row % 2 ? k + 1 : k + 0.5) * (c.width * 0.4 / 6.2) + 2;
      const y = (row + 0.7) * (s * 7 / 9.6);
      g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A ribbon bow, white: two flat loops, a knot, two tails (tinted per piece). */
function bowGeometry() {
  const loop = (side) => part(new THREE.TorusGeometry(0.13, 0.035, 5, 14).scale(1.15, 0.8, 0.5).rotateZ(side * 0.45).translate(side * 0.16, 0, 0), '#ffffff');
  return merge([
    loop(-1), loop(1),
    part(new THREE.SphereGeometry(0.06, 8, 6), '#e8e8e8'),
    part(new THREE.BoxGeometry(0.075, 0.34, 0.02).rotateZ(0.22).translate(-0.06, -0.2, 0), '#ffffff'),
    part(new THREE.BoxGeometry(0.075, 0.34, 0.02).rotateZ(-0.22).translate(0.06, -0.2, 0), '#ffffff'),
  ]);
}

export function buildPatriot(kit, { memorial }) {
  const { ctx, plan, flags, lights, strands, walkwayFences, TINTS, scatter, once, still } = kit;
  const group = new THREE.Group();
  const glow = [];

  // Stars on the fences and the eave, ribbon bows on the end posts of every fence.
  flags(group, strands({ y: 3.15, out: 0.2, eave: false }), MUTED, { shape: 'star', size: { w: 0.36, l: 0.36 }, step: 1.0 });
  flags(group, strands({ fences: false, y: 3.0 }), MUTED, { shape: 'star', size: { w: 0.4, l: 0.4 }, step: 1.2 });
  lights(group, strands({ fences: false, y: 3.7 }), TINTS.WARM, glow, { halo: 0.7 });
  lights(group, strands({ eave: false, y: 3.7 }).filter((_, i) => i % 2 === 0), TINTS.SILVER, glow, { halo: 0.6 });

  const bows = [];
  for (const f of walkwayFences()) for (const x of [f.x0 + 0.12, f.x1 - 0.12]) bows.push([x, 2.35, f.z + f.side * 0.24, 0, 1.5]);
  scatter(group, once('patriot-bow', bowGeometry), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }), bows, { colors: ['#a8343a', '#efeade', '#40507f'], shadow: false });

  // Masts (static) and flags (live, on the life layer).
  const masts = [];
  for (const [x, z] of MASTS) {
    const at = plan.settle(x, z, 0.3, 1.2);
    if (!at) continue;
    plan.take(at.x, at.z, 0.4);
    masts.push({ x: at.x, y: plan.floorY(at.x, at.z), z: at.z });
  }
  const mastGeo = once('patriot-mast', () => merge([
    part(new THREE.CylinderGeometry(0.045, 0.08, POLE, 8).translate(0, POLE / 2, 0), '#e6e3da'),
    part(new THREE.CylinderGeometry(0.2, 0.26, 0.18, 10).translate(0, 0.09, 0), '#8a8d92'),
    part(new THREE.SphereGeometry(0.08, 8, 6).translate(0, POLE + 0.06, 0), '#c9a54a'),
    part(new THREE.BoxGeometry(0.4, 0.03, 0.03).translate(0.2, POLE - 0.2, 0), '#e6e3da'), // a short yardarm for the flag to hang from
  ]));
  const poles = scatter(group, mastGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }), masts.map((m, i) => [m.x, m.y, m.z, 0, 1]));
  void poles;

  const uT = { value: 0 };
  const geo = new THREE.PlaneGeometry(L, H, 16, 6).translate(L / 2 + 0.06, -H / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uT = uT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT;\nvarying float vFold;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float u = clamp((position.x - 0.06) / ${L.toFixed(2)}, 0.0, 1.0);
        float w = sin(u * 7.0 - uT * 2.6) + 0.35 * sin(u * 13.0 - uT * 4.1 + position.y * 3.0);
        transformed.z += w * 0.09 * u;
        transformed.x -= abs(w) * 0.035 * u;
        transformed.y -= u * u * 0.05;
        vFold = 0.9 + 0.1 * cos(u * 7.0 - uT * 2.6);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFold;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n        diffuseColor.rgb *= vFold;');
  };
  mat.customProgramCacheKey = () => 'patriot-flag';
  gradeLife(mat);
  const live = new THREE.Group();
  live.name = 'patriot_live';
  const cloths = masts.map((m, i) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(LIFE_LAYER);
    mesh.frustumCulled = false;
    mesh.userData.noAO = true;
    mesh.rotation.y = -0.12 + (i % 2) * 0.24; // not all the same way
    live.add(mesh);
    return mesh;
  });

  // Where the flags are: Memorial Day before noon, half-staff; at noon they climb; otherwise full.
  let pin = null;
  let pinToday = false; // dev: pretend it is Memorial Day itself
  let raiseAt = null; // performance seconds the climb began (the noon seen live)
  let lastHours = null;
  const rise = (hours, now) => {
    const today = memorial && (pinToday || daysFromEvent('memorial-day', miamiNow()) === 0);
    if (!today) { lastHours = null; return 1; }
    if (hours < 12) { raiseAt = null; lastHours = hours; return 0; }
    if (lastHours != null && lastHours < 12) raiseAt = now; // noon passed while it was watched
    lastHours = hours;
    if (raiseAt == null) return 1; // up already (loaded after noon)
    const k = Math.min(1, (now - raiseAt) / RAISE);
    if (k >= 1) raiseAt = null;
    return k * k * (3 - 2 * k);
  };

  let state = 1;
  const api = {
    update(t, dt, night) {
      if (!live.parent) ctx.scene.add(live);
      if (!still) uT.value = t;
      const n = miamiNow();
      state = rise(pin ?? n.hours, performance.now() / 1000);
      masts.forEach((m, i) => {
        const top = POLE * (HALF + (1 - HALF) * state) - 0.05;
        cloths[i].position.set(m.x, m.y + top, m.z);
      });
      mat.color.setScalar(0.95 - 0.38 * night); // flags in the dusk: not lit from below, dim
      return !still;
    },
    pick: () => null,
    label: () => null,
    click: () => false,
    off() { ctx.scene.remove(live); raiseAt = null; lastHours = null; },
    state: () => ({ hoist: +state.toFixed(2), memorialToday: memorial && (pinToday || daysFromEvent('memorial-day', miamiNow()) === 0), masts: masts.length }),
    at(hours, today = false) { pin = hours; pinToday = today; },
  };
  if (import.meta.env.DEV) { window.__bp ??= {}; window.__bp.seasons ??= {}; window.__bp.seasons.flags = api; }

  return { group, glow, live: api, accent: { tint: [1.0, 0.99, 1.02] } };
}
