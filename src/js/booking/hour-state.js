// The hour the map shows (round 7): the dock's time scrubber sets it, the light, the floodlights,
// the rallies and the court tint follow it. `live` = following the Miami clock (no scrub).
// Every change goes out as a `bp-hour` event with the same fields.

export const hourState = {
  offset: 0, // days from today
  dayKey: null, // availability key of that day
  hour: null, // booking hour shown (an hour of the day, 0…23)
  time: null, // light time in hours (live: the clock; scrubbed: the middle of the hour)
  live: true,
  instant: false, // round 9: the light jumps to the time instead of easing (fun/timelapse.js)
};

export function setHourState(next) {
  Object.assign(hourState, next);
  document.dispatchEvent(new CustomEvent('bp-hour', { detail: { ...hourState } }));
}
