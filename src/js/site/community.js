import { initReviews } from './reviews.js';

// Home community block: the photo grid is static markup (row 115, squares assemble via
// court-grid.js [data-cells]); only the reviews below need wiring.
export function initCommunity(opts) {
  initReviews(opts);
}
