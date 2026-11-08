// Who is booking: first and last name, a phone or an e-mail, remembered on this device (localStorage,
// never logged, never sent: there is no backend). Court, lesson, café table and open-game bookings all
// read and write this one record, so the second booking starts filled in. Every access is wrapped:
// private mode just means nothing is remembered.

const KEY = 'bp-contact';
const OLD = 'bp-player'; // before the split: one "name" field, phone, e-mail
export const CONTACT_HINT = 'We confirm by phone or e-mail';
export const PARTY_LIMITS = {
  court: (padel) => ({ min: padel ? 2 : 1, max: 4 }),
  lesson: { min: 1, max: 4 },
  table: { min: 1, max: 8 },
};

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const cap = (s) => clean(s).replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export function loadContact() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && typeof c === 'object') return { first: clean(c.first), last: clean(c.last), phone: clean(c.phone), email: clean(c.email) };
    const old = JSON.parse(localStorage.getItem(OLD) || 'null');
    if (old?.name) {
      const [first, ...rest] = clean(old.name).split(' ');
      return { first, last: rest.join(' '), phone: clean(old.phone), email: clean(old.email) };
    }
  } catch { /* no record */ }
  return { first: '', last: '', phone: '', email: '' };
}

export function saveContact(c) {
  try { localStorage.setItem(KEY, JSON.stringify({ first: cap(c.first), last: cap(c.last), phone: clean(c.phone), email: clean(c.email) })); } catch { /* this visit only */ }
}

export function clearContact() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD); } catch { /* nothing to clear */ }
}

export const hasContact = (c = loadContact()) => !!(c.first || c.last || c.phone || c.email);

/** "+1 (305) 555-0142" while typing; the leading 1 is the country, not part of the ten digits. */
export function formatPhone(raw) {
  const t = String(raw ?? '').trim();
  let d = (t.startsWith('+1') ? t.slice(2) : t).replace(/\D/g, ''); // our own "+1" prefix is not a digit typed
  if (d.length > 10 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return '';
  const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 10);
  return `+1 (${a}${a.length === 3 ? ')' : ''}${b ? ` ${b}` : ''}${c ? `-${c}` : ''}`;
}

export const phoneDigits = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; };

export const RULES = {
  first: (v) => clean(v).length >= 2 || 'Your first name, please',
  last: (v) => clean(v).length >= 2 || 'Your last name, please',
  phone: (v) => !clean(v) || phoneDigits(v).length === 10 || 'Ten digits, like +1 (305) 555-0142',
  email: (v) => !clean(v) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(v)) || 'That e-mail looks incomplete',
};

/** Errors by field; `contact` is set when both phone and e-mail are empty. {} means valid. */
export function checkContact(c) {
  const out = {};
  for (const k of ['first', 'last', 'phone', 'email']) {
    const r = RULES[k](c[k]);
    if (r !== true) out[k] = r;
  }
  if (!clean(c.phone) && !clean(c.email)) out.contact = 'A phone or an e-mail, so we can confirm';
  return out;
}

export const fullName = (c) => `${cap(c.first)} ${cap(c.last)}`.trim();
/** The line the desk would call or write to. */
export const contactLine = (c) => [clean(c.phone), clean(c.email)].filter(Boolean).join(' · ');
export const peopleLabel = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
