// Square size and palette shared with the tournament calendar's photo peek (tournament-peek.js).
// The squares on photos, section edges, the hero and page changes are gone.

export const COLORS = {
  ink: '#121211',
  ink2: '#1e1e1e',
  paper: '#ffffff',
  paper2: '#f1f1ef',
  sun: '#fff3da',
  clay: '#9c441f',
  finch: '#646544',
  wood: '#36251b',
};


export function cellSize() {
  const w = window.innerWidth;
  return w < 640 ? Math.round(w / 12) : Math.round(w / 40); // row 86: smaller squares, less cut-off
}
