import * as THREE from 'three';
import { SHOW_COURT, tournamentOnOffset, nextClayEvent } from '../../shared/tournaments.js';
import { hourState } from '../hour-state.js';
import { crowdApplause } from '../ambient.js';

// Tournament days on the map (round 7). When the day picked on the dock has a clay event in the
// tournaments calendar (shared/tournaments.js), the show court gets stands with a crowd, pennants on
// its fences and a scoreboard (life/tournament-stands.js, loaded the first time it is needed). From
// the event's start hour a match is on: the players system keeps a rally on that court
// (players.forceCourt), every point it plays goes onto the board, the crowd follows the ball and
// claps after the point, and the applause comes through the ambient sound bed.
// Preview: ?tournament=1 · dev: __bp.tournament(true | false | null).

// Fictional players, two at a time.
const PAIRS = [['Reyes', 'Okafor'], ['Lindqvist', 'Moreau'], ['Tanaka', 'Silva'], ['Brennan', 'Haddad'], ['Novak', 'Ferreira']];
const LAST_HOUR = 21; // the match stops when the club closes
// The lawn strip west of the show court: from the path edge back to the boundary fence.
const AREA = { frontX: -30.75, fenceX: -34 };
const NEXT_MATCH = 12; // s after match point

function newScore(k, midMatch = false) {
  const [a, b] = PAIRS[k % PAIRS.length];
  return midMatch
    ? { names: [a, b], sets: [[6, 4], [2, 3]], won: [1, 0], points: [1, 2], over: false }
    : { names: [a, b], sets: [[0, 0]], won: [0, 0], points: [0, 0], over: false };
}

/** Adds a point for the near (0) or far (1) player; true when it ends a game or a tiebreak serve turn. */
export function addPoint(s, w) { // round 9 (row 13): fun/scoreboard.js keeps club rallies the same way
  const l = 1 - w;
  const set = s.sets[s.sets.length - 1];
  const tiebreak = set[0] === 6 && set[1] === 6;
  s.points[w]++;
  const pw = s.points[w];
  const pl = s.points[l];
  if (!(tiebreak ? pw >= 7 && pw - pl >= 2 : pw >= 4 && pw - pl >= 2)) return tiebreak && (pw + pl) % 2 === 1;
  set[w]++;
  s.points = [0, 0];
  if ((set[w] >= 6 && set[w] - set[l] >= 2) || set[w] === 7) {
    s.won[w]++;
    if (s.won[w] === 2) { s.over = true; s.winner = w; } else s.sets.push([0, 0]);
  }
  return true;
}

export function pointText(s, i) {
  if (s.over) return '';
  const set = s.sets[s.sets.length - 1];
  if (set[0] === 6 && set[1] === 6) return String(s.points[i]);
  const me = s.points[i];
  const other = s.points[1 - i];
  if (me >= 3 && other >= 3) return me > other ? 'Ad' : '40';
  return ['0', '15', '30', '40'][Math.min(3, me)];
}

