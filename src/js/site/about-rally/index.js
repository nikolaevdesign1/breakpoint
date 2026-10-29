import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createStage } from './stage.js';
import { createHawkeye } from './hawkeye.js';
import { createChapters } from './chapters.js';
import { createCraft } from './craft.js';
import { timeAt, cameraAt, CHAPTERS, BOUNCES, T_END } from './path.js';

// One rally (About, row 33): scroll plays a single point through the club. The page is a tall section with
// a sticky stage; film progress p (0..1) picks rally time T, T picks the ball, the track, the marks and the
// camera. One canvas, rendered only while the stage is on screen and only when something moved.

const HOLD = 0.8; // seconds of rally time a verdict tag stays up (the last one stays)
const LAG = 6; // how quickly the picture catches up with the scroll, per second: unhurried

export async function startRally({ section }) {
  const stage = section.querySelector('[data-rally-stage]');
  const canvas = section.querySelector('[data-rally-canvas]');
  const tagBox = section.querySelector('[data-rally-tags]');

  const jump = (i) => {
    const range = section.offsetHeight - innerHeight;
    const y = section.getBoundingClientRect().top + scrollY + range * (CHAPTERS[i].p[0] + 0.01);
    const lenis = window.__lenis;
    lenis ? lenis.scrollTo(y, { duration: 2.4 }) : scrollTo({ top: y, behavior: 'smooth' });
  };
  const chapters = createChapters(stage, jump);
  chapters.update(0);

  let gl;
  try { gl = await createStage(canvas); } catch (err) { chapters.reset(); throw err; }
  const hawk = createHawkeye(gl.scene);
  const craft = createCraft(gl.scene);
  const tags = hawk.marks.map((m, i) => {
    const el = document.createElement('span');
    el.className = 'rally__tag';
    el.textContent = 'In';
    tagBox.append(el);
    return { el, ...m, last: i === hawk.marks.length - 1 };
  });

  let W = 1;
  let H = 1;
  const fit = () => { [W, H] = gl.resize(); hawk.setResolution(W, H); dirty = true; };
  let dirty = true;
  let target = 0;
  let cur = 0;
  let onScreen = true;
  const cam = { pos: new THREE.Vector3(), at: new THREE.Vector3(), fov: 40 };
  const v = new THREE.Vector3();

  function draw(p) {
    const T = timeAt(p);
    hawk.update(T);
    cameraAt(T, hawk.ballWorld, cam);
    const [c0, c1] = CHAPTERS[2].p;
    const q = (p - c0) / (c1 - c0);
    craft.update(Math.min(1, Math.max(0, q)));
    if (q > 0 && q < 1) cam.pos.x += Math.sin(q * Math.PI * 4) * 0.9 * Math.sin(q * Math.PI); // a sideways drift between the words
    gl.camera.position.copy(cam.pos);
    gl.camera.lookAt(cam.at);
    if (gl.camera.fov !== cam.fov) { gl.camera.fov = cam.fov; gl.camera.updateProjectionMatrix(); }
    gl.camera.updateMatrixWorld();
    gl.render();
    chapters.update(p);
    for (const t of tags) {
      const age = T - t.t;
      const show = age >= 0.05 && (t.last || age < HOLD);
      t.el.classList.toggle('is-on', show);
      if (!show) continue;
      v.copy(t.pos).project(gl.camera);
      t.el.style.transform = `translate3d(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px, 0)`;
    }
  }

  const tick = (_, ms) => {
    if (!onScreen) return;
    const d = target - cur;
    if (Math.abs(d) > 1e-4) { cur += d * (1 - Math.exp(-LAG * Math.min(ms, 100) / 1000)); dirty = true; } else if (cur !== target) { cur = target; dirty = true; }
    if (!dirty) return;
    dirty = false;
    draw(cur);
  };

  fit();
  draw(0);
  section.classList.add('is-live');
  gsap.ticker.add(tick);

  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => { target = self.progress; },
  });
  // render only while the section is on screen
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; dirty = true; }, { rootMargin: '10% 0px' });
  io.observe(section);
  target = cur = st.progress;
  dirty = true;
  addEventListener('resize', fit);

  const dispose = () => {
    gsap.ticker.remove(tick);
    removeEventListener('resize', fit);
    io.disconnect();
    st.kill();
    hawk.dispose();
    craft.dispose();
    gl.dispose();
  };
  addEventListener('pagehide', dispose, { once: true });
  if (import.meta.env.DEV) window.__rally = { set: (p) => { target = cur = p; dirty = true; }, info: () => gl.renderer.info.render, T_END, BOUNCES };

  return { dispose };
}
