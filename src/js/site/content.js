import { RATES, COACH_RATE, GROUP_LESSON, ACADEMY_MONTH } from '../shared/club-facts.js';

// Copy for the home page. Numbers come from shared/club-facts.js: the rate grid, the widget and the booking read the same table.

export const SERVICES = [
  {
    name: 'Indoor <em>courts</em>',
    meta: '60–120 min',
    desc: 'Four climate-controlled hard courts. No rain delays, no 95° afternoons in August.',
    price: RATES.hard.offPeak, unit: '/ hour', note: 'Weekdays before 4 PM', cta: 'Book indoor', kind: 'court', href: '/booking.html',
    media: 'services.0',
  },
  {
    name: 'Outdoor <em>clay</em>',
    meta: '60–120 min',
    desc: 'Six red clay courts, brushed and watered between bookings. Lit after dark.',
    price: RATES.clay.offPeak, unit: '/ hour', note: 'Weekdays before 4 PM', cta: 'Book clay', kind: 'court', href: '/booking.html',
    media: 'services.1',
  },
  {
    name: 'Padel <em>glass</em>',
    meta: '90 min · 4 players',
    desc: 'Four covered glass padel courts. Padel rackets and balls are free to borrow at the front desk.',
    price: RATES.padel.offPeak, unit: '/ hour', note: 'Weekdays before 4 PM', cta: 'Book padel', kind: 'court', href: '/booking.html',
    media: 'services.7',
  },
  {
    name: 'Private <em>coaching</em>',
    meta: '60 min · 1 player',
    desc: 'One coach, one player, one plan. Video analysis from your second session on.',
    price: COACH_RATE.from, unit: '/ session', note: `Prices vary by coach, $${COACH_RATE.from}–${COACH_RATE.to}`, cta: 'Pick a coach', kind: 'coaching', href: '/coaches.html',
    media: 'services.2',
  },
  {
    name: 'Adult <em>groups</em>',
    meta: '90 min · 4 players max',
    desc: 'Four players per coach, grouped by level. Morning, evening and weekend clinics.',
    price: GROUP_LESSON, unit: '/ session', note: 'Per player', cta: 'Join a group', kind: 'coaching', href: '/coaches.html',
    media: 'services.3',
  },
  {
    name: 'Junior <em>academy</em>',
    meta: 'Ages 5–17 · 2–4× a week',
    desc: 'Red, orange, green and yellow ball groups that lead into the junior circuit.',
    price: ACADEMY_MONTH, unit: '/ month', note: 'Per player', cta: 'Book a trial', kind: 'coaching', href: '/coaches.html',
    media: 'services.4',
  },
];

export { RATES, PEAK_FROM, rateFor } from '../shared/club-facts.js';
