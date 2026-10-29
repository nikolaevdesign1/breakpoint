// Coaching staff for the home cloud, the coaches page and its profiles. One list, one place to edit.
// Photos: public/media/coaches/<slug>.webp (720×900 cut-out) and <slug>.thumb.webp (240×300); see CREDITS.md.
// Slots are day offsets from today, so the "next free hours" never go stale in the mockup.

export const COACHES = [
  {
    slug: 'alexander-milevski', name: 'Alexander Milevski', role: 'Founder and head coach',
    sports: ['tennis'], ages: ['kids', 'adults'], price: 220,
    played: 'Founder of the club',
    languages: ['English', 'Russian'],
    specialties: ['Clay-court patterns', 'Match strategy', 'High-performance juniors'],
    reviews: [
      { text: 'Two sessions in and he had rebuilt my second serve. I stopped double-faulting in league matches.', by: 'Marcus, advanced league player' },
      { text: 'He watches one rally and knows what you will do in the next ten.', by: 'Elena, club member' },
    ],
    slots: [[2, '7:00 AM'], [3, '6:00 PM'], [6, '8:00 AM']],
  },
  {
    slug: 'sofia-marquez', name: 'Sofia Marquez', role: 'Performance coach',
    sports: ['tennis'], ages: ['adults'], years: 11, price: 160,
    played: 'Former competitive player, performance coach',
    languages: ['English', 'Spanish'],
    specialties: ['Match play & tactics', 'Return of serve', 'Tournament prep'],
    reviews: [
      { text: 'Sofia plans every lesson around my next opponent. I won my first club open in March.', by: 'Daniela, advanced player' },
      { text: 'Tough, clear and very funny. The drills feel like real points.', by: 'Chris, plays twice a week' },
    ],
    slots: [[1, '6:30 PM'], [2, '7:30 PM'], [4, '9:00 AM']],
  },
  {
    slug: 'daniel-okafor', name: 'Daniel Okafor', role: 'Junior academy lead',
    sports: ['tennis'], ages: ['kids'], years: 14, price: 140,
    played: 'Certified coach, juniors to college tennis',
    languages: ['English', 'French'],
    specialties: ['Red to green ball', 'Footwork', 'College pathway'],
    reviews: [
      { text: 'Our son went from crying at drills to asking for extra practice. Daniel just gets kids.', by: 'Parent of Leo, 9' },
      { text: 'Clear plan, monthly video check-ins, real progress. She made the green ball squad.', by: 'Parent of Ava, 12' },
    ],
    slots: [[1, '4:00 PM'], [3, '4:30 PM'], [5, '10:00 AM']],
  },
  {
    slug: 'lena-hoffmann', name: 'Lena Hoffmann', role: 'Padel & conditioning',
    sports: ['tennis', 'padel'], ages: ['adults'], years: 9, price: 150,
    played: 'Former competitive padel player, strength coach',
    languages: ['English', 'German', 'Spanish'],
    specialties: ['Wall play', 'Footwork & speed', 'Injury prevention'],
    reviews: [
      { text: 'My knees stopped hurting after six weeks of her movement sessions. I play more, not less.', by: 'Robert, 58' },
      { text: 'She explains padel angles so simply. The walls finally make sense.', by: 'Ana, padel beginner' },
    ],
    slots: [[1, '7:00 AM'], [2, '12:00 PM'], [5, '6:00 PM']],
  },
  {
    slug: 'mateo-rivas', name: 'Mateo Rivas', role: 'Head of padel',
    sports: ['padel'], ages: ['adults'], years: 12, price: 160,
    played: 'Former national-level padel player',
    languages: ['Spanish', 'English'],
    specialties: ['Bandeja & víbora', 'Doubles positioning', 'Competitive league prep'],
    reviews: [
      { text: 'He fixed my bandeja in one hour. Our team moved up a division this season.', by: 'Javier, padel league' },
      { text: 'Very calm, very precise. You leave every lesson with one thing to work on.', by: 'Monica, plays Sundays' },
    ],
    slots: [[1, '8:00 PM'], [3, '7:00 AM'], [4, '8:30 PM']],
  },
  {
    slug: 'camila-duarte', name: 'Camila Duarte', role: 'Padel coach',
    sports: ['padel'], ages: ['kids', 'adults'], years: 6, price: 120,
    played: 'Former junior padel champion',
    languages: ['Portuguese', 'Spanish', 'English'],
    specialties: ['First padel lessons', 'Family sessions', 'Volleys at the net'],
    reviews: [
      { text: 'We booked a family hour and now all four of us play every weekend.', by: 'The Alvarez family' },
      { text: 'Patient and so much energy. My daughter adores her.', by: 'Parent of Sofia, 10' },
    ],
    slots: [[2, '5:00 PM'], [3, '10:00 AM'], [6, '11:00 AM']],
  },
  {
    slug: 'marcus-bell', name: 'Marcus Bell', role: 'Tennis coach',
    sports: ['tennis'], ages: ['adults'], years: 10, price: 140,
    played: 'Former college and tournament player',
    languages: ['English'],
    specialties: ['Serve mechanics', 'Doubles', 'Adult league teams'],
    reviews: [
      { text: 'Marcus added 12 mph to my first serve without wrecking my shoulder.', by: 'Tom, advanced player' },
      { text: 'Our USTA doubles team trains with him every Thursday. Best hour of the week.', by: 'Karen, team captain' },
    ],
    slots: [[1, '6:00 AM'], [2, '6:00 PM'], [3, '7:00 PM']],
  },
  {
    slug: 'andres-calderon', name: 'Andrés Calderón', role: 'Tennis & padel coach',
    sports: ['tennis', 'padel'], ages: ['kids', 'adults'], years: 8, price: 130,
    played: 'Former junior national and college player',
    languages: ['Spanish', 'English'],
    specialties: ['Two-sport players', 'Topspin forehand', 'Beginners'],
    reviews: [
      { text: 'He coaches my son on the tennis court and me on the padel court. Same great coach.', by: 'Laura, mom and padel player' },
      { text: 'Super clear in Spanish and English. My forehand finally has spin.', by: 'Diego, intermediate player' },
    ],
    slots: [[1, '5:00 PM'], [4, '7:00 AM'], [5, '5:30 PM']],
  },
  {
    slug: 'yuki-tanaka', name: 'Yuki Tanaka', role: 'Junior coach',
    sports: ['tennis'], ages: ['kids'], years: 5, price: 120,
    played: 'Former junior and college club player',
    languages: ['English', 'Japanese'],
    specialties: ['Ages 5–9', 'Coordination games', 'Red ball tennis'],
    reviews: [
      { text: 'Yuki turns every drill into a game. My twins count the days until Saturday.', by: 'Parent of Mia & Max, 6' },
      { text: 'Gentle and organized. Weekly notes on what to practice at home.', by: 'Parent of Noah, 7' },
    ],
    slots: [[1, '3:30 PM'], [2, '4:00 PM'], [6, '9:00 AM']],
  },
  {
    slug: 'olivia-grant', name: 'Olivia Grant', role: 'Adult programs coach',
    sports: ['tennis'], ages: ['adults'], years: 13, price: 130,
    played: 'Former college player and certified coach',
    languages: ['English'],
    specialties: ['Adult beginners', 'Cardio tennis', 'Back to tennis after a break'],
    reviews: [
      { text: 'I had never held a racket at 41. Three months later I play a weekly doubles game.', by: 'Priya, adult beginner' },
      { text: 'Encouraging, organized and she remembers everyone’s name.', by: 'Mike, cardio tennis regular' },
    ],
    slots: [[2, '9:00 AM'], [3, '12:00 PM'], [4, '6:30 PM']],
  },
  {
    slug: 'rafael-costa', name: 'Rafael Costa', role: 'Padel coach',
    sports: ['padel'], ages: ['adults'], years: 7, price: 130,
    played: 'Former league padel player, certified coach',
    languages: ['Portuguese', 'English', 'Spanish'],
    specialties: ['Smash & x3', 'Glass defense', 'Intermediate players'],
    reviews: [
      { text: 'Rafael made me love defending. I get balls back I used to watch fly past.', by: 'Pedro, plays after work' },
      { text: 'Every session has a clear theme and a game at the end. Great format.', by: 'Isabel, padel league' },
    ],
    slots: [[1, '7:30 PM'], [2, '8:00 AM'], [5, '7:30 PM']],
  },
  {
    slug: 'jordan-hayes', name: 'Jordan Hayes', role: 'Hitting partner & sparring',
    sports: ['tennis'], ages: ['adults'], years: 4, price: 120,
    played: 'Former college player, match-play specialist',
    languages: ['English'],
    specialties: ['Live-ball sparring', 'Match practice', 'Pre-tournament hitting'],
    reviews: [
      { text: 'Jordan hits as hard or as steady as you ask. Perfect before a tournament.', by: 'Alex, open division' },
      { text: 'Feels like a real match, minus the gamesmanship.', by: 'Sam, advanced player' },
    ],
    slots: [[1, '6:00 AM'], [1, '8:00 PM'], [3, '6:00 AM']],
  },
  {
    slug: 'karim-haddad', name: 'Karim Haddad', role: 'Tennis coach',
    sports: ['tennis'], ages: ['kids', 'adults'], years: 9, price: 140,
    played: 'Former national-level player',
    languages: ['French', 'Arabic', 'English'],
    specialties: ['Baseline consistency', 'Mental game', 'Teen players'],
    reviews: [
      { text: 'Karim taught my daughter how to stay calm when she is down a set. Huge.', by: 'Parent of Lina, 15' },
      { text: 'Rallies of 30 balls became normal. My error count halved.', by: 'Julien, intermediate player' },
    ],
    slots: [[2, '4:30 PM'], [3, '8:00 AM'], [4, '5:00 PM']],
  },
  {
    slug: 'nina-petrova', name: 'Nina Petrova', role: 'High-performance juniors',
    sports: ['tennis'], ages: ['kids'], years: 15, price: 180,
    played: 'Former competitive player, junior coach',
    languages: ['Russian', 'English'],
    specialties: ['Tournament juniors', 'Two-handed backhand', 'Training plans'],
    reviews: [
      { text: 'Nina built a full season plan for our son. He is now top 50 in Florida for his age.', by: 'Parent of Ilya, 14' },
      { text: 'Demanding in the best way. She knows the junior circuit inside out.', by: 'Parent of Kate, 13' },
    ],
    slots: [[1, '3:30 PM'], [4, '3:30 PM'], [6, '7:00 AM']],
  },
  {
    slug: 'ethan-brooks', name: 'Ethan Brooks', role: 'Junior tennis & padel',
    sports: ['tennis', 'padel'], ages: ['kids'], years: 5, price: 120,
    played: 'Former competitive junior',
    languages: ['English', 'Spanish'],
    specialties: ['Ages 8–14', 'Multi-sport movement', 'Summer camps'],
    reviews: [
      { text: 'My boys play both sports with Ethan. They come home exhausted and happy.', by: 'Parent of Liam & Owen' },
      { text: 'Organized, punctual and the kids look up to him.', by: 'Parent of Zoe, 11' },
    ],
    slots: [[2, '3:30 PM'], [3, '4:00 PM'], [5, '9:00 AM']],
  },
  {
    slug: 'isabela-ferreira', name: 'Isabela Ferreira', role: 'Junior padel coach',
    sports: ['padel'], ages: ['kids'], years: 4, price: 120,
    played: 'Former youth padel player',
    languages: ['Portuguese', 'English'],
    specialties: ['First padel lessons', 'Ages 7–13', 'Junior padel league'],
    reviews: [
      { text: 'Isabela made padel the favorite part of my daughter’s week.', by: 'Parent of Clara, 9' },
      { text: 'Fun but serious about technique. Our son plays the junior league now.', by: 'Parent of Rafa, 12' },
    ],
    slots: [[1, '4:30 PM'], [4, '4:30 PM'], [6, '10:00 AM']],
  },
  {
    slug: 'tomas-novak', name: 'Tomáš Novák', role: 'Strength & movement',
    sports: ['tennis', 'padel'], ages: ['adults'], years: 10, price: 140,
    played: 'Former junior national player, certified strength coach',
    languages: ['Czech', 'English', 'German'],
    specialties: ['On-court fitness', 'Recovery', 'Players over 40'],
    reviews: [
      { text: 'Tomáš got me through a third set I would have lost last year.', by: 'Greg, 52' },
      { text: 'Short, hard, smart sessions. My first step is quicker on both courts.', by: 'Natalie, tennis & padel' },
    ],
    slots: [[1, '7:00 AM'], [3, '6:30 PM'], [5, '7:00 AM']],
  },
  {
    slug: 'richard-hale', name: 'Richard Hale', role: 'Social & senior tennis',
    sports: ['tennis'], ages: ['adults'], years: 12, price: 125,
    played: 'Former college assistant coach',
    languages: ['English'],
    specialties: ['Players 55+', 'Doubles strategy', 'Social mixers'],
    reviews: [
      { text: 'Richard put together our Tuesday group. Eight of us, never missed a week.', by: 'Linda, 67' },
      { text: 'The kindest coach and still the sharpest eye for doubles positioning.', by: 'Howard, 71' },
    ],
    slots: [[2, '9:30 AM'], [3, '10:00 AM'], [4, '9:30 AM']],
  },
  {
    slug: 'luca-romano', name: 'Luca Romano', role: 'Padel coach',
    sports: ['padel'], ages: ['kids', 'adults'], years: 8, price: 135,
    played: 'Former league padel player',
    languages: ['Italian', 'English', 'Spanish'],
    specialties: ['Lob & net transition', 'Tactics', 'Kids from age 8'],
    reviews: [
      { text: 'Luca reads the game like chess. My lobs now actually win points.', by: 'Andrea, padel league' },
      { text: 'My son and I take a lesson together every Sunday. Highlight of our week.', by: 'Paolo, padel dad' },
    ],
    slots: [[2, '7:00 PM'], [5, '10:30 AM'], [6, '5:00 PM']],
  },
  {
    slug: 'kevin-park', name: 'Kevin Park', role: 'Technique & video analysis',
    sports: ['tennis'], ages: ['kids', 'adults'], years: 7, price: 150,
    played: 'Former college club captain, certified coach',
    languages: ['English', 'Korean'],
    specialties: ['Slow-motion video', 'Stroke rebuilds', 'Data-driven plans'],
    reviews: [
      { text: 'Seeing my swing at 240 fps next to a pro’s changed everything.', by: 'Jason, intermediate player' },
      { text: 'Kevin sends a short video note after each lesson. My son actually watches them.', by: 'Parent of Ethan, 13' },
    ],
    slots: [[1, '5:30 PM'], [3, '5:30 PM'], [4, '8:00 AM']],
  },
];

