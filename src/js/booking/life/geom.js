import * as THREE from 'three';

// Small geometry helpers for the round 7 life props (drag brushes, the golf cart): parts painted
// with vertex colours and merged into one mesh, a soft dark patch for contact shadows, and a
// shadow material that flattens a mesh along the sun onto the ground.

/** A part: `geometry` (any) painted `hex`, non-indexed, position + normal + colour only. */
export function part(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** A box part: size, centre, colour. */
export const box = (w, h, d, x, y, z, hex) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

/** Merges parts (see part()) into one geometry. */
export function merge(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = {};
  for (const k of ['position', 'normal', 'color']) out[k] = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    for (const k of ['position', 'normal', 'color']) out[k].set(g.attributes[k].array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) g.setAttribute(k, new THREE.BufferAttribute(out[k], 3));
  g.computeBoundingSphere();
  return g;
}

/** A soft black rectangle (canvas texture) for contact shadows. */
export function softRect(w = 64, h = 32, blur = 5) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.filter = `blur(${blur}px)`;
  g.fillStyle = '#000';
  g.fillRect(blur * 2, blur * 2, w - blur * 4, h - blur * 4);
  return new THREE.CanvasTexture(c);
}

/**
 * Black, `opacity`: the mesh flattened along `sunDir` (kept live: the vector is the uniform) onto
 * the plane y = ground. Overlapping parts darken once (all at one depth, strict depth test).
 */
export function flatShadowMaterial(sunDir, ground, opacity = 0.5) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: true, depthFunc: THREE.LessDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSun = { value: sunDir };
    shader.uniforms.uGround = { value: ground };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSun;\nuniform float uGround;')
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vec3 bpSun = normalize(uSun);
        wp.xyz -= bpSun * ((wp.y - uGround) / max(bpSun.y, 0.12));
        wp.y = uGround;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'life-flat-shadow';
  return m;
}
