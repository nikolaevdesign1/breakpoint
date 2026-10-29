import * as THREE from 'three';
import gsap from 'gsap';
import { LIFE_LAYER } from '../life/shared.js';
import { gradeLife } from '../lookdev.js';
import { COURTS, dayKeyForOffset } from '../../shared/availability.js';
import { latestByCourt } from '../../shared/session-bookings.js';
import { fmtHour, weekday, DAYS_AHEAD } from '../../shared/slot-ui.js';
import { readInvite, inviteText, onInviteShown } from '../flow/invite.js';

// Your booking on the map (round 7). Once a booking is confirmed (court-hud.js sends `bp-booked`) and
// the tiles close, the drone settles on the far end of that court, where a small scoreboard flips
// round on its posts: "Reserved · Alex · 18:00", warm LED type on a black board, with one glint
// passing over it. The court's floodlights stay on (scene.js highlightBooked, called by the page).
// Bookings are kept for the visit (session-bookings.js), so the boards are back after a reload.
//
// Round 9: a member's board carries a "Member" plate (row 35); a group books several boards that flip
// in together (row 24); ten minutes before today's game the board blinks (`bp-sign-blink`, row 22)
// and `bp-sign-focus` flies to it; an invite link stands a board "Alex is waiting for you · 18:00"
// on the friend's map (row 6).

const BOARD_H = 1.4; // m
const BOARD_D = 0.12;
const BOARD_LIFT = 1.0; // bottom edge above the court
const MAX_W = 6.4;
const TEX_W = 1024;
const LED = '#fff3da';

/** "18:00" today, "Tomorrow 18:00" / "Fri 18:00" later in the week; null once the day has passed. */
function whenLabel(b) {
  for (let i = 0; i < DAYS_AHEAD; i++) {
    if (dayKeyForOffset(i) !== b.dayKey) continue;
    return i === 0 ? fmtHour(b.hour) : `${i === 1 ? 'Tomorrow' : weekday(i)} ${fmtHour(b.hour)}`;
  }
  return null;
}

const signText = (b) => b.text ?? ['Reserved', b.first, whenLabel(b)].filter(Boolean).join(' · ');

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d');
  const r = g.createLinearGradient(0, 0, 64, 0);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.5, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 4);
  return new THREE.CanvasTexture(c);
}

