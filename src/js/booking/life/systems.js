import { createBirds } from './birds.js';
import { createPlayers } from './players.js';
import { createLessons } from './lessons.js';
import { createKids } from './kids.js';
import { createCat } from './cat.js';
import { createRain } from './rain.js';
import { createClubhouse } from './clubhouse.js';
import { createClouds } from './clouds.js';
import { createDrinkingFountains } from './fountains-drinking.js';
import { createStorm } from './storm.js';
import { createBallTap } from '../interact/ball-tap.js';
import { createBookedSigns } from '../interact/booked-sign.js';
import { createTournament } from './tournament.js';
import { createKeeper } from './keeper.js';
import { createIguana } from './iguana.js';
import { createParrots } from './parrots.js';
import { createPelican } from './pelican.js';
import { createCart } from './cart.js';
import { createSprinklers } from './sprinklers.js';
import { createPlane } from './plane.js';
import { createFlag } from './flag.js';
import { createPlaces } from './places.js';
import { createGreenhouse } from './greenhouse.js';
import { createPadel } from './padel.js';
import { createFollowCam } from './follow-cam.js';
import { createBookflowMarks } from '../flow/marks.js';
import { setAtlasRenderer, atlasesIdle } from './sprite.js';
import { currentSeason } from '../seasons/season.js';
import { onChill } from '../seasons/chill.js';

// The ambient systems, in tick order. Loaded as one chunk right after the first visible frame
// (life/index.js start()), so the first load carries only what the first frame needs (row 48).

/**
 * Holiday decor (~100 KB of code) matters only on a dressed-up date or when the
 * visitor picks it: the system is a stub until then.
 */
function lazySeasons(ctx, still) {
  const stub = { name: 'seasons', tick: () => false };
  let loading = false;
  const wake = (e) => {
    const d = e?.detail; // the change itself (bp-season { season }), else the state now
    if (loading || !(d ? d.season : currentSeason())) return;
    loading = true;
    document.removeEventListener('bp-season', wake);
    import('./seasons.js').then(({ createSeasons }) => {
      const real = createSeasons(ctx, { still });
      if (real) Object.assign(stub, real);
    }).catch((err) => console.warn('Seasons failed', err));
  };
  document.addEventListener('bp-season', wake);
  wake();
  return stub;
}

