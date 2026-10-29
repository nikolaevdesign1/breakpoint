import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadLightmaps, applyLightmaps } from '../../booking/lightmaps.js';

// The club for the About rally: the same model as the booking map, still and light.
// One canvas, no shadow map and no post stack (the ground light is baked into the lightmaps),
// pixel ratio capped at 1.5. The words get their contrast from a grade drawn in the render (GRADE), not from cards.

const MODEL_URL = '/models/clay_courts.glb';
const SKY = new THREE.Color('#a8c4dc');
const SKIP = /^(car_|.*_fence$|.*_sign_post$)/; // heavy or in the way of the camera (car_1 alone is 89k triangles)

// Render-side grade for the words: a vignette plus a dark band at the top and bottom, drawn after the scene.
// White headlines sit on the bands, so no card is needed behind them (no CSS blur either).
const GRADE = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.35, 0.85, length(d * vec2(1.1, 1.0)));
      float top = pow(smoothstep(0.55, 1.0, vUv.y), 1.4);
      float bot = pow(smoothstep(0.5, 0.0, vUv.y), 1.3);
      gl_FragColor = vec4(0.07, 0.05, 0.04, clamp(vig * 0.45 + top * 0.5 + bot * 0.55, 0.0, 0.8));
    }`,
});

export async function createStage(canvas, onProgress) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.FogExp2(SKY, 0.006);
  scene.add(new THREE.HemisphereLight(0xdceaf7, 0x8a7a66, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.position.set(0.7, 0.5, 0.5).multiplyScalar(100);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  const size = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return [w, h];
  };
  size();

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const lightmaps = loadLightmaps().catch(() => ({}));
  const gltf = await loader.loadAsync(MODEL_URL, (e) => e.lengthComputable && onProgress?.(e.loaded / e.total));
  const root = gltf.scene;
  applyLightmaps(root, root.userData.lightmaps, await lightmaps);
  const hide = [];
  root.traverse((o) => { if (o.name && SKIP.test(o.name)) hide.push(o); });
  hide.forEach((o) => o.removeFromParent());
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.matrixAutoUpdate = false;
  });
  scene.add(root);
  await renderer.compileAsync(scene, camera); // link the shaders in parallel instead of stalling the first draw
  const grade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), GRADE);
  grade.frustumCulled = false;
  grade.renderOrder = 999;
  const post = new THREE.Scene();
  post.add(grade);
  const flat = new THREE.Camera();
  root.updateMatrixWorld(true);

  return {
    scene,
    camera,
    renderer,
    resize: size,
    render() {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(post, flat);
    },
    dispose() {
      GRADE.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) {
          if (!m) continue;
          for (const v of Object.values(m)) v?.isTexture && v.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
