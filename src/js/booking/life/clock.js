import * as THREE from 'three';
import { miamiNow } from '../miami-clock.js';
import { hourState } from '../hour-state.js';
import { dayKeyForOffset } from '../../shared/availability.js';

// The club's clock for its routines (round 7, "clublife"): the groundskeeper's drag at the top of
// the hour, the morning sprinklers. They follow the hour the map shows: the Miami clock
// (miami-clock.js, pinned with ?time=07:30 or __bp.setTime) or the dock's scrubber (hour-state.js,
// `bp-hour`), the same time the light follows.

/** Hours since midnight in Miami as the map shows them (14.5 = 14:30). */
export function clubHours() {
  return hourState.time ?? miamiNow().hours;
}

/** The booking slot shown: day key and hour, for "is this court free now". */
export function clubSlot() {
  return { dayKey: hourState.dayKey ?? dayKeyForOffset(hourState.offset ?? 0), hour: hourState.hour ?? Math.floor(clubHours()) };
}

/**
 * Direction towards the sun, kept up to date from the scene's sun light (life/daylight.js turns it
 * between a few bands): shadow shaders hold this vector as a uniform.
 */
export function liveSunDir({ sun, sunDir }) {
  const dir = sunDir.clone().normalize();
  const tmp = new THREE.Vector3();
  return {
    dir,
    update() {
      if (!sun) return dir;
      tmp.subVectors(sun.position, sun.target.position);
      if (tmp.lengthSq() > 1e-6 && tmp.y > 0.05) dir.copy(tmp.normalize());
      return dir;
    },
  };
}
