import * as THREE from 'three';
import { LIFE_LAYER } from './shared.js';
import { liveSunDir } from './clock.js';
import { weatherSky } from './sky.js';
import { ambientBus } from '../ambient.js';
import { jetFlyover } from '../soundscape.js';
import { currentSeason } from '../seasons/season.js';
import { drawSleigh, sleighBells } from '../seasons/sleigh.js';

// A jet over the club (round 8, "arrival"). Every two to four minutes a wide-body on approach to
// Miami International (about 7 km north-west) passes a few hundred metres up. The drone looks
// down, so the plane itself is never in frame: only its shadow sweeps across the courts in a
// straight line at approach speed, and a distant rumble swells, peaks and rolls away (soundscape.js).
// The shadow is a 60 m airliner silhouette, blurred by the sun's disc (the penumbra grows with the
// distance to the plane along the sun ray, so a low sun gives a softer, fainter shadow) and dimmed
// by clouds; at night there is only the sound. Dev: __bp.lifeDev().plane.trigger().
// Row 36 (round 9): in the holiday season (decor on Holidays, by date or picked) Santa's sleigh
// takes the jet's place: lower and slower, its storybook silhouette crosses the courts and sleigh
// bells jingle by instead of the rumble (seasons/sleigh.js). It comes round sooner, too.

const FIRST = [45, 100]; // s after the map shows
const EVERY = [120, 240];
const SPEED = 74; // m/s, ~145 kn on approach
const ALT = 330; // m above the club (a 3° glide path ~7 km out)
const SIZE = 76; // m the shadow texture covers
const BEARING = 318; // degrees: from the club towards MIA
const LEAD = 9; // s of rumble before the shadow reaches the view
const STRENGTH = 0.5; // darkest the shadow gets (display space)
const TEX = 512; // row 36: the sleigh team has thin legs and antlers
const rand = (a, b) => a + Math.random() * (b - a);
const SLEIGH = { speed: 24, alt: 120, first: [18, 40], every: [70, 140] };
const isSleigh = () => currentSeason() === 'holidays';

/** Top view of a wide-body twin (A330-like), nose up, in metres: span 60, length 63. */
function drawAirliner(g, s) {
  const P = (x, y) => [TEX / 2 + x * s, TEX / 2 + y * s];
  const poly = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
    g.closePath();
    g.fill();
  };
  // fuselage: round nose, straight barrel, tapering tail cone
  g.beginPath();
  g.moveTo(...P(-2.8, -24));
  g.quadraticCurveTo(...P(-2.8, -31.5), ...P(0, -31.5));
  g.quadraticCurveTo(...P(2.8, -31.5), ...P(2.8, -24));
  g.lineTo(...P(2.8, 18));
  g.quadraticCurveTo(...P(2, 27), ...P(0.6, 31.5));
  g.lineTo(...P(-0.6, 31.5));
  g.quadraticCurveTo(...P(-2, 27), ...P(-2.8, 18));
  g.closePath();
  g.fill();
  for (const side of [-1, 1]) {
    // wing: 30° sweep, root chord ~10 m, tip ~2.6 m, a kink at the engine
    poly([[side * 2.5, -4], [side * 11, 1.2], [side * 30, 13.2], [side * 30, 15.8], [side * 11, 8.2], [side * 2.5, 7.4]]);
    // engine nacelle under the wing, sticking out ahead of the leading edge
    g.beginPath();
    g.ellipse(...P(side * 10.2, -1.2), 1.6 * s, 3.4 * s, 0, 0, Math.PI * 2);
    g.fill();
    // tailplane
    poly([[side * 1.6, 22.5], [side * 9.6, 28.2], [side * 9.6, 30], [side * 1.6, 28.4]]);
  }
}

