// Dev-only FPS overlay (press F, or Shift+F). Imported behind `import.meta.env.DEV`, so it is not
// in the production build. Shows frames per second, frame time, render scale, tier, draw calls and,
// from the life layer, which systems cost the most CPU per frame.
import { perf } from './perf.js';

export function mountFpsOverlay({ renderer, stats }) {
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;background:#000;color:#FFF3DA;font:12px/16px ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre;display:none;max-width:48ch';
  document.body.appendChild(el);
  let on = false;
  let frames = 0;
  let t0 = performance.now();
  let fps = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    if (!on) return;
    frames++;
    const now = performance.now();
    if (now - t0 < 500) return;
    fps = (frames * 1000) / (now - t0);
    frames = 0;
    t0 = now;
    const s = stats();
    const info = renderer.info.render;
    const top = (s.systems || []).slice(0, 6).map((x) => `${x.name.padEnd(12)} ${x.ms.toFixed(2)} ms`).join('\n');
    el.textContent = [
      `${fps.toFixed(0)} fps  ${(1000 / Math.max(fps, 1)).toFixed(1)} ms   tier ${perf.tier}`,
      `scale ${renderer.getPixelRatio().toFixed(2)}   calls ${info.calls}   tris ${(info.triangles / 1000).toFixed(0)}k`,
      `tick ${s.tickMs.toFixed(2)} ms   ${perf.hidden ? 'hidden' : 'visible'}`,
      top,
      perf.log.length ? `drops: ${perf.log.join('; ')}` : '',
    ].filter(Boolean).join('\n');
  };
  requestAnimationFrame(loop);
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    on = !on;
    el.style.display = on ? 'block' : 'none';
  });
}
