import gsap from 'gsap';

// Square-motif reveal: a block of small squares pops in over an element at random,
// the content switches on underneath, then the squares drop out again.

// `whole`: the element itself (background included) only appears once the squares cover it.
// `pace` stretches the timing (1 = the booking tiles' pace, higher = slower waves).
export function pixelReveal(el, { cell = 6, color = '#f4f3ef', whole = false, pace = 1 } = {}) {
  const { width, height } = el.getBoundingClientRect();
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const layer = document.createElement('span');
  layer.className = 'px-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:absolute;inset:0;display:grid;pointer-events:none;overflow:hidden;z-index:2;
    grid-template-columns:repeat(${cols},${cell}px);grid-auto-rows:${cell}px;`;
  const cells = Array.from({ length: cols * rows }, () => {
    const c = document.createElement('i');
    c.style.cssText = `display:block;background:${color};transform:scale(0)`;
    layer.appendChild(c);
    return c;
  });
  el.appendChild(layer);
  if (whole) layer.style.visibility = 'visible';
  // Hide text nodes (via colour) and child elements until the squares cover them.
  const content = [...el.children].filter((c) => c !== layer);

  // Hidden right away, not when the timeline reaches this element.
  gsap.set(el, whole ? { color: 'transparent', visibility: 'hidden' } : { color: 'transparent' });
  if (content.length) gsap.set(content, { autoAlpha: 0 });

  const tl = gsap.timeline({ onComplete: () => layer.remove() });
  tl.to(cells, { scale: 1, duration: 0.14 * pace, ease: 'steps(2)', stagger: { amount: 0.22 * pace, from: 'random' } });
  tl.set(el, whole ? { clearProps: 'color', visibility: 'visible' } : { clearProps: 'color' });
  if (content.length) tl.set(content, { clearProps: 'opacity,visibility' });
  tl.to(cells, { scale: 0, duration: 0.14 * pace, ease: 'steps(2)', stagger: { amount: 0.26 * pace, from: 'random' } });
  return tl;
}
