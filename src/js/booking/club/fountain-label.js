// "Drinking fountain" label (round 10, row 36): the annotation style of the map (marker, leader
// line, label) over the fountain under the pointer. life/fountains-drinking.js sends
// `bp-fountain-hover` with the spot, or null when the pointer leaves it.

export function initFountainLabel(pins) {
  document.addEventListener('bp-fountain-hover', (e) => {
    const f = e.detail;
    if (!f) { pins.drop('fountain'); return; }
    pins.put('fountain', {
      at: { x: f.x, z: f.z },
      tone: 'light',
      rows: [{ t: 'Drinking fountain', cls: 'b' }, { t: f.label === 'Drinking fountain' ? (f.touch ? 'Tap for a sip' : 'Click for a sip') : f.label, cls: 's' }],
    });
  });
}
