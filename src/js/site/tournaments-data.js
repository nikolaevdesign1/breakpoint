import { mediaUrl } from './media.js';

// Amateur tournaments (row 75). Levels are years of play and age groups, not ratings.
// Dates are laid out relative to this week's Monday, so the calendar always shows the next four months.

export const LEVELS = [
  { id: 'u1', label: 'Under 1 year' },
  { id: '1-3', label: '1–3 years' },
  { id: '3-5', label: '3–5 years' },
  { id: '5+', label: '5+ years' },
];

export const AGES = [
  { id: 'jr', label: 'Juniors' },
  { id: '18-29', label: '18–29' },
  { id: '30-44', label: '30–44' },
  { id: '45+', label: '45+' },
];

const ADULTS = ['18-29', '30-44', '45+'];

// photo: a local poster (/media/…) or a media.js key, shown when a calendar day is hovered (row 126).
// week: weeks after this Monday · dow: 0 = Monday … 6 = Sunday · kind sets the colour on the calendar.
const PLAN = [
  {
    id: 'first-serve', photo: '/media/clips/serve-studio.jpg', week: 0, dow: 5, hour: 9, days: 1, kind: 'singles',
    name: 'First Serve <em>Cup</em>', plain: 'First Serve Cup',
    levels: ['u1'], ages: ADULTS, entries: ['Singles'],
    format: 'Round robin groups of four, then a final', scoring: 'Short sets to 4, no-ad, tiebreak at 3–3',
    surface: 'Red clay', fee: 35, spots: 24, taken: 19, prizes: 'Medals for the top three',
  },
  {
    id: 'friday-doubles', photo: 'community.1', week: 1, dow: 4, hour: 19, days: 1, kind: 'doubles',
    name: 'Friday Night <em>Doubles</em>', plain: 'Friday Night Doubles',
    levels: ['1-3', '3-5'], ages: ['18-29', '30-44'], entries: ['Doubles'],
    format: 'Rotating partners, points add up all night', scoring: 'One pro set to 8, tiebreak at 7–7',
    surface: 'Hard, indoor', fee: 25, perPair: false, spots: 32, taken: 26, prizes: 'A club prize for the top pair',
  },
  {
    id: 'club-open', photo: '/media/clips/clay-aerial.jpg', week: 2, dow: 5, hour: 9, days: 2, kind: 'singles',
    name: 'Club <em>Open</em>', plain: 'Club Open',
    levels: ['3-5', '5+'], ages: ['18-29', '30-44'], entries: ['Singles'],
    format: 'Single elimination with a consolation draw', scoring: 'Best of three sets, match tiebreak to 10 in the third',
    surface: 'Red clay', fee: 65, spots: 48, taken: 41, prizes: 'A prize pool for the winner, trophies for the finalists',
  },
  {
    id: 'junior-green', photo: '/media/clips/junior-rally.jpg', week: 3, dow: 5, hour: 8, days: 1, kind: 'junior',
    name: 'Junior Circuit: <em>Green ball</em>', plain: 'Junior Circuit: Green ball',
    levels: ['u1', '1-3'], ages: ['jr'], entries: ['Singles'],
    format: 'Round robin groups, then playoffs', scoring: 'One set to 4, tiebreak at 3–3',
    surface: 'Hard, indoor', fee: 30, spots: 32, taken: 14, prizes: 'Medals for every player, trophies for the top two',
  },
  {
    id: 'clay-classic-45', photo: 'services.1', week: 4, dow: 4, hour: 17, days: 3, kind: 'singles',
    name: '45+ Clay <em>Classic</em>', plain: '45+ Clay Classic',
    levels: ['3-5', '5+'], ages: ['45+'], entries: ['Singles', 'Doubles'],
    format: 'Feed-in consolation: everyone plays at least three matches', scoring: 'Best of three sets, match tiebreak to 10 in the third',
    surface: 'Red clay', fee: 75, spots: 40, taken: 29, prizes: 'Trophies and restringing vouchers',
  },
  {
    id: 'padel-cup', photo: 'services.7', week: 5, dow: 5, hour: 10, days: 2, kind: 'padel',
    name: 'Padel <em>Cup</em>', plain: 'Padel Cup',
    levels: ['1-3', '3-5'], ages: ADULTS, entries: ['Doubles'],
    format: 'Groups of four pairs, then a knockout', scoring: 'Best of three sets, golden point at deuce',
    surface: 'Padel glass', fee: 80, perPair: true, spots: 24, taken: 21, prizes: 'New rackets for the winning pair',
  },
  {
    id: 'mixed-classic', photo: 'services.3', week: 6, dow: 5, hour: 9, days: 1, kind: 'doubles',
    name: 'Mixed Doubles <em>Classic</em>', plain: 'Mixed Doubles Classic',
    levels: ['1-3', '3-5'], ages: ADULTS, entries: ['Doubles'],
    format: 'Round robin groups, then semifinals', scoring: 'One pro set to 8, tiebreak at 8–8',
    surface: 'Grass', fee: 60, perPair: true, spots: 24, taken: 12, prizes: 'Trophies and the club plate',
  },
  {
    id: 'night-singles', photo: 'community.5', week: 8, dow: 4, hour: 18, days: 1, kind: 'singles',
    name: 'Night <em>Singles</em>', plain: 'Night Singles',
    levels: ['5+'], ages: ['18-29', '30-44'], entries: ['Singles'],
    format: 'Sixteen-player single elimination under the lights', scoring: 'One set to 6, tiebreak at 6–6',
    surface: 'Hard, indoor', fee: 45, spots: 16, taken: 16, prizes: 'A prize for the winner',
  },
  {
    id: 'junior-orange', photo: 'services.4', week: 9, dow: 5, hour: 8, days: 1, kind: 'junior',
    name: 'Junior Circuit: <em>Orange ball</em>', plain: 'Junior Circuit: Orange ball',
    levels: ['u1', '1-3'], ages: ['jr'], entries: ['Singles'],
    format: 'Round robin, everyone plays four matches', scoring: 'Short sets to 4, tiebreak at 3–3',
    surface: 'Red clay', fee: 30, spots: 24, taken: 9, prizes: 'Medals for every player',
  },
  {
    id: 'championship', photo: 'community.4', week: 10, dow: 4, hour: 17, days: 3, kind: 'singles',
    name: 'Club <em>Championship</em>', plain: 'Club Championship',
    levels: ['3-5', '5+'], ages: ADULTS, entries: ['Singles'],
    format: 'Seeded single elimination with a consolation draw', scoring: 'Best of three full sets',
    surface: 'Red clay', fee: 90, spots: 64, taken: 38, prizes: 'Your name on the board and a prize pool',
  },
  {
    id: 'weekend-doubles', photo: 'community.2', week: 12, dow: 5, hour: 9, days: 2, kind: 'doubles',
    name: 'Weekend <em>Doubles</em>', plain: 'Weekend Doubles',
    levels: ['1-3', '3-5'], ages: ['18-29', '30-44'], entries: ['Doubles'],
    format: 'Compass draw: four matches for every pair', scoring: 'Best of three sets, no-ad, match tiebreak to 10',
    surface: 'Hard, indoor', fee: 70, perPair: true, spots: 32, taken: 10, prizes: 'Trophies and a club prize',
  },
  {
    id: 'beginner-series', photo: 'services.6', week: 13, dow: 6, hour: 10, days: 1, kind: 'singles',
    name: 'Beginner Singles <em>Series</em>', plain: 'Beginner Singles Series',
    levels: ['u1'], ages: ADULTS, entries: ['Singles'],
    format: 'Round robin with a coach on court', scoring: 'Short sets to 4, no-ad',
    surface: 'Red clay', fee: 35, spots: 24, taken: 5, prizes: 'A free group lesson for every player',
  },
  {
    id: 'grass-invitational', photo: 'community.0', week: 15, dow: 5, hour: 9, days: 2, kind: 'singles',
    name: 'Grass Court <em>Invitational</em>', plain: 'Grass Court Invitational',
    levels: ['5+'], ages: ['18-29', '30-44'], entries: ['Singles'],
    format: 'Thirty-two-player single elimination', scoring: 'Best of three sets, tiebreak at 6–6',
    surface: 'Grass', fee: 85, spots: 32, taken: 11, prizes: 'A prize pool and the grass trophy',
  },
  {
    id: 'junior-yellow', photo: 'services.2', week: 16, dow: 5, hour: 8, days: 2, kind: 'junior',
    name: 'Junior Circuit: <em>Yellow ball</em>', plain: 'Junior Circuit: Yellow ball',
    levels: ['3-5', '5+'], ages: ['jr'], entries: ['Singles', 'Doubles'],
    format: 'Single elimination with a consolation draw', scoring: 'Best of three sets, match tiebreak to 10 in the third',
    surface: 'Red clay', fee: 45, spots: 32, taken: 6, prizes: 'Trophies and a session with the academy coaches',
  },
];

