import { initSite } from '../site/site.js';
import { initReviews } from '../site/reviews.js';
import { initFaq } from '../site/faq.js';
import { initCalendar } from '../site/tournament-calendar.js';
import { initApply } from '../site/tournament-apply.js';
import { nextEvent } from '../site/tournaments-data.js';

const { reducedMotion } = initSite();
initCalendar({ reducedMotion });
initReviews({ reducedMotion });
initFaq();

// Every "Apply" on the page opens the same application form for its event.
const apply = initApply({ reducedMotion });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-apply]');
  if (btn && !btn.closest('[data-apply-modal]')) apply.open(btn.dataset.apply || nextEvent()?.id, btn);
});
