import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = '/models/clay_courts.glb';
const DUSK_OPACITY = 0.55;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.15;
const PAN_BOUNDS = { minX: -20, maxX: 96, minZ: -68, maxZ: 55 };

const COURTS = [
  { id: 'clay-1', type: 'clay', label: 'Clay 1', x: -19, z: -19.5 },
  { id: 'clay-2', type: 'clay', label: 'Clay 2', x: 0, z: -19.5 },
  { id: 'clay-3', type: 'clay', label: 'Clay 3', x: 19, z: -19.5 },
  { id: 'clay-4', type: 'clay', label: 'Clay 4', x: -19, z: 19.5 },
  { id: 'clay-5', type: 'clay', label: 'Clay 5', x: 0, z: 19.5 },
  { id: 'clay-6', type: 'clay', label: 'Clay 6', x: 19, z: 19.5 },
  { id: 'hard-1', type: 'hard', label: 'Hard 1', x: 38, z: -19.5 },
  { id: 'hard-2', type: 'hard', label: 'Hard 2', x: 57, z: -19.5 },
  { id: 'hard-3', type: 'hard', label: 'Hard 3', x: 38, z: 19.5 },
  { id: 'hard-4', type: 'hard', label: 'Hard 4', x: 57, z: 19.5 },
  { id: 'padel-1', type: 'padel', label: 'Padel 1', x: 4, z: -66 },
  { id: 'padel-2', type: 'padel', label: 'Padel 2', x: 38, z: -66 },
  { id: 'padel-3', type: 'padel', label: 'Padel 3', x: 4, z: -46 },
  { id: 'padel-4', type: 'padel', label: 'Padel 4', x: 38, z: -46 },
];

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function isSlotTaken(courtId, dayKey, hour) {
  return hashStr(`${courtId}-${dayKey}-${hour}`)() <= 0.32;
}

function dayKeyForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// --- Renderer / scene setup ---------------------------------------------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2f22);
scene.fog = new THREE.Fog(0x1a2f22, 140, 420);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);

const hemi = new THREE.HemisphereLight(0xdfefe0, 0x1c2a1f, 0.65);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d8, 1.6);
sun.position.set(-40, 70, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0003;
scene.add(sun);
scene.add(sun.target);

const backdrop = new THREE.Mesh(
  new THREE.CircleGeometry(420, 48),
  new THREE.MeshStandardMaterial({ color: 0x4a6b3e, roughness: 1, metalness: 0 })
);
backdrop.rotation.x = -Math.PI / 2;
backdrop.position.set(35, -0.08, -10);
backdrop.receiveShadow = true;
scene.add(backdrop);

// --- Camera rig: drag-pan + wheel-zoom (not orbit controls) -------------

const camDir = new THREE.Vector3(0.58, 0.82, 0.58).normalize();
const camDist0 = 55.05;
const forwardGround = new THREE.Vector3(-camDir.x, 0, -camDir.z).normalize();
const rightGround = new THREE.Vector3(forwardGround.z, 0, -forwardGround.x).normalize();

const camTarget = new THREE.Vector3(18, 0, -6);
let zoom = 1.0;

function aspectFactor() {
  const a = window.innerWidth / window.innerHeight;
  return a < 1 ? Math.min(2.6, 1.4 + (1 - a) * 1.8) : 1;
}

function updateCamera() {
  const dist = camDist0 * aspectFactor() * zoom;
  const pos = camTarget.clone().addScaledVector(camDir, dist);
  camera.position.copy(pos);
  camera.lookAt(camTarget);
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(-40, 70, 40));
}

function clampTarget() {
  camTarget.x = Math.min(PAN_BOUNDS.maxX, Math.max(PAN_BOUNDS.minX, camTarget.x));
  camTarget.z = Math.min(PAN_BOUNDS.maxZ, Math.max(PAN_BOUNDS.minZ, camTarget.z));
}

function panBy(dxPx, dyPx) {
  const wpp = (camDist0 * zoom) / window.innerHeight; // world units per pixel, rough
  camTarget.addScaledVector(rightGround, -dxPx * wpp);
  camTarget.addScaledVector(forwardGround, dyPx * wpp);
  clampTarget();
  updateCamera();
}

let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  panBy(dx, dy);
});
window.addEventListener('mouseup', () => { dragging = false; });

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + e.deltaY * 0.0012)));
    updateCamera();
  },
  { passive: false }
);

// touch pan
let touchLast = null;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});
canvas.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length !== 1 || !touchLast) return;
    e.preventDefault();
    const t = e.touches[0];
    panBy(t.clientX - touchLast.x, t.clientY - touchLast.y);
    touchLast = { x: t.clientX, y: t.clientY };
  },
  { passive: false }
);
canvas.addEventListener('touchend', () => { touchLast = null; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCamera();
});
renderer.setSize(window.innerWidth, window.innerHeight);
updateCamera();

