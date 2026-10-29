import { initSite } from '../site/site.js';
import { playPageIntro } from '../site/page-intro.js';
import { initStudio } from '../site/coaches-studio.js';
import { initProfile } from '../site/coaches-profile.js';

const { lenis, reducedMotion } = initSite();
playPageIntro({ reducedMotion });
const profile = initProfile({ lenis, reducedMotion });
initStudio({ onOpen: profile.open, reducedMotion });