export function createTournament(ctx, { still, players }) {
  const { rig, courtSurface, refreshShadows } = ctx;
  const params = new URLSearchParams(location.search);
  let forced = params.get('tournament') === '1' ? true : null;
  let offset = hourState.offset ?? 0; // the dock reports before life starts: start from its last word
  let event = null;
  let stands = null;
  let loading = null;
  let shown = false;
  let playing = false;
  let staticChange = false;
  let pairs = 0;
  let score = newScore(pairs++, true);
  let restartAt = 0;
  let heardOver = 0;
  let applauseAt = 0;
  let applauseLevel = 0;
  const wind = { x: -1, z: 0, k: 0.4 }; // off the bay (+x) until the weather says otherwise
  const ball = new THREE.Vector3();

  function board() {
    if (!stands) return;
    const g = players?.game?.(SHOW_COURT);
    const serving = g ? (g.server === g.players[0] ? 0 : 1) : 0;
    stands.score({
      title: event?.plain ?? 'Club tournament',
      status: score.over ? `${score.names[score.winner]} wins` : playing ? `set ${score.sets.length}` : `starts ${String(event?.hour ?? 9).padStart(2, '0')}:00`,
      over: score.over,
      rows: [0, 1].map((i) => ({
        name: score.names[i],
        serving: playing && !score.over && serving === i,
        sets: score.sets.map((set) => set[i]),
        points: playing ? pointText(score, i) : '',
      })),
    });
  }

  /** A point is over (players.js): onto the board; true when the serve changes. */
  function onPoint(nearWon) {
    if (score.over) return false;
    const changes = addPoint(score, nearWon ? 0 : 1);
    if (score.over) restartAt = performance.now() / 1000 + NEXT_MATCH;
    board();
    return changes;
  }

  function apply() {
    const day = tournamentOnOffset(offset);
    const on = forced ?? !!day;
    event = day ?? nextClayEvent();
    const hour = hourState.hour ?? new Date().getHours();
    const live = on && (forced || (hour >= event.hour && hour < LAST_HOUR));
    if (on && !stands) { load(); return; }
    if (on === shown && live === playing) { board(); return; }
    shown = on;
    playing = live;
    stands?.show(on, live);
    players?.forceCourt?.(live ? SHOW_COURT : null);
    players?.onPoint?.(SHOW_COURT, live ? onPoint : null);
    board();
    refreshShadows(); // the stands, their people and the board go into the baked shadow map
    staticChange = true;
  }

  function load() {
    loading ??= import('./tournament-stands.js').then(({ buildStands }) => {
      const court = courtSurface(SHOW_COURT);
      if (!court) return;
      stands = buildStands(ctx, court, { ...AREA, z: court.z }, { still });
      stands.wind(wind.x, wind.z, wind.k);
      document.fonts?.load(`600 62px Switzer`).then(() => stands.redraw()).catch(() => {});
      apply();
    }).catch((err) => console.warn('Tournament failed', err));
  }

  document.addEventListener('bp-day', (e) => { offset = e.detail.offset ?? 0; apply(); });
  document.addEventListener('bp-hour', () => apply());
  document.addEventListener('bp-weather', (e) => {
    const { wind: mph = 8, windDir = 90 } = e.detail;
    const d = THREE.MathUtils.degToRad(windDir); // where it blows from; +x is east, +z south
    Object.assign(wind, { x: -Math.sin(d), z: Math.cos(d), k: THREE.MathUtils.clamp(mph / 18, 0.12, 1) });
    stands?.wind(wind.x, wind.z, wind.k);
  });
  apply();

  if (import.meta.env.DEV && window.__bp) {
    window.__bp.tournament = (on) => { forced = on == null ? null : !!on; apply(); return { forced, shown, playing }; };
  }

  return {
    name: 'tournament',
    tick(t, dt) {
      if (!shown || !stands || still) return false;
      const now = performance.now() / 1000;
      dt = Math.min(0.1, dt);
      if (playing) {
        const g = players?.game?.(SHOW_COURT);
        // The point is decided as the last ball dies (players.js ends it ~2 s later).
        if (g?.pointOver && g.pointOver !== heardOver) {
          heardOver = g.pointOver;
          const quality = THREE.MathUtils.clamp(0.25 + g.shots * 0.08, 0.25, 0.85);
          applauseLevel = quality + (score.points.some((p) => p >= 3) ? 0.15 : 0);
          applauseAt = g.pointOver - 1.8;
        }
        if (applauseAt && now >= applauseAt) {
          applauseAt = 0;
          const from = players.ballOf(SHOW_COURT, ball)?.z ?? courtSurface(SHOW_COURT).z;
          stands.applaud(now, applauseLevel, from);
          const c = courtSurface(SHOW_COURT);
          const v = rig.state;
          const near = THREE.MathUtils.clamp(1 - Math.hypot(AREA.frontX - v.x, c.z - v.z) / 90, 0, 1) * THREE.MathUtils.clamp(40 / v.dist, 0.45, 1.2);
          const s = rig.screenOf(AREA.frontX, c.z);
          crowdApplause(applauseLevel * near, THREE.MathUtils.clamp((s.x / innerWidth) * 2 - 1, -0.8, 0.8), 1.6 + applauseLevel * 2);
        }
        if (score.over && now > restartAt) { score = newScore(pairs++); board(); }
      }
      stands.update(now, dt, playing ? players?.ballOf?.(SHOW_COURT, ball) : null);
      return true;
    },
    takeStaticChange() {
      const changed = staticChange;
      staticChange = false;
      return changed;
    },
    debug: () => ({ shown, playing, offset, event: event?.id, people: stands?.count ?? 0, clapping: stands?.clapping ?? 0, score: score.sets.map((s) => s.join('-')).join(' ') + ` · ${score.points.join('-')}` }),
  };
}