export function createBookedSigns({ scene, root, rig, sunDir }, { still }) {
  const boxes = new Map();
  for (const c of COURTS) {
    const plane = root.getObjectByName(`${c.id}_hl`);
    if (plane) boxes.set(c.id, new THREE.Box3().setFromObject(plane));
  }
  if (!boxes.size) return null;

  const frameMat = gradeLife(new THREE.MeshStandardMaterial({ color: 0x161615, roughness: 0.55, metalness: 0.3 }));
  const postMat = gradeLife(new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.6 }));
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const glintMat = new THREE.MeshBasicMaterial({ map: glintTexture(), color: 0xfff3da, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const sun = sunDir.clone().normalize();
  const signs = new Map(); // courtId -> { group, board, glint, shadow, tex, booking }
  let pending = []; // court ids whose boards flip in once the tiles close (several for a group)
  let redraw = true;

  /** LED face: the line set in Switzer, fitted to the board; a member's board ends in a lit "Member" plate. */
  function paint(c, text, badge) {
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b0a';
    g.fillRect(0, 0, c.width, c.height);
    let size = Math.round(c.height * 0.5);
    const font = (px) => `500 ${px}px Switzer, "Helvetica Neue", Arial, sans-serif`;
    const measure = () => {
      g.font = font(size);
      const tw = g.measureText(text).width;
      if (!badge) return { tw, bw: 0, gap: 0 };
      g.font = font(Math.round(size * 0.62));
      const bw = g.measureText(badge).width + size * 0.7;
      return { tw, bw, gap: size * 0.5 };
    };
    let m = measure();
    const fit = (c.width * 0.88) / (m.tw + m.gap + m.bw);
    if (fit < 1) { size = Math.floor(size * fit); m = measure(); }
    const x0 = (c.width - (m.tw + m.gap + m.bw)) / 2;
    const y = c.height / 2 + size * 0.04;
    g.fillStyle = LED;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = font(size);
    g.fillText(text, x0, y);
    if (!badge) return;
    const bx = x0 + m.tw + m.gap;
    const bh = size * 0.96;
    g.fillRect(bx, c.height / 2 - bh / 2, m.bw, bh);
    g.fillStyle = '#0b0b0a';
    g.font = font(Math.round(size * 0.62));
    g.fillText(badge, bx + size * 0.35, y);
  }

  function faceTexture(text, w, badge) {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = Math.round((TEX_W * BOARD_H) / w / 2) * 2;
    paint(c, text, badge);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    // The webfont may still be on its way on a cold load: set the line again once it is in.
    document.fonts?.load('500 64px Switzer').then(() => { paint(c, text, badge); t.needsUpdate = true; redraw = true; }).catch(() => {});
    return t;
  }

  function build(booking) {
    const box = boxes.get(booking.courtId);
    const text = signText(booking);
    if (!box || !whenLabel(booking)) return null;
    const y = box.max.y;
    const wide = booking.member || booking.invite ? 1.25 : 1; // longer lines get a longer board
    const w = Math.min(MAX_W * wide, (box.max.x - box.min.x) * 0.42 * wide);
    const tex = faceTexture(text, w, booking.member ? 'Member' : null);
    const faceMat = gradeLife(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 2.4 }));

    const group = new THREE.Group();
    group.name = `booked_sign_${booking.courtId}`;
    // Far side of the court (screen top), inside the fence, square to the drone. Courts laid along x
    // (padel, grass) have their net and umpire chair in the middle of that side: the board stands
    // behind one half instead.
    const alongX = box.max.x - box.min.x > box.max.z - box.min.z;
    group.position.set((box.min.x + box.max.x) / 2 + (alongX ? (box.max.x - box.min.x) / 4 : 0), y, box.min.z + 0.9);
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, BOARD_H, BOARD_D), [frameMat, frameMat, frameMat, frameMat, faceMat, frameMat]);
    board.position.y = BOARD_LIFT + BOARD_H / 2;
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.9, BOARD_H * 0.92), glintMat.clone());
    glint.position.set(-w / 2, 0, BOARD_D / 2 + 0.01);
    board.add(glint);
    const postGeo = new THREE.BoxGeometry(0.08, BOARD_LIFT + BOARD_H, 0.08);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(side * (w / 2 - 0.3), (BOARD_LIFT + BOARD_H) / 2, -BOARD_D / 2 - 0.05);
      group.add(post);
    }
    group.add(board);

    // Shadow along the sun onto the court: board and posts, projected flat (life objects stay out of the baked shadow map).
    const quads = [[-w / 2, w / 2, BOARD_LIFT, BOARD_LIFT + BOARD_H]];
    for (const side of [-1, 1]) quads.push([side * (w / 2 - 0.3) - 0.04, side * (w / 2 - 0.3) + 0.04, 0, BOARD_LIFT]);
    const pts = [];
    const at = (x, h) => [x - (sun.x / sun.y) * h, 0.004, -(sun.z / sun.y) * h];
    for (const [x0, x1, h0, h1] of quads) {
      const a = at(x0, h0); const b = at(x1, h0); const c = at(x1, h1); const d = at(x0, h1);
      pts.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const shadowGeo = new THREE.BufferGeometry();
    shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
    shadow.material.side = THREE.DoubleSide;
    group.add(shadow);

    group.traverse((o) => { o.layers.set(LIFE_LAYER); o.userData.noAO = true; o.frustumCulled = false; });
    scene.add(group);
    return { group, board, glint, shadow, tex, faceMat, booking, w };
  }

  function remove(id) {
    const s = signs.get(id);
    if (!s) return;
    scene.remove(s.group);
    s.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    s.tex.dispose();
    s.faceMat.dispose();
    signs.delete(id);
  }

  function place(booking, hidden) {
    remove(booking.courtId);
    const s = build(booking);
    if (!s) return null;
    signs.set(booking.courtId, s);
    if (hidden) {
      s.group.visible = false;
    } else {
      s.shadow.material.opacity = 0.34;
    }
    redraw = true;
    return s;
  }

  /** The drone settles on the far end of the court: the board and the floodlit court together. */
  function frameSign(id) {
    const box = boxes.get(id);
    const long = box.max.z - box.min.z > box.max.x - box.min.x;
    const depth = long ? 14 : box.max.z - box.min.z + 2;
    rig.frame({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z - 2, maxZ: box.min.z + depth }, { pad: 1.12, duration: 1.8 });
  }

  /** Flip in: the board turns over on its axis between the posts and settles; one glint crosses it. */
  function reveal(id) {
    const s = signs.get(id);
    if (!s) return;
    s.group.visible = true;
    redraw = true;
    if (still) { s.shadow.material.opacity = 0.34; return; }
    const tl = gsap.timeline({ delay: 0.9 });
    tl.fromTo(s.board.rotation, { x: -Math.PI }, { x: 0, duration: 1.3, ease: 'back.out(1.4)' }, 0)
      .fromTo(s.board.scale, { y: 0.001 }, { y: 1, duration: 0.5, ease: 'power2.out' }, 0)
      .fromTo(s.faceMat, { emissiveIntensity: 0 }, { emissiveIntensity: 2.4, duration: 0.5, ease: 'power1.in' }, 0.55)
      .to(s.shadow.material, { opacity: 0.34, duration: 0.6, ease: 'power2.out' }, 0.5)
      .fromTo(s.glint.material, { opacity: 0 }, { opacity: 0.55, duration: 0.2, yoyo: true, repeat: 1, repeatDelay: 0.35 }, 1.25)
      .fromTo(s.glint.position, { x: -s.w / 2 + 0.45 }, { x: s.w / 2 - 0.45, duration: 0.75, ease: 'power2.inOut' }, 1.25);
    s.anim = tl;
  }

  // Bookings already made on this visit: their boards are standing when the map opens.
  for (const b of latestByCourt().values()) place(b, false);

  const onBooked = (e) => {
    if (!e.detail?.courtId) return;
    place(e.detail, true);
    pending.push(e.detail.courtId);
  };
  const onHud = (e) => {
    if (e.detail?.open || !pending.length) return;
    const ids = pending;
    pending = [];
    if (ids.length === 1) frameSign(ids[0]);
    else {
      const bs = ids.map((id) => boxes.get(id)).filter(Boolean);
      rig.frame({ minX: Math.min(...bs.map((b) => b.min.x)), maxX: Math.max(...bs.map((b) => b.max.x)), minZ: Math.min(...bs.map((b) => b.min.z)) - 4, maxZ: Math.min(...bs.map((b) => b.min.z)) + 16 }, { pad: 1.1, duration: 1.8 }); // the far ends, where the boards stand
    }
    ids.forEach((id, i) => gsap.delayedCall(i * 0.18, () => reveal(id)));
  };
  document.addEventListener('bp-booked', onBooked);
  document.addEventListener('bp-hud', onHud);

  // Round 9 (row 22): blink before the game; fly to the board from the countdown in the top bar.
  const blinking = new Set();
  document.addEventListener('bp-sign-blink', (e) => {
    const { courtId, on } = e.detail ?? {};
    if (on) blinking.add(courtId);
    else if (blinking.delete(courtId)) { const s = signs.get(courtId); if (s) s.faceMat.emissiveIntensity = 2.4; redraw = true; }
  });
  document.addEventListener('bp-sign-focus', (e) => { if (boxes.has(e.detail?.courtId)) frameSign(e.detail.courtId); });

  // Round 9 (row 6): the friend's map. The board stands on the invited court once the page shows it.
  const invite = readInvite();
  if (invite && !signs.has(invite.courtId)) {
    const s = place({ ...invite, text: inviteText(invite) }, true);
    if (s) onInviteShown(() => reveal(invite.courtId));
  }

  return {
    name: 'signs',
    tick() {
      let busy = redraw;
      redraw = false;
      for (const s of signs.values()) if (s.anim?.isActive()) busy = true;
      if (blinking.size) {
        const on = (performance.now() / 1000) % 1 < 0.62; // an LED blink, not a fade
        for (const id of blinking) { const s = signs.get(id); if (s && !s.anim?.isActive()) s.faceMat.emissiveIntensity = on ? 2.4 : 0.35; }
        busy = true;
      }
      return busy;
    },
    debug: () => [...signs.values()].map((s) => ({ court: s.booking.courtId, text: signText(s.booking), visible: s.group.visible })),
  };
}
