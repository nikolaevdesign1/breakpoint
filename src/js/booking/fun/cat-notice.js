// Round 9 (row 16): the cat notices the pointer. When the mouse rests near the club cat for a
// moment, it stops and turns its head (the whole cat, in its eight headings) towards it; if the
// pointer stays, it dashes off a few metres along the path and sits down again, in plain sight.
// That gives away where it is, which helps the "catch the cat" contest: a click still catches it,
// even mid-dash. Hooks: cat.notice(x, z) and cat.scurry(x, z) in life/cat.js.

const NOTICE_AFTER = 1.1; // s of the pointer resting near the cat
const SCURRY_AFTER = 1.5; // s more before it runs
const AGAIN = 20; // s before it reacts again
const NEAR_PX = 96; // never less than this around the cat on screen
const NEAR_M = 3; // m around the cat

export function createCatNotice({ renderer, rig }, { cat }) {
  if (!cat) return null;
  const canvas = renderer.domElement;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return null;
  const pointer = { x: 0, y: 0, on: false };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.on = !e.buttons;
  });
  canvas.addEventListener('pointerleave', () => { pointer.on = false; });
  canvas.addEventListener('pointerdown', () => { pointer.on = false; });

  let nearSince = 0;
  let phase = 'idle'; // idle | noticed | done
  let phaseAt = 0;
  let quietUntil = 0;

  return {
    name: 'cat-notice',
    tick() {
      const now = performance.now() / 1000;
      const at = cat.where?.();
      if (!at || !pointer.on || now < quietUntil) { nearSince = 0; if (phase !== 'idle' && now >= quietUntil) phase = 'idle'; return false; }
      const s = rig.screenOf(at.x, at.z);
      const e = rig.screenOf(at.x + NEAR_M, at.z);
      const r = Math.max(NEAR_PX, Math.abs(e.x - s.x));
      const near = Math.hypot(pointer.x - s.x, pointer.y - (s.y - 8)) < r;
      if (!near) {
        nearSince = 0;
        if (phase === 'noticed' && now - phaseAt > 2) { phase = 'idle'; quietUntil = now + 4; } // it only looked
        return false;
      }
      nearSince ||= now;
      const g = rig.groundAt(pointer.x, pointer.y);
      if (phase === 'idle' && now - nearSince > NOTICE_AFTER) {
        if (cat.notice?.(g.x, g.z)) { phase = 'noticed'; phaseAt = now; }
      } else if (phase === 'noticed' && now - phaseAt > SCURRY_AFTER) {
        cat.scurry?.(g.x, g.z);
        phase = 'idle';
        nearSince = 0;
        quietUntil = now + AGAIN;
      }
      return false;
    },
    debug: () => ({ phase, near: nearSince ? +(performance.now() / 1000 - nearSince).toFixed(1) : 0 }),
  };
}
