import { buildPatriot } from '../patriot.js';

// Veterans Day (round 11, row 8), November 11, three days before and one after: the same quiet
// flags and stars as Memorial Day (../patriot.js), flying full all day.
export default function build(kit) {
  return buildPatriot(kit, { memorial: false });
}
