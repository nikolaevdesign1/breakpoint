// Shared by the custom select and the date picker: where a popover sits relative to its button.
export const mobile = () => window.matchMedia('(max-width: 640px)').matches;

/** Fixed popover under (or over, when short of room) its button; on a phone the CSS makes it a sheet. Returns true if it went up. */
export function placePopover(btn, el, { match = false, maxH = Infinity } = {}) {
  if (mobile()) { el.style.cssText = ''; return false; }
  const r = btn.getBoundingClientRect();
  const h = Math.min(el.scrollHeight, maxH);
  const up = innerHeight - r.bottom < h + 16 && r.top > innerHeight - r.bottom;
  const w = match ? r.width : el.offsetWidth;
  el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  if (match) el.style.width = `${r.width}px`;
  el.style.top = `${up ? r.top - h - 4 : r.bottom + 4}px`;
  if (maxH < Infinity) el.style.maxHeight = `${Math.min(maxH, up ? r.top - 16 : innerHeight - r.bottom - 16)}px`;
  return up;
}
