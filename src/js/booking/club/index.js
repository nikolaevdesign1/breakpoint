import '../../../css/booking-club.css';
import { createPins } from './pins.js';
import { initNextUp } from './next-up.js';
import { initKitMarks } from './kit-marks.js';
import { initFlags } from './flags.js';
import { initFountainLabel } from './fountain-label.js';
import { createPanel } from './panel.js';
import { readCoachLink } from './coach-link.js';

// Round 10, the club on the map: open games to join (flags on the map, the Club panel), "Next up"
// boards at busy courts, your day at the club, the ladder with "Report score", the ball kit waiting
// on court. The weather tip and the kit tile live in the booking panel (weather-tip.js, kit.js).
// Local data only: localStorage (store.js), constants, the Miami clock.

export function initClub() {
  const pins = createPins();
  initNextUp(pins);
  initKitMarks(pins);
  const panel = createPanel(pins);
  // The partner flags (and "Your court") are annotations too; a tap on an open game's label opens it in the panel.
  initFlags(pins, { onOpen: (g) => panel?.openGame(g) });
  initFountainLabel(pins); // row 36: "Drinking fountain" under the pointer
  // A coach's card on the site links here with ?coach=<slug>&slot=<ISO>: the lesson form opens with them picked.
  const link = readCoachLink();
  if (link && panel) {
    for (let i = 0; i < link.offset; i++) document.querySelector('[data-day-step="1"]')?.click(); // the dock's day
    setTimeout(() => panel.openLesson(link), 400);
  }
  return { pins, panel };
}