/** Heaters and jackets (life/cold.js) are built the first time it is cold, not before. */
function lazyCold(ctx, still) {
  const stub = { name: 'cold', tick: () => false };
  let loading = false;
  onChill((on) => {
    if (!on || loading) return;
    loading = true;
    import('./cold.js').then(({ createCold }) => {
      const real = createCold(ctx, { still });
      if (real) Object.assign(stub, real);
    }).catch((err) => console.warn('Cold failed', err));
  });
  return stub;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Builds the systems one after another, giving the browser a frame whenever a few milliseconds are
 * spent: the whole set used to be built in one 1.4 s block that froze the loader and the first
 * frames. Each step leaves a `life:<name>` measure in the performance timeline.
 */
export async function startSystems(ctx, { still, dev, add }) {
  setAtlasRenderer(ctx.renderer);
  let sliceStart = performance.now();
  const step = async (name, make) => {
    if (performance.now() - sliceStart > 8) { await frame(); sliceStart = performance.now(); }
    const t0 = performance.now();
    const sys = make();
    try { performance.measure(`life:${name}`, { start: t0, end: performance.now() }); } catch { /* no timeline */ }
    // Compile what the system just added in parallel (KHR_parallel_shader_compile), before it first draws.
    if (performance.now() - t0 > 1) { await ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {}); sliceStart = performance.now(); }
    return sys;
  };
  dev.birds = add(await step('birds', () => createBirds(ctx, { still })));
  dev.players = add(await step('players', () => createPlayers(ctx, { still })));
  dev.cat = add(await step('cat', () => createCat(ctx, { still })));
  dev.lessons = add(await step('lessons', () => createLessons(ctx, { still, players: dev.players }))); // round 8: coaching lessons on the lesson courts
  dev.kids = add(await step('kids', () => createKids({ ...ctx, players: dev.players }, { still }))); // round 8: the kids group, 16:00 to 17:00
  dev.rain = add(await step('rain', () => createRain(ctx, { still }))); // row 151: when it rains in Miami
  dev.clubhouse = add(await step('clubhouse', () => createClubhouse(ctx, { still }))); // round 8: lit windows, café terrace after dark (before the cart: it keeps clear of the tables)
  dev.fountains = add(await step('fountains', () => createDrinkingFountains(ctx))); // round 10 (row 36): drinking fountains, a jet on click, the list of spots for the players' water step
  dev.clouds = add(await step('clouds', () => createClouds(ctx, { still }))); // round 7: cloud shadows drifting with the wind
  dev.storm = add(await step('storm', () => createStorm(ctx, { still }))); // round 7: lightning, thunder, harder wind
  dev.balls = add(await step('balls', () => createBallTap(ctx, { still }))); // round 7: hold on a court to drop a ball
  dev.signs = add(await step('signs', () => createBookedSigns(ctx, { still }))); // round 7: your booking on the map
  dev.tournament = add(await step('tournament', () => createTournament(ctx, { still, players: dev.players }))); // round 7: tournament days on the show court
  dev.keeper = add(await step('keeper', () => createKeeper({ ...ctx, players: dev.players }, { still }))); // round 7: a groundskeeper drags a free clay court
  dev.iguana = add(await step('iguana', () => createIguana({ ...ctx, cat: dev.cat, threats: () => [dev.cart?.where?.(), dev.keeper?.where?.()] }, { still }))); // round 7: iguanas basking by the hedge (row 175: several)
  dev.parrots = add(await step('parrots', () => createParrots(ctx, { still }))); // round 7: monk parakeets crossing, chattering
  dev.pelican = add(await step('pelican', () => createPelican(ctx, { still }))); // round 7: now and then a pelican glides along the edge
  dev.cart = add(await step('cart', () => createCart({ ...ctx, keeper: dev.keeper, cat: dev.cat, iguana: dev.iguana }, { still }))); // round 7: the club's golf cart on the paths
  dev.sprinklers = add(await step('sprinklers', () => createSprinklers(ctx, { still }))); // round 7: morning sprinklers on the grass
  dev.plane = add(await step('plane', () => createPlane(ctx, { still }))); // round 8: a jet's shadow sweeps over now and then
  dev.flag = add(await step('flag', () => createFlag(ctx, { still }))); // round 8: the club flag streams in the real Miami wind
  dev.seasons = add(await step('seasons', () => lazySeasons({ ...ctx, keeper: dev.keeper }, still))); // round 8: holiday decor by the date, or as picked in the top bar
  dev.cold = add(await step('cold', () => lazyCold(ctx, still))); // round 10: heaters and jackets when it is cold (below ~60°F, or Holidays)
  dev.places = add(await step('places', () => createPlaces(ctx))); // round 8: clubhouse, café, parking… labels on hover
  dev.greenhouse = add(await step('greenhouse', () => createGreenhouse(ctx, { still }))); // row 179: grow light in the orchid house after dark
  dev.padel = add(await step('padel', () => createPadel(ctx, { still }))); // row 38: padel doubles on the booked padel courts
  dev.follow = add(await step('follow', () => createFollowCam(ctx, { sources: () => [dev.players, dev.padel] }))); // row 32: double-click a player
  dev.bookflow = add(await step('bookflow', () => createBookflowMarks(ctx))); // round 9: your court, partner flags, the walk from the car park
  // The first atlases (players, cat, keeper) are on the GPU and their shaders are built before this resolves: the loader waits for it.
  await atlasesIdle();
  await ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {});
  import('../fun/mapsound.js').then(({ createMapSound }) => { for (const [k, s] of createMapSound(ctx, { still, dev })) dev[k] = add(s); }).catch((err) => console.warn('Map sound failed', err)); // round 9 (mapsound): sound up close, café music, rain front, squeegee, club finds; lazy
  import('../fun/index.js').then(({ createMapFun }) => { for (const [k, s] of createMapFun(ctx, { still, dev })) dev[k] = add(s); }).catch((err) => console.warn('Map details failed', err)); // round 9 (mapfun): scoreboard, light test, cat, pigeons, moths; lazy, off the first load
}
