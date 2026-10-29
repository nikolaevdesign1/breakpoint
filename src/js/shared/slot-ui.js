// Date and hour helpers shared by the booking map and the site (24-hour clock: 08:00 … 20:00).

export const DAYS_AHEAD = 7;
export const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;
export const dateFor = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
export const dayName = (offset) => (offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dateFor(offset).toLocaleDateString('en-US', { weekday: 'short' }));
export const weekday = (offset) => (offset === 0 ? 'Today' : dateFor(offset).toLocaleDateString('en-US', { weekday: 'short' }));
export const isPast = (offset, hour) => offset === 0 && hour <= new Date().getHours();
