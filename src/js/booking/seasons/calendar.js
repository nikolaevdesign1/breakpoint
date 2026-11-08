// The holiday registry of the booking map (row 1, round 11). One list says which holidays the club
// dresses for: id, name, the rule for its date in Miami, the window it shows around that date, and
// the priority when two windows meet. No DOM here: the dates are plain calendar days of the Miami
// date the clock gives ({ y, m, d }), so it runs (and is tested) in node too.
//
// Adding a holiday: add one entry below, then (optionally) a decor file `seasons/packs/<id>.js`
// (see packs/index.js). An entry without a pack is a stub: the plate and the menu item work, the
// decor is empty.
//
// Optional per holiday: `staffHat` (a hat name from life/adorn.js, worn by the staff only, not the
// guests) and `music` (a loop from sound/, played instead of the café music while the holiday is on).
//
// Overlaps: when several windows hold the same day, the higher priority wins (New Year over the
// December holidays, St. Patrick's Day over an early Easter week, Valentine's Day over the Super
// Bowl); equal priorities go to the event nearer in time.

const DAY = 864e5;
/** Days since 1970-01-01 of a calendar date (UTC arithmetic: no zone, no DST). */
export const dayNum = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);
/** { y, m, d } of a day number. */
export const fromDayNum = (n) => { const t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (n) => (((n + 4) % 7) + 7) % 7;

/** The n-th (1…) `wd` of a month, as a day number. */
const nthWeekday = (y, m, wd, n) => { const first = dayNum(y, m, 1); return first + ((wd - weekday(first) + 7) % 7) + (n - 1) * 7; };
/** The last `wd` of a month. */
const lastWeekday = (y, m, wd) => { const last = dayNum(y, m + 1, 1) - 1; return last - ((weekday(last) - wd + 7) % 7); };

/** Western (Gregorian) Easter Sunday, the Meeus / Jones / Butcher algorithm. */
export function easter(y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNum(y, mo, da);
}

export const thanksgiving = (y) => nthWeekday(y, 11, 4, 4); // 4th Thursday of November
export const memorialDay = (y) => lastWeekday(y, 5, 1); // last Monday of May
export const laborDay = (y) => nthWeekday(y, 9, 1, 1); // 1st Monday of September

/**
 * Super Bowl Sunday. The league fixes it years ahead, so it is a table: 2026 (LX) is Feb 8 and
 * 2027 (LXI) Feb 14, the later years follow the second-Sunday habit and stay open to change.
 * `verifySuperBowl()` checks the table (a Sunday, in February, 8th to 14th); a year outside it
 * falls back to the second Sunday of February.
 */
export const SUPER_BOWL = {
  2026: [2, 8], 2027: [2, 14], 2028: [2, 13], 2029: [2, 11], 2030: [2, 10], 2031: [2, 9],
  2032: [2, 8], 2033: [2, 13], 2034: [2, 12], 2035: [2, 11], 2036: [2, 10],
};
export function superBowl(y) {
  const t = SUPER_BOWL[y];
  return t ? dayNum(y, t[0], t[1]) : nthWeekday(y, 2, 0, 2);
}
/** Problems in the Super Bowl table, as strings (an empty list: it is sound). */
export function verifySuperBowl() {
  const out = [];
  for (const [y, [m, d]] of Object.entries(SUPER_BOWL)) {
    const n = dayNum(+y, m, d);
    if (weekday(n) !== 0) out.push(`${y}: Feb ${d} is not a Sunday`);
    if (m !== 2 || d < 8 || d > 14) out.push(`${y}: Feb ${d} is not a second-Sunday date`);
  }
  return out;
}

/**
 * First day of Hanukkah (25 Kislev), a Gregorian day number. The Hebrew calendar comes from Intl;
 * a table of the next ten years stands behind it for engines without that calendar.
 */
const HANUKKAH = { 2026: [12, 5], 2027: [12, 25], 2028: [12, 13], 2029: [12, 2], 2030: [12, 21], 2031: [12, 10], 2032: [11, 28], 2033: [12, 17], 2034: [12, 7], 2035: [12, 26], 2036: [12, 14] };
let hebrew = null;
function viaIntl(y) {
  try {
    hebrew ??= new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' });
    if (hebrew.resolvedOptions().calendar !== 'hebrew') return null;
    for (let n = dayNum(y, 11, 20); n <= dayNum(y, 12, 31); n++) {
      const p = Object.fromEntries(hebrew.formatToParts(new Date(n * DAY + 12 * 36e5)).map((x) => [x.type, x.value]));
      if (/^kislev$/i.test(p.month) && +p.day === 25) return n;
    }
  } catch { /* no Hebrew calendar here */ }
  return null;
}
export function hanukkahStart(y) {
  const t = HANUKKAH[y];
  return viaIntl(y) ?? (t ? dayNum(y, t[0], t[1]) : null);
}
/** Which day of Hanukkah (1…8) a Miami date is, or 0. Candles are lit the evening before each day's date counts: day 1 is lit on the eve. */
export function hanukkahDay({ y, m, d }) {
  const n = dayNum(y, m, d);
  const s = hanukkahStart(y);
  if (s == null) return 0;
  const k = n - s + 1;
  return k >= 1 && k <= 8 ? k : 0;
}

/**
 * The registry, in the order of the year (the order of the menu). `date(y)` is the day number of the
 * event in year y; `before` / `after` are the days of the window round it; `span(y)` overrides the
 * window when a rule is not symmetric (the December holidays). `alias` are other spellings the
 * `?season=` link accepts.
 */
export const HOLIDAYS = [
  {
    id: 'new-year', name: 'New Year', alias: ['newyear', 'ny', 'newyears', 'nye'], priority: 7,
    date: (y) => dayNum(y, 1, 1), before: 4, after: 1, // Dec 28 to Jan 2
    hint: 'Confetti, the ball and fireworks', note: ['New Year at the club', 'Confetti in the air, a ball above the plaza, fireworks at midnight'],
  },
  {
    id: 'super-bowl', name: 'Super Bowl', alias: ['superbowl', 'gameday', 'game-day'], priority: 3,
    date: superBowl, before: 3, after: 1,
    hint: 'Footballs, team colors, game day', note: ['Game Day at the club', 'Footballs on the courts, pennants and a big screen'],
  },
  {
    id: 'valentines', name: "Valentine's Day", alias: ['valentine', 'valentines-day', 'valentinesday', 'hearts'], priority: 5,
    date: (y) => dayNum(y, 2, 14), before: 4, after: 1, // Feb 10 to Feb 15
    hint: 'Hearts, roses and pink light', note: ["Valentine's Day at the club", 'Hearts in the air, roses on the benches'],
  },
  {
    id: 'st-patricks', name: "St. Patrick's Day", alias: ['stpatricks', 'st-patrick', 'stpatrick', 'patricks', 'stpaddys'], priority: 5,
    date: (y) => dayNum(y, 3, 17), before: 4, after: 1, // Mar 13 to Mar 18
    hint: 'Shamrocks, green light, a rainbow', note: ["St. Patrick's Day at the club", 'Shamrocks on the nets, a rainbow over the courts'],
  },
  {
    id: 'easter', name: 'Easter', alias: ['easter-sunday'], priority: 4,
    date: (y) => easter(y), before: 7, after: 1,
    hint: 'Painted eggs, bunnies, pastels', note: ['Easter at the club', 'Eggs in the grass, tulips in the beds'],
  },
  {
    id: 'cinco-de-mayo', name: 'Cinco de Mayo', alias: ['cinco', 'cincodemayo', 'cinco-de-mayo'], priority: 5,
    date: (y) => dayNum(y, 5, 5), before: 4, after: 1, // May 1 to May 6
    hint: 'Papel picado, cacti, bright colors', note: ['Cinco de Mayo at the club', 'Papel picado over the walkways, cacti at the doors'],
    staffHat: 'sombrero', music: 'mariachi', // the club's own people wear the hat (life/adorn.js); sound/mariachi.js plays instead of the café music
  },
  {
    id: 'memorial-day', name: 'Memorial Day', alias: ['memorial', 'memorialday'], priority: 4,
    date: memorialDay, before: 3, after: 1,
    hint: 'Flags and stars, quiet lights', note: ['Memorial Day at the club', 'Flags on the masts, stars along the fences'],
  },
  {
    id: 'july4', name: 'July 4th', alias: ['july-4th', 'july4th', 'fourth', 'independence', 'independence-day'], priority: 5,
    date: (y) => dayNum(y, 7, 4), before: 3, after: 1, // Jul 1 to Jul 5
    hint: 'Bunting, flags, fireworks at night', note: ['July 4th at the club', 'Flags on the walkway, fireworks after dark'],
  },
  {
    id: 'labor-day', name: 'Labor Day', alias: ['labor', 'laborday'], priority: 4,
    date: laborDay, before: 4, after: 1,
    hint: 'Grills, umbrellas, golden light', note: ['Labor Day at the club', 'Grills on the terrace, the last of the summer'],
  },
  {
    id: 'halloween', name: 'Halloween', alias: ['hallowe-en', 'spooky'], priority: 6,
    date: (y) => dayNum(y, 10, 31), before: 11, after: 1, // Oct 20 to Nov 1
    hint: 'Pumpkins and orange lights', note: ['Halloween at the club', 'Pumpkins at every gate, orange lights at night'],
  },
  {
    id: 'veterans-day', name: 'Veterans Day', alias: ['veterans', 'veteransday'], priority: 4,
    date: (y) => dayNum(y, 11, 11), before: 3, after: 1,
    hint: 'Flags and stars, quiet lights', note: ['Veterans Day at the club', 'Flags on the masts, stars along the fences'],
  },
  {
    id: 'thanksgiving', name: 'Thanksgiving', alias: ['thanks', 'turkey-day'], priority: 5,
    date: thanksgiving, before: 7, after: 1,
    hint: 'Turkeys, pumpkins, autumn leaves', note: ['Thanksgiving at the club', 'Autumn leaves on the walkway, corn on the gates'],
  },
  {
    // Christmas and Hanukkah share one season, "Holidays": Dec 1 to Jan 6, widened to the eve of
    // Hanukkah when it starts before Dec 1 (Nov 28 in 2032).
    id: 'holidays', name: 'Holidays', alias: ['christmas', 'xmas', 'hanukkah', 'chanukah', 'winter'], priority: 3,
    date: (y) => dayNum(y, 12, 25),
    span(y) {
      const h = hanukkahStart(y);
      return { from: Math.min(dayNum(y, 12, 1), h == null ? Infinity : h - 1), to: dayNum(y + 1, 1, 6) };
    },
    hint: 'Lights, a tree, snow and gifts', note: ['Holidays at the club', 'Lights, a tree, snow on the paths and a sleigh overhead'],
  },
];

const byId = new Map(HOLIDAYS.map((h) => [h.id, h]));
export const holidayById = (id) => byId.get(id) ?? null;
export const SEASONS = HOLIDAYS.map((h) => h.id);
export const SEASON_NAMES = Object.fromEntries(HOLIDAYS.map((h) => [h.id, h.name]));

/** The id a `?season=` value or a menu mode stands for (spelling, case and dashes forgiven), or null. */
export function resolveId(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (byId.has(s)) return s;
  const flat = (x) => x.replace(/[^a-z0-9]/g, '');
  const k = flat(s);
  if (!k) return null;
  for (const h of HOLIDAYS) if (flat(h.id) === k || h.alias?.some((a) => flat(a) === k)) return h.id;
  return null;
}

/** The window of a holiday for its event in year `y`: { event, from, to } as day numbers. */
export function windowOf(h, y) {
  const event = h.date(y);
  if (h.span) return { event, ...h.span(y) };
  return { event, from: event - h.before, to: event + h.after };
}

/** The holiday a Miami date { y, m, d } falls in (several windows: the nearest event), or null. */
export function holidayForDate({ y, m, d }) {
  const n = dayNum(y, m, d);
  let best = null;
  for (const h of HOLIDAYS) {
    for (const yy of [y - 1, y, y + 1]) {
      const w = windowOf(h, yy);
      if (n < w.from || n > w.to) continue;
      const gap = Math.abs(n - w.event);
      if (!best || h.priority > best.h.priority || (h.priority === best.h.priority && gap < best.gap)) best = { h, gap };
    }
  }
  return best?.h.id ?? null;
}

/** Days from the event (negative: before it) for a holiday on a Miami date, or null outside the window. */
export function daysFromEvent(id, { y, m, d }) {
  const h = byId.get(id);
  if (!h) return null;
  const n = dayNum(y, m, d);
  for (const yy of [y - 1, y, y + 1]) {
    const w = windowOf(h, yy);
    if (n >= w.from && n <= w.to) return n - w.event;
  }
  return null;
}
