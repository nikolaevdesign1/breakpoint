// One place for the club's facts: contacts, hours, court rates, add-ons, plan perks, cancellation and
// player levels. Scripts import it; static HTML reads it through {{fact:key}} tokens (TOKENS below,
// filled in by vite.config.js). Change a value here and every page follows.

// --- Contacts (placeholders: replace here, nowhere else) ---
export const CONTACT = {
  phone: '+1 (305) 555-0142',
  phoneHref: 'tel:+13055550142',
  phoneExample: '+1 305 555 0100', // what a phone field shows as its example
  whatsapp: 'https://wa.me/13055550142',
  email: 'hello@breakpoint.club',
};

// --- Hours in Miami time: [opens, closes]. The last booking starts an hour before closing. ---
export const OPEN = { weekday: [6, 23], weekend: [7, 22] };
export const hoursOn = (day) => (day === 0 || day === 6 ? OPEN.weekend : OPEN.weekday); // 0 = Sunday
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
/** Hours a booking can start at on a weekday number. */
export const startHoursOn = (day) => { const [from, to] = hoursOn(day); return range(from, to); };
/** Every start hour of any day; a given day uses the part of it inside its opening hours. */
export const ALL_START_HOURS = range(Math.min(OPEN.weekday[0], OPEN.weekend[0]), Math.max(OPEN.weekday[1], OPEN.weekend[1]));

export const hourText = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const span = ([a, b]) => `${hourText(a)}–${hourText(b)}`;

// --- Court rates by surface (USD an hour): weekday before 4 PM, weekday from 4 PM, weekend ---
export const RATES = {
  clay: { label: 'Red clay', note: 'Outdoor', offPeak: 48, peak: 64, weekend: 60 },
  hard: { label: 'Hard court', note: 'Indoor', offPeak: 56, peak: 72, weekend: 68 },
  padel: { label: 'Padel', note: 'Glass', offPeak: 40, peak: 56, weekend: 52 },
  grass: { label: 'Grass', note: 'Outdoor', offPeak: 62, peak: 80, weekend: 76 },
};
export const PEAK_FROM = 16;

export function rateFor(type, date, hour) {
  const r = RATES[type];
  const day = date.getDay();
  if (day === 0 || day === 6) return r.weekend;
  return hour >= PEAK_FROM ? r.peak : r.offPeak;
}

// --- Coaching: a coach's own rate (coaches-data.js) is paid on top of the court ---
export const COACH_RATE = { from: 120, to: 220 }; // per session
export const GROUP_LESSON = 45; // per player, 90 minutes
export const ACADEMY_MONTH = 280;

// --- Add-ons in the booking. Padel rackets are included; tennis rackets are rented. ---
export const ADDONS = { balls: 8, racket: { tennis: 10, padel: 0 }, basket: 12, machine: 15, kitOff: 4 };
export const racketPrice = (courtType) => ADDONS.racket[courtType === 'padel' ? 'padel' : 'tennis'];

// --- Plans. Discounts are for members only; guests pay the drop-in rate. ---
// coachOff: private lessons and clinics. courtOff: court hours beyond the plan's own hours.
export const ANNUAL_OFF = 0.15;
export const JUNIOR_EXTRA = 49; // per extra junior on Family, a month
export const PLAN = {
  payg: { name: 'Pay as you play', price: 0, hours: 0, window: 3, guests: 0, freeze: 0, coachOff: 0, courtOff: 0 },
  weekday: { name: 'Weekday', price: 99, hours: 6, window: 7, guests: 1, freeze: 1, coachOff: 0.1, courtOff: 0 },
  club: { name: 'Club', price: 189, hours: 12, window: 14, guests: 2, freeze: 2, coachOff: 0.2, courtOff: 0.2 },
  family: { name: 'Family', price: 349, hours: 20, window: 14, guests: 2, freeze: 2, coachOff: 0.2, courtOff: 0.2, juniorOff: 0.25 },
};
export const ROLLOVER_HOURS = 4; // unused hours that move to next month, Club and Family

// --- Cancellation: one rule for the site and the booking ---
export const CANCEL = {
  hours: 24,
  head: 'Free cancellation up to 24 hours before',
  tail: 'Later cancellations may be charged.',
  text: 'Free cancellation up to 24 hours before; later cancellations may be charged.',
};

// --- Player levels. The number stays inside (a game is "level 3.5"); people see the word. ---
export const LEVELS = [
  { id: '3.0', label: 'Beginner' },
  { id: '3.5', label: 'Intermediate' },
  { id: '4.0', label: 'Advanced' },
];
/** The word for a stored level; other numbers fall to the nearest word. */
export function levelLabel(id) {
  const hit = LEVELS.find((l) => l.id === String(id));
  if (hit) return hit.label;
  const n = parseFloat(id);
  return Number.isNaN(n) ? String(id) : n < 3.25 ? LEVELS[0].label : n < 3.75 ? LEVELS[1].label : LEVELS[2].label;
}

// --- Text for static HTML ---
const pct = (n) => `${Math.round(n * 100)}%`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const guestText = (n) => `${n === 1 ? 'One' : 'Two'} guest ${n === 1 ? 'pass' : 'passes'} a month`;

export const TOKENS = {
  phone: CONTACT.phone,
  phoneHref: CONTACT.phoneHref,
  phoneExample: CONTACT.phoneExample,
  whatsapp: CONTACT.whatsapp,
  email: CONTACT.email,
  mailHref: `mailto:${CONTACT.email}`,
  'hours.weekday': span(OPEN.weekday),
  'hours.weekend': span(OPEN.weekend),
  'cancel.head': CANCEL.head,
  'cancel.tail': CANCEL.tail,
  cancel: CANCEL.text,
  'price.balls': `$${ADDONS.balls}`,
  'price.racket': `$${ADDONS.racket.tennis}`,
  'price.junior': `$${JUNIOR_EXTRA}`,
  'rate.padel': `$${RATES.padel.offPeak}`,
  annual: pct(ANNUAL_OFF),
  juniorOff: pct(PLAN.family.juniorOff),
  rollover: String(ROLLOVER_HOURS),
};
for (const [id, p] of Object.entries(PLAN)) {
  Object.assign(TOKENS, {
    [`${id}.price`]: String(p.price),
    [`${id}.hours`]: String(p.hours),
    [`${id}.window`]: String(p.window),
    [`${id}.windowWord`]: WORDS[p.window] ?? String(p.window),
    [`${id}.coachOff`]: pct(p.coachOff),
    [`${id}.courtOff`]: pct(p.courtOff),
    [`${id}.guests`]: guestText(p.guests),
    [`${id}.freeze`]: `${p.freeze} ${p.freeze === 1 ? 'month' : 'months'}`,
  });
}

/** Replaces every {{fact:key}} in a string; an unknown key is a mistake worth failing the build for. */
export function fillTokens(html) {
  return html.replace(/\{\{fact:([\w.]+)\}\}/g, (_, key) => {
    if (!(key in TOKENS)) throw new Error(`club-facts: no token "${key}"`);
    return TOKENS[key];
  });
}
