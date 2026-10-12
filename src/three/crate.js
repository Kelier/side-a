// 首页主视觉：在唱片箱里“翻唱片”。前面的唱片向前倒，当前这张立起来，
// 黑胶从封套上沿滑出、旋转；滚轮 / 拖动可以自己翻，点击打开这张唱片。
import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeRenderer, fitRenderer, makeSleeve, makeDisc, studioEnv, disposeScene, makeSpotCone } from './objects.js';
import { floorTexture } from './house.js';
import { rng } from '../lib/color.js';

gsap.ticker.lagSmoothing(0);

const SIZE = 2.2;
const GAP = 0.15;
const FRONT_LEAN = 0.52;
const BACK_LEAN = -0.16;

const n0 = (recs) => Math.min(recs.length, 12) % Math.max(1, recs.length);

export function createCrate(container, recs, { onChange, onOpen } = {}) {
  const renderer = makeRenderer(container, { alpha: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const env = studioEnv(renderer, scene);
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  // 镜头拉远一点、对准箱子中心，向前翻倒的唱片也完整在画面里
  const base = new THREE.Vector3(5.6, 4.4, 10.2);
  const look = new THREE.Vector3(-0.35, 1.05, 0.2);
  camera.position.copy(base);
  fitRenderer(renderer, camera, container);

  // 光：一盏暖色顶光 + 柔和环境
  scene.add(new THREE.HemisphereLight(0xf3e6cf, 0x0c0a08, 0.55));
  const spot = new THREE.SpotLight(0xffe2b8, 90, 22, 0.42, 0.55, 1.6);
  spot.position.set(0.6, 8, 2.4);
  spot.target.position.set(0, 0.8, -0.4);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0006;
  scene.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0xff8a5c, 0.9);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  const cone = makeSpotCone(0xffe2b8, 7.6, 2.4);
  cone.position.set(0.6, 8, 2.4);
  cone.lookAt(0, 0.8, -0.4);
  cone.rotateX(Math.PI / 2);
  cone.material.uniforms.uOpacity.value = 0.16;
  scene.add(cone);

  // 周边：胡桃木地板、远处的暖墙、台灯、植物、靠在箱边的几张唱片
  scene.fog = new THREE.Fog(0x0b0b0c, 12, 24);
  const floorWood = floorTexture('walnut').clone();
  floorWood.needsUpdate = true;
  floorWood.repeat.set(5, 5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorWood, color: 0x9a7458, roughness: 0.5 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const wallTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(256, 230, 10, 256, 256, 360);
    gr.addColorStop(0, '#4a3122'); gr.addColorStop(0.6, '#20150f'); gr.addColorStop(1, '#0b0b0c');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ map: wallTex, fog: false }));
  wall.position.set(-0.5, 6, -6);
  scene.add(wall);
  const props = new THREE.Group();
  scene.add(props);
  const pm = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; props.add(o); return o; };
  // 台灯（右后，暖光）
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.85, roughness: 0.3 });
  pm(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0x1b1916, metalness: 0.4, roughness: 0.4 }), 3.4, 0.03, -2.4);
  pm(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), brass, 3.4, 0.98, -2.4);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xf1e2c4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffbf70, emissiveIntensity: 0.6 });
  const shade = pm(new THREE.CylinderGeometry(0.34, 0.5, 0.5, 32, 1, true), shadeM, 3.4, 2.05, -2.4);
  shade.castShadow = false;
  const lampL = new THREE.PointLight(0xffb066, 12, 9, 1.6);
  lampL.position.set(3.4, 1.9, -2.2);
  scene.add(lampL);
  // 植物（左后）
  const pot = new THREE.MeshStandardMaterial({ color: 0xb8674a, roughness: 0.85 });
  pm(new THREE.CylinderGeometry(0.5, 0.38, 0.9, 32), pot, -3.8, 0.45, -2.6);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x46683d, roughness: 0.6, side: THREE.DoubleSide });
  const lg = new THREE.SphereGeometry(0.3, 12, 8); lg.scale(1, 0.2, 1.5);
  const R = rng(21);
  for (let i = 0; i < 26; i++) { const a2 = R() * Math.PI * 2, rr = 0.2 + R() * 0.7; const lf = pm(lg, leaf, -3.8 + Math.cos(a2) * rr, 1.2 + R() * 2.2, -2.6 + Math.sin(a2) * rr); lf.rotation.set(R() * 0.9 - 0.2, a2, R() * 0.8 - 0.4); }
  // 靠在箱子后面墙边的几张唱片
  recs.slice(n0(recs), n0(recs) + 3).forEach(async (r, i) => {
    const sl = await makeSleeve(r, 2.0);
    if (dead) return;
    sl.position.set(-2.1 + i * 0.28, 1.0, -2.3 - i * 0.12);
    sl.rotation.set(-0.12 - i * 0.03, 0.25 - i * 0.08, 0.04 * i);
    sl.castShadow = sl.receiveShadow = true;
    props.add(sl);
  });
  // 光里的尘埃
  const dustN = 160;
  const dg = new THREE.BufferGeometry();
  const dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dpos[i * 3] = (Math.random() - 0.5) * 6; dpos[i * 3 + 1] = Math.random() * 6; dpos[i * 3 + 2] = (Math.random() - 0.5) * 4; }
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // 唱片箱
  const n = Math.min(recs.length, 12);
  const depth = 0.7 + n * GAP + 0.4;
  const W = SIZE + 0.5, H = 0.95, T = 0.07;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.7 });
  const crate = new THREE.Group();
  const panel = (w, h, d, m, x, y, z) => { const p = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.02), m); p.position.set(x, y, z); p.castShadow = p.receiveShadow = true; crate.add(p); return p; };
  panel(W, T, depth, woodDark, 0, T / 2, 0);
  panel(T, H, depth, wood, -W / 2 + T / 2, H / 2, 0);
  panel(T, H, depth, wood, W / 2 - T / 2, H / 2, 0);
  panel(W, H * 0.62, T, wood, 0, H * 0.31, depth / 2 - T / 2);
  panel(W, H, T, wood, 0, H / 2, -depth / 2 + T / 2);
  // 侧面的把手孔
  for (const sx of [-1, 1]) {
    const hole = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 12), new THREE.MeshBasicMaterial({ color: 0x1a120b }));
    hole.rotation.z = Math.PI / 2;
    hole.position.set(sx * (W / 2 + 0.001), H * 0.72, 0);
    hole.rotation.y = Math.PI / 2;
    crate.add(hole);
  }
  // 箱子侧面的印字
  const stamp = document.createElement('canvas');
  stamp.width = 512; stamp.height = 128;
  const sg = stamp.getContext('2d');
  sg.fillStyle = 'rgba(30,18,10,.75)';
  sg.font = '700 64px "Archivo Variable", sans-serif';
  sg.fillText('SIDE A', 20, 82);
  sg.font = '22px "JetBrains Mono", monospace';
  sg.fillText('FRAGILE  /  33⅓ RPM', 250, 80);
  const stampTex = new THREE.CanvasTexture(stamp);
  stampTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshStandardMaterial({ map: stampTex, transparent: true, roughness: 0.9 }));
  label.position.set(0, H * 0.3, depth / 2 + 0.002);
  crate.add(label);
  crate.rotation.y = -0.38;
  scene.add(crate);

  // 唱片：每张一个枢轴（底边），封套 + 藏在里面的黑胶
  const items = [];
  const zFront = depth / 2 - 0.62;
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, T, zFront - i * GAP);
    pivot.rotation.x = i === 0 ? 0 : BACK_LEAN;
    crate.add(pivot);
    items.push({ pivot, rec: recs[i], sleeve: null, disc: null, lift: 0 });
  }
  let dead = false;
  (async () => {
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const s = await makeSleeve(it.rec, SIZE);
      if (dead) return;
      s.position.y = SIZE / 2;
      s.castShadow = s.receiveShadow = true;
      it.pivot.add(s);
      it.sleeve = s;
    }
    // 只给当前与相邻几张准备黑胶，省资源
    prepDisc(cur);
  })();

  async function prepDisc(i) {
    const it = items[i];
    if (!it || it.disc || it.loading) return;
    it.loading = true;
    const d = await makeDisc({ ...it.rec }, it.rec.format === 'cd' ? 'cd' : 'vinyl');
    if (dead) return;
    d.scale.setScalar(SIZE * 0.47);
    d.position.set(0, SIZE / 2, -0.004);
    d.traverse((o) => { o.castShadow = true; });
    it.pivot.add(d);
    it.disc = d;
    if (i === cur) slideOut(it);
  }
  function slideOut(it) {
    if (!it.disc) return;
    gsap.to(it.disc.position, { y: SIZE / 2 + SIZE * 0.42, duration: 1.1, ease: 'power3.out', delay: 0.35 });
  }
  function slideIn(it) {
    if (!it.disc) return;
    gsap.to(it.disc.position, { y: SIZE / 2, duration: 0.5, ease: 'power2.in' });
  }

  let cur = 0;
  function layout(next, instant = false) {
    const prev = cur;
    cur = (next + n) % n;
    items.forEach((it, i) => {
      const lean = i < cur ? FRONT_LEAN : i === cur ? -0.03 : BACK_LEAN;
      const y = i === cur ? 0.32 : 0;
      if (instant) { it.pivot.rotation.x = lean; it.pivot.position.y = T + y; return; }
      gsap.to(it.pivot.rotation, { x: lean, duration: 0.9, ease: 'power3.inOut', delay: Math.abs(i - cur) * 0.02 });
      gsap.to(it.pivot.position, { y: T + y, duration: 0.7, ease: 'power3.out' });
    });
    if (items[prev] && prev !== cur) slideIn(items[prev]);
    if (items[cur]?.disc) slideOut(items[cur]);
    else prepDisc(cur);
    prepDisc((cur + 1) % n);
    onChange?.(items[cur]?.rec, cur, n);
  }

  // ---------- 交互 ----------
  let auto = setInterval(() => layout(cur + 1), 3200);
  const resetAuto = () => { clearInterval(auto); auto = setInterval(() => layout(cur + 1), 4200); };
  let mx = 0, my = 0;
  const onMove = (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; };
  window.addEventListener('pointermove', onMove);
  let wheelLock = 0;
  const onWheel = (e) => {
    const now = performance.now();
    if (now - wheelLock < 420 || Math.abs(e.deltaY) < 8) return;
    e.preventDefault();
    wheelLock = now;
    layout(cur + (e.deltaY > 0 ? 1 : -1));
    resetAuto();
  };
  // 只有悬停在唱片箱上时才接管滚轮，避免影响页面滚动
  let over = false;
  container.addEventListener('pointerenter', () => (over = true));
  container.addEventListener('pointerleave', () => (over = false));
  const wheelGuard = (e) => over && onWheel(e);
  container.addEventListener('wheel', wheelGuard, { passive: false });
  let downX = null;
  const onDown = (e) => { downX = e.clientX; };
  const onUp = (e) => {
    if (downX == null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 30) { layout(cur + (dx < 0 ? 1 : -1)); resetAuto(); }
    else openCurrent();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.style.cursor = 'pointer';
  renderer.domElement.style.touchAction = 'pan-y';
  renderer.domElement.addEventListener('pointercancel', () => { downX = null; });

  // 点开：当前这张从箱子里抽出、朝镜头抬起，然后把它在屏幕上的位置交给页面过渡
  let opening = false;
  function screenRect(it) {
    const box = new THREE.Box3().setFromObject(it.sleeve || it.pivot);
    const r = renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    const size = Math.min(x1 - x0, y1 - y0);
    return { left: (x0 + x1) / 2 - size / 2, top: (y0 + y1) / 2 - size / 2, width: size, height: size };
  }
  function openCurrent() {
    const it = items[cur];
    if (!it || opening) return;
    opening = true;
    clearInterval(auto);
    if (it.disc) gsap.to(it.disc.position, { y: SIZE / 2, duration: 0.3, ease: 'power2.in' });
    gsap.to(it.pivot.position, { y: T + 1.1, duration: 0.55, ease: 'power3.out' });
    gsap.to(it.pivot.rotation, { x: 0.18, duration: 0.55, ease: 'power3.out' });
    gsap.to(base, { x: base.x * 0.82, y: base.y * 0.9, z: base.z * 0.8, duration: 0.6, ease: 'power3.inOut' });
    setTimeout(() => { if (!dead) onOpen?.(it.rec, screenRect(it)); }, 560);
  }

  const onResize = () => fitRenderer(renderer, camera, container);
  window.addEventListener('resize', onResize);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    camera.position.x += (base.x + mx * 1.4 - camera.position.x) * 0.08;
    camera.position.y += (base.y - my * 1.0 - camera.position.y) * 0.08;
    camera.position.z += (base.z - camera.position.z) * 0.08;
    camera.lookAt(look);
    const it = items[cur];
    if (it?.disc) it.disc.rotation.z -= dt * 1.6;
    cone.material.uniforms.uOpacity.value = 0.14 + Math.sin(t * 0.7) * 0.02;
    const dp2 = dust.geometry.attributes.position;
    for (let i = 0; i < dustN; i++) { dp2.array[i * 3 + 1] -= dt * 0.05; if (dp2.array[i * 3 + 1] < 0) dp2.array[i * 3 + 1] = 6; }
    dp2.needsUpdate = true;
    renderer.render(scene, camera);
  });
  layout(0, true);

  return {
    next: () => { layout(cur + 1); resetAuto(); },
    prev: () => { layout(cur - 1); resetAuto(); },
    dispose() {
      dead = true;
      clearInterval(auto);
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('wheel', wheelGuard);
      items.forEach((x) => { gsap.killTweensOf(x.pivot.rotation); gsap.killTweensOf(x.pivot.position); if (x.disc) gsap.killTweensOf(x.disc.position); });
      disposeScene(scene);
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
