import * as THREE from 'three';
import { LIFE_LAYER, lifeTime } from './shared.js';
import { gradeLife } from '../lookdev.js';
import { spriteMesh, hideFrame, flush } from './sprite.js';
import { poseMan } from './man-pose.js';
import { pathGrid, route } from './cat.js';
import { COURTS } from '../../shared/availability.js';
import { clubHours } from './clock.js';
import { box, merge, part } from './geom.js';
import { courtFrame, furniture } from './keeper.js';
import { onWeather, skyLight } from './sky.js';

// Squeegee after the rain (round 9, row 27). While it rains the hard courts take a sheet of
// standing water (a dark, glossy film on the life layer). When the rain stops, the groundskeeper
// (life/keeper.js: the same man, the same flipbook; his clay round waits meanwhile) walks out to the
// hard court nearest the middle of the view with a court squeegee and works the near half in lanes
// across the court, pushing the water off to the sides: behind the blade the court is dry, a bright
// ridge of water runs in front of it. The other courts dry on their own, more slowly.

const BLADE = 1.5; // m
const REACH = 1.2; // m from his feet to the blade
const LANE = 1.4; // m between lanes (the blade overlaps a little)
const SPEED = { push: 1.25, walk: 1.35 }; // m/s
const TURN = 3.4; // rad/s
const MASK = [48, 96]; // dry mask texels across × along the court
const WET = { in: 26, out: 150, clickIn: 7 }; // s to soak / to dry by themselves
const COME = { live: 14, click: 3.5 }; // s after the rain stops
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function sheetMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending, // premultiplied: the film darkens, the sheen adds
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMask;
      uniform float uWet, uLight, uTime, uOn;
      uniform vec4 uBlade; // x, z, forward x, forward z
      varying vec2 vUv;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
      }
      void main() {
        float dry = texture2D(uMask, vUv).r;
        // Standing water is never even: thinner patches, a few dry crowns.
        float n = noise(vWorld.xz * 0.35) * 0.6 + noise(vWorld.xz * 1.3) * 0.4;
        float wet = uWet * smoothstep(0.18, 0.5, n + uWet * 0.45) * (1.0 - 0.86 * dry);
        // The ridge of water riding in front of the blade.
        vec2 rel = vWorld.xz - uBlade.xy;
        float ahead = dot(rel, uBlade.zw);
        float side = abs(dot(rel, vec2(-uBlade.w, uBlade.z)));
        float ridge = uOn * (1.0 - smoothstep(${(BLADE / 2 - 0.12).toFixed(2)}, ${(BLADE / 2 + 0.06).toFixed(2)}, side))
          * smoothstep(-0.02, 0.08, ahead) * (1.0 - smoothstep(0.12, 0.5, ahead)) * max(uWet, 0.3);
        float a = clamp(wet * 0.34 + ridge * 0.3, 0.0, 0.6);
        if (a < 0.003) discard;
        float glint = pow(noise(vWorld.xz * 3.1 + vec2(uTime * 0.25, -uTime * 0.18)), 6.0);
        vec3 sheen = vec3(0.6, 0.67, 0.74) * (0.07 * wet + 0.22 * ridge + 0.18 * glint * wet) * uLight;
        gl_FragColor = vec4(sheen, a);
      }`,
  });
}

/** The squeegee in its own frame: forward is −z, the blade on the court ahead of his feet. */
function squeegeeGeometry() {
  const parts = [
    box(BLADE, 0.07, 0.06, 0, 0.035, -REACH, '#151515'), // rubber blade
    box(BLADE, 0.05, 0.09, 0, 0.09, -REACH + 0.01, '#3d3f41'), // frame
  ];
  const from = new THREE.Vector3(0, 0.98, -0.3); // the hands
  const to = new THREE.Vector3(0, 0.1, -REACH + 0.02);
  const d = to.clone().sub(from);
  const handle = new THREE.BoxGeometry(0.035, 0.035, d.length());
  handle.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize()));
  handle.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  parts.push(part(handle, '#a4a7aa')); // aluminium
  return merge(parts);
}

export function createSqueegee(ctx, { still }) {
  if (still) return null;
  const { scene, root, camera, keeper, players } = ctx;
  if (!keeper) return null;
  const props = furniture(scene);
  const courts = COURTS.filter((c) => c.type === 'hard').map((c) => courtFrame(root, c.id, props)).filter(Boolean);
  if (!courts.length) return null;

  // --- Water sheets, one per hard court; the worked court gets the dry mask ---
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const maskData = new Uint8Array(MASK[0] * MASK[1] * 4);
  const mask = new THREE.DataTexture(maskData, MASK[0], MASK[1]);
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearFilter;
  const blade = { value: new THREE.Vector4(0, 0, 0, -1) };
  const sheets = courts.map((cf) => {
    const uniforms = { uMask: { value: blank }, uWet: { value: 0 }, uLight: skyLight, uTime: lifeTime, uOn: { value: 0 }, uBlade: blade };
    // The sheet spans the court and its runouts: u across (x), w along (from the net to the gate).
    const geo = new THREE.PlaneGeometry(cf.W * 2 - 0.4, cf.H * 2 - 0.4);
    geo.rotateX(-Math.PI / 2);
    if (cf.s < 0) geo.rotateY(Math.PI); // uv v runs from the far end to the gate end either way
    const mesh = new THREE.Mesh(geo, sheetMaterial(uniforms));
    mesh.position.set(cf.cx, cf.y + 0.012, cf.cz);
    mesh.name = `life_court_water_${cf.id}`;
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.userData.noAO = true;
    mesh.layers.set(LIFE_LAYER);
    scene.add(mesh);
    return { cf, mesh, uniforms, wet: 0 };
  });
  const sheetOf = (cf) => sheets.find((s) => s.cf === cf);

  // --- The man and his squeegee (the keeper's flipbook, shared textures) ---
  let man = null;
  function dress() {
    const a = keeper.assets;
    if (!a || man) return !!man;
    const body = spriteMesh(a.bodyTex, 1, { slide: 0.32, lift: 1.35 });
    const shadow = spriteMesh(a.shadowTex, 1, { ground: true, shadow: true, strength: 0.6 });
    body.name = 'life_squeegee_man';
    shadow.name = 'life_squeegee_man_shadow';
    const tool = new THREE.Mesh(squeegeeGeometry(), gradeLife(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 })));
    tool.name = 'life_squeegee';
    for (const o of [body, shadow, tool]) { o.layers.set(LIFE_LAYER); o.frustumCulled = false; o.userData.noAO = true; }
    tool.visible = false;
    scene.add(shadow, tool, body);
    hideFrame(body, 0); hideFrame(shadow, 0); flush(body); flush(shadow);
    man = { data: a.data, body, shadow, tool };
    return true;
  }

  let grid = null;
  const cellNear = (p) => {
    let best = -1;
    let bestD = Infinity;
    for (const c of grid.cells) {
      const q = grid.centre(c);
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  function onScreen(p, pad = 40) {
    const v = new THREE.Vector3(p.x, p.y ?? 0, p.z).project(camera);
    const x = ((v.x + 1) / 2) * innerWidth;
    const y = ((1 - v.y) / 2) * innerHeight;
    return v.z < 1 && x > -pad && x < innerWidth + pad && y > -pad && y < innerHeight + pad;
  }
  /** A walk along the paths from 12–24 m away to `gate`, off screen if there is one. */
  function walkIn(gate) {
    grid ??= pathGrid(root);
    if (!grid) return [];
    const to = cellNear(gate);
    const options = [];
    for (let tries = 0; tries < 60 && options.length < 12; tries++) {
      const c = pick(grid.cells);
      const p = grid.centre(c);
      const d = Math.hypot(p.x - gate.x, p.z - gate.z);
      if (d < 12 || d > 24) continue;
      const r = route(grid, c, to);
      if (r && r.length < 30) options.push({ r, off: !onScreen(p) });
    }
    const off = options.filter((o) => o.off);
    return ((off.length ? pick(off) : pick(options))?.r ?? []).map((p) => p.clone());
  }

  // --- The job ---
  const job = { on: false, cf: null, path: [], pos: new THREE.Vector3(), heading: 0, clipT: 0, fade: 0, pushing: false };

  function plan(cf) {
    const out = cf.world(0, cf.H + 1.1);
    const into = cf.world(0, cf.H - 0.8);
    const path = [];
    walkIn(out).forEach((p) => path.push({ p: p.setY(cf.y), push: false }));
    path.push({ p: out, push: false }, { p: into, push: false });
    // Lanes across the near half, from the back of the court to the net, the water pushed off to
    // alternate sides; between lanes he steps over without the blade on the court.
    const reachU = Math.min(cf.W - 1.4, 7.2);
    let side = Math.random() < 0.5 ? -1 : 1;
    const ws = [];
    for (let w = Math.min(cf.H - 2.4, 12.6); w >= 0.9; w -= LANE) ws.push(w);
    // He stands behind the blade: his feet trail it by REACH along the lane.
    path.push({ p: cf.world(side * (reachU + REACH), ws[0]), push: false });
    ws.forEach((w, i) => {
      path.push({ p: cf.world(-side * (reachU - REACH), w), push: true });
      if (i < ws.length - 1) {
        path.push({ p: cf.world(-side * (reachU + 0.3), w), push: false });
        path.push({ p: cf.world(-side * (reachU + REACH), ws[i + 1]), push: false });
      }
      side = -side;
    });
    path.push({ p: into, push: false }, { p: out, push: false });
    walkIn(out).reverse().forEach((p) => path.push({ p: p.setY(cf.y), push: false }));
    path[path.length - 1].done = true;
    return path;
  }

  function start(cf) {
    if (!dress()) return false;
    job.path = plan(cf);
    if (job.path.length < 4) return false;
    job.on = true;
    job.cf = cf;
    job.pos.copy(job.path[0].p);
    job.heading = Math.atan2(job.path[1].p.x - job.pos.x, -(job.path[1].p.z - job.pos.z));
    job.fade = 0;
    job.clipT = Math.random();
    maskData.fill(0);
    mask.needsUpdate = true;
    const sheet = sheetOf(cf);
    sheets.forEach((s) => { s.uniforms.uMask.value = s === sheet ? mask : blank; });
    keeper.hold?.(true);
    return true;
  }

  function finish() {
    job.on = false;
    job.pushing = false;
    blade.value.w = -1;
    sheets.forEach((s) => { s.uniforms.uOn.value = 0; });
    if (man) { hideFrame(man.body, 0); hideFrame(man.shadow, 0); flush(man.body); flush(man.shadow); man.tool.visible = false; }
    keeper.hold?.(false);
  }

  /** Marks the blade's sweep as dry on the mask. */
  const fwd = new THREE.Vector2();
  function paint(cf, bx, bz) {
    const loc = cf.local(bx, bz);
    const u = cf.s < 0 ? -loc.u : loc.u; // the sheet is turned round on the far row
    const { w } = loc;
    const across = MASK[0] / (cf.W * 2 - 0.4);
    const along = MASK[1] / (cf.H * 2 - 0.4);
    // texel of (u, w): u from −W.., w from −H..; the sheet's v runs from the far end (w = −H) up
    const cu = (u + cf.W - 0.2) * across;
    const cw = (w + cf.H - 0.2) * along;
    // the blade lies across the lane direction (fwd): mostly along w here, give it its length
    const half = BLADE / 2;
    const span = Math.abs(fwd.x) > Math.abs(fwd.y) ? [0.35 * across, half * along] : [half * across, 0.35 * along];
    let changed = false;
    for (let j = Math.floor(cw - span[1]); j <= Math.ceil(cw + span[1]); j++) {
      if (j < 0 || j >= MASK[1]) continue;
      for (let i = Math.floor(cu - span[0]); i <= Math.ceil(cu + span[0]); i++) {
        if (i < 0 || i >= MASK[0]) continue;
        const k = (j * MASK[0] + i) * 4;
        if (maskData[k] !== 255) { maskData[k] = 255; changed = true; }
      }
    }
    if (changed) mask.needsUpdate = true;
  }

  function step(dt) {
    const g = job.path[0];
    if (!g) return;
    job.pushing = !!g.push;
    const speed = SPEED[job.pushing ? 'push' : 'walk'];
    let left = speed * dt;
    while (left > 0 && job.path.length) {
      const q = job.path[0];
      const d = Math.hypot(q.p.x - job.pos.x, q.p.z - job.pos.z);
      if (d > 0.04 && !(q.push === false && job.pushing)) {
        const target = Math.atan2(q.p.x - job.pos.x, -(q.p.z - job.pos.z));
        let dh = target - job.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        job.heading += Math.max(-TURN * dt, Math.min(TURN * dt, dh));
      }
      if (d <= left) {
        job.pos.x = q.p.x; job.pos.z = q.p.z;
        left -= d;
        job.path.shift();
        if (q.done) { finish(); return; }
      } else {
        job.pos.x += ((q.p.x - job.pos.x) / d) * left;
        job.pos.z += ((q.p.z - job.pos.z) / d) * left;
        left = 0;
      }
    }
    job.pos.y = job.cf.y;
    job.clipT += dt * (speed / (man.data.speed?.walk || speed)) * (job.pushing ? 0.85 : 1);
    if (job.fade < 1 && job.path.length > 1) job.fade = Math.min(1, job.fade + dt * 2);
    if (job.path.length === 1) job.fade = Math.min(job.fade, Math.hypot(job.path[0].p.x - job.pos.x, job.path[0].p.z - job.pos.z) / 2.5);
  }

  function draw() {
    const { data, body, shadow, tool } = man;
    poseMan(data, body, shadow, 0, 'walk', job.heading, job.clipT, job.pos.x, job.pos.y, job.pos.z);
    body.material.opacity = job.fade;
    shadow.material.opacity = 0.6 * job.fade;
    flush(body);
    flush(shadow);
    tool.visible = job.fade > 0.05;
    tool.position.copy(job.pos);
    tool.rotation.y = -job.heading;
  }

  // --- Weather: soak while it rains, call him when it stops ---
  let raining = false;
  let manual = false;
  let callAt = 0;
  onWeather((d) => {
    const now = (d.rain ?? 0) > 0;
    manual = !!d.manual;
    if (raining && !now) callAt = performance.now() / 1000 + (manual ? COME.click : COME.live);
    if (now) callAt = 0;
    raining = now;
    if (manual && !now) { // a click to sun: the sheets are gone at once, nobody comes with the squeegee
      callAt = 0;
      if (job.on) finish();
      for (const s of sheets) { s.wet = 0; s.uniforms.uWet.value = 0; s.mesh.visible = false; }
    }
  });

  function viewCentre() {
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const t = -camera.position.y / look.y;
    return { x: camera.position.x + look.x * t, z: camera.position.z + look.z * t };
  }
  function chooseCourt() {
    const c = viewCentre();
    const byDist = sheets.filter((s) => s.wet > 0.35).sort((a, b) => Math.hypot(a.cf.cx - c.x, a.cf.cz - c.z) - Math.hypot(b.cf.cx - c.x, b.cf.cz - c.z));
    return (byDist.find((s) => !players?.game?.(s.cf.id)) ?? byDist[0])?.cf ?? null;
  }

  let last = performance.now() / 1000;
  return {
    name: 'squeegee',
    tick() {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      // Water on the courts.
      let any = false;
      for (const s of sheets) {
        s.wet = raining
          ? Math.min(1, s.wet + dt / (manual ? WET.clickIn : WET.in))
          : Math.max(0, s.wet - dt / WET.out);
        s.uniforms.uWet.value = s.wet;
        s.mesh.visible = s.wet > 0.004;
        any ||= s.mesh.visible;
      }
      if (callAt && now > callAt) {
        callAt = 0;
        const h = clubHours() % 24;
        const cf = !job.on && h > 6 && h < 22.5 ? chooseCourt() : null;
        if (cf) start(cf);
      }
      if (job.on) {
        if (raining) finish(); // back inside: it is raining again
        else {
          step(dt);
          if (job.on) {
            fwd.set(Math.sin(job.heading), -Math.cos(job.heading));
            const bx = job.pos.x + fwd.x * REACH;
            const bz = job.pos.z + fwd.y * REACH;
            const sheet = sheetOf(job.cf);
            blade.value.set(bx, bz, fwd.x, fwd.y);
            sheet.uniforms.uOn.value = job.pushing ? 1 : 0;
            if (job.pushing) paint(job.cf, bx, bz);
            draw();
          }
        }
      }
      return any || job.on;
    },
    debug: () => ({
      on: job.on, court: job.cf?.id ?? null, pushing: job.pushing, left: job.path.length,
      wet: Object.fromEntries(sheets.map((s) => [s.cf.id, +s.wet.toFixed(2)])), callIn: callAt ? +(callAt - performance.now() / 1000).toFixed(1) : null,
    }),
    where: () => (job.on ? { x: job.pos.x, z: job.pos.z } : null),
    courts: () => courts.map((c) => ({ id: c.id, cx: +c.cx.toFixed(1), cz: +c.cz.toFixed(1), s: c.s, H: +c.H.toFixed(1), W: +c.W.toFixed(1) })),
    path: () => job.path.slice(0, 60).map((q) => [+q.p.x.toFixed(1), +q.p.z.toFixed(1), q.push ? 1 : 0]),
    /** Dev: soak the hard courts and send him to `id` (or the nearest) now; `skip` s of his walk done at once. */
    trigger(id, skip = 0) {
      sheets.forEach((s) => { s.wet = 1; });
      const cf = id ? courts.find((c) => c.id === id) : chooseCourt();
      if (!cf || !start(cf)) return false;
      for (let t = 0; t < skip && job.on; t += 0.1) { step(0.1); if (job.pushing) { fwd.set(Math.sin(job.heading), -Math.cos(job.heading)); paint(job.cf, job.pos.x + fwd.x * REACH, job.pos.z + fwd.y * REACH); } }
      return true;
    },
  };
}
