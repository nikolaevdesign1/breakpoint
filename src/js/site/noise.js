import '../../css/site/noise.css';

// Film grain over everything (row 93). The tile is generated once on a small canvas: each pixel is a
// black or white grain with a random, mostly faint alpha, so it shows on white pages, dark bars and photos.
// Usage: initNoise() on site pages; booking passes a z-index that sits above the 3D canvas, below its UI.

const TILE = 128; // px of noise, drawn a little larger by the CSS for a softer, filmic grain

function makeTile() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = Math.pow(Math.random(), 2.4) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && URL.createObjectURL(blob))));
}

let layer = null;

export function initNoise({ zIndex } = {}) {
  if (layer) return layer;
  // A screen-sized clip around the oversized, jittering tile layer: no page ever scrolls sideways.
  layer = document.createElement('div');
  layer.className = 'grain-frame';
  layer.setAttribute('aria-hidden', 'true');
  if (zIndex != null) layer.style.zIndex = String(zIndex);
  const grain = document.createElement('div');
  grain.className = 'grain';
  layer.append(grain);
  makeTile().then((url) => {
    if (url) grain.style.backgroundImage = `url(${url})`;
  });
  document.body.appendChild(layer);
  return layer;
}
