// Row 32: double-click (double-tap) a player and the drone follows them for a while, close in,
// gliding after their moves; any input (press, wheel, key, touch) or the end of the time flies back
// to the view there was before. Players and padel players answer `personAt(x, y)` with a live
// position getter. A single click still opens the court underneath; the double-click closes that
// panel again (Escape) before the camera takes over.

const HOLD = 14; // s of following
const CLOSE = 30; // m: the rig's closest distance
const EASE = 3.2; // 1/s: how softly the camera catches up with the player
const INPUTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];

export function createFollowCam({ rig, renderer }, { sources }) {
  const sys = { name: 'follow', tick: () => false };
  let follow = null; // { get, until, back, x, z }

  function stop(flyBack = true) {
    if (!follow) return;
    const { back } = follow;
    follow = null;
    INPUTS.forEach((t) => window.removeEventListener(t, onInput, true));
    if (flyBack) rig.flyTo(back, { duration: 1.2 });
  }
  function onInput() { stop(true); }

  // On the window: the cursor's own label may sit between the pointer and the canvas.
  const canvas = renderer.domElement;
  window.addEventListener('dblclick', (e) => {
    if (rig.flying?.()) return;
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const i = stack.indexOf(canvas);
    if (i < 0 || stack.slice(0, i).some((el) => el.closest('button, a, input, select, textarea, label, [role="dialog"]'))) return;
    const get = sources().map((s) => s?.personAt?.(e.clientX, e.clientY)).find(Boolean);
    if (!get) return;
    const at = get();
    if (!at) return;
    // The first click of the pair opened the court's panel: close it, then take the camera.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const back = { x: rig.state.x, z: rig.state.z, dist: rig.state.dist };
    stop(false);
    rig.flyTo({ x: at.x, z: at.z, dist: CLOSE }, { duration: 0.9 });
    const now = performance.now() / 1000;
    follow = { get, back, start: now + 0.9, until: now + HOLD, x: at.x, z: at.z };
    // Inputs from the next frame on end it (this double-click's own events have passed).
    requestAnimationFrame(() => { if (follow) INPUTS.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: true })); });
  });

  let last = performance.now() / 1000;
  sys.tick = () => {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - last);
    last = now;
    if (!follow) return false;
    const at = follow.get();
    if (!at || now > follow.until) { stop(true); return false; }
    if (now < follow.start) return true; // the fly-in tween is running
    const k = 1 - Math.exp(-EASE * dt);
    follow.x += (at.x - follow.x) * k;
    follow.z += (at.z - follow.z) * k;
    rig.flyTo({ x: follow.x, z: follow.z, dist: CLOSE }, { duration: 0 });
    return true;
  };
  sys.following = () => !!follow;
  sys.debug = () => (follow ? { x: +follow.x.toFixed(1), z: +follow.z.toFixed(1), left: +(follow.until - performance.now() / 1000).toFixed(1) } : null);
  return sys;
}
