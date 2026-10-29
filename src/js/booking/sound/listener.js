// Where the visitor "stands" on the map (round 9, rows 17 and 33): the ground point at the middle of
// the view, and how far the drone hangs above it. Sounds on the map use it to decide how loud they
// are and where they sit in the stereo field.
//
// near():    0 zoomed out (only the club's general bed), 1 down at the courts (DIST_MIN 30 m).
// reach(x,z): 0…1, how close a point is to the middle of the view, scaled by the zoom (the closer
//            the drone, the smaller the patch you hear in detail).
// pan(x,z):  −1…1 from where the point is on screen, wider the closer you are.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createListener(rig) {
  return {
    near: () => smooth(78, 36, rig.state.dist),
    reach(x, z, scale = 0.62) {
      const s = rig.state;
      const d = Math.hypot(x - s.x, z - s.z);
      const r = Math.max(14, s.dist * scale);
      const k = Math.max(0, 1 - d / r);
      return k * k * (3 - 2 * k);
    },
    pan(x, z) {
      const p = rig.screenOf(x, z);
      const u = Math.max(-1, Math.min(1, (p.x / innerWidth) * 2 - 1));
      return u * (0.45 + 0.4 * this.near());
    },
  };
}