// --- Model loading --------------------------------------------------------

const overlays = new Map(); // courtId -> hl mesh
const courtRoots = new Map(); // courtId -> root object
let playerTemplate = null;
let racketTemplate = null;

const bookings = new Map(); // `${courtId}-${dayKey}-${hour}` -> true when user-booked this session

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene;
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name.endsWith('_hl')) {
        child.material = child.material.clone();
        child.material.map = null;
        child.material.alphaMap = null;
        child.material.alphaTest = 0;
        child.material.transparent = true;
        child.material.depthWrite = false;
        child.material.polygonOffset = true;
        child.material.polygonOffsetFactor = -1;
        child.material.polygonOffsetUnits = -1;
        child.material.color.set(0x02040a);
        child.material.opacity = 0;
        child.visible = true;
        overlays.set(child.name.slice(0, -3), child);
      }
    });

    for (const c of COURTS) {
      const obj = root.getObjectByName(c.id);
      if (obj) courtRoots.set(c.id, obj);
    }

    playerTemplate = root.getObjectByName('tennis_player_template');
    if (playerTemplate) playerTemplate.visible = false;
    racketTemplate = root.getObjectByName('racket_template');
    if (racketTemplate) racketTemplate.visible = false;

    scene.add(root);
    document.getElementById('loading').classList.add('hidden');
    startDemoRally();
  },
  undefined,
  (err) => {
    console.error('Failed to load model', err);
    document.getElementById('loading').textContent = 'Не удалось загрузить сцену.';
  }
);

// --- Hover / raycast ------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let hoveredId = null;
const hint = document.getElementById('court-hint');

function findCourtIdFromObject(obj) {
  let o = obj;
  while (o) {
    for (const c of COURTS) {
      if (o.name === c.id) return c.id;
    }
    o = o.parent;
  }
  return null;
}

function setHover(id) {
  if (id === hoveredId) return;
  if (hoveredId && overlays.has(hoveredId) && !courtState(hoveredId).alwaysLit) {
    gsapFade(overlays.get(hoveredId).material, 0);
  }
  hoveredId = id;
  if (hoveredId && overlays.has(hoveredId) && !courtState(hoveredId).alwaysLit) {
    gsapFade(overlays.get(hoveredId).material, DUSK_OPACITY);
  }
}

// tiny opacity tween without pulling in gsap
function gsapFade(material, target) {
  const start = material.opacity;
  const startTime = performance.now();
  const duration = 180;
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    material.opacity = start + (target - start) * t;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const courtStates = new Map();
function courtState(id) {
  if (!courtStates.has(id)) courtStates.set(id, { alwaysLit: false });
  return courtStates.get(id);
}

canvas.addEventListener('mousemove', (e) => {
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find((h) => findCourtIdFromObject(h.object));
  const id = hit ? findCourtIdFromObject(hit.object) : null;
  setHover(id);
  if (id) {
    hint.classList.remove('hidden');
    hint.style.left = `${e.clientX}px`;
    hint.style.top = `${e.clientY}px`;
  } else {
    hint.classList.add('hidden');
  }
});

canvas.addEventListener('click', (e) => {
  if (dragMoved) { dragMoved = false; return; }
  if (hoveredId) openPanel(hoveredId);
});

let dragStartPos = null;
let dragMoved = false;
canvas.addEventListener('mousedown', (e) => { dragStartPos = { x: e.clientX, y: e.clientY }; dragMoved = false; });
canvas.addEventListener('mousemove', (e) => {
  if (dragStartPos && (Math.abs(e.clientX - dragStartPos.x) > 4 || Math.abs(e.clientY - dragStartPos.y) > 4)) {
    dragMoved = true;
  }
});

// --- Demo rally: ball + two moving players on a lit court -----------------

let rallyGroup = null;

function startDemoRally() {
  if (!playerTemplate || !COURTS.length) return;
  const now = new Date();
  const hour = Math.min(20, Math.max(8, now.getHours()));
  const dayKey = dayKeyForOffset(0);
  let bookedNow = COURTS.filter((c) => isSlotTaken(c.id, dayKey, hour));
  if (!bookedNow.length) bookedNow = COURTS;
  const court = bookedNow[Math.floor(Math.random() * bookedNow.length)];
  courtState(court.id).alwaysLit = true;
  if (overlays.has(court.id)) overlays.get(court.id).material.opacity = DUSK_OPACITY;

  if (rallyGroup) scene.remove(rallyGroup);
  rallyGroup = new THREE.Group();

  const isPadel = court.type === 'padel';
  const halfLen = isPadel ? 5 : 11.5;
  const sideOffset = 3.2;

  const p1 = playerTemplate.clone(true);
  const p2 = playerTemplate.clone(true);
  [p1, p2].forEach((p) => {
    p.visible = true;
    p.traverse((c) => { c.visible = true; });
  });
  p1.position.set(court.x - sideOffset, 0, court.z - halfLen * 0.6);
  p2.position.set(court.x + sideOffset, 0, court.z + halfLen * 0.6);
  p2.rotation.y = Math.PI;
  rallyGroup.add(p1, p2);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xd7ff3a, roughness: 0.6 })
  );
  ball.castShadow = true;
  ball.position.set(court.x, 0.9, court.z - halfLen * 0.6);
  rallyGroup.add(ball);

  scene.add(rallyGroup);

  const clock = { t: 0 };
  const cycle = 2.6;
  function animateRally() {
    if (!rallyGroup) return;
    clock.t += 0.016;
    const phase = (clock.t % cycle) / cycle;
    const z = THREE.MathUtils.lerp(court.z - halfLen * 0.6, court.z + halfLen * 0.6, phase);
    const arc = Math.sin(phase * Math.PI) * 1.6;
    ball.position.z = z;
    ball.position.y = 0.4 + arc;
    ball.position.x = court.x + Math.sin(phase * Math.PI * 2) * 0.4;

    const swing = Math.sin(clock.t * 3) * 0.15;
    p1.rotation.z = phase < 0.5 ? swing : 0;
    p2.rotation.z = phase >= 0.5 ? swing : 0;

    requestAnimationFrame(animateRally);
  }
  animateRally();
}

