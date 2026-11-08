import { buildPatriot } from '../patriot.js';

// Memorial Day (round 11, row 8), the last Monday of May, three days before and one after: the
// quiet flags and stars (../patriot.js). On the day itself the flags fly at half-staff until
// noon in Miami, then they are raised. No fireworks.
export default function build(kit) {
  return buildPatriot(kit, { memorial: true });
}
