import * as THREE from 'three';
import { LIFE_LAYER, lifeTime } from '../life/shared.js';
import { PITCH, spriteMesh, writeFrame, hideFrame, flush } from '../life/sprite.js';
import { poseMan } from '../life/man-pose.js';
import { decorLight } from '../life/sky.js';
import { canvas, cardMaterial, cards, TILT } from './halloween.js';
import { loadHaunt } from './haunt-kit.js';

// Round 10, rows 64 and 65: in Halloween the groundskeeper is Death. The keeper's own sprite (and the
// squeegee man's, in the rain) is hidden and a rendered Death takes his place (death.webp, from
// scripts/life/render_death.py: a heavy folded robe with a torn hem, a hood with a skull and pale
// eyes inside, bony hands, a real scythe on the shoulder; the keeper's walk). Everything he does
// stays the keeper's: this follows the sprite, turning to the way it moves and walking the clip by the
// distance covered. After dark a low mist drifts from his hem. Hover names him, a click makes him
// bow and say "Boo!".

const NAMES = ['life_keeper', 'life_squeegee_man'];
const BOW = 1.4; // s
const UP = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));
const BACK = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));

const booTexture = () => canvas(128, 64, (g) => {
  g.fillStyle = '#f6f4ee'; g.strokeStyle = '#14110f'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(4, 4, 120, 44, 6); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(30, 48); g.lineTo(26, 62); g.lineTo(44, 48); g.fill(); g.stroke();
  g.fillStyle = '#14110f'; g.font = '600 30px Switzer, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Boo!', 64, 27);
});
const mistTexture = () => canvas(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(190,210,255,0.9)'); r.addColorStop(1, 'rgba(190,210,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

export function buildDeath({ ctx }) {
  const { scene, camera, quality } = ctx;
  const group = new THREE.Group();
  const plane = new THREE.PlaneGeometry(1, 1);
  const boo = cards(plane, cardMaterial(booTexture()), 2, 'life_death_boo', 6);
  const mistMat = cardMaterial(mistTexture());
  mistMat.blending = THREE.AdditiveBlending;
  mistMat.color.setRGB(2.4, 3.0, 4.2); // the night grade would swallow a plain glow: a cold, over-bright one survives it
  const mist = cards(plane, mistMat, 20, 'life_death_mist', 5);
  for (const m of [boo, mist]) { m.layers.set(LIFE_LAYER); m.count = 0; group.add(m); }

  let kit = null; // { data, body, shadow } once the atlas is in
  loadHaunt('death', quality, { shadow: true }).then(({ data, bodyTex, shadowTex }) => {
    const body = spriteMesh(bodyTex, 2, { slide: 0.32, lift: 1.3 });
    const shadow = spriteMesh(shadowTex, 2, { ground: true, shadow: true, strength: 0.6 });
    body.name = 'life_death';
    shadow.name = 'life_death_shadow';
    for (const o of [body, shadow]) { o.layers.set(LIFE_LAYER); o.frustumCulled = false; o.userData.noAO = true; o.visible = false; }
    for (let i = 0; i < 2; i++) { hideFrame(body, i); hideFrame(shadow, i); }
    group.add(shadow, body);
    kit = { data, body, shadow };
  }).catch((err) => console.warn('Death failed', err));

  const men = []; // { mesh, shadow, slot, last, heading, clipT, bow }
  let scanned = -9;
  const m4 = new THREE.Matrix4(); const e = new THREE.Matrix4();
  const p = new THREE.Vector3(); const o = new THREE.Vector3(); const s = new THREE.Vector3(); const col = new THREE.Color();
  const right = new THREE.Vector3();

  function scan(t) {
    scanned = t;
    for (const name of NAMES) {
      const mesh = scene.getObjectByName(name);
      if (mesh && !men.some((m) => m.mesh === mesh)) men.push({ mesh, shadow: scene.getObjectByName(`${name}_shadow`), slot: men.length, last: null, heading: 0, clipT: 0, bow: -9, show: false });
    }
  }
  const foot = (m) => { m.mesh.getMatrixAt(0, e); const el = e.elements; return el[0] === 0 && el[5] === 0 ? null : p.set(el[12], el[13], el[14]); };

  function update(t, dt, night) {
    decorLight.nightKeeper = true; // he works after dark too
    if (t - scanned > 1) scan(t);
    if (!kit) return false;
    const speed = kit.data.speed?.walk || 1.2;
    let n = 0; let mists = 0; let booN = 0;
    for (const m of men) {
      const f0 = foot(m);
      const alpha = m.mesh.material.opacity;
      const on = !!f0 && alpha > 0.02;
      m.mesh.visible = false; m.shadow && (m.shadow.visible = false); // the keeper's own sprite gives way
      if (!on) { hideFrame(kit.body, m.slot); hideFrame(kit.shadow, m.slot); continue; }
      const f = f0.clone();
      if (m.last) {
        const dx = f.x - m.last.x; const dz = f.z - m.last.z; const d = Math.hypot(dx, dz);
        if (d > 0.002) { m.heading = Math.atan2(dx, -dz); m.clipT += d / speed; }
      }
      m.last = f.clone();
      const u = (t - m.bow) / BOW;
      const bow = u >= 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
      poseMan(kit.data, kit.body, kit.shadow, m.slot, 'walk', m.heading, m.clipT, f.x, f.y, f.z, 1 - bow * 0.07);
      kit.body.material.opacity = alpha;
      kit.shadow.material.opacity = 0.6 * alpha;
      n++;
      if (bow || (u >= 0 && u < 1)) {
        o.copy(f).addScaledVector(UP, 2.1).addScaledVector(BACK, 0.4); o.x += 0.4;
        boo.setMatrixAt(booN, m4.compose(o, TILT, s.set(0.9, 0.45, 1)));
        boo.setColorAt(booN, col.setScalar(Math.min(1, (1 - u) * 3) * alpha));
        booN++;
      }
    }
    kit.body.visible = kit.shadow.visible = n > 0;
    flush(kit.body); flush(kit.shadow);
    boo.count = booN;
    if (booN) { boo.instanceMatrix.needsUpdate = true; boo.instanceColor.needsUpdate = true; }
    // Mist at night, drifting off his hem.
    {
      for (const m of men) {
        if (!m.last || m.mesh.material.opacity < 0.02) continue;
        // A cold aura round him, so the black robe reads against the dark.
        o.copy(m.last).addScaledVector(UP, 0.95).addScaledVector(BACK, 0.2);
        mist.setMatrixAt(mists, m4.compose(o, TILT, s.set(2.0 + night * 0.6, 2.4 + night * 0.6, 1)));
        mist.setColorAt(mists, col.setScalar(0.04 + 0.45 * night));
        mists++;
        const hd = ((Math.round((m.heading / (Math.PI * 2)) * 8) % 8) + 8) % 8;
        if (hd >= 3 && hd <= 5) { // facing us: two pale eyes in the hood
          for (const sx of [-0.05, 0.05]) {
            o.copy(m.last).addScaledVector(UP, 1.22).addScaledVector(BACK, 0.45); o.x += sx;
            mist.setMatrixAt(mists, m4.compose(o, TILT, s.set(0.14, 0.14, 1)));
            mist.setColorAt(mists, col.setScalar(0.5 + 0.5 * night));
            mists++;
          }
        }
        for (let k = 0; k < 3 && mists < 20; k++, mists++) {
          const ph = (t * 0.35 + k / 3 + m.slot * 0.2) % 1;
          o.set(m.last.x + Math.sin(k * 2.1 + t * 0.4) * 0.35, m.last.y + 0.08 + ph * 0.45, m.last.z + 0.1 + Math.cos(k * 1.7) * 0.2);
          mist.setMatrixAt(mists, m4.compose(o, TILT, s.set(0.9 + ph * 0.8, 0.5 + ph * 0.5, 1)));
          mist.setColorAt(mists, col.setScalar(Math.sin(ph * Math.PI) * 0.3 * night));
        }
      }
    }
    mist.count = mists;
    if (mists) { mist.instanceMatrix.needsUpdate = true; mist.instanceColor.needsUpdate = true; }
    return n > 0;
  }

  const hit = (x, y) => {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const m of men) {
      const f = foot(m);
      if (!f || m.mesh.material.opacity < 0.3) continue;
      p.copy(f).addScaledVector(UP, 0.9);
      const c = p.clone().project(camera);
      const sx = ((c.x + 1) / 2) * innerWidth; const sy = ((1 - c.y) / 2) * innerHeight;
      const edge = p.clone().addScaledVector(right, 0.6).project(camera);
      const rad = Math.max(30, Math.abs(((edge.x + 1) / 2) * innerWidth - sx));
      if (Math.hypot(sx - x, (sy - y) * 0.7) < rad) return m;
    }
    return null;
  };

  return {
    group,
    update,
    pick: (x, y) => (hit(x, y) ? 'death' : null),
    label: (kind) => (kind === 'death' ? 'Death, groundskeeper' : null),
    click(x, y) {
      const m = hit(x, y);
      if (!m) return false;
      m.bow = lifeTime.value;
      return true;
    },
    /** The season changed: the keeper's own sprites come back. */
    off() {
      decorLight.nightKeeper = false;
      for (const m of men) { m.mesh.visible = true; if (m.shadow) m.shadow.visible = true; }
      men.length = 0;
      scanned = -9;
    },
    debug: () => ({ men: men.length, loaded: !!kit }),
  };
}
