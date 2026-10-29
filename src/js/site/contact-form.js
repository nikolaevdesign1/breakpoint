import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLineForm, showDone, EMAIL, digits } from './line-form.js';

// Front-desk form (rows 118, 10): a thin-line form on a black block, the topic picked on four tiles. Links from other pages prefill it
// through ?topic=&coach=&slot=&event= (coach cards, plan buttons, tournament entries).
// There is no backend yet: submit only shows the confirmation.

const PREFILL = {
  booking: () => 'Hi, I need help with a booking. ',
  coaching: (q) => (q.get('coach') ? `Hi, I’d like to book a session with ${q.get('coach')}${q.get('slot') ? ` on ${q.get('slot')}` : ''}. ` : 'Hi, I’d like to book a coaching assessment. '),
  junior: () => 'Hi, I’d like to book a free junior trial for my child (age: ). ',
  membership: () => 'Hi, I’m interested in a membership. ',
  tournaments: (q) => (q.get('event') ? `Hi, I’d like to register for ${q.get('event')}. My level: ` : 'Hi, I’d like to join a tournament. My level: '),
};

// Other topics from links map onto the four tiles (the prefill still follows the original key)
const TILE = { junior: 'coaching', tournaments: 'other', events: 'other' };

const RULES = {
  name: (f) => (f.name.value.trim().length > 1 ? '' : 'Add your name.'),
  email: (f) => (EMAIL.test(f.email.value.trim()) ? '' : 'Check the address.'),
  phone: (f) => (!f.phone.value.trim() || digits(f.phone.value) >= 7 ? '' : 'Check the number.'),
  message: (f) => (f.message.value.trim().length > 9 ? '' : 'A few more words, please.'),
};

export function initContactForm() {
  const wrap = document.querySelector('[data-form-wrap]');
  const form = wrap?.querySelector('[data-form]');
  if (!form) return;
  const f = form.elements;

  // Topic hints (membership → the Memberships page) follow the topic tiles.
  const hints = form.querySelectorAll('[data-topic-hint]');
  const syncHint = () => hints.forEach((h) => { h.hidden = h.dataset.topicHint !== f.topic.value; });
  form.addEventListener('change', (e) => { if (e.target.name === 'topic') { syncHint(); ScrollTrigger.refresh(); } });

  const q = new URLSearchParams(window.location.search);
  const topic = q.get('topic');
  if (topic && (TILE[topic] || [...f.topic].some((r) => r.value === topic))) {
    f.topic.value = TILE[topic] || topic;
    if (PREFILL[topic] && !f.message.value) f.message.value = PREFILL[topic](q);
  }
  syncHint();

  initLineForm(form, {
    rules: RULES,
    onValid: ({ name }) => {
      wrap.querySelector('[data-done-name]').textContent = name.trim().split(/\s+/)[0];
      showDone(wrap);
    },
  });
}