/** Separable box blur (three passes ≈ gaussian of `sigma` px) on the mask. */
function blur(data, w, h, sigma) {
  const r = (Math.sqrt(4 * sigma * sigma + 1) - 1) / 2;
  if (r < 0.5) return;
  const tmp = new Float32Array(w * h);
  const src = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4];
  const rr = Math.max(1, Math.round(r));
  const pass = (a, b, horiz) => {
    const n = horiz ? w : h;
    const m = horiz ? h : w;
    for (let j = 0; j < m; j++) {
      let acc = 0;
      const at = (i) => (horiz ? j * w + i : i * w + j);
      for (let i = -rr; i <= rr; i++) acc += a[at(Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        b[at(i)] = acc / (2 * rr + 1);
        acc += a[at(Math.min(n - 1, i + rr + 1))] - a[at(Math.max(0, i - rr))];
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(src, tmp, true); pass(tmp, src, false); }
  for (let i = 0; i < w * h; i++) data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = src[i];
}

export function createPlane(ctx, { still }) {
  const { scene, rig } = ctx;
  const sun = liveSunDir(ctx);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const g2 = canvas.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  let texBlur = -1;
  let texKind = '';

  // The shadow is a translation of the plane's outline along the sun ray (a level plane over level
  // ground), so it keeps its shape whatever the sun; only the blur and the strength change.
  function paint(sigmaM, kind = 'jet') {
    const px = sigmaM * (TEX / SIZE);
    if (Math.abs(px - texBlur) < 0.6 && kind === texKind) return;
    texBlur = px;
    texKind = kind;
    g2.fillStyle = '#000';
    g2.fillRect(0, 0, TEX, TEX);
    g2.fillStyle = '#fff';
    if (kind === 'sleigh') drawSleigh(g2, (TEX / SIZE) * 1.35, TEX); // a storybook team, larger than life so it reads (~45 m)
    else drawAirliner(g2, TEX / SIZE);
    const img = g2.getImageData(0, 0, TEX, TEX);
    blur(img.data, TEX, TEX, px);
    g2.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  }

  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2); // nose (texture top) towards −z
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life_plane_shadow';
  mesh.layers.set(LIFE_LAYER);
  mesh.renderOrder = 50; // over everything on the life layer: trees, players, birds
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.noAO = true;
  mesh.position.y = 1.5; // roofs and crowns are close enough to the ground at this angle
  scene.add(mesh);

  let pass = null; // { from, dir, t0, length, strength }
  let next = performance.now() / 1000 + rand(...(isSleigh() ? SLEIGH.first : FIRST));
  let sounds = 0;

  function launch({ lead = LEAD } = {}) {
    const now = performance.now() / 1000;
    const sleigh = isSleigh();
    const speed = sleigh ? SLEIGH.speed : SPEED;
    const alt = sleigh ? SLEIGH.alt : ALT;
    if (sleigh) lead = Math.min(lead, 6);
    const b = THREE.MathUtils.degToRad(BEARING + rand(-9, 9));
    const dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b)); // x east, z south
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // Across whatever the visitor is looking at, from off screen to off screen.
    const { x, z, dist } = rig.state;
    const reach = dist * 0.72 + SIZE * 0.5;
    const centre = new THREE.Vector3(x, 0, z).addScaledVector(side, rand(-0.18, 0.18) * dist);
    const from = centre.clone().addScaledVector(dir, -reach);

    // Sun: distance to the plane along the ray sets the penumbra (the sun's disc is ~0.53°).
    const s = sun.update();
    const day = weatherSky.day ?? 1;
    const slant = alt / Math.max(0.12, s.y);
    paint(Math.min(sleigh ? 0.2 : 3, slant * 0.0093 * 0.22), sleigh ? 'sleigh' : 'jet'); // gaussian ≈ a quarter of the penumbra width (the sleigh flies low: crisp)
    const soft = THREE.MathUtils.clamp((s.y - 0.08) / 0.3, 0, 1); // a low sun washes it out
    const strength = still ? 0 : (sleigh ? 1.1 : 1) * STRENGTH * day * Math.min(1, weatherSky.sun ?? 1) ** 1.5 * (0.35 + 0.65 * soft);

    pass = { from, dir, t0: now + lead, length: (reach * 2) / speed, strength, speed, sleigh };
    mesh.rotation.y = -b;
    mesh.position.x = from.x;
    mesh.position.z = from.z;
    mesh.visible = false;
    mat.opacity = strength;

    const bus = ambientBus();
    if (bus) {
      // Screen right is +x: it pans from the side it comes from to the side it goes to.
      const p = THREE.MathUtils.clamp(dir.x * 1.2, -0.8, 0.8);
      if (sleigh) sleighBells(bus, { lead, pass: pass.length, pan0: -p, pan1: p, level: 1 });
      else jetFlyover(bus, { lead: lead + pass.length * 0.5, pan0: -p, pan1: p, level: 1 });
      sounds++;
    }
  }

  return {
    name: 'plane',
    tick() {
      const now = performance.now() / 1000;
      if (!pass) {
        if (now > next) launch();
        return false;
      }
      const t = pass.hold != null ? pass.hold * pass.length : now - pass.t0;
      if (t < 0) return false;
      if (t > pass.length || pass.strength < 0.01) {
        mesh.visible = false;
        pass = null;
        next = now + rand(...(isSleigh() ? SLEIGH.every : EVERY));
        return false;
      }
      mesh.visible = true;
      mesh.position.x = pass.from.x + pass.dir.x * pass.speed * t;
      mesh.position.z = pass.from.z + pass.dir.z * pass.speed * t;
      return true;
    },
    /** Dev: a plane now (shadow in `lead` s, default 1.5); `hold` 0…1 parks the shadow on its track (screenshots). */
    trigger(lead = 1.5, hold = null) {
      mesh.visible = false;
      launch({ lead });
      pass.hold = hold;
      return { lead, strength: +pass.strength.toFixed(2), crossing: +pass.length.toFixed(1) };
    },
    debug: () => (pass
      ? { t: +(performance.now() / 1000 - pass.t0).toFixed(1), strength: +pass.strength.toFixed(2), at: [+mesh.position.x.toFixed(0), +mesh.position.z.toFixed(0)], sounds, sleigh: pass.sleigh }
      : { next: +(next - performance.now() / 1000).toFixed(0), sounds }),
  };
}
