import gsap from 'gsap';
import { COURTS, readBookingParams, dayKeyForOffset } from '../shared/availability.js';
import { isTournamentCourt } from '../shared/tournaments.js';
import { sceneEvents, setDimmed, setSelected, focusCourt, frameCourts, introCamera, introFlight, saveView, restoreView, highlightBooked, courtScreenRect } from '../booking/scene.js';
import { sessionBookings, isOwnSlot } from '../shared/session-bookings.js';
import { createCoachHover } from '../booking/interact/coach-hover.js';
import { initPostcard } from '../booking/interact/postcard.js';
import { initSeasonMenu } from '../booking/seasons/season-menu.js';
import { createCourtHud } from '../booking/court-hud.js';
import { createDock } from '../booking/dock.js';
import { createLoader } from '../booking/loader.js';
import { initAmbient } from '../booking/ambient.js';
import { initSound } from '../site/sound.js';
import { initCursor } from '../site/cursor.js';
import { initCookies } from '../site/cookies.js';
import { initWeather } from '../booking/weather.js';
import { initCatContest } from '../booking/life/cat-contest.js';
import { initSurfacePeek } from '../booking/fun/surface-peek.js';
import { initCountdown } from '../booking/flow/countdown.js';
import { readInvite, markInviteShown } from '../booking/flow/invite.js';

const cursor = initCursor();
initSound(); // click "pock" + shared mute toggle
initAmbient(); // wind, pad, distant rallies (after the first gesture)
initWeather(); // Miami time and weather in the top bar; rain on the map when it rains there (row 151)
initPostcard(); // round 7: the view as a tilt-shift postcard, button beside the weather
initCountdown(); // round 9 (row 22): "Your game in 2 h 14 min" in the top bar
initSeasonMenu(); // round 8: holiday decor switcher (auto by date, or forced for the session)

const loader = createLoader(document.getElementById('loading'));

// Booking happens on the court itself: the camera dives in, tiles float over the court.
// Leaving (Back, a click on the dimmed map, Esc, Done) flies back out to where the visitor was.
// After a booking, leaving settles on that court instead (interact/booked-sign.js flies there and flips its board in).
let justBooked = null;
const hud = createCourtHud({ onBack: () => backToArea(), onBooked: (b) => { justBooked = b; }, onGroup: (ids) => showGroup(ids) });

/** Round 9 (row 24): courts booked together stay clear and the drone frames them all. */
function showGroup(ids) {
  setDimmed(COURTS.filter((c) => !ids.includes(c.id)).map((c) => c.id));
  const phone = window.innerWidth <= 640;
  if (ids.length === 1) focusCourt(ids[0], phone ? { bottom: Math.min(window.innerHeight * 0.62, 520) } : {}, phone ? 1.15 : 1.08, 1.2);
  else frameCourts(COURTS.filter((c) => ids.includes(c.id)), phone ? { bottom: Math.min(window.innerHeight * 0.62, 520) } : {}, 1.2);
}
let returnView = null;
document.addEventListener('bp-open-court', (e) => openCourt(e.detail.courtId, e.detail)); // round 10 (booking/club): a Next up board or a weather tip sends the visitor to a court

function openCourt(courtId, opts) {
  if (!COURTS.some((c) => c.id === courtId)) return;
  if (!hud.isOpen()) returnView = saveView();
  setSelected(courtId);
  setDimmed(COURTS.filter((c) => c.id !== courtId).map((c) => c.id));
  // Phones keep the court in view above the tiles; on wider screens the tiles sit on the court.
  const phone = window.innerWidth <= 640;
  focusCourt(courtId, phone ? { bottom: Math.min(window.innerHeight * 0.62, 520) } : {}, phone ? 1.15 : 1.08, 1.7);
  hud.open(courtId, opts);
  gsap.to('[data-dock]', { yPercent: 180, autoAlpha: 0, duration: 0.5, ease: 'power3.in', overwrite: true }); // the tiles take over
}

