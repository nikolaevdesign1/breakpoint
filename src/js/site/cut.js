// Cut corners (css/site/cut.css): keep the vertical depth of the cut equal to the horizontal one in pixels,
// so the slope stays at 45 degrees on tall and wide photos alike.

let ro = null;
function observer() {
  if (ro) return ro;
  const set = (el, w, h) => {
    if (!w || !h) return;
    const x = parseFloat(getComputedStyle(el).getPropertyValue('--cut-x')) || 9;
    el.style.setProperty('--cut-y', `${((x * w) / h).toFixed(2)}%`);
  };
  ro = new ResizeObserver((entries) => entries.forEach((e) => set(e.target, e.contentRect.width, e.contentRect.height)));
  return ro;
}

export function initCuts() {
  document.querySelectorAll('.cut').forEach((el) => observer().observe(el));
}

/** Cut an element that got its .cut class after load (the home hero, once its intro has finished). */
export function watchCut(el) {
  observer().observe(el);
}