// --- Booking panel UI -------------------------------------------------

const panel = document.getElementById('booking-panel');
const panelTitle = document.getElementById('panel-title');
const panelSubtitle = document.getElementById('panel-subtitle');
const dayTabsEl = document.getElementById('day-tabs');
const slotGridEl = document.getElementById('slot-grid');
const panelFooter = document.getElementById('panel-footer');
document.getElementById('panel-close').addEventListener('click', closePanel);

let activeCourt = null;
let activeDayOffset = 0;
let selectedHour = null;

function openPanel(courtId) {
  const court = COURTS.find((c) => c.id === courtId);
  if (!court) return;
  activeCourt = court;
  activeDayOffset = 0;
  selectedHour = null;
  panelTitle.textContent = court.label;
  panelSubtitle.textContent = court.type === 'padel' ? 'Падел-корт' : court.type === 'hard' ? 'Хард-корт' : 'Грунтовый корт';
  renderDayTabs();
  renderSlots();
  panel.classList.remove('hidden');
}

function closePanel() {
  panel.classList.add('hidden');
  activeCourt = null;
}

function renderDayTabs() {
  dayTabsEl.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const btn = document.createElement('button');
    btn.className = 'day-tab' + (i === activeDayOffset ? ' active' : '');
    btn.textContent = `${DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}`;
    btn.addEventListener('click', () => {
      activeDayOffset = i;
      selectedHour = null;
      renderDayTabs();
      renderSlots();
    });
    dayTabsEl.appendChild(btn);
  }
}

function renderSlots() {
  slotGridEl.innerHTML = '';
  const dayKey = dayKeyForOffset(activeDayOffset);
  for (const hour of HOURS) {
    const key = `${activeCourt.id}-${dayKey}-${hour}`;
    const taken = isSlotTaken(activeCourt.id, dayKey, hour) && !bookings.has(key);
    const bookedByMe = bookings.has(key);
    const el = document.createElement('div');
    el.className = 'slot' + (taken ? ' taken' : '') + (selectedHour === hour ? ' selected' : '');
    el.textContent = bookedByMe ? `${hour}:00 ✓` : `${hour}:00`;
    if (!taken) {
      el.addEventListener('click', () => {
        selectedHour = hour;
        renderSlots();
        renderFooter();
      });
    }
    slotGridEl.appendChild(el);
  }
  renderFooter();
}

function renderFooter() {
  panelFooter.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'book-btn';
  btn.textContent = selectedHour ? `Забронировать на ${selectedHour}:00` : 'Выберите время';
  btn.disabled = selectedHour === null;
  btn.addEventListener('click', () => {
    if (selectedHour === null || !activeCourt) return;
    const dayKey = dayKeyForOffset(activeDayOffset);
    bookings.set(`${activeCourt.id}-${dayKey}-${selectedHour}`, true);
    showToast(`${activeCourt.label} забронирован на ${selectedHour}:00`);
    renderSlots();
  });
  panelFooter.appendChild(btn);
}

const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

// --- Render loop ------------------------------------------------------

function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
