import { createCourtMix } from '../sound/court-mix.js';
import { createCafeMusic } from '../sound/cafe-music.js';
import { createRainFront } from '../life/rain-front.js';
import { createSqueegee } from '../life/squeegee.js';
import { createAchievements } from './achievements.js';

// Round 9 (mapsound): sound up close (row 33), café music (row 17), the rain front (row 26), the
// squeegee after rain (row 27) and the club finds badge (row 19). Loaded after the first frame
// (life/index.js), so none of it weighs on the first load. Returns [dev name, system] pairs.

export function createMapSound(ctx, { still, dev }) {
  const out = [];
  const add = (name, sys) => { if (sys) out.push([name, sys]); return sys; };
  add('courtMix', createCourtMix({ ...ctx, players: dev.players }));
  add('cafeMusic', createCafeMusic({ ...ctx, clubhouse: dev.clubhouse }));
  add('rainFront', createRainFront(ctx, { still }));
  const squeegee = add('squeegee', createSqueegee({ ...ctx, keeper: dev.keeper, players: dev.players }, { still }));
  add('finds', createAchievements({ ...ctx, players: dev.players, keeper: dev.keeper, squeegee, clubhouse: dev.clubhouse }));
  return out;
}