const DAY = 864e5;
const thisMonday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();

export const EVENTS = PLAN.map((e) => {
  const start = new Date(thisMonday);
  start.setDate(start.getDate() + e.week * 7 + e.dow);
  const end = new Date(start);
  end.setDate(end.getDate() + e.days - 1);
  const startsAt = new Date(start);
  startsAt.setHours(e.hour);
  return { ...e, start, end, startsAt };
});

export const byId = (id) => EVENTS.find((e) => e.id === id);
export const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export const spotsLeft = (e) => e.spots - e.taken;
export const isPast = (e) => e.end.getTime() + DAY <= Date.now();
export const nextEvent = (now = Date.now()) => EVENTS.find((e) => e.startsAt.getTime() > now && spotsLeft(e) > 0) || EVENTS.find((e) => e.startsAt.getTime() > now);

export function eventDays(e) {
  const days = [];
  for (let d = new Date(e.start); d <= e.end; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
  return days;
}

const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

// "Sat–Sun, Oct 17–18" · "Fri, Oct 30–Sun, Nov 1" · "Sat, Oct 10"
export function formatDates(e) {
  const wd = (d) => fmt(d, { weekday: 'short' });
  if (e.days === 1) return `${wd(e.start)}, ${fmt(e.start, { month: 'short', day: 'numeric' })}`;
  if (e.start.getMonth() === e.end.getMonth()) return `${wd(e.start)}–${wd(e.end)}, ${fmt(e.start, { month: 'short' })} ${e.start.getDate()}–${e.end.getDate()}`;
  return `${wd(e.start)}, ${fmt(e.start, { month: 'short', day: 'numeric' })}–${wd(e.end)}, ${fmt(e.end, { month: 'short', day: 'numeric' })}`;
}
export const formatStart = (e) => `Starts ${hourLabel(e.hour)}`;

const listLabel = (ids, from) => ids.map((id) => from.find((x) => x.id === id).label);
export const levelText = (e) => listLabel(e.levels, LEVELS).join(', ').replace(/ years?(?=,)/g, '');
export const ageText = (e) => (e.ages.length === 3 && !e.ages.includes('jr') ? 'All adults' : listLabel(e.ages, AGES).join(', '));
export const feeText = (e) => `$${e.fee}${e.perPair ? ' per pair' : ''}`;

// Small photo for the calendar hover (row 126): local posters as they are, stock photos at a small width.
export const photoUrl = (e) => (e.photo.startsWith('/') ? e.photo : mediaUrl(e.photo, 480));
