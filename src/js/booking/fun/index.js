import { createScoreboard } from './scoreboard.js';
import { createLightTest } from './light-test.js';
import { createCatNotice } from './cat-notice.js';
import { createPigeons } from './pigeons.js';
import { createMoths } from './moths.js';

// Round 9 map details ("mapfun", rows 13, 14, 16, 28, 30), started with the rest of the life once
// the first frame is up. Rows 10 (fun/surface-peek.js, from pages/booking.js) and 15
// (fun/ball-net.js, inside interact/ball-tap.js) hook in where they belong.
// `dev` holds the other life systems these read: players, padel, cat, keeper, cart, lessons…

export function createMapFun(ctx, { still, dev }) {
  const sys = {
    scoreboard: createScoreboard(ctx, dev), // row 13: the score of the rally under the pointer
    lightTest: createLightTest(ctx, dev), // row 14: try a free court's floodlights after dark
    catNotice: createCatNotice(ctx, dev), // row 16: the cat turns to the resting pointer, then dashes off
    pigeons: createPigeons(ctx, { still, ...dev }), // row 28: pigeons on the net of an empty court
    moths: createMoths(ctx, { still }), // row 30: moths round the lit floodlights
  };
  return Object.entries(sys).filter(([, s]) => s);
}