function backToArea() {
  if (justBooked) (justBooked.group ?? [justBooked.courtId]).forEach(highlightBooked); // its floodlights stay on for the visit
  setSelected(null);
  holdFrame = true;
  dock.update(); // restores the filter / availability dimming
  holdFrame = false;
  if (justBooked) justBooked = null; // the drone is already on its way to the booked court
  else if (returnView) restoreView(returnView);
  else frameCourts(COURTS, undefined, 1.6);
  returnView = null;
  gsap.to('[data-dock]', { yPercent: 0, autoAlpha: 1, duration: 0.8, delay: 0.3, ease: 'expo.out', overwrite: true });
}

let firstFilter = true;
let holdFrame = false; // leaving a court restores the saved view instead of re-framing
const dock = createDock({
  onChange: ({ faded, busy, pool, filter, offset }) => {
    // A court booked by this visitor is not faded as busy: it stays lit and clear (round 7).
    const mine = (id) => isOwnSlot(id, dayKeyForOffset(offset), dock.focusHour());
    setDimmed(faded.filter((id) => !(busy.includes(id) && mine(id))), busy.filter((id) => !mine(id)));
    if (!firstFilter && !hud.isOpen() && !holdFrame) frameCourts(filter === 'all' ? COURTS : pool);
    firstFilter = false;
  },
  onNext: ({ court, offset, hour, minutes }) => openCourt(court.id, { offset, hour, minutes }), // round 9: a span from the scrubber
});

import('../booking/fun/timelapse.js').then(({ initTimelapse }) => initTimelapse()).catch((err) => console.warn('Timelapse failed', err)); // round 9 (row 34): a whole day in 20 s, button on the time bar

// Round 7: a court with a lesson at the dock's hour shows who is coaching there.
const coachTag = createCoachHover({
  when: () => ({ dayKey: dayKeyForOffset(dock.state.offset), hour: dock.focusHour() }),
  rectOf: courtScreenRect,
});
initSurfacePeek({ dock, isBusy: () => hud.isOpen() }); // round 9 (row 10): hovering a surface filter shows its nearest court and how it plays

sceneEvents.onHover = (id) => {
  const court = id && COURTS.find((c) => c.id === id);
  const cup = court && isTournamentCourt(court.id, dayKeyForOffset(dock.state.offset)); // round 7
  cursor.setLabel(court ? `${cup ? 'Tournament day ·' : 'Book'} ${court.label}` : null);
  coachTag.hover(id);
};
sceneEvents.onSelect = (id) => openCourt(id, dock.pickedSlot() ?? undefined); // round 7: the scrubbed hour comes along
sceneEvents.onProgress = (p) => loader.progress(p);
sceneEvents.onError = () => { loader.fail(); gsap.set('[data-top]', { autoAlpha: 1 }); };
sceneEvents.onReady = async () => {
  sessionBookings().forEach((b) => highlightBooked(b.courtId)); // round 7: courts booked on this visit stay lit
  dock.update();
  const invite = readInvite(); // round 9 (row 6): a friend's link lands on their court
  const link = invite ? null : readBookingParams();
  const flight = link || invite ? null : introFlight(); // round 8: a first visit opens with a flight over the club (booking/intro.js)
  if (!flight) introCamera();
  // Row 48: the first sprite sheets (players, cat, keeper) reach the GPU behind the loader, not in the intro's first frames; capped at 2 s.
  await Promise.race([sceneEvents.lifeStarted, new Promise((resolve) => setTimeout(resolve, 2000))]);
  await loader.done();
  performance.mark('bp-loader-done');
  gsap.fromTo('[data-top]', { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' });
  dock.reveal();
  if (invite) { focusCourt(invite.courtId, {}, 1.6, 2.2); markInviteShown(); }
  else if (link) { openCourt(link.courtId, { offset: link.offset, hour: link.hour }); returnView = null; } // leaving frames the courts
  else if (flight) flight.play();
  else frameCourts(COURTS, undefined, 2.2);
  initCookies({ delay: 1.6 });
  initCatContest({ isBusy: () => hud.isOpen() }); // row 136: the rules card at ~10 s; finding the cat is up to the visitor
  import('../booking/club/index.js').then(({ initClub }) => initClub()).catch((err) => console.warn('Club failed', err)); // round 10: open play, Next up boards, your day, the ladder
};