// Short muted loops for the home cloud (Mixkit Free License, see docs/media-sources.md).
// Row 145: clay-rally, junior-lesson, padel-aerial, padel-night, clay-serve and padel-coach are left out,
// they show venue names, sponsor banners or brand logos.
export const CLIPS = [
  { file: 'serve-studio' },
  { file: 'clay-aerial', wide: true },
  { file: 'junior-rally' },
  { file: 'padel-sunset' },
];

export const SPORT_LABEL = { tennis: 'Tennis', padel: 'Padel' };
export const AGE_LABEL = { kids: 'Kids', adults: 'Adults' };

export const firstName = (c) => c.name.split(' ')[0];

export function coachPhoto(c, size = 'full') {
  return `/media/coaches/${c.slug}${size === 'thumb' ? '.thumb' : ''}.webp`;
}

export function bookingUrl(c, slot) {
  const q = new URLSearchParams({ topic: 'coaching', coach: c.name });
  if (slot) q.set('slot', slot);
  return `/contacts.html?${q}#form`;
}

/** The booking map with the coach picked: /booking.html?coach=<slug>&slot=2026-10-30T17:30 (club/coach-link.js reads it). */
export function coachBookingUrl(c, slotIndex) {
  const q = new URLSearchParams({ coach: c.slug });
  const slot = c.slots[slotIndex];
  if (slot) {
    const d = new Date();
    d.setDate(d.getDate() + slot[0]);
    const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot[1]);
    const h = (+m[1] % 12) + (m[3] === 'PM' ? 12 : 0);
    const pad = (n) => String(n).padStart(2, '0');
    q.set('slot', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${m[2]}`);
  }
  return `/booking.html?${q}`;
}

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// [[dayOffset, '7:00 AM'], ...] → 'Thu, Oct 9 · 7:00 AM'
export function slotLabels(c, from = new Date()) {
  return c.slots.map(([offset, time]) => {
    const d = new Date(from);
    d.setDate(d.getDate() + offset);
    return `${DAY.format(d)} · ${time}`;
  });
}
